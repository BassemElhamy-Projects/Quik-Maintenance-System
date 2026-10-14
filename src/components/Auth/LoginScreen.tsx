import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  UserPlus,
  Phone
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const LoginScreen: React.FC = () => {
  const {
    loginWithUsername,
    initializeFirstAdmin,
    checkNeedsFirstAdmin,
    authError,
    isLoading: authIsLoading,
    isSupabaseReady,
    clearAuthError
  } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [isFirstAdminSetup, setIsFirstAdminSetup] = useState(false);
  const [adminUsername, setAdminUsername] = useState('bassem_admin');
  const [adminFullName, setAdminFullName] = useState('باسم - مدير النظام');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAdmin() {
      if (isSupabaseReady) {
        setIsCheckingSetup(true);
        const needsSetup = await checkNeedsFirstAdmin();

        if (isMounted) {
          setIsFirstAdminSetup(needsSetup);
          setIsCheckingSetup(false);
        }
      } else {
        setIsCheckingSetup(false);
      }
    }

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, [isSupabaseReady, checkNeedsFirstAdmin]);

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password) {
      setLocalError('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await loginWithUsername(trimmedUsername, password);

      if (!res.success && res.error) {
        setLocalError(res.error);
      }
    } catch {
      setLocalError('حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFirstAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    const trimmedUsername = adminUsername.trim();

    if (!trimmedUsername || trimmedUsername.length < 3) {
      setLocalError('اسم المستخدم يجب أن لا يقل عن 3 أحرف أو أرقام.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      setLocalError(
        'اسم المستخدم يجب أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطة سفلية.'
      );
      return;
    }

    if (!adminPassword || adminPassword.length < 6) {
      setLocalError('يجب أن تتكون كلمة المرور من 6 خانات على الأقل.');
      return;
    }

    if (adminPassword !== adminConfirmPassword) {
      setLocalError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await initializeFirstAdmin(
        trimmedUsername,
        adminPassword,
        adminFullName.trim() || 'مدير النظام الأول',
        adminPhone.trim() || undefined
      );

      if (!res.success && res.error) {
        setLocalError(res.error);
      }
    } catch {
      setLocalError('حدث خطأ أثناء إنشاء الحساب. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-6 sm:px-6 dir-rtl font-['Cairo',sans-serif] selection:bg-orange-500 selection:text-white relative overflow-hidden">

      {/* Background Accents */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm space-y-4 relative z-10">

        {/* Brand Header */}
        <div className="text-center space-y-1.5">

          {/* Company Logo */}
          <div className="flex justify-center items-center mb-1">
            <img
              src="/quik-logo.png"
              alt="Quik Logo"
              className="w-72 h-40 object-contain"
            />
          </div>

          <div className="space-y-0.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 font-['Cairo']">
              كويك لمحطات الوقود
            </h1>

            <p className="text-orange-600 font-bold text-xs tracking-wide">
              نظام إدارة الصيانة والتفتيش
            </p>
          </div>

          {isFirstAdminSetup && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100/80 border border-orange-200 text-orange-800 text-[11px] font-bold">
              <UserPlus className="w-3.5 h-3.5 text-orange-600" />
              <span>تهيئة مدير النظام الأول (Setup Mode)</span>
            </div>
          )}
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200/90 p-5 sm:p-6 rounded-3xl shadow-xl shadow-slate-200/60 space-y-4 text-right">

          {/* Error Message */}
          {displayError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold flex items-start gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{displayError}</span>
            </div>
          )}

          {/* Connection Warning */}
          {!isSupabaseReady && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                تعذر الاتصال بالنظام. يرجى التحقق من اتصال الإنترنت أو التواصل مع مسؤول النظام.
              </span>
            </div>
          )}

          {isCheckingSetup ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-500 text-xs font-medium">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <span>جاري التحقق من إعدادات النظام...</span>
            </div>
          ) : isFirstAdminSetup ? (

            /* First Admin Setup Form */
            <form onSubmit={handleSubmitFirstAdmin} className="space-y-3">

              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200/80 text-slate-700 text-[11px] leading-relaxed">
                <p className="font-bold text-orange-800 mb-1">
                  ترحيب بالنظام الجديد:
                </p>
                لم يتم تسجيل أي مدير نظام بعد. يرجى إدخال اسم المستخدم وكلمة المرور التي ترغب بها لإنشاء حساب المدير الأول.
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  اسم مستخدم المدير (Admin Username)
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>

                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={adminUsername}
                    onChange={(e) => {
                      setAdminUsername(e.target.value);
                      if (displayError) {
                        setLocalError(null);
                        clearAuthError();
                      }
                    }}
                    placeholder="مثال: bassem_admin"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl py-2.5 pr-9 pl-3 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  الاسم الكامل
                </label>

                <input
                  type="text"
                  required
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="الاسم الكامل لمدير النظام"
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-right"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  رقم الهاتف (اختياري)
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>

                  <input
                    type="text"
                    dir="ltr"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    placeholder="05xxxxxxxx"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl py-2.5 pr-9 pl-3 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  كلمة المرور
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>

                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      if (displayError) {
                        setLocalError(null);
                        clearAuthError();
                      }
                    }}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl py-2.5 pr-9 pl-9 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />

                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showAdminPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  تأكيد كلمة المرور
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>

                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl py-2.5 pr-9 pl-3 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || authIsLoading}
                className="w-full py-3 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black text-xs shadow-md shadow-orange-500/20 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {submitting || authIsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>جاري إنشاء مدير النظام والتفعيل...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>إنشاء حساب مدير النظام والدخول فوراً</span>
                  </>
                )}
              </button>
            </form>
          ) : (

            /* Standard Login Form */
            <form onSubmit={handleSubmitLogin} className="space-y-3.5">

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  اسم المستخدم
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>

                  <input
                    type="text"
                    required
                    autoFocus
                    dir="ltr"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (displayError) {
                        setLocalError(null);
                        clearAuthError();
                      }
                    }}
                    placeholder="اسم المستخدم (Username)"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl py-2.5 pr-9 pl-3 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  كلمة المرور
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>

                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (displayError) {
                        setLocalError(null);
                        clearAuthError();
                      }
                    }}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl py-2.5 pr-9 pl-9 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || authIsLoading}
                className="w-full py-3 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black text-xs shadow-md shadow-orange-500/20 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-1"
              >
                {submitting || authIsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>جاري التحقق والمصادقة...</span>
                  </>
                ) : (
                  <span>تسجيل الدخول</span>
                )}
              </button>
            </form>
          )}

          {/* Security Notice */}
          <div className="pt-2.5 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span>
                نظام محمي ومشفر — يتم إنشاء الحسابات عبر مدير النظام فقط
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-500 font-medium">
          محطات كويك للوقود © {new Date().getFullYear()} • جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
};
