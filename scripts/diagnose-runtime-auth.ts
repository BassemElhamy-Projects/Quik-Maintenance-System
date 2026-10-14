import { supabase, isSupabaseConfigured, SUPABASE_URL } from '../src/services/supabaseClient';

async function diagnose() {
  console.log('====================================================');
  console.log('  RUNTIME AUTH DIAGNOSIS SIMULATION                 ');
  console.log('====================================================');
  console.log('Vite Project Root / Working Dir:', process.cwd());
  console.log('isSupabaseConfigured():', isSupabaseConfigured());
  console.log('SUPABASE_URL:', SUPABASE_URL);

  if (!supabase) {
    console.log('[AUTH DEBUG] Supabase is null');
    return;
  }

  // Simulate fresh incognito startup (no stored session in memory)
  const { data, error } = await supabase.auth.getSession();
  const session = data?.session || null;
  const user = session?.user || null;
  let profile = null;

  console.log('\n--- FRESH STARTUP VALUES ---');
  console.log('session =', session);
  console.log('user =', user);
  console.log('isLoading =', false);

  const isAuthenticated = Boolean(user && profile && (profile as any).is_active);
  console.log('isAuthenticated =', isAuthenticated);

  if (!isAuthenticated) {
    // Check if first admin is needed
    const { count, error: countErr } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true);

    const needsFirstAdmin = (count ?? 0) === 0;
    console.log('needsFirstAdmin =', needsFirstAdmin);
    if (needsFirstAdmin) {
      console.log('rendered component = [AUTH DEBUG] RENDERING FIRST ADMIN SETUP');
    } else {
      console.log('rendered component = [AUTH DEBUG] RENDERING LOGIN');
    }
  } else {
    console.log('rendered component = [AUTH DEBUG] RENDERING DASHBOARD');
  }

  console.log('====================================================');
}

diagnose().catch(console.error);
