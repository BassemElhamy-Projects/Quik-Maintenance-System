import { supabase } from '../src/services/supabaseClient';

async function verifyAllTables() {
  console.log('====================================================');
  console.log('  VERIFYING ALL 7 DATABASE TABLES IN SUPABASE       ');
  console.log('====================================================');

  if (!supabase) {
    console.error('Supabase client is null.');
    return;
  }

  const tables = [
    'profiles',
    'stations',
    'section_counters',
    'maintenance_requests',
    'internal_inspections',
    'incident_records',
    'audit_logs'
  ];

  for (const tbl of tables) {
    const { count, error } = await supabase
      .from(tbl as any)
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.log(`[FAIL] Table '${tbl}': ${error.message}`);
    } else {
      console.log(`[OK] Table '${tbl}' exists. Record count: ${count ?? 0}`);
    }
  }

  console.log('====================================================');
}

verifyAllTables().catch(console.error);
