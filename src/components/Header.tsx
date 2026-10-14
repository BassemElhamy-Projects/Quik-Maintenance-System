
import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  Database,
  User,
  Users,
  LogOut,
  ChevronDown,
  Shield,
  KeyRound
} from 'lucide-react';
import { SectionType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS_AR, ROLE_BADGE_STYLES } from '../types/auth';
import { UserProfileModal } from './Auth/UserProfileModal';
import { UsersManagementModal } from './Admin/UsersManagementModal';

export interface HeaderProps {
  activeSection: SectionType | 'home';
  onNavigateHome: () => void;
  onOpenBackupModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  onNavigateHome,
  onOpenBackupModal
}) => {
  const { profile, role, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isUsersManagementOpen, setIsUsersManagementOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
  };

  const userRole = role || 'user';
  const roleLabel = ROLE_LABELS_AR[userRole] || 'مستخدم';
  const roleBadgeStyle =
    ROLE_BADGE_STYLES[userRole] ||
    'bg-orange-100 text-orange-900 border-orange-200';

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-[68px] sm:min-h-20 gap-2 sm:gap-4">

            {/* Right Side: Company Logo and Title */}
            <div className="flex items-center min-w-0">
              <button
                onClick={onNavigateHome}
                className="flex items-center gap-2 sm:gap-3 text-right group focus:outline-hidden transition-transform active:scale-98 cursor-pointer min-w-0"
                title="العودة إلى لوحة التحكم الرئيسية"
              >
                {/* Quik Logo */}
                <div className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center shrink-0">
                  <img
                    src="/quik-logo.png"
                    alt="Quik"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Company Name and Description */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm sm:text-lg font-black text-slate-900 tracking-tight leading-tight group-hover:text-orange-600 transition-colors">
                      كويك لمحطات الوقود
                    </span>

                    <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100/80 text-orange-800 border border-orange-200 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-pulse" />
                      نظام سحابي
                    </span>
                  </div>

                  <p className="hidden xs:block text-[10px] sm:text-xs font-bold text-slate-500 mt-1 leading-tight">
                    نظام إدارة الصيانة والتفتيش الدوري والحوادث
                  </p>
                </div>
              </button>
            </div>

            {/* Left Side: Actions and User Profile */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">

              {/* Home Button */}
              <button
                onClick={onNavigateHome}
                className={`px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSection === 'home'
                    ? 'bg-orange-50 text-orange-700 border border-orange-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="الرئيسية"
              >
                <Home className="w-4 h-4 text-orange-600" />
                <span className="hidden sm:inline">الرئيسية</span>
              </button>

              {/* Backup and Data */}
              <button
                onClick={onOpenBackupModal}
                className="px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                title="النسخ الاحتياطي والبيانات"
              >
                <Database className="w-4 h-4 text-slate-600" />
                <span className="hidden md:inline">النسخ الاحتياطي والبيانات</span>
                <span className="md:hidden">البيانات</span>
              </button>

              {/* User Profile Dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-1.5 sm:gap-2.5 p-1.5 sm:px-3 sm:py-2 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer focus:outline-hidden"
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-700 border border-orange-200 flex items-center justify-center font-bold text-xs shrink-0">
                    <User className="w-4 h-4" />
                  </div>

                  <div className="hidden lg:flex flex-col text-right leading-tight">
                    <span className="text-xs font-bold text-slate-900 truncate max-w-[120px]">
                      {profile?.full_name || profile?.username || 'مستخدم النظام'}
                    </span>

                    <span className="text-[10px] text-slate-500 font-medium">
                      {userRole === 'admin' ? 'مدير النظام' : 'مستخدم'}
                    </span>
                  </div>

                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                      isUserMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div className="absolute left-0 mt-2 w-64 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 text-right animate-in fade-in zoom-in-95 duration-150">

                    {/* User Information */}
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 rounded-t-2xl">
                      <div className="font-bold text-xs text-slate-900 truncate">
                        {profile?.full_name || 'مستخدم النظام'}
                      </div>

                      <div className="text-[11px] text-slate-500 truncate mt-0.5 dir-ltr text-right">
                        @{profile?.username || 'user'}
                      </div>

                      <div className="mt-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleBadgeStyle}`}>
                          <Shield className="w-3 h-3" />
                          <span>{roleLabel}</span>
                        </span>
                      </div>
                    </div>

                    {/* Profile and Password */}
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsProfileModalOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4 text-slate-500" />
                        <span>الملف الشخصي وتغيير كلمة المرور</span>
                      </button>

                      {/* Admin User Management */}
                      {userRole === 'admin' && (
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            setIsUsersManagementOpen(true);
                          }}
                          className="w-full px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-100"
                        >
                          <Users className="w-4 h-4 text-orange-600" />

                          <div className="flex items-center justify-between flex-1">
                            <span>إدارة المستخدمين والصلاحيات</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded font-semibold">
                              إدارة
                            </span>
                          </div>
                        </button>
                      )}

                      {/* Logout */}
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-100"
                      >
                        <LogOut className="w-4 h-4 text-rose-600" />
                        <span>تسجيل الخروج</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Profile and Password Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* Admin Users Management Modal */}
      {userRole === 'admin' && (
        <UsersManagementModal
          isOpen={isUsersManagementOpen}
          onClose={() => setIsUsersManagementOpen(false)}
        />
      )}
    </>
  );
};
