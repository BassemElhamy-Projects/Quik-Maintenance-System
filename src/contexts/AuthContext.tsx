import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { UserProfile } from '../types/auth';
import { UserRole } from '../types/supabase';
import { logAuthEvent } from '../services/auditService';
import { initializeFirstAdminServer } from '../services/adminService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  isSupabaseReady: boolean;
  loginWithUsername: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  initializeFirstAdmin: (username: string, password: string, fullName: string, phone?: string) => Promise<{ success: boolean; error?: string }>;
  checkNeedsFirstAdmin: () => Promise<boolean>;
  logout: () => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Normalizes username to a consistent internal authentication identifier
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Generates secure internal email for Supabase Auth identity from username
 */
export function getInternalEmailForUsername(username: string): string {
  const clean = normalizeUsername(username);
  return `${clean}@quik.internal`;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const isSupabaseReady = isSupabaseConfigured();
  const currentUserIdRef = useRef<string | null>(null);
  const currentSessionRef = useRef<Session | null>(null);
  const isAuthenticatingRef = useRef<boolean>(false);
  const authRequestIdRef = useRef<number>(0);

  // Read-only profile fetch: prevents client-side privilege escalation
  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[AUTH] Error fetching profile:', error.message);
        return null;
      }

      return (data as UserProfile) || null;
    } catch (err) {
      console.error('[AUTH] Profile fetch exception:', err);
      return null;
    }
  }, []);

  // Initialize and restore session on startup
  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function initSession() {
      const reqId = ++authRequestIdRef.current;
      try {
        const { data: { session: initialSession }, error } = await supabase!.auth.getSession();

        if (error) {
          console.warn('[AUTH] Session load error:', error.message);
          const sessionError = error.message.toLowerCase();
          if (
            sessionError.includes('refresh token') ||
            sessionError.includes('session not found') ||
            sessionError.includes('token not found')
          ) {
            try {
              await supabase!.auth.signOut({ scope: 'local' });
            } catch (clearError) {
              console.warn('[AUTH] Could not clear stale local session:', clearError);
            }
          }
        }

        if (!isMounted || authRequestIdRef.current !== reqId) return;

        if (initialSession?.user) {
          currentUserIdRef.current = initialSession.user.id;
          currentSessionRef.current = initialSession;

          const userProf = await fetchProfile(initialSession.user.id);

          if (!isMounted || authRequestIdRef.current !== reqId) return;

          if (!userProf) {
            currentUserIdRef.current = null;
            currentSessionRef.current = null;
            setSession(null);
            setUser(null);
            setProfile(null);
            setAuthError('تعذر العثور على ملف تعريف الحساب. يرجى التواصل مع مسؤول النظام.');
            await supabase!.auth.signOut({ scope: 'local' });
          } else if (!userProf.is_active) {
            currentUserIdRef.current = null;
            currentSessionRef.current = null;
            setSession(null);
            setUser(null);
            setProfile(null);
            setAuthError('هذا الحساب غير مفعل، يرجى التواصل مع مدير النظام.');
            await supabase!.auth.signOut({ scope: 'local' });
          } else {
            setSession(initialSession);
            setUser(initialSession.user);
            setProfile(userProf);
          }
        }
      } catch (err) {
        console.error('[AUTH] Init session error:', err);
      } finally {
        if (isMounted && authRequestIdRef.current === reqId) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        authRequestIdRef.current++;
        currentUserIdRef.current = null;
        currentSessionRef.current = null;
        isAuthenticatingRef.current = false;
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' && currentSession) {
        if (currentSessionRef.current?.access_token !== currentSession.access_token) {
          currentSessionRef.current = currentSession;
          setSession(currentSession);
        }
        return;
      }

      if (event === 'SIGNED_IN' && currentSession?.user) {
        // Tab-switch and focus revalidation protection
        if (currentUserIdRef.current === currentSession.user.id) {
          if (currentSessionRef.current?.access_token === currentSession.access_token) {
            return;
          }
          currentSessionRef.current = currentSession;
          setSession(currentSession);
          return;
        }

        // Avoid duplicate work if loginWithUsername is actively handling this authentication sequence
        if (isAuthenticatingRef.current) {
          currentUserIdRef.current = currentSession.user.id;
          currentSessionRef.current = currentSession;
          return;
        }

        const reqId = ++authRequestIdRef.current;
        const targetUserId = currentSession.user.id;

        currentUserIdRef.current = targetUserId;
        currentSessionRef.current = currentSession;
        setSession(currentSession);
        setUser(currentSession.user);

        (async () => {
          try {
            const userProf = await fetchProfile(targetUserId);

            if (!isMounted || authRequestIdRef.current !== reqId) return;

            if (!userProf) {
              currentUserIdRef.current = null;
              currentSessionRef.current = null;
              setSession(null);
              setUser(null);
              setProfile(null);
              setAuthError('تعذر العثور على ملف تعريف الحساب. يرجى التواصل مع مسؤول النظام.');
              await supabase!.auth.signOut({ scope: 'local' });
            } else if (!userProf.is_active) {
              currentUserIdRef.current = null;
              currentSessionRef.current = null;
              setSession(null);
              setUser(null);
              setProfile(null);
              setAuthError('هذا الحساب غير مفعل، يرجى التواصل مع مدير النظام.');
              await supabase!.auth.signOut({ scope: 'local' });
            } else {
              setProfile(userProf);
              setAuthError(null);
            }
          } catch (err) {
            console.error('[AUTH] Profile fetch in auth change error:', err);
          } finally {
            if (isMounted && authRequestIdRef.current === reqId) {
              setIsLoading(false);
            }
          }
        })();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const loginWithUsername = useCallback(async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);

    if (!supabase) {
      const err = 'تعذر تهيئة الاتصال بالنظام. يرجى التواصل مع مسؤول النظام.';
      setAuthError(err);
      return { success: false, error: err };
    }

    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername || !password) {
      const err = 'يرجى إدخال اسم المستخدم وكلمة المرور.';
      setAuthError(err);
      return { success: false, error: err };
    }

    setIsLoading(true);
    isAuthenticatingRef.current = true;
    const reqId = ++authRequestIdRef.current;

    try {
      // 1. Resolve stored email safely via RPC (avoids exposing profiles table to anon)
      let resolvedEmail: string | null = null;
      const { data: rpcEmail, error: rpcError } = await supabase.rpc('get_login_email_by_username', {
        p_username: cleanUsername
      });

      if (!rpcError && typeof rpcEmail === 'string' && rpcEmail.trim() !== '') {
        resolvedEmail = rpcEmail.trim();
      }

      const hasProfileEmail = Boolean(resolvedEmail);
      const targetEmail = resolvedEmail || getInternalEmailForUsername(cleanUsername);

      let { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password
      });

      // Fallback for legacy @quik.local accounts if RPC was not found or returned empty
      if (error && !hasProfileEmail) {
        const alternateEmail = targetEmail.endsWith('@quik.internal')
          ? `${cleanUsername}@quik.local`
          : getInternalEmailForUsername(cleanUsername);

        const fallbackRes = await supabase.auth.signInWithPassword({
          email: alternateEmail,
          password
        });

        if (!fallbackRes.error && fallbackRes.data.user) {
          data = fallbackRes.data;
          error = null;
        }
      }

      if (error) {
        let msg = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
        const raw = (error.message || '').toLowerCase();
        if (raw.includes('invalid login credentials') || raw.includes('invalid_grant')) {
          msg = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
        } else if (raw.includes('failed to fetch') || raw.includes('network')) {
          msg = 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.';
        } else if (raw.includes('rate limit') || raw.includes('too many requests')) {
          msg = 'تم تجاوز عدد محاولات الدخول المسموح بها. يرجى المحاولة بعد قليل.';
        } else if (raw.includes('email not confirmed')) {
          msg = 'الحساب بانتظار تأكيد البريد الإلكتروني.';
        }
        setAuthError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      if (data?.user) {
        currentUserIdRef.current = data.user.id;
        currentSessionRef.current = data.session;

        const userProf = await fetchProfile(data.user.id);

        if (authRequestIdRef.current !== reqId) {
          return { success: false, error: 'تم إلغاء الجلسة.' };
        }

        if (!userProf) {
          currentUserIdRef.current = null;
          currentSessionRef.current = null;
          const noProfileMsg = 'تعذر العثور على ملف تعريف المستخدم. يرجى التواصل مع مسؤول النظام.';
          setAuthError(noProfileMsg);
          setIsLoading(false);
          await supabase.auth.signOut({ scope: 'local' });
          return { success: false, error: noProfileMsg };
        }

        if (!userProf.is_active) {
          currentUserIdRef.current = null;
          currentSessionRef.current = null;
          const inactiveMsg = 'هذا الحساب غير مفعل، يرجى التواصل مع مدير النظام.';
          setAuthError(inactiveMsg);
          setIsLoading(false);
          await supabase.auth.signOut({ scope: 'local' });
          return { success: false, error: inactiveMsg };
        }

        setProfile(userProf);
        setUser(data.user);
        setSession(data.session);
        setIsLoading(false);
        await logAuthEvent({ action: 'LOGIN' }, data.user);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: 'تعذر استرجاع بيانات الجلسة.' };
    } catch {
      const errorMsg = 'تعذر تسجيل الدخول بسبب خطأ غير متوقع. يرجى المحاولة مرة أخرى أو التواصل مع مسؤول النظام.';
      setAuthError(errorMsg);
      setIsLoading(false);
      return { success: false, error: errorMsg };
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, [fetchProfile]);

  const checkNeedsFirstAdmin = useCallback(async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { data: hasAdmin, error: rpcError } = await supabase.rpc('has_active_admin');

      if (!rpcError && typeof hasAdmin === 'boolean') {
        return !hasAdmin;
      }

      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true);

      if (error) {
        console.warn('[AUTH] Error checking admin existence:', error.message);
        return false;
      }

      return (count ?? 0) === 0;
    } catch {
      return false;
    }
  }, []);

  const initializeFirstAdmin = useCallback(async (
    username: string,
    password: string,
    fullName: string,
    phone?: string
  ): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);
    if (!supabase) {
      const err = 'تعذر تهيئة الاتصال بالنظام. يرجى التواصل مع مسؤول النظام.';
      setAuthError(err);
      return { success: false, error: err };
    }

    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername || cleanUsername.length < 3) {
      const err = 'اسم المستخدم يجب ألا يقل عن 3 أحرف أو أرقام.';
      setAuthError(err);
      return { success: false, error: err };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      const err = 'اسم المستخدم يجب أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطة سفلية.';
      setAuthError(err);
      return { success: false, error: err };
    }

    if (!password || password.length < 6) {
      const err = 'يجب أن لا تقل كلمة المرور عن 6 خانات.';
      setAuthError(err);
      return { success: false, error: err };
    }

    setIsLoading(true);

    try {
      const needsInit = await checkNeedsFirstAdmin();
      if (!needsInit) {
        const err = 'تمت تهيئة مدير النظام مسبقاً. التسجيل الذاتي غير متاح.';
        setAuthError(err);
        setIsLoading(false);
        return { success: false, error: err };
      }

      const edgeRes = await initializeFirstAdminServer(cleanUsername, password, fullName, phone);

      if (!edgeRes.success) {
        const rawErr = edgeRes.error || '';
        const hasArabic = /[\u0600-\u06FF]/.test(rawErr);
        const hasTechnicalTokens = /(?:functions?|error:|exception|status code|network|fail|500|400|403|404)/i.test(rawErr);
        const errMessage = hasArabic && !hasTechnicalTokens
          ? rawErr
          : 'تعذر إتمام تهيئة حساب مدير النظام الأول. يرجى التواصل مع مسؤول النظام.';

        setAuthError(errMessage);
        setIsLoading(false);
        return { success: false, error: errMessage };
      }

      await logAuthEvent({
        action: 'USER_CREATED',
        details: { username: cleanUsername, role: 'admin', isFirstAdmin: true }
      });

      const loginRes = await loginWithUsername(cleanUsername, password);
      return loginRes;
    } catch {
      const errText = 'حدث خطأ غير متوقع أثناء تهيئة حساب مدير النظام الأول. يرجى المحاولة لاحقاً أو التواصل مع مسؤول النظام.';
      setAuthError(errText);
      setIsLoading(false);
      return { success: false, error: errText };
    }
  }, [checkNeedsFirstAdmin, loginWithUsername]);

  const logout = useCallback(async (): Promise<void> => {
    authRequestIdRef.current++;
    currentUserIdRef.current = null;
    currentSessionRef.current = null;
    isAuthenticatingRef.current = false;
    if (user) {
      await logAuthEvent({ action: 'LOGOUT' }, user);
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
    setSession(null);
    setAuthError(null);
  }, [user]);

  const updateUserPassword = useCallback(async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabase || !user) {
      return { success: false, error: 'المستخدم غير مسجل الدخول.' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'يجب أن لا تقل كلمة المرور عن 6 خانات.' };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        const raw = (error.message || '').toLowerCase();
        let safeMsg = 'تعذر تحديث كلمة المرور. يرجى المحاولة لاحقاً أو التواصل مع مسؤول النظام.';

        if (raw.includes('same_password') || raw.includes('different from the old') || raw.includes('should be different')) {
          safeMsg = 'كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية.';
        } else if (raw.includes('at least 6') || raw.includes('password should be at least')) {
          safeMsg = 'يجب أن لا تقل كلمة المرور عن 6 خانات.';
        } else if (raw.includes('session') || raw.includes('jwt') || raw.includes('expired') || raw.includes('unauthorized') || raw.includes('not logged in')) {
          safeMsg = 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى.';
        } else if (raw.includes('rate limit') || raw.includes('too many requests')) {
          safeMsg = 'تم تجاوز عدد المحاولات المسموح بها، يرجى المحاولة بعد قليل.';
        } else if (raw.includes('failed to fetch') || raw.includes('network')) {
          safeMsg = 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.';
        }

        return { success: false, error: safeMsg };
      }

      await logAuthEvent({ action: 'PASSWORD_CHANGED' }, user);
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر تحديث كلمة المرور. يرجى المحاولة لاحقاً أو التواصل مع مسؤول النظام.' };
    }
  }, [user]);

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (user && supabase) {
      const p = await fetchProfile(user.id);
      if (!p || !p.is_active) {
        await logout();
        setAuthError('تم إيقاف الحساب أو لم يعد متاحاً.');
        return;
      }
      setProfile(p);
    }
  }, [user, fetchProfile, logout]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const contextValue = useMemo<AuthContextType>(() => ({
    user,
    profile,
    role: profile?.role || null,
    session,
    isAuthenticated: Boolean(user && profile && profile.is_active),
    isLoading,
    authError,
    isSupabaseReady,
    loginWithUsername,
    initializeFirstAdmin,
    checkNeedsFirstAdmin,
    logout,
    updateUserPassword,
    refreshProfile,
    clearAuthError
  }), [
    user,
    profile,
    session,
    isLoading,
    authError,
    isSupabaseReady,
    loginWithUsername,
    initializeFirstAdmin,
    checkNeedsFirstAdmin,
    logout,
    updateUserPassword,
    refreshProfile,
    clearAuthError
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
