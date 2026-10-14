import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  UserCheck,
  UserX,
  KeyRound,
  Trash2,
  X,
  Search,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Phone,
  User as UserIcon,
  Lock,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { useAuth, normalizeUsername, getInternalEmailForUsername } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';
import { UserProfile, ROLE_LABELS_AR, ROLE_BADGE_STYLES } from '../../types/auth';
import { UserRole } from '../../types/supabase';
import { logAuthEvent } from '../../services/auditService';
import { resetUserPasswordByAdmin, addNewUserByAdmin } from '../../services/adminService';
import { ModalPortal } from '../ModalPortal';

interface UsersManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UsersManagementModal: React.FC<UsersManagementModalProps> = ({ isOpen, onClose }) => {
  const { user: currentAuthUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [changePasswordUser, setChangePasswordUser] = useState<UserProfile | null>(null);
  const [confirmToggleUser, setConfirmToggleUser] = useState<UserProfile | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserProfile | null>(null);

  // Form states for Add User
  const [addUsername, setAddUsername] = useState('');
  const [addFullName, setAddFullName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('user');
  const [addPassword, setAddPassword] = useState('');
  const [addConfirmPassword, setAddConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Edit User
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editIsActive, setEditIsActive] = useState(true);

  // Form state for Admin Resetting User Password
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmNewPassword, setAdminConfirmNewPassword] = useState('');

  // Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMessage('تعذر جلب قائمة المستخدمين: ' + error.message);
      } else {
        setUsers(data as UserProfile[]);
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ غير متوقع: ' + (err?.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, loadUsers]);

  // Active Admins Count (for last-admin protection)
  const activeAdminsCount = useMemo(() => {
    return users.filter(u => u.role === 'admin' && u.is_active).length;
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (u.username && u.username.toLowerCase().includes(q)) ||
        u.full_name.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q));

      const matchesRole = roleFilter === 'all' || u.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  // Handle Add User
  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanUsername = normalizeUsername(addUsername);
    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMessage('اسم المستخدم يجب أن لا يقل عن 3 أحرف أو أرقام.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMessage('اسم المستخدم يجب أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطة سفلية.');
      return;
    }

    // Check duplicate username locally & in DB
    const existing = users.find(u => normalizeUsername(u.username) === cleanUsername);
    if (existing) {
      setErrorMessage(`اسم المستخدم [${cleanUsername}] مستخدم بالفعل، يرجى اختيار اسم مستخدم آخر.`);
      return;
    }

    if (addPassword.length < 6) {
      setErrorMessage('يجب أن تتكون كلمة المرور من 6 خانات على الأقل.');
      return;
    }

    if (addPassword !== addConfirmPassword) {
      setErrorMessage('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsSubmitting(true);

    try {
      const createRes = await addNewUserByAdmin(
        cleanUsername,
        addPassword,
        addFullName.trim() || cleanUsername,
        addRole,
        addPhone.trim() || undefined
      );

      if (!createRes.success) {
        setErrorMessage(createRes.error || 'فشل إنشاء المستخدم.');
        setIsSubmitting(false);
        return;
      }

      await logAuthEvent({
        action: 'USER_CREATED',
        details: { username: cleanUsername, role: addRole, full_name: addFullName }
      });

      setSuccessMessage(`تم إنشاء حساب المستخدم [${cleanUsername}] بنجاح.`);
      setShowAddModal(false);
      setAddUsername('');
      setAddFullName('');
      setAddPhone('');
      setAddPassword('');
      setAddConfirmPassword('');
      setAddRole('user');
      loadUsers();
    } catch (err: any) {
      setErrorMessage('حدث خطأ أثناء إنشاء المستخدم: ' + (err?.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit User
  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !editingUser) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    // Last Admin Protection: cannot demote last admin to user
    if (editingUser.role === 'admin' && editRole === 'user' && activeAdminsCount <= 1 && editingUser.is_active) {
      setErrorMessage('يجب أن يوجد مدير نظام واحد على الأقل.');
      return;
    }

    // Last Admin Protection: cannot deactivate last admin
    if (editingUser.role === 'admin' && !editIsActive && activeAdminsCount <= 1) {
      setErrorMessage('يجب أن يوجد مدير نظام واحد على الأقل.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editFullName.trim(),
          phone: editPhone.trim() || null,
          role: editRole,
          is_active: editIsActive,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', editingUser.id);

      if (error) {
        setErrorMessage('فشل تحديث بيانات المستخدم: ' + error.message);
      } else {
        await logAuthEvent({
          action: 'USER_UPDATED',
          entityId: editingUser.id,
          details: {
            username: editingUser.username,
            newRole: editRole,
            newFullName: editFullName,
            newStatus: editIsActive
          }
        });

        setSuccessMessage(`تم تحديث بيانات المستخدم [${editingUser.username}] بنجاح.`);
        setEditingUser(null);
        loadUsers();
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ أثناء التحديث: ' + (err?.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin Changing User Password via Secure Edge Function
  const handleAdminChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !changePasswordUser) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (adminNewPassword.length < 6) {
      setErrorMessage('كلمة المرور يجب أن لا تقل عن 6 خانات.');
      return;
    }

    if (adminNewPassword !== adminConfirmNewPassword) {
      setErrorMessage('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Call secure server-side Edge Function (does NOT touch caller's own password)
      const res = await resetUserPasswordByAdmin(changePasswordUser.id, adminNewPassword);

      if (!res.success) {
        setErrorMessage(res.error || 'فشل إعادة تعيين كلمة المرور للمستخدم.');
        setIsSubmitting(false);
        return;
      }

      await logAuthEvent({
        action: 'PASSWORD_RESET_BY_ADMIN',
        entityId: changePasswordUser.id,
        details: { username: changePasswordUser.username }
      });

      setSuccessMessage(
        res.message || `تم تعيين كلمة المرور الجديدة للمستخدم [${changePasswordUser.username}] بنجاح.`
      );
      setChangePasswordUser(null);
      setAdminNewPassword('');
      setAdminConfirmNewPassword('');
    } catch (err: any) {
      setErrorMessage('حدث خطأ: ' + (err?.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Toggle Active/Inactive
  const handleConfirmToggleStatus = async () => {
    if (!supabase || !confirmToggleUser) return;

    // Last Admin Protection
    if (confirmToggleUser.role === 'admin' && confirmToggleUser.is_active && activeAdminsCount <= 1) {
      setErrorMessage('يجب أن يوجد مدير نظام واحد على الأقل.');
      setConfirmToggleUser(null);
      return;
    }

    const newStatus = !confirmToggleUser.is_active;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: newStatus,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', confirmToggleUser.id);

      if (error) {
        setErrorMessage('تعذر تغيير حالة الحساب: ' + error.message);
      } else {
        await logAuthEvent({
          action: 'USER_STATUS_TOGGLED',
          entityId: confirmToggleUser.id,
          details: { username: confirmToggleUser.username, newStatus }
        });

        setSuccessMessage(
          newStatus
            ? `تم تفعيل حساب [${confirmToggleUser.username}] بنجاح.`
            : `تم تعطيل حساب [${confirmToggleUser.username}]. لن يتمكن من تسجيل الدخول.`
        );
        setConfirmToggleUser(null);
        loadUsers();
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ: ' + (err?.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Safe User Deletion
  const handleConfirmDeleteUser = async () => {
    if (!supabase || !confirmDeleteUser) return;

    // Last Admin Protection
    if (confirmDeleteUser.role === 'admin' && activeAdminsCount <= 1) {
      setErrorMessage('يجب أن يوجد مدير نظام واحد على الأقل.');
      setConfirmDeleteUser(null);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', confirmDeleteUser.id);

      if (error) {
        setErrorMessage('تعذر حذف المستخدم: ' + error.message);
      } else {
        await logAuthEvent({
          action: 'USER_DELETED',
          entityId: confirmDeleteUser.id,
          details: { username: confirmDeleteUser.username, full_name: confirmDeleteUser.full_name }
        });

        setSuccessMessage(`تم حذف المستخدم [${confirmDeleteUser.username}] بنجاح دون التأثير على السجلات التاريخية.`);
        setConfirmDeleteUser(null);
        loadUsers();
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ أثناء الحذف: ' + (err?.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-5xl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col text-right max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
              <Users className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">
                  إدارة المستخدمين
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                  صلاحية مدير النظام
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                إضافة المستخدمين وتعيين أسماء الدخول وكلمات المرور وتحديد الأدوار (Admin / User)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة مستخدم جديد</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 p-1 cursor-pointer">✕</button>
          </div>
        )}

        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-700 p-1 cursor-pointer">✕</button>
          </div>
        )}

        {/* Filter Controls */}
        <div className="p-4 sm:px-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex flex-1 items-center gap-2 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="البحث باسم المستخدم أو الاسم الكامل أو الهاتف..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="all">كافة الأدوار</option>
              <option value="admin">مدير النظام (Admin)</option>
              <option value="user">مستخدم (User)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={loadUsers}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>

        {/* Users Table */}
        <div className="overflow-y-auto flex-1 p-6">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3 text-xs">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              <span>جاري تحميل بيانات المستخدمين...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2 text-xs">
              <Users className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-600">لا يوجد مستخدمون مطابقون لمعايير البحث</p>
            </div>
          ) : (
            <div className="table-container-responsive overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5 font-mono">اسم المستخدم</th>
                    <th className="py-3 px-3.5">الاسم الكامل</th>
                    <th className="py-3 px-3.5 text-center">الدور</th>
                    <th className="py-3 px-3.5 text-center">الحالة</th>
                    <th className="py-3 px-3.5 text-center">تاريخ الإنشاء</th>
                    <th className="py-3 px-3.5 text-center w-40">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentAuthUser?.id;
                    const isOnlyAdmin = u.role === 'admin' && activeAdminsCount <= 1;

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3.5 font-mono font-bold text-slate-900 dir-ltr text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            {isSelf && (
                              <span className="text-[10px] bg-orange-100 text-orange-800 font-bold px-1.5 py-0.2 rounded border border-orange-200">
                                أنت
                              </span>
                            )}
                            <span>@{u.username}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-800">
                          {u.full_name}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ROLE_BADGE_STYLES[u.role]}`}>
                            {ROLE_LABELS_AR[u.role]}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              نشط
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              معطل
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center font-mono text-slate-500 text-[11px]">
                          {u.created_at?.slice(0, 10) || '---'}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            
                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUser(u);
                                setEditFullName(u.full_name);
                                setEditPhone(u.phone || '');
                                setEditRole(u.role);
                                setEditIsActive(u.is_active);
                              }}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-orange-600 hover:bg-orange-50 border border-slate-200 transition-colors cursor-pointer"
                              title="تعديل المستخدم"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Reset Password Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setChangePasswordUser(u);
                                setAdminNewPassword('');
                                setAdminConfirmNewPassword('');
                              }}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition-colors cursor-pointer"
                              title="تغيير كلمة المرور"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {/* Deactivate / Activate Button */}
                            <button
                              type="button"
                              disabled={isOnlyAdmin && u.is_active}
                              onClick={() => setConfirmToggleUser(u)}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                u.is_active
                                  ? 'text-rose-600 hover:bg-rose-50 border-slate-200'
                                  : 'text-emerald-600 hover:bg-emerald-50 border-slate-200'
                              }`}
                              title={
                                isOnlyAdmin && u.is_active
                                  ? 'لا يمكن تعطيل مدير النظام الوحيد'
                                  : u.is_active
                                  ? 'تعطيل الحساب'
                                  : 'تفعيل الحساب'
                              }
                            >
                              {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>

                            {/* Delete User Button */}
                            <button
                              type="button"
                              disabled={isOnlyAdmin}
                              onClick={() => setConfirmDeleteUser(u)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={isOnlyAdmin ? 'لا يمكن حذف مدير النظام الوحيد' : 'حذف المستخدم بأمان'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. ADD USER MODAL */}
      {/* ------------------------------------------------------------- */}
      {showAddModal && (
        <ModalPortal isOpen={showAddModal} onClose={() => setShowAddModal(false)} maxWidthClass="max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right">
            
            <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-orange-600" />
                <h4 className="text-base font-black text-slate-900">إضافة مستخدم جديد</h4>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="p-6 space-y-4 text-xs">
              
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">اسم المستخدم (Username) *</label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder="مثال: ahmed أو mohamed_admin"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white text-left font-mono"
                />
                <p className="text-[10px] text-slate-500">حروف إنجليزية وأرقام وشرطة سفلية فقط دون مسافات</p>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  placeholder="مثال: م. أحمد محمد"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">الدور والصلاحية *</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white cursor-pointer font-bold"
                >
                  <option value="user">مستخدم (User) - استخدام النظام والعمليات</option>
                  <option value="admin">مدير النظام (Admin) - تحكم كامل وإدارة المستخدمين</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">رقم الهاتف (اختياري)</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white text-left font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">كلمة المرور الأولية *</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">تأكيد كلمة المرور *</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={addConfirmPassword}
                  onChange={(e) => setAddConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>إنشاء المستخدم</span>
                </button>
              </div>

            </form>

          </div>
        </ModalPortal>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. EDIT USER MODAL */}
      {/* ------------------------------------------------------------- */}
      {editingUser && (
        <ModalPortal isOpen={!!editingUser} onClose={() => setEditingUser(null)} maxWidthClass="max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right">
            
            <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Edit2 className="w-5 h-5 text-orange-600" />
                <h4 className="text-base font-black text-slate-900">تعديل بيانات المستخدم</h4>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditUserSubmit} className="p-6 space-y-4 text-xs">
              
              <div className="space-y-1">
                <label className="block font-bold text-slate-500">اسم المستخدم (غير قابل للتعديل)</label>
                <input
                  type="text"
                  disabled
                  dir="ltr"
                  value={`@${editingUser.username}`}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-slate-500 text-left font-mono cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">الدور والصلاحية *</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white cursor-pointer font-bold"
                >
                  <option value="user">مستخدم (User) - استخدام النظام والعمليات</option>
                  <option value="admin">مدير النظام (Admin) - تحكم كامل وإدارة المستخدمين</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">رقم الهاتف</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white text-left font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">حالة الحساب</label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editStatus"
                      checked={editIsActive}
                      onChange={() => setEditIsActive(true)}
                      className="text-orange-500 focus:ring-orange-500"
                    />
                    <span className="font-bold text-emerald-800">نشط (Active)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="editStatus"
                      checked={!editIsActive}
                      onChange={() => setEditIsActive(false)}
                      className="text-orange-500 focus:ring-orange-500"
                    />
                    <span className="font-bold text-rose-800">معطل (Inactive)</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>حفظ التعديلات</span>
                </button>
              </div>

            </form>

          </div>
        </ModalPortal>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. CHANGE PASSWORD MODAL */}
      {/* ------------------------------------------------------------- */}
      {changePasswordUser && (
        <ModalPortal isOpen={!!changePasswordUser} onClose={() => setChangePasswordUser(null)} maxWidthClass="max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right">
            
            <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-5 h-5 text-blue-600" />
                <h4 className="text-base font-black text-slate-900">
                  تعيين كلمة مرور للمستخدم @{changePasswordUser.username}
                </h4>
              </div>
              <button onClick={() => setChangePasswordUser(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdminChangePasswordSubmit} className="p-6 space-y-4 text-xs">
              
              <p className="text-slate-600">
                أدخل كلمة المرور الجديدة للمستخدم <strong>{changePasswordUser.full_name}</strong>:
              </p>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">كلمة المرور الجديدة *</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-700">تأكيد كلمة المرور الجديدة *</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={adminConfirmNewPassword}
                  onChange={(e) => setAdminConfirmNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 outline-none focus:border-orange-500 focus:bg-white font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setChangePasswordUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>حفظ كلمة المرور</span>
                </button>
              </div>

            </form>

          </div>
        </ModalPortal>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. CONFIRM TOGGLE STATUS MODAL */}
      {/* ------------------------------------------------------------- */}
      {confirmToggleUser && (
        <ModalPortal isOpen={!!confirmToggleUser} onClose={() => setConfirmToggleUser(null)} maxWidthClass="max-w-sm">
          <div className="bg-white rounded-3xl p-6 text-right space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${confirmToggleUser.is_active ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {confirmToggleUser.is_active ? <UserX className="w-6 h-6" /> : <UserCheck className="w-6 h-6" />}
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">
                  {confirmToggleUser.is_active ? 'تأكيد تعطيل الحساب' : 'تأكيد تفعيل الحساب'}
                </h4>
                <p className="text-xs text-slate-500">
                  @{confirmToggleUser.username} ({confirmToggleUser.full_name})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmToggleUser.is_active
                ? 'عند تعطيل الحساب، لن يتمكن المستخدم من تسجيل الدخول للنظام حتى يقوم مدير النظام بإعادة تفعيله، مع الحفاظ التام على كافة السجلات والعمليات التاريخية المسندة إليه.'
                : 'سيتمكن المستخدم فوراً من تسجيل الدخول والوصول للنظام.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmToggleUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmToggleStatus}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  confirmToggleUser.is_active
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : confirmToggleUser.is_active ? (
                  'نعم، تعطيل الحساب'
                ) : (
                  'نعم، تفعيل الحساب'
                )}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. CONFIRM DELETE USER MODAL (SAFE DELETION) */}
      {/* ------------------------------------------------------------- */}
      {confirmDeleteUser && (
        <ModalPortal isOpen={!!confirmDeleteUser} onClose={() => setConfirmDeleteUser(null)} maxWidthClass="max-w-sm">
          <div className="bg-white rounded-3xl p-6 text-right space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-600">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">
                  تأكيد حذف المستخدم
                </h4>
                <p className="text-xs text-slate-500">
                  @{confirmDeleteUser.username} ({confirmDeleteUser.full_name})
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold space-y-1">
              <p>هل أنت متأكد من حذف هذا المستخدم؟</p>
              <p className="text-[11px] text-amber-800">
                ملاحظة أمان: لن يتم حذف أي سجلات صيانة أو تفتيش أو حوادث تاريخية من قاعدة البيانات.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'نعم، حذف المستخدم'}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

    </ModalPortal>
  );
};
