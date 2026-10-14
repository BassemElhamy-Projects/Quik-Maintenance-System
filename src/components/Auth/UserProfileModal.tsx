import React, { useState } from 'react';
import { X, User, Key, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_LABELS_AR, ROLE_BADGE_STYLES } from '../../types/auth';
import { ModalPortal } from '../ModalPortal';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateUserPassword } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !profile) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsUpdating(true);
    const res = await updateUserPassword(newPassword);
    setIsUpdating(false);

    if (res.success) {
      setSuccessMsg('تم تحديث كلمة المرور بنجاح.');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setErrorMsg(res.error || 'تعذر تحديث كلمة المرور.');
    }
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                الملف الشخصي
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                معلومات الحساب والصلاحيات
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 px-5 pt-3 gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer border-b-2 ${
              activeTab === 'profile'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            بيانات الحساب
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('password');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer border-b-2 ${
              activeTab === 'password'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            تغيير كلمة المرور
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'profile' ? (
            <div className="space-y-3.5 text-xs">
              
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[11px] font-bold text-slate-500">اسم المستخدم</span>
                <p className="text-sm font-mono font-black text-slate-900 dir-ltr text-right">@{profile.username}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[11px] font-bold text-slate-500">الاسم الكامل</span>
                <p className="text-sm font-black text-slate-900">{profile.full_name}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[11px] font-bold text-slate-500">الدور والصلاحية</span>
                <div className="pt-1">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${ROLE_BADGE_STYLES[profile.role]}`}>
                    {ROLE_LABELS_AR[profile.role]}
                  </span>
                </div>
              </div>

              {profile.phone && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[11px] font-bold text-slate-500">رقم الهاتف</span>
                  <p className="text-sm font-mono text-slate-900 dir-ltr text-right">{profile.phone}</p>
                </div>
              )}

            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-slate-900 outline-none focus:border-orange-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-slate-900 outline-none focus:border-orange-500 focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isUpdating}
                className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <span>حفظ كلمة المرور</span>
                )}
              </button>
            </form>
          )}

        </div>

      </div>
    </ModalPortal>
  );
};
