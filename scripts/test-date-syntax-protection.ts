import { toValidIsoDate, toOptionalValidIsoDate, importExcelRecordsToCloud, buildValidCalendarDate } from '../src/services/cloudDataService';
import { supabase } from '../src/services/supabaseClient';
import { MaintenanceRequest } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${msg}`);
  }
}

async function testDateSyntaxProtection() {
  console.log('================================================================');
  console.log('  TESTING DATE SYNTAX & OUT-OF-RANGE ("2026-02-30") PROTECTION   ');
  console.log('================================================================\n');

  // Test 1: toValidIsoDate rejects arbitrary Arabic text
  const cleanedDate = toValidIsoDate('شركة كويك لمحطات الوقود');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate), `1. toValidIsoDate('شركة كويك لمحطات الوقود') returns valid ISO date: ${cleanedDate}`);
  assert(!cleanedDate.includes('شركة'), '1.1 toValidIsoDate does not contain Arabic text');

  // Test 2: toOptionalValidIsoDate returns null for arbitrary text
  const optDate = toOptionalValidIsoDate('شركة كويك لمحطات الوقود');
  assert(optDate === null, '2. toOptionalValidIsoDate("شركة كويك لمحطات الوقود") returns null');

  // Test 3: Standard ISO date preserved
  const validIso = toValidIsoDate('2024-08-15');
  assert(validIso === '2024-08-15', '3. toValidIsoDate preserves valid YYYY-MM-DD');

  // Test 4: Slash dates normalized
  const slashDate = toValidIsoDate('15/08/2024');
  assert(slashDate === '2024-08-15', `4. toValidIsoDate normalizes DD/MM/YYYY to YYYY-MM-DD: ${slashDate}`);

  // Test 5: Out of range February 30th (2026-02-30) clamped to valid calendar end of month
  const feb30Clamped = toValidIsoDate('2026-02-30');
  assert(feb30Clamped === '2026-02-28', `5.1 toValidIsoDate('2026-02-30') clamped to 2026-02-28: ${feb30Clamped}`);

  const feb30Opt = toOptionalValidIsoDate('2026-02-30');
  assert(feb30Opt === '2026-02-28', `5.2 toOptionalValidIsoDate('2026-02-30') clamped to 2026-02-28: ${feb30Opt}`);

  // Test 6: Leap year vs non-leap year February
  const leapFeb = toValidIsoDate('2024-02-30');
  assert(leapFeb === '2024-02-29', `6.1 toValidIsoDate('2024-02-30') in leap year clamped to 2024-02-29: ${leapFeb}`);

  const april31 = toValidIsoDate('2026-04-31');
  assert(april31 === '2026-04-30', `6.2 toValidIsoDate('2026-04-31') in 30-day month clamped to 2026-04-30: ${april31}`);

  // Test 7: DD/MM/YYYY with February 30th
  const dmyFeb30 = toValidIsoDate('30/02/2026');
  assert(dmyFeb30 === '2026-02-28', `7.1 toValidIsoDate('30/02/2026') clamped to 2026-02-28: ${dmyFeb30}`);

  // Test 8: JavaScript Date object handling
  const jsDate = new Date('2025-06-20T10:00:00Z');
  const fromJsDate = toValidIsoDate(jsDate);
  assert(fromJsDate === '2025-06-20', `8.1 toValidIsoDate(Date object) returns 2025-06-20: ${fromJsDate}`);

  // Test 9: Live Database insertion test with rogue date values ("2026-02-30" & "شركة كويك")
  console.log('\n--- Testing Live Database Import with Rogue "2026-02-30" Date Values ---');
  if (!supabase) {
    console.error('Supabase client is null!');
    process.exit(1);
  }

  // Sign in as active admin
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'bassem_admin@quik.local',
    password: '123456'
  });

  if (authErr || !authData.user) {
    console.error('[FAIL] Could not authenticate admin for test:', authErr?.message);
    process.exit(1);
  }
  console.log('[PASS] Signed in as admin successfully.');

  // Clean up any previous test records
  await supabase
    .from('maintenance_requests')
    .delete()
    .ilike('problem_description', '%اختبار حماية صياغة التاريخ%');

  // Create test record with rogue date = "2026-02-30" (the exact bug from user report)
  const rogueReqFeb30: MaintenanceRequest = {
    id: '00000000-0000-0000-0000-000000000098',
    requestNumber: '99998',
    section: 'facilities',
    date: '2026-02-30' as any, // The exact out-of-range value that caused Postgres error
    stationId: '',
    stationCode: '1',
    stationName: 'محطة المعادي الأولى',
    requester: 'مفتش الجودة',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'أخرى',
    problemDescription: 'اختبار حماية صياغة التاريخ وتفادي خطأ date/time field value out of range: 2026-02-30',
    closingDate: '2026-02-30' as any, // Out-of-range closing date as well
    technician: '',
    actionTaken: '',
    completionNotes: '',
    status: 'جديد',
    createdAt: new Date().toISOString()
  };

  const importRes = await importExcelRecordsToCloud([rogueReqFeb30], [], []);
  console.log('Import Result with Out-of-Range Date:', importRes);
  assert(importRes.success === true, '9.1 importExcelRecordsToCloud succeeded without throwing out of range error');
  assert(importRes.importedCount === 1, '9.2 exactly 1 record imported');

  // Verify that the record in Supabase has valid clamped DATE column format
  const { data: dbRecords, error: qErr } = await supabase
    .from('maintenance_requests')
    .select('id, request_number, date, closing_date, problem_description')
    .ilike('problem_description', '%اختبار حماية صياغة التاريخ%');

  assert(!qErr && dbRecords && dbRecords.length === 1, '9.3 Record retrieved from database');
  const savedRow = dbRecords![0];
  console.log('Saved Database Row:', savedRow);
  assert(savedRow.date === '2026-02-28', `9.4 Database date was safely clamped to 2026-02-28: ${savedRow.date}`);
  assert(savedRow.closing_date === '2026-02-28', `9.5 Database closing_date was safely clamped to 2026-02-28: ${savedRow.closing_date}`);

  // Clean up
  await supabase
    .from('maintenance_requests')
    .delete()
    .ilike('problem_description', '%اختبار حماية صياغة التاريخ%');

  console.log('\n================================================================');
  console.log('  ALL DATE OUT-OF-RANGE PROTECTION TESTS PASSED (100% SUCCESS)! ');
  console.log('================================================================');
}

testDateSyntaxProtection();
