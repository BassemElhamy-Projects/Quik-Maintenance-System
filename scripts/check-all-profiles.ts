import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oozxebwhhbxblbgptytq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g4346u1jcDG3UaZ6er92EQ_9NbIsQ_X';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAll() {
  console.log('Testing users sign-in...');

  // Try different common passwords
  const passwords = ['password123', 'admin123', 'quik123456', '123456', 'bassem_admin'];
  const usernames = ['bassem_admin', 'admin_quik', 'abdallah'];

  for (const u of usernames) {
    for (const p of passwords) {
      const email = `${u}@quik.local`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: p });
      if (!error && data.user) {
        console.log(`SUCCESS LOGIN: ${email} with password "${p}" -> UID: ${data.user.id}`);
        
        // Test fetching profiles
        const { data: profs, error: pErr } = await supabase.from('profiles').select('*');
        console.log(`Profiles fetch result for ${u}:`, profs?.length, pErr?.message || '');

        // Test fetching stations
        const { data: st, error: sErr } = await supabase.from('stations').select('*');
        console.log(`Stations fetch result for ${u}:`, st?.length, sErr?.message || '');

        // Test fetching maintenance_requests
        const { data: mr, error: mErr } = await supabase.from('maintenance_requests').select('*');
        console.log(`Maintenance Requests fetch result for ${u}:`, mr?.length, mErr?.message || '');

        // Test fetching internal_inspections
        const { data: ins, error: iErr } = await supabase.from('internal_inspections').select('*');
        console.log(`Inspections fetch result for ${u}:`, ins?.length, iErr?.message || '');

        // Test fetching incident_records
        const { data: inc, error: icErr } = await supabase.from('incident_records').select('*');
        console.log(`Incidents fetch result for ${u}:`, inc?.length, icErr?.message || '');

        return;
      }
    }
  }

  console.log('No matching password found among test list.');
}

testAll();
