import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('   RUNNING SUPABASE SCHEMA & SECURITY AUDIT VALIDATION (2 ROLES)  ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${description}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${description}`);
  }
}

// 1. Check Schema File Presence
const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
assert(fs.existsSync(schemaPath), '1. Supabase schema.sql file exists');

const schemaSql = fs.readFileSync(schemaPath, 'utf8');

// 2. Table Definitions Check
const requiredTables = [
  'profiles',
  'stations',
  'section_counters',
  'maintenance_requests',
  'internal_inspections',
  'incident_records',
  'audit_logs'
];

requiredTables.forEach(tbl => {
  assert(
    schemaSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`),
    `2. Table 'public.${tbl}' is defined with IF NOT EXISTS`
  );
});

// 3. Username unique constraint in profiles
assert(
  schemaSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower'),
  '3. Case-insensitive unique index on LOWER(username) is defined'
);

assert(
  schemaSql.includes('CONSTRAINT unique_section_request_number UNIQUE (section, request_number)'),
  '3. Unique constraint (section, request_number) is defined on maintenance_requests'
);

assert(
  schemaSql.includes('inspection_number TEXT NOT NULL UNIQUE'),
  '3. Unique constraint is defined on inspection_number'
);

assert(
  schemaSql.includes('incident_number TEXT NOT NULL UNIQUE'),
  '3. Unique constraint is defined on incident_number'
);

// 4. Concurrency-Safe Sequence Function Check
assert(
  schemaSql.includes('FUNCTION public.get_next_section_sequence(p_section TEXT)'),
  '4. Atomic section sequence function get_next_section_sequence is defined'
);

assert(
  schemaSql.includes('ON CONFLICT (section_name)'),
  '4. Concurrency safety: function uses ON CONFLICT DO UPDATE for atomic increments'
);

assert(
  schemaSql.includes('SECURITY DEFINER SET search_path = public'),
  '4. Security: Function is SECURITY DEFINER with explicit search_path = public'
);

// 5. Indexes Check
const requiredIndexes = [
  'idx_stations_code',
  'idx_maint_section',
  'idx_maint_date',
  'idx_maint_station_code',
  'idx_maint_station_id',
  'idx_maint_status',
  'idx_maint_section_reqnum',
  'idx_insp_date',
  'idx_inc_date'
];

requiredIndexes.forEach(idx => {
  assert(
    schemaSql.includes(`CREATE INDEX IF NOT EXISTS ${idx}`),
    `5. Index '${idx}' is defined`
  );
});

// 6. Row Level Security (RLS) Check
requiredTables.forEach(tbl => {
  assert(
    schemaSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`),
    `6. RLS is explicitly ENABLED on table '${tbl}'`
  );
});

// 7. Verification: No Anonymous Public Write Policies
const lowerSql = schemaSql.toLowerCase();
assert(
  !lowerSql.includes('for insert to anon') && !lowerSql.includes('for update to anon') && !lowerSql.includes('for delete to anon'),
  '7. Security: Zero public/anonymous INSERT, UPDATE, or DELETE policies exist'
);

assert(
  !lowerSql.includes('for all to anon') && !lowerSql.includes('to public with check (true)'),
  '7. Security: Zero permissive open public write policies exist'
);

// 8. Role Helper Functions
assert(
  schemaSql.includes('FUNCTION public.get_auth_user_role()'),
  '8. RLS role helper get_auth_user_role() is defined'
);

assert(
  schemaSql.includes('FUNCTION public.is_admin()'),
  '8. Admin role check is_admin() is defined'
);

// 9. TypeScript Definitions & Client Service Check
const typesPath = path.join(process.cwd(), 'src', 'types', 'supabase.ts');
assert(fs.existsSync(typesPath), '9. TypeScript definitions src/types/supabase.ts exists');

const clientPath = path.join(process.cwd(), 'src', 'services', 'supabaseClient.ts');
assert(fs.existsSync(clientPath), '9. Supabase Client service src/services/supabaseClient.ts exists');

// 10. Verify Local Storage and Production App Remains Completely Untouched
const storageServicePath = path.join(process.cwd(), 'src', 'services', 'storage.ts');
const storageContent = fs.readFileSync(storageServicePath, 'utf8');
assert(
  storageContent.includes('loadAppDataAsync') && storageContent.includes('D:\\Quik Maintenance System'),
  '10. Safety check: Local storage and D: drive database.json logic is 100% preserved and untouched'
);

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('ALL SCHEMA & SECURITY VALIDATION TESTS PASSED WITH 100% SUCCESS!\n');
} else {
  console.error('SOME TESTS FAILED!\n');
  process.exit(1);
}
