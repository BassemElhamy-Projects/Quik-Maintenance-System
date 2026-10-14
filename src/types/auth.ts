export type UserRole = 'admin' | 'user';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthAuditLogPayload {
  action:
    | 'LOGIN'
    | 'LOGOUT'
    | 'USER_CREATED'
    | 'USER_UPDATED'
    | 'USER_STATUS_TOGGLED'
    | 'USER_DELETED'
    | 'PASSWORD_CHANGED'
    | 'PASSWORD_RESET_BY_ADMIN';
  entityId?: string;
  details?: Record<string, any>;
}

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  admin: 'مدير النظام (Admin)',
  user: 'مستخدم (User)'
};

export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  admin: 'bg-rose-100 text-rose-800 border-rose-200',
  user: 'bg-orange-100 text-orange-900 border-orange-200'
};
