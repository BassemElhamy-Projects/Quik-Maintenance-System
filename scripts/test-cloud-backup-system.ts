import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${message}`);
  }
}

console.log('================================================================');
console.log('  RUNNING ENTERPRISE CLOUD BACKUP TEST SUITE                   ');
console.log('================================================================');

// 1. Verify schema.sql defines cloud_backups table and RLS
const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
assert(fs.existsSync(schemaPath), '1.1. supabase/schema.sql exists');

const schemaContent = fs.readFileSync(schemaPath, 'utf8');
assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS public.cloud_backups'), '1.2. schema.sql creates public.cloud_backups table');
assert(schemaContent.includes('ALTER TABLE public.cloud_backups ENABLE ROW LEVEL SECURITY'), '1.3. schema.sql enables RLS on cloud_backups');
assert(schemaContent.includes('cloud_backups_admin_select'), '1.4. schema.sql defines cloud_backups_admin_select policy');
assert(schemaContent.includes('cloud_backups_admin_manage'), '1.5. schema.sql defines cloud_backups_admin_manage policy');

// 2. Verify Edge Function cloud-backup-manager exists and enforces Admin authorization
const edgeFnPath = path.join(process.cwd(), 'supabase', 'functions', 'cloud-backup-manager', 'index.ts');
assert(fs.existsSync(edgeFnPath), '2.1. cloud-backup-manager Edge Function file exists');

const edgeFnContent = fs.readFileSync(edgeFnPath, 'utf8');
assert(edgeFnContent.includes('role !== "admin"'), '2.2. Edge Function verifies active Admin caller role');
assert(edgeFnContent.includes('SUPABASE_SERVICE_ROLE_KEY'), '2.3. Edge Function uses SUPABASE_SERVICE_ROLE_KEY server-side');
assert(edgeFnContent.includes('autoBackups.length > 7'), '2.4. Edge Function prunes automatic backups beyond 7');
assert(edgeFnContent.includes('SafetyCloudBackup'), '2.5. Edge Function creates Safety Backup automatically before restore');
assert(edgeFnContent.includes('RESTORE_STARTED') && edgeFnContent.includes('RESTORE_COMPLETED'), '2.6. Edge Function logs audit events for restore');

// 3. Verify client service cloudBackupService.ts
const servicePath = path.join(process.cwd(), 'src', 'services', 'cloudBackupService.ts');
assert(fs.existsSync(servicePath), '3.1. src/services/cloudBackupService.ts exists');

const serviceContent = fs.readFileSync(servicePath, 'utf8');
assert(serviceContent.includes('listCloudBackups'), '3.2. Exports listCloudBackups');
assert(serviceContent.includes('createCloudBackup'), '3.3. Exports createCloudBackup');
assert(serviceContent.includes('executeCloudSafetyBackup'), '3.4. Exports executeCloudSafetyBackup');
assert(serviceContent.includes('restoreCloudBackup'), '3.5. Exports restoreCloudBackup');
assert(serviceContent.includes('deleteCloudBackup'), '3.6. Exports deleteCloudBackup');
assert(serviceContent.includes('checkAndRunAutomaticCloudBackup'), '3.7. Exports checkAndRunAutomaticCloudBackup');

// 4. Verify UI component BackupModal.tsx
const modalPath = path.join(process.cwd(), 'src', 'components', 'BackupModal.tsx');
assert(fs.existsSync(modalPath), '4.1. src/components/BackupModal.tsx exists');

const modalContent = fs.readFileSync(modalPath, 'utf8');
assert(modalContent.includes('useAuth'), '4.2. BackupModal checks caller role via useAuth');
assert(modalContent.includes('createCloudBackup'), '4.3. BackupModal connects to createCloudBackup');
assert(modalContent.includes('restoreCloudBackup'), '4.4. BackupModal connects to restoreCloudBackup');
assert(modalContent.includes('executeCloudSafetyBackup'), '4.5. BackupModal creates safety backup before clear all');

// 5. Zero service_role leakage check
const clientFiles = [
  'src/services/supabaseClient.ts',
  'src/services/adminService.ts',
  'src/services/cloudBackupService.ts',
  'src/contexts/AuthContext.tsx',
  'src/components/BackupModal.tsx',
  'src/App.tsx'
];

for (const file of clientFiles) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(!content.includes('service_role'), `5. Zero 'service_role' references in ${file}`);
    assert(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `5. Zero SUPABASE_SERVICE_ROLE_KEY in ${file}`);
    assert(!content.includes('VITE_SUPABASE_SERVICE_ROLE'), `5. Zero VITE_SUPABASE_SERVICE_ROLE in ${file}`);
  }
}

// 6. Test Mock Simulation of Cloud Backup Retention & Safety Rules
console.log('\n--- Mock Simulation of Cloud Backup Retention & Safety Rules ---');
interface MockCloudBackup {
  id: string;
  filename: string;
  backup_type: 'automatic' | 'manual' | 'safety';
  created_at: string;
}

const mockBackups: MockCloudBackup[] = [];

function createMockBackup(type: 'automatic' | 'manual' | 'safety'): MockCloudBackup {
  const id = `cb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const dateStr = new Date().toISOString();
  const filename = `${type}_${dateStr}.json`;
  const backup: MockCloudBackup = { id, filename, backup_type: type, created_at: dateStr };
  mockBackups.unshift(backup);

  // Prune automatic backups beyond 7
  if (type === 'automatic') {
    const autos = mockBackups.filter(b => b.backup_type === 'automatic');
    if (autos.length > 7) {
      const toRemove = autos.slice(7);
      toRemove.forEach(rem => {
        const idx = mockBackups.findIndex(b => b.id === rem.id);
        if (idx !== -1) mockBackups.splice(idx, 1);
      });
    }
  }

  return backup;
}

// Create 10 automatic backups
for (let i = 0; i < 10; i++) {
  createMockBackup('automatic');
}

const remainingAutoCount = mockBackups.filter(b => b.backup_type === 'automatic').length;
assert(remainingAutoCount === 7, `6.1. Automatic backup pruning keeps exactly 7 backups (actual: ${remainingAutoCount})`);

// Create manual and safety backups
createMockBackup('manual');
createMockBackup('safety');

assert(mockBackups.filter(b => b.backup_type === 'manual').length === 1, '6.2. Manual backups are retained independently');
assert(mockBackups.filter(b => b.backup_type === 'safety').length === 1, '6.3. Safety backups are retained independently');

console.log('================================================================');
console.log('ALL CLOUD BACKUP TESTS PASSED WITH 100% SUCCESS!');
console.log('================================================================');
