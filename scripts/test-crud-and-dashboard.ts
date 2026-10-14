import { supabase } from '../src/services/supabaseClient';
import { loadAppDataAsync } from '../src/services/storage';

async function testCloudSyncWithSingleton() {
  console.log('--- TESTING DIRECT SUPABASE READ WITH SINGLETON CLIENT ---');

  if (!supabase) {
    console.error('Supabase singleton client not configured!');
    return;
  }

  // Sign in on the singleton client!
  const { data: auth, error: aErr } = await supabase.auth.signInWithPassword({
    email: 'bassem_admin@quik.local',
    password: '123456'
  });

  if (aErr || !auth.user) {
    console.error('Sign in failed on singleton:', aErr?.message);
    return;
  }

  console.log('Signed in on singleton client:', auth.user.email);

  // Insert a test record using the singleton
  const testReqNumber = `TEST-PUMP-${Date.now()}`;
  const { data: insData, error: insErr } = await supabase.from('maintenance_requests').insert({
    request_number: testReqNumber,
    section: 'pumps',
    date: '2026-10-06',
    station_name: 'محطة كويك 101 - الرياض',
    station_code: '101',
    requester: 'باسم - اختبار المراجعة',
    request_type: 'طارئ',
    maintenance_type: 'ميكانيكا',
    problem_description: 'عطل بالمضخة رقم 2 - تسريب وقود',
    status: 'جديد',
    created_by: auth.user.id
  }).select();

  if (insErr) {
    console.error('Insertion failed:', insErr.message);
    return;
  }

  console.log('Inserted test record into Supabase maintenance_requests table:', insData[0]?.id);

  // Now call loadAppDataAsync() which uses the singleton client
  const loaded = await loadAppDataAsync();
  console.log('loadAppDataAsync() maintenanceRequests count:', loaded.data?.maintenanceRequests.length);

  const found = loaded.data?.maintenanceRequests.find(r => r.requestNumber === testReqNumber);
  if (found) {
    console.log('[SUCCESS & VERIFIED] Found test record directly loaded from Supabase PostgreSQL in AppData:');
    console.log(`- Request Number: ${found.requestNumber}`);
    console.log(`- Section: ${found.section}`);
    console.log(`- Status: ${found.status}`);
    console.log(`- Station Code: ${found.stationCode}`);
  } else {
    console.error('[FAIL] Test record was not found in AppData!');
  }

  // Clean up test record
  const { error: delErr } = await supabase.from('maintenance_requests').delete().eq('request_number', testReqNumber);
  if (delErr) {
    console.error('Delete test record error:', delErr.message);
  } else {
    console.log('Cleaned up test record from Supabase successfully.');
  }
}

testCloudSyncWithSingleton();
