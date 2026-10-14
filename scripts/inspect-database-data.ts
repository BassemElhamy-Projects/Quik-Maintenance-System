import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oozxebwhhbxblbgptytq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g4346u1jcDG3UaZ6er92EQ_9NbIsQ_X';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectData() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'bassem_admin@quik.local',
    password: '123456'
  });

  console.log('Signed in as:', authData.user?.email);

  const { data: profiles } = await supabase.from('profiles').select('*');
  console.log('\n--- PROFILES IN SUPABASE ---');
  console.table(profiles);

  const { data: stations } = await supabase.from('stations').select('*');
  console.log('\n--- STATIONS IN SUPABASE ---');
  console.log('Count:', stations?.length);
  if (stations?.length) console.table(stations);

  const { data: reqs } = await supabase.from('maintenance_requests').select('*');
  console.log('\n--- MAINTENANCE REQUESTS IN SUPABASE ---');
  console.log('Count:', reqs?.length);
  if (reqs?.length) console.table(reqs);

  const { data: ins } = await supabase.from('internal_inspections').select('*');
  console.log('\n--- INTERNAL INSPECTIONS IN SUPABASE ---');
  console.log('Count:', ins?.length);
  if (ins?.length) console.table(ins);

  const { data: inc } = await supabase.from('incident_records').select('*');
  console.log('\n--- INCIDENT RECORDS IN SUPABASE ---');
  console.log('Count:', inc?.length);
  if (inc?.length) console.table(inc);

  const { data: backups } = await supabase.from('cloud_backups').select('*');
  console.log('\n--- CLOUD BACKUPS IN SUPABASE ---');
  console.log('Count:', backups?.length);
  if (backups?.length) {
    backups.forEach(b => {
      console.log(`Backup ${b.filename} (${b.backup_type}):`, b.record_counts);
    });
  }
}

inspectData();
