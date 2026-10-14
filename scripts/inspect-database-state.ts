import { supabase } from '../src/services/supabaseClient';

async function checkDatabaseState() {
  console.log('====================================================');
  console.log('  INSPECTING SUPABASE PROFILES & ACTIVE ADMINS       ');
  console.log('====================================================');

  if (!supabase) {
    console.error('Supabase client is null.');
    return;
  }

  // 1. Query all records in public.profiles
  const { data: allProfiles, error: profError } = await supabase
    .from('profiles')
    .select('*');

  if (profError) {
    console.error('Error fetching profiles:', profError.message);
  } else {
    console.log('Total profiles count:', allProfiles?.length ?? 0);
    console.log('Profiles rows:');
    console.table(allProfiles);
  }

  // 2. Count active admins specifically
  const { count: activeAdminCount, error: countErr } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);

  console.log('\nActive Admin Count (role="admin", is_active=true):', activeAdminCount ?? 0);

  // 3. Test logging in with bassem_admin (without changing anything)
  // We check whether signInWithPassword fails with invalid credentials or email not confirmed or succeeds
  console.log('====================================================');
}

checkDatabaseState().catch(console.error);
