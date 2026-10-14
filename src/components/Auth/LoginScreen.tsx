
import React, { useState, useEffect } from 'react';
import { Lock, User, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck, UserPlus, Phone } from 'lucide-react';
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

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // First Admin Setup state
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
    const res = await loginWithUsername(trimmedUsername, password);
    setSubmitting(false);

    if (!res.success && res.error) {
      setLocalError(res.error);
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
      setLocalError('اسم المستخدم يجب أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطة سفلية.');
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

    const res = await initializeFirstAdmin(
      trimmedUsername,
      adminPassword,
      adminFullName.trim() || 'مدير النظام الأول',
      adminPhone.trim() || undefined
    );

    setSubmitting(false);

    if (!res.success && res.error) {
      setLocalError(res.error);
    }
  };

  const displayError = localError || authError;

  if (isFirstAdminSetup) {
    console.log('[AUTH DEBUG] RENDERING FIRST ADMIN SETUP');
  } else {
    console.log('[AUTH DEBUG] RENDERING LOGIN');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 dir-rtl font-['Cairo',sans-serif] selection:bg-orange-500 selection:text-white relative overflow-hidden">

      {/* Background Subtle Accents */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-600/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md space-y-6 relative z-10">

        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="flex justify-center mb-1">
            <img
              src="/quik-logo.png"
              alt="Quik Logo"
              className="w-72 h-40 object-contain"
            />
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 font-['Cairo']">
              كويك لمحطات الوقود
            </h1>
            <p className="text-orange-600 font-bold text-xs sm:text-sm tracking-wide mt-0.5">
              نظام إدارة الصيانة والتفتيش
            </p>
          </div>

          {isFirstAdminSetup ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100/80 border border-orange-200 text-orange-800 text-xs font-bold">
              <UserPlus className="w-3.5 h-3.5 text-orange-600" />
              <span>تهيئة مدير النظام الأول (Setup Mode)</span>
            </div>
          ) : (
            <p className="text-slate-500 text-xs max-w-xs mx-auto font-medium">
              سجل دخولك باسم المستخدم وكلمة المرور للوصول إلى النظام
            </p>
          )}
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/90 p-6 sm:p-8 rounded-3xl shadow-xl shadow-slate-200/60 space-y-5 text-right">

          {/* Error Banner */}
          {displayError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{displayError}</span>
            </div>
          )}

          {!isSupabaseReady && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                تعذر تهيئة الاتصال بالخدمة السحابية. يرجى التواصل مع مسؤول النظام.
              </span>
            </div>
          )}

          {isCheckingSetup ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500 text-xs font-medium">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <span>جاري التحقق من إعدادات النظام...</span>
            </div>
          ) : isFirstAdminSetup ? (
            /* FIRST ADMIN INITIALIZATION FORM */
            <form onSubmit={handleSubmitFirstAdmin} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-orange-50 border border-orange-200/80 text-slate-700 text-xs leading-relaxed">
                <p className="font-bold text-orange-800 mb-1">ترحيب بالنظام الجديد:</p>
                لم يتم تسجيل أي مدير نظام بعد. يرجى إدخال اسم المستخدم وكلمة المرور التي ترغب بها لإنشاء حساب المدير الأول.
              </div>

              {/* Admin Username Field */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  اسم مستخدم المدير (Admin Username)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
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
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-2xl py-2.5 pr-10 pl-4 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  required
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="الاسم الكامل لمدير النظام"
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-2xl py-2.5 px-4 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-right"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  رقم الهاتف (اختياري)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    placeholder="05xxxxxxxx"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-2xl py-2.5 pr-10 pl-4 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              {/* Admin Password Field */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  كلمة المرور (اختر كلمة المرور)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
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
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-2xl py-2.5 pr-10 pl-10 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showAdminPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-2xl py-2.5 pr-10 pl-4 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || authIsLoading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black text-xs tracking-wide shadow-lg shadow-orange-500/20 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-3"
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
            /* STANDARD LOGIN FORM */
            <form onSubmit={handleSubmitLogin} className="space-y-4">

              {/* Username Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  اسم المستخدم
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
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
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-2xl py-3 pr-10 pl-4 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  كلمة المرور
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
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
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-2xl py-3 pr-10 pl-10 text-xs font-semibold text-slate-900 placeholder-slate-400 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-left font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || authIsLoading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black text-xs tracking-wide shadow-lg shadow-orange-500/20 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
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
          <div className="pt-3 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-500" />
              <span>نظام محمي ومشفر — يتم إنشاء الحسابات عبر مدير النظام فقط</span>
            </p>
          </div>

        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500 font-medium">
          محطات كويك للوقود © {new Date().getFullYear()} • جميع الحقوق محفوظة
        </p>

      </div>
    </div>
  );
};
