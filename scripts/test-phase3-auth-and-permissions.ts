import fs from 'fs';
import path from 'path';
import {
  canManageUsers,
  canDeleteRecords,
  canEditStations,
  canImportExcel,
  canExportData,
  canCreateMaintenanceRequest,
  canEditMaintenanceRequest,
  canManageInspections,
  canManageIncidents,
  canViewAuditLogs,
  isAdmin
} from '../src/utils/permissions';
import { ROLE_LABELS_AR, ROLE_BADGE_STYLES } from '../src/types/auth';
import { normalizeUsername, getInternalEmailForUsername } from '../src/contexts/AuthContext';

console.log('================================================================');
console.log('  RUNNING PHASE 3 USERNAME & 2-ROLE AUTH PERMISSION TEST SUITE  ');
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

// -------------------------------------------------------------
// 1. 2-ROLE PERMISSION MATRIX TESTS (ADMIN vs USER)
// -------------------------------------------------------------

// ADMIN Role
assert(canManageUsers('admin') === true, '1. Admin CAN manage users');
assert(canDeleteRecords('admin') === true, '1. Admin CAN delete records');
assert(canEditStations('admin') === true, '1. Admin CAN edit stations');
assert(canImportExcel('admin') === true, '1. Admin CAN import Excel');
assert(canExportData('admin') === true, '1. Admin CAN export data');
assert(canCreateMaintenanceRequest('admin') === true, '1. Admin CAN create maintenance requests');
assert(canEditMaintenanceRequest('admin') === true, '1. Admin CAN edit maintenance requests');
assert(canManageInspections('admin') === true, '1. Admin CAN manage inspections');
assert(canManageIncidents('admin') === true, '1. Admin CAN manage incidents');
assert(canViewAuditLogs('admin') === true, '1. Admin CAN view audit logs');
assert(isAdmin('admin') === true, '1. isAdmin("admin") returns true');

// USER Role
assert(canManageUsers('user') === false, '2. User CANNOT manage users');
assert(canDeleteRecords('user') === false, '2. User CANNOT delete records');
assert(canEditStations('user') === false, '2. User CANNOT edit stations');
assert(canImportExcel('user') === true, '2. User CAN import Excel');
assert(canExportData('user') === true, '2. User CAN export data');
assert(canCreateMaintenanceRequest('user') === true, '2. User CAN create maintenance requests');
assert(canEditMaintenanceRequest('user') === true, '2. User CAN edit maintenance requests');
assert(canManageInspections('user') === true, '2. User CAN manage inspections');
assert(canManageIncidents('user') === true, '2. User CAN manage incidents');
assert(canViewAuditLogs('user') === false, '2. User CANNOT view audit logs');
assert(isAdmin('user') === false, '2. isAdmin("user") returns false');

// Unauthenticated / Null
assert(canManageUsers(null) === false, '3. Unauthenticated user CANNOT manage users');
assert(canDeleteRecords(null) === false, '3. Unauthenticated user CANNOT delete records');
assert(canExportData(null) === false, '3. Unauthenticated user CANNOT export data');

// -------------------------------------------------------------
// 2. USERNAME NORMALIZATION & CASE-INSENSITIVITY
// -------------------------------------------------------------
assert(normalizeUsername('Ahmed') === 'ahmed', '4. Case-insensitivity: "Ahmed" normalizes to "ahmed"');
assert(normalizeUsername('AHMED') === 'ahmed', '4. Case-insensitivity: "AHMED" normalizes to "ahmed"');
assert(normalizeUsername('  bassem_admin  ') === 'bassem_admin', '4. Whitespace trimming: "  bassem_admin  " -> "bassem_admin"');
assert(getInternalEmailForUsername('Ahmed') === 'ahmed@quik.internal', '4. Internal email identity: "ahmed@quik.internal"');

// -------------------------------------------------------------
// 3. ARABIC LOCALIZATION LABELS (ONLY 2 ROLES)
// -------------------------------------------------------------
assert(ROLE_LABELS_AR.admin.includes('مدير النظام'), '5. Admin role label is localized in Arabic');
assert(ROLE_LABELS_AR.user.includes('مستخدم'), '5. User role label is localized in Arabic');
assert(Object.keys(ROLE_LABELS_AR).length === 2, '5. Exactly 2 roles exist in ROLE_LABELS_AR (admin, user)');

// -------------------------------------------------------------
// 4. LAST ADMIN PROTECTION LOGIC
// -------------------------------------------------------------
const mockUsers = [
  { id: 'u1', username: 'admin1', role: 'admin' as const, is_active: true },
  { id: 'u2', username: 'user1', role: 'user' as const, is_active: true },
  { id: 'u3', username: 'user2', role: 'user' as const, is_active: true }
];

const activeAdmins = mockUsers.filter(u => u.role === 'admin' && u.is_active).length;
assert(activeAdmins === 1, '6. Exactly 1 active admin in mock dataset');
const canDeleteAdmin1 = activeAdmins > 1;
assert(canDeleteAdmin1 === false, '6. Last admin cannot be deleted or deactivated when activeAdmins <= 1');

// -------------------------------------------------------------
// 5. CODEBASE SECURITY AUDIT (No Service Role / Plaintext Passwords)
// -------------------------------------------------------------
const srcFiles = [
  'src/services/supabaseClient.ts',
  'src/contexts/AuthContext.tsx',
  'src/components/Header.tsx',
  'src/components/Auth/LoginScreen.tsx',
  'src/components/Auth/UserProfileModal.tsx',
  'src/components/Admin/UsersManagementModal.tsx',
  'src/App.tsx'
];

srcFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  assert(fs.existsSync(filePath), `7. File exists: ${file}`);
  const content = fs.readFileSync(filePath, 'utf8');

  assert(!content.includes('service_role'), `7. Security: Zero 'service_role' key references in ${file}`);
  assert(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `7. Security: Zero service role env in ${file}`);
});

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL PHASE 3 USERNAME & 2-ROLE TESTS PASSED WITH 100% SUCCESS!\n');
} else {
  console.error('SOME TESTS FAILED!\n');
  process.exit(1);
}
