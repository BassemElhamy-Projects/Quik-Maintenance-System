import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function getInternalEmail(username: string): string {
  return `${normalizeUsername(username)}@quik.local`;
}

async function main() {
  const args = process.argv.slice(2);
  const username = args[0] || 'bassem_admin';
  const password = args[1];
  const fullName = args[2] || 'باسم - مدير النظام';

  console.log('================================================================');
  console.log('       QUIK MAINTENANCE SYSTEM — FIRST ADMIN INITIALIZER        ');
  console.log('================================================================\n');

  if (!password) {
    console.log('Usage:');
    console.log('  npx tsx scripts/init-first-admin.ts <username> <password> [fullName]\n');
    console.log('Example:');
    console.log('  npx tsx scripts/init-first-admin.ts bassem_admin MySecretPassword123 "باسم - مدير النظام"\n');
    process.exit(1);
  }

  const cleanUsername = normalizeUsername(username);

  if (cleanUsername.length < 3) {
    console.error('❌ Username must be at least 3 characters.');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('❌ Password must be at least 6 characters.');
    process.exit(1);
  }

  // 1. Check if any admin already exists
  const { count, error: countErr } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);

  if (countErr) {
    console.error('❌ Error connecting to database:', countErr.message);
    process.exit(1);
  }

  if ((count ?? 0) > 0) {
    console.error('❌ An active Admin account already exists. Self-initialization is locked.');
    process.exit(1);
  }

  console.log(`⏳ Initializing First Admin: @${cleanUsername}...`);

  const internalEmail = getInternalEmail(cleanUsername);

  // 2. Sign up in Supabase Auth
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email: internalEmail,
    password,
    options: {
      data: {
        username: cleanUsername,
        full_name: fullName,
        role: 'admin'
      }
    }
  });

  if (authErr) {
    console.error('❌ Failed to create auth user:', authErr.message);
    process.exit(1);
  }

  if (!authData.user) {
    console.error('❌ No user returned from auth service.');
    process.exit(1);
  }

  // 3. Upsert profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({
      id: authData.user.id,
      username: cleanUsername,
      email: internalEmail,
      full_name: fullName,
      role: 'admin',
      is_active: true
    });

  if (profileErr) {
    console.warn('⚠️ Profile upsert notice:', profileErr.message);
  }

  console.log('\n================================================================');
  console.log('✅ FIRST ADMIN INITIALIZED SUCCESSFULLY!');
  console.log('================================================================');
  console.log(`Username:  ${cleanUsername}`);
  console.log(`Full Name: ${fullName}`);
  console.log(`Role:      admin`);
  console.log('Status:    Active (نشط)');
  console.log('\nYou can now log into the application with:');
  console.log(`  اسم المستخدم: ${cleanUsername}`);
  console.log(`  كلمة المرور:  [the password you chose]\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
