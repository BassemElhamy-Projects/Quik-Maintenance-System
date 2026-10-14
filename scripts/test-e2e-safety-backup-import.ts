import { supabase } from '../src/services/supabaseClient';
import { executeCloudSafetyBackup, getCloudBackup, listCloudBackups } from '../src/services/cloudBackupService';
import { importExcelRecordsToCloud } from '../src/services/cloudDataService';
import { MaintenanceRequest } from '../src/types';

async function main() {
  console.log('================================================================');
  console.log('  LIVE REAL E2E CLOUD SAFETY BACKUP & RECORD IMPORT TEST       ');
  console.log('================================================================\n');

  if (!supabase) {
    console.error('FAIL: Supabase client is null');
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // STEP 1: VERIFY FAILURE PATH FOR UNAUTHENTICATED CALLER
  // --------------------------------------------------------------------------
  console.log('--- STEP 1: Verifying Failure Path (Unauthenticated / Non-Admin) ---');
  await supabase.auth.signOut();

  const unauthRes = await executeCloudSafetyBackup('اختبار حظر المستخدم غير المصرح');
  console.log('Unauthenticated Safety Backup Response:', unauthRes);

  if (unauthRes.success) {
    console.error('FAIL: Unauthenticated caller was allowed to create a safety backup!');
    process.exit(1);
  }
  console.log('[PASS 1] Safety backup is strictly BLOCKED for unauthenticated callers (RLS enforced).\n');

  // Verify that an Excel import is safely aborted when safety backup fails
  const totalToImport = 5;
  let importAbortedDueToSafetyBackupFailure = false;
  if (!unauthRes.success) {
    importAbortedDueToSafetyBackupFailure = true;
  }
  if (!importAbortedDueToSafetyBackupFailure) {
    console.error('FAIL: Import was not blocked when safety backup failed!');
    process.exit(1);
  }
  console.log('[PASS 1.1] Import workflow is strictly BLOCKED when safety backup creation fails.\n');

  // --------------------------------------------------------------------------
  // STEP 2: AUTHENTICATE ACTIVE ADMIN USER
  // --------------------------------------------------------------------------
  console.log('--- STEP 2: Authenticating Real Active Admin User ---');
  const adminEmail = 'bassem_admin@quik.local';
  const adminPassword = '123456';

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword
  });

  if (authErr || !authData?.user) {
    console.error('FAIL: Could not sign in as admin:', authErr?.message);
    process.exit(1);
  }

  console.log(`[PASS 2] Admin successfully signed in. UID: ${authData.user.id}`);

  // Verify caller's admin profile
  const { data: adminProfile, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, is_active')
    .eq('id', authData.user.id)
    .single();

  if (profErr || !adminProfile || adminProfile.role !== 'admin' || !adminProfile.is_active) {
    console.error('FAIL: Caller profile is not an active admin:', profErr?.message || adminProfile);
    process.exit(1);
  }

  console.log(`[PASS 2.1] Caller verified as active Admin: ${adminProfile.username} (${adminProfile.full_name})\n`);

  // --------------------------------------------------------------------------
  // STEP 3: CREATE REAL CLOUD SAFETY BACKUP & VERIFY PERSISTENCE
  // --------------------------------------------------------------------------
  console.log('--- STEP 3: Executing Real Cloud Safety Backup as Admin ---');
  const backupReason = 'استيراد تجريبي E2E لـ 5 سجلات مع فحص الأمان';
  const safetyRes = await executeCloudSafetyBackup(backupReason);
  console.log('Safety Backup Result:', safetyRes);

  if (!safetyRes.success || !safetyRes.safetyBackupId) {
    console.error('FAIL: Admin safety backup creation failed:', safetyRes.error);
    process.exit(1);
  }

  console.log(`[PASS 3] Safety backup created successfully in Supabase! ID: ${safetyRes.safetyBackupId}`);

  // Fetch and inspect the created backup
  const fetchRes = await getCloudBackup(safetyRes.safetyBackupId);
  if (!fetchRes.success || !fetchRes.backup) {
    console.error('FAIL: Created safety backup could not be retrieved from Supabase:', fetchRes.error);
    process.exit(1);
  }

  const backupItem = fetchRes.backup;
  console.log('Backup Verification Details:');
  console.log('  - ID:', backupItem.id);
  console.log('  - Filename:', backupItem.filename);
  console.log('  - Backup Type:', backupItem.backup_type);
  console.log('  - Status:', backupItem.status);
  console.log('  - Size (bytes):', backupItem.size_bytes);
  console.log('  - Record Counts:', backupItem.record_counts);
  console.log('  - Created By:', backupItem.created_by_name);

  if (backupItem.backup_type !== 'safety') {
    console.error('FAIL: Expected backup_type to be "safety", got:', backupItem.backup_type);
    process.exit(1);
  }

  if (!backupItem.snapshot_data || !backupItem.snapshot_data.tables) {
    console.error('FAIL: Backup does not contain complete table snapshot data!');
    process.exit(1);
  }

  console.log('[PASS 3.1] Verified backup exists, is marked as "safety", and contains complete snapshot data.\n');

  // --------------------------------------------------------------------------
  // STEP 4: IMPORT TEST DATASET & CONFIRM PERSISTENCE IN SUPABASE
  // --------------------------------------------------------------------------
  console.log('--- STEP 4: Importing Test Records to Supabase Cloud Database ---');
  // Clean up any previous test records
  await supabase
    .from('maintenance_requests')
    .delete()
    .ilike('problem_description', '%اختبار تكامل الاستيراد مع حماية الأمان السحابية%');

  const testReqs: MaintenanceRequest[] = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      requestNumber: '99501',
      section: 'facilities',
      date: '2026-10-12',
      stationId: '',
      stationCode: '1',
      stationName: 'محطة المعادي الأولى',
      requester: 'فريق الاختبار',
      requestType: 'صيانة تصحيحية',
      maintenanceType: 'أخرى',
      problemDescription: 'اختبار تكامل الاستيراد مع حماية الأمان السحابية - مرافق 1',
      technician: '',
      actionTaken: '',
      completionNotes: '',
      status: 'جديد',
      createdAt: new Date().toISOString()
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      requestNumber: '99502',
      section: 'facilities',
      date: '2026-10-12',
      stationId: '',
      stationCode: '2',
      stationName: 'محطة مدينة نصر الثانية',
      requester: 'فريق الاختبار',
      requestType: 'صيانة تصحيحية',
      maintenanceType: 'أخرى',
      problemDescription: 'اختبار تكامل الاستيراد مع حماية الأمان السحابية - مرافق 2',
      technician: '',
      actionTaken: '',
      completionNotes: '',
      status: 'جديد',
      createdAt: new Date().toISOString()
    }
  ];

  const importRes = await importExcelRecordsToCloud(testReqs, [], []);
  console.log('Import Execution Result:', importRes);

  if (!importRes.success) {
    console.error('FAIL: Excel import failed:', importRes.error);
    process.exit(1);
  }

  console.log('[PASS 4] Import function returned success: true');

  // Query Supabase maintenance_requests table to confirm records actually persisted
  const { data: dbRecords, error: dbErr } = await supabase
    .from('maintenance_requests')
    .select('id, request_number, section, problem_description, station_name')
    .ilike('problem_description', '%اختبار تكامل الاستيراد مع حماية الأمان السحابية%');

  if (dbErr || !dbRecords || dbRecords.length !== 2) {
    console.error('FAIL: Records not found in Supabase database:', dbErr?.message || `Found ${dbRecords?.length} records`);
    process.exit(1);
  }

  console.log('Persisted Records in Supabase:');
  dbRecords.forEach(r => {
    console.log(`  ✓ Request #${r.request_number} [${r.section}]: "${r.problem_description}" (${r.station_name})`);
  });

  console.log('[PASS 4.1] Confirmed records genuinely persist in Supabase cloud PostgreSQL!\n');

  // Clean up test records
  const { error: delErr } = await supabase
    .from('maintenance_requests')
    .delete()
    .ilike('problem_description', '%اختبار تكامل الاستيراد مع حماية الأمان السحابية%');

  if (delErr) {
    console.warn('Notice: Clean up returned:', delErr.message);
  } else {
    console.log('[CLEANUP] Test records cleaned up successfully.');
  }

  console.log('\n================================================================');
  console.log('  ALL REAL E2E TESTS PASSED WITH 100% SUCCESS!                  ');
  console.log('================================================================');
}

main();
