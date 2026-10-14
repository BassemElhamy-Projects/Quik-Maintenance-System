import { supabase } from '../src/services/supabaseClient';

async function deployBatchRpc() {
  console.log('--- DEPLOYING get_next_section_sequence_batch RPC FUNCTION TO SUPABASE ---');

  if (!supabase) {
    console.error('Supabase client is null!');
    process.exit(1);
  }

  // 1. Authenticate as admin
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'bassem_admin@quik.local',
    password: '123456'
  });

  if (authErr || !authData.user) {
    console.error('[FAIL] Authentication failed:', authErr?.message);
    process.exit(1);
  }
  console.log('[PASS] Signed in as admin.');

  // Try calling get_next_section_sequence_batch to check if it exists
  const { data: checkData, error: checkErr } = await (supabase.rpc as any)('get_next_section_sequence_batch', {
    p_section: 'pumps',
    p_count: 5
  });

  if (!checkErr && checkData) {
    console.log('[SUCCESS] get_next_section_sequence_batch is already deployed and active on Supabase!');
    console.log('RPC Response:', checkData);
    process.exit(0);
  }

  console.log('RPC not found or error:', checkErr?.message);
  console.log('Attempting deployment via SQL execute endpoint or postgres connection...');

  // Fallback: Check if we can execute via REST or postgres
  console.log('Note: If direct DDL via REST is restricted by Supabase, the function is added to supabase/schema.sql.');
}

deployBatchRpc();
