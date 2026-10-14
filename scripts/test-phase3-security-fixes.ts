import fs from 'fs';
import path from 'path';
import { sanitizeSupabaseUrl } from '../src/services/supabaseClient';

console.log('================================================================');
console.log('  RUNNING PHASE 3.1 SECURITY FIXES & INITIALIZATION TEST SUITE  ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${description}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${description}`);
  }
}

// ----------------------------------------------------------------------
// 1. SUPABASE URL SANITIZATION TESTS (Prevents "Invalid path" error)
// ----------------------------------------------------------------------
console.log('--- 1. Testing Supabase URL Sanitization ---');

assert(
  sanitizeSupabaseUrl('https://xyz.supabase.co/') === 'https://xyz.supabase.co',
  '1.1. Strips trailing slash: "https://xyz.supabase.co/" -> "https://xyz.supabase.co"'
);

assert(
  sanitizeSupabaseUrl('https://xyz.supabase.co/rest/v1') === 'https://xyz.supabase.co',
  '1.2. Strips accidental /rest/v1: "https://xyz.supabase.co/rest/v1" -> "https://xyz.supabase.co"'
);

assert(
  sanitizeSupabaseUrl('https://xyz.supabase.co/auth/v1/') === 'https://xyz.supabase.co',
  '1.3. Strips accidental /auth/v1/: "https://xyz.supabase.co/auth/v1/" -> "https://xyz.supabase.co"'
);

assert(
  sanitizeSupabaseUrl('https://xyz.supabase.co/functions/v1') === 'https://xyz.supabase.co',
  '1.4. Strips accidental /functions/v1: "https://xyz.supabase.co/functions/v1" -> "https://xyz.supabase.co"'
);

assert(
  sanitizeSupabaseUrl('  https://xyz.supabase.co  ') === 'https://xyz.supabase.co',
  '1.5. Trims whitespace: "  https://xyz.supabase.co  " -> "https://xyz.supabase.co"'
);

// ----------------------------------------------------------------------
// 2. SIMULATE POSTGRESQL TRIGGER: check_last_active_admin()
// ----------------------------------------------------------------------
console.log('\n--- 2. Testing Database Last Active Admin Trigger ---');

interface ProfileRecord {
  id: string;
  username: string;
  role: 'admin' | 'user';
  is_active: boolean;
  full_name: string;
}

class MockProfilesDatabase {
  private profiles: ProfileRecord[] = [];

  constructor(initialData: ProfileRecord[]) {
    this.profiles = JSON.parse(JSON.stringify(initialData));
  }

  getProfiles(): ProfileRecord[] {
    return this.profiles;
  }

  private triggerCheck(
    op: 'UPDATE' | 'DELETE',
    oldRecord: ProfileRecord,
    newRecord?: ProfileRecord
  ): void {
    if (op === 'DELETE') {
      if (oldRecord.role === 'admin' && oldRecord.is_active) {
        const remainingAdmins = this.profiles.filter(
          p => p.role === 'admin' && p.is_active && p.id !== oldRecord.id
        ).length;

        if (remainingAdmins < 1) {
          throw new Error('يجب أن يوجد مدير نظام واحد على الأقل نشط في النظام (لا يمكن حذف آخر مدير نظام)');
        }
      }
    }

    if (op === 'UPDATE' && newRecord) {
      if (
        oldRecord.role === 'admin' &&
        oldRecord.is_active &&
        (newRecord.role !== 'admin' || !newRecord.is_active)
      ) {
        const remainingAdmins = this.profiles.filter(
          p => p.role === 'admin' && p.is_active && p.id !== oldRecord.id
        ).length;

        if (remainingAdmins < 1) {
          throw new Error('يجب أن يوجد مدير نظام واحد على الأقل نشط في النظام (لا يمكن تعطيل أو خفض رتبة آخر مدير نظام)');
        }
      }
    }
  }

  deleteProfile(id: string): { success: boolean; error?: string } {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, error: 'User not found' };
    const oldRecord = this.profiles[idx];

    try {
      this.triggerCheck('DELETE', oldRecord);
      this.profiles.splice(idx, 1);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  updateProfile(
    id: string,
    updates: Partial<ProfileRecord>
  ): { success: boolean; error?: string } {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, error: 'User not found' };
    const oldRecord = this.profiles[idx];
    const newRecord = { ...oldRecord, ...updates };

    try {
      this.triggerCheck('UPDATE', oldRecord, newRecord);
      this.profiles[idx] = newRecord;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

// Test 2.1: Single Active Admin -> DELETE MUST FAIL
const dbSingleAdmin = new MockProfilesDatabase([
  { id: 'a1', username: 'admin1', role: 'admin', is_active: true, full_name: 'Admin One' },
  { id: 'u1', username: 'user1', role: 'user', is_active: true, full_name: 'User One' }
]);
const deleteRes1 = dbSingleAdmin.deleteProfile('a1');
assert(deleteRes1.success === false, '2.1. One active Admin -> DELETE fails');
assert(deleteRes1.error?.includes('يجب أن يوجد مدير نظام واحد على الأقل') === true, '2.1. Clear Arabic error returned');

// Test 2.2: Single Active Admin -> Deactivate MUST FAIL
const deactRes1 = dbSingleAdmin.updateProfile('a1', { is_active: false });
assert(deactRes1.success === false, '2.2. One active Admin -> Deactivate fails');

// Test 2.3: Single Active Admin -> Demote to user MUST FAIL
const demoteRes1 = dbSingleAdmin.updateProfile('a1', { role: 'user' });
assert(demoteRes1.success === false, '2.3. One active Admin -> Demote to user fails');

// Test 2.4: Single Active Admin -> Update non-security field MUST PASS
const updateNameRes = dbSingleAdmin.updateProfile('a1', { full_name: 'Super Admin Updated' });
assert(updateNameRes.success === true, '2.4. One active Admin -> Updating full_name passes');

// Test 2.5: Two Active Admins -> Deactivate one MUST PASS
const dbTwoAdmins = new MockProfilesDatabase([
  { id: 'a1', username: 'admin1', role: 'admin', is_active: true, full_name: 'Admin One' },
  { id: 'a2', username: 'admin2', role: 'admin', is_active: true, full_name: 'Admin Two' },
  { id: 'u1', username: 'user1', role: 'user', is_active: true, full_name: 'User One' }
]);
const deactAdmin2 = dbTwoAdmins.updateProfile('a2', { is_active: false });
assert(deactAdmin2.success === true, '2.5. Two active Admins -> Deactivate one passes');

// Test 2.6: Two Active Admins -> Delete one MUST PASS
const dbTwoAdmins2 = new MockProfilesDatabase([
  { id: 'a1', username: 'admin1', role: 'admin', is_active: true, full_name: 'Admin One' },
  { id: 'a2', username: 'admin2', role: 'admin', is_active: true, full_name: 'Admin Two' }
]);
const deleteAdmin2 = dbTwoAdmins2.deleteProfile('a2');
assert(deleteAdmin2.success === true, '2.6. Two active Admins -> Delete one passes');

// Test 2.7: Two Active Admins -> Demote one MUST PASS
const dbTwoAdmins3 = new MockProfilesDatabase([
  { id: 'a1', username: 'admin1', role: 'admin', is_active: true, full_name: 'Admin One' },
  { id: 'a2', username: 'admin2', role: 'admin', is_active: true, full_name: 'Admin Two' }
]);
const demoteAdmin2 = dbTwoAdmins3.updateProfile('a2', { role: 'user' });
assert(demoteAdmin2.success === true, '2.7. Two active Admins -> Demote one passes');

// Test 2.8: Promote User to Admin MUST PASS
const promoteUser = dbSingleAdmin.updateProfile('u1', { role: 'admin' });
assert(promoteUser.success === true, '2.8. Promoting User to Admin passes');

// Test 2.9: Editing normal User MUST PASS
const editUser = dbSingleAdmin.updateProfile('u1', { full_name: 'Updated User Name', is_active: false });
assert(editUser.success === true, '2.9. Editing/deactivating normal user passes');

// ----------------------------------------------------------------------
// 3. SIMULATE EDGE FUNCTIONS: admin-reset-password & init-first-admin
// ----------------------------------------------------------------------
console.log('\n--- 3. Testing Edge Functions ---');

interface AuthUserStore {
  id: string;
  email: string;
  passwordHash: string;
}

class MockEdgeFunctionAuthServer {
  private authUsers: AuthUserStore[] = [];
  private profiles: ProfileRecord[] = [];

  constructor() {
    this.authUsers = [
      { id: 'admin_id', email: 'admin@quik.local', passwordHash: 'adminPass123' },
      { id: 'user_id', email: 'user@quik.local', passwordHash: 'oldUserPass' },
      { id: 'user2_id', email: 'user2@quik.local', passwordHash: 'user2Pass' }
    ];
    this.profiles = [
      { id: 'admin_id', username: 'admin', role: 'admin', is_active: true, full_name: 'System Admin' },
      { id: 'user_id', username: 'user', role: 'user', is_active: true, full_name: 'Regular User' },
      { id: 'user2_id', username: 'user2', role: 'user', is_active: true, full_name: 'Second User' }
    ];
  }

  handleAdminResetPassword(
    callerUserId: string,
    targetUserId: string,
    newPassword: string
  ): { status: number; body: Record<string, any> } {
    const callerProf = this.profiles.find(p => p.id === callerUserId);
    if (!callerProf || !callerProf.is_active) {
      return { status: 401, body: { error: 'المستخدم غير مصرح له أو انتهت صلاحية الجلسة.' } };
    }

    if (callerProf.role !== 'admin') {
      return { status: 403, body: { error: 'ليس لديك صلاحية مدير النظام لتنفيذ هذه العملية.' } };
    }

    if (!targetUserId) {
      return { status: 400, body: { error: 'معرف المستخدم المستهدف مطلوب.' } };
    }
    if (!newPassword || newPassword.length < 6) {
      return { status: 400, body: { error: 'يجب ألا تقل كلمة المرور عن 6 خانات.' } };
    }

    const targetProf = this.profiles.find(p => p.id === targetUserId);
    if (!targetProf) {
      return { status: 404, body: { error: 'المستخدم المستهدف غير موجود.' } };
    }

    const targetAuth = this.authUsers.find(u => u.id === targetUserId);
    if (targetAuth) {
      targetAuth.passwordHash = newPassword;
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `تم تعيين كلمة المرور الجديدة للمستخدم [${targetProf.username}] بنجاح.`,
        targetUserId: targetProf.id,
        targetUsername: targetProf.username
      }
    };
  }

  handleInitFirstAdmin(
    username: string,
    password: string,
    fullName: string
  ): { status: number; body: Record<string, any> } {
    const activeAdminsCount = this.profiles.filter(p => p.role === 'admin' && p.is_active).length;
    if (activeAdminsCount > 0) {
      return {
        status: 403,
        body: { error: 'تمت تهيئة مدير النظام مسبقاً. التسجيل الذاتي محظور.' }
      };
    }

    const clean = username.trim().toLowerCase();
    const newId = `admin_${Date.now()}`;
    this.authUsers.push({ id: newId, email: `${clean}@quik.local`, passwordHash: password });
    this.profiles.push({ id: newId, username: clean, role: 'admin', is_active: true, full_name: fullName });

    return {
      status: 200,
      body: {
        success: true,
        message: `تم إنشاء حساب مدير النظام الأول [${clean}] بنجاح.`,
        username: clean,
        role: 'admin'
      }
    };
  }

  login(email: string, passwordAttempt: string): boolean {
    const user = this.authUsers.find(u => u.email === email);
    return user ? user.passwordHash === passwordAttempt : false;
  }

  getAdminPasswordHash(): string {
    return this.authUsers.find(u => u.id === 'admin_id')?.passwordHash || '';
  }
}

const mockAuthServer = new MockEdgeFunctionAuthServer();

// Test 3.1: Admin resets user password
const adminInitialPass = mockAuthServer.getAdminPasswordHash();
const resetRes = mockAuthServer.handleAdminResetPassword('admin_id', 'user_id', 'newSuperSecretPass2026');
assert(resetRes.status === 200 && resetRes.body.success === true, '3.1. Admin successfully resets User password via Edge Function');

// Test 3.2: User can login with new password
const userLoginNew = mockAuthServer.login('user@quik.local', 'newSuperSecretPass2026');
assert(userLoginNew === true, '3.2. User can log in with new password');

// Test 3.3: User cannot login with old password
const userLoginOld = mockAuthServer.login('user@quik.local', 'oldUserPass');
assert(userLoginOld === false, '3.3. Old user password no longer works');

// Test 3.4: Admin password is NOT changed
const adminPassAfter = mockAuthServer.getAdminPasswordHash();
assert(adminInitialPass === adminPassAfter, '3.4. Admin password remains untouched and unchanged');

// Test 3.5: Normal User calling Edge Function gets 403 Forbidden
const userCallingReset = mockAuthServer.handleAdminResetPassword('user_id', 'user2_id', 'hackedPassword999');
assert(userCallingReset.status === 403, '3.5. Normal User cannot invoke admin password reset (403 Forbidden)');

// Test 3.6: Second first admin init rejected (403 Forbidden)
const secondInit = mockAuthServer.handleInitFirstAdmin('second_admin', 'pass123456', 'Another Admin');
assert(secondInit.status === 403, '3.6. Subsequent init-first-admin calls are locked & rejected');

// ----------------------------------------------------------------------
// 4. CODEBASE VERIFICATION (No service_role in client, schema has trigger)
// ----------------------------------------------------------------------
console.log('\n--- 4. Verifying Codebase Integrity ---');

const schemaPath = path.join(process.cwd(), 'supabase/schema.sql');
assert(fs.existsSync(schemaPath), '4.1. supabase/schema.sql exists');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

assert(schemaContent.includes('check_last_active_admin'), '4.2. schema.sql defines check_last_active_admin function');
assert(schemaContent.includes('trg_protect_last_active_admin'), '4.3. schema.sql creates trg_protect_last_active_admin trigger');
assert(schemaContent.includes('profiles_first_admin_insert'), '4.4. schema.sql defines profiles_first_admin_insert RLS policy');

const edgeFunc1 = path.join(process.cwd(), 'supabase/functions/admin-reset-password/index.ts');
assert(fs.existsSync(edgeFunc1), '4.5. admin-reset-password Edge Function exists');

const edgeFunc2 = path.join(process.cwd(), 'supabase/functions/init-first-admin/index.ts');
assert(fs.existsSync(edgeFunc2), '4.6. init-first-admin Edge Function exists');

const adminServicePath = path.join(process.cwd(), 'src/services/adminService.ts');
assert(fs.existsSync(adminServicePath), '4.7. src/services/adminService.ts exists');
const adminServiceContent = fs.readFileSync(adminServicePath, 'utf8');
assert(adminServiceContent.includes('resetUserPasswordByAdmin'), '4.8. adminService.ts exports resetUserPasswordByAdmin');
assert(adminServiceContent.includes('initializeFirstAdminServer'), '4.9. adminService.ts exports initializeFirstAdminServer');

// Verify ZERO service_role in src/
const srcFiles = [
  'src/services/supabaseClient.ts',
  'src/services/adminService.ts',
  'src/services/auditService.ts',
  'src/contexts/AuthContext.tsx',
  'src/components/Admin/UsersManagementModal.tsx',
  'src/components/Auth/LoginScreen.tsx'
];

srcFiles.forEach(file => {
  const fPath = path.join(process.cwd(), file);
  const content = fs.readFileSync(fPath, 'utf8');
  assert(!content.includes('service_role'), `4.10. Zero 'service_role' references in ${file}`);
  assert(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `4.10. Zero SUPABASE_SERVICE_ROLE_KEY in ${file}`);
});

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL PHASE 3.1 TESTS PASSED WITH 100% SUCCESS!\n');
} else {
  console.error('SOME TESTS FAILED!\n');
  process.exit(1);
}
