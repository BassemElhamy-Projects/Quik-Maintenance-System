import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oozxebwhhbxblbgptytq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g4346u1jcDG3UaZ6er92EQ_9NbIsQ_X';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runAudit() {
  console.log('--- SUPABASE DATABASE AUDIT WITH AUTH ---');

  // Attempt login
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'bassem_admin@quik.local',
    password: 'password123'
  });

  if (authErr) {
    console.log('Login bassem_admin error:', authErr.message);
    // Try admin_quik
    const { data: authData2, error: authErr2 } = await supabase.auth.signInWithPassword({
      email: 'admin_quik@quik.local',
      password: 'password123'
    });
    if (authErr2) {
      console.log('Login admin_quik error:', authErr2.message);
    } else {
      console.log('Signed in as admin_quik:', authData2.user?.id);
    }
  } else {
    console.log('Signed in as bassem_admin:', authData.user?.id);
  }

  // 1. Stations
  const { data: stations, error: stErr } = await supabase.from('stations').select('*');
  console.log(`Stations count in Supabase: ${stations?.length || 0}`, stErr?.message || '');

  // 2. Maintenance Requests
  const { data: maintenanceRequests, error: mrErr } = await supabase.from('maintenance_requests').select('*');
  console.log(`Maintenance Requests count in Supabase: ${maintenanceRequests?.length || 0}`, mrErr?.message || '');

  // 3. Inspections
  const { data: inspections, error: insErr } = await supabase.from('internal_inspections').select('*');
  console.log(`Internal Inspections count in Supabase: ${inspections?.length || 0}`, insErr?.message || '');

  // 4. Incidents
  const { data: incidents, error: incErr } = await supabase.from('incident_records').select('*');
  console.log(`Incident Records count in Supabase: ${incidents?.length || 0}`, incErr?.message || '');

  // 5. Profiles
  const { data: profiles, error: prErr } = await supabase.from('profiles').select('*');
  console.log(`Profiles count in Supabase: ${profiles?.length || 0}`, prErr?.message || '');

  // Breakdown of maintenance requests
  if (maintenanceRequests && maintenanceRequests.length > 0) {
    console.log('\n--- Maintenance Requests Breakdown ---');
    const bySection: Record<string, number> = { pumps: 0, tanks: 0, facilities: 0 };
    const byStatus: Record<string, number> = { open: 0, in_progress: 0, completed: 0, cancelled: 0 };
    const byMonth: Record<string, number> = {};

    maintenanceRequests.forEach(r => {
      const sec = r.section_type || 'unknown';
      bySection[sec] = (bySection[sec] || 0) + 1;

      const st = r.status || 'unknown';
      byStatus[st] = (byStatus[st] || 0) + 1;

      if (r.request_date) {
        const d = new Date(r.request_date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
      }
    });

    console.log('Requests by Section:', bySection);
    console.log('Requests by Status:', byStatus);
    console.log('Requests by Month:', byMonth);
  }

  if (inspections && inspections.length > 0) {
    console.log('\n--- Inspections Count ---', inspections.length);
  }

  if (incidents && incidents.length > 0) {
    console.log('\n--- Incidents Count ---', incidents.length);
  }
}

runAudit();
