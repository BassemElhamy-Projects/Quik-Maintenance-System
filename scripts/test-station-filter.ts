import { matchesStrictStationFilter, resolveOfficialStationCode } from '../src/utils/stationMatcher';
import { OFFICIAL_STATIONS } from '../src/data/officialStations';
import { AppData, MaintenanceRequest } from '../src/types';

console.log('=== STARTING STRICT STATION FILTER TESTS ===\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
  }
}

// TEST A: Station 1 vs Station 10 by Code
assert(
  matchesStrictStationFilter({ stationCode: '1' }, '1') === true,
  'Test A1: Selected filter "1" matches record with stationCode "1"'
);
assert(
  matchesStrictStationFilter({ stationCode: '10' }, '1') === false,
  'Test A2: Selected filter "1" DOES NOT match record with stationCode "10"'
);

// TEST B: Station 10 vs Station 1 by Code
assert(
  matchesStrictStationFilter({ stationCode: '10' }, '10') === true,
  'Test B1: Selected filter "10" matches record with stationCode "10"'
);
assert(
  matchesStrictStationFilter({ stationCode: '1' }, '10') === false,
  'Test B2: Selected filter "10" DOES NOT match record with stationCode "1"'
);

// TEST C: Exact Station Names
assert(
  matchesStrictStationFilter({ stationName: 'كويك - 1 أبها' }, '1') === true,
  'Test C1: Selected filter "1" matches record with stationName "كويك - 1 أبها"'
);
assert(
  matchesStrictStationFilter({ stationName: 'كويك - 10 المحالة' }, '1') === false,
  'Test C2: Selected filter "1" DOES NOT match record with stationName "كويك - 10 المحالة"'
);
assert(
  matchesStrictStationFilter({ stationName: 'كويك - 10 المحالة' }, 'كويك - 1 أبها') === false,
  'Test C3: Filter "كويك - 1 أبها" DOES NOT match record "كويك - 10 المحالة"'
);

// TEST D: Station IDs
assert(
  matchesStrictStationFilter({ stationId: 'st-1' }, 'st-1') === true,
  'Test D1: Filter "st-1" matches record with stationId "st-1"'
);
assert(
  matchesStrictStationFilter({ stationId: 'st-10' }, 'st-1') === false,
  'Test D2: Filter "st-1" DOES NOT match record with stationId "st-10"'
);

// TEST E: Mixed Legacy Data
assert(
  matchesStrictStationFilter({ stationCode: '1' }, 'st-1') === true,
  'Test E1: Filter "st-1" matches legacy record with stationCode "1" only'
);
assert(
  matchesStrictStationFilter({ stationId: 'st-1' }, '1') === true,
  'Test E2: Filter "1" matches legacy record with stationId "st-1" only'
);
assert(
  matchesStrictStationFilter({ stationName: 'كويك - 1 أبها' }, 'st-1') === true,
  'Test E3: Filter "st-1" matches legacy record with stationName "كويك - 1 أبها" only'
);
assert(
  matchesStrictStationFilter({ stationCode: '10' }, 'st-1') === false,
  'Test E4: Filter "st-1" DOES NOT match legacy record with stationCode "10"'
);

// TEST F: "all" filter
assert(
  matchesStrictStationFilter({ stationCode: '1' }, 'all') === true &&
  matchesStrictStationFilter({ stationCode: '10' }, 'all') === true,
  'Test F: Filter "all" matches both Station 1 and Station 10'
);

// RECONCILIATION SCENARIO TEST
console.log('\n=== RUNNING RECONCILIATION SCENARIO TEST ===');

// Mock Data Setup matching the audit scenario:
// 11 records for Station 1
// 14 records for Station 2
// 10 records for Station 10
// Rest distributed across other stations to total 137 records
const mockRequests: MaintenanceRequest[] = [];
let reqCounter = 1;

// 11 records for Station 1
for (let i = 0; i < 11; i++) {
  mockRequests.push({
    id: `req-${reqCounter++}`,
    requestNumber: `REQ-2026-${i + 1}`,
    section: 'pumps',
    stationId: 'st-1',
    stationCode: '1',
    stationName: 'كويك - 1 أبها',
    date: '2026-03-15',
    requester: 'فني الصيانة',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مضخة 1',
    technician: 'الفني المعتمد',
    actionTaken: 'تم الإصلاح',
    completionNotes: 'تمت المعايرة',
    status: 'تم',
    createdAt: '2026-03-15T10:00:00Z'
  });
}

// 14 records for Station 2
for (let i = 0; i < 14; i++) {
  mockRequests.push({
    id: `req-${reqCounter++}`,
    requestNumber: `REQ-2026-${reqCounter}`,
    section: 'tanks',
    stationId: 'st-2',
    stationCode: '2',
    stationName: 'كويك - 2 الدرب',
    date: '2026-03-15',
    requester: 'فني الصيانة',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل خزان 2',
    technician: 'الفني المعتمد',
    actionTaken: 'تم الإصلاح',
    completionNotes: 'تمت المعايرة',
    status: 'تم',
    createdAt: '2026-03-15T10:00:00Z'
  });
}

// 10 records for Station 10
for (let i = 0; i < 10; i++) {
  mockRequests.push({
    id: `req-${reqCounter++}`,
    requestNumber: `REQ-2026-${reqCounter}`,
    section: 'facilities',
    stationId: 'st-10',
    stationCode: '10',
    stationName: 'كويك - 10 المحالة',
    date: '2026-03-15',
    requester: 'فني الصيانة',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مرفق 10',
    technician: 'الفني المعتمد',
    actionTaken: 'تم الإصلاح',
    completionNotes: 'تمت المعايرة',
    status: 'تم',
    createdAt: '2026-03-15T10:00:00Z'
  });
}

// 102 records spread across stations 3 to 9 (Total = 11 + 14 + 10 + 102 = 137)
for (let i = 0; i < 102; i++) {
  const stNum = (i % 7) + 3; // Stations 3 to 9
  const st = OFFICIAL_STATIONS.find(s => s.code === stNum.toString())!;
  mockRequests.push({
    id: `req-${reqCounter++}`,
    requestNumber: `REQ-2026-${reqCounter}`,
    section: 'pumps',
    stationId: st.id,
    stationCode: st.code,
    stationName: st.name,
    date: '2026-03-15',
    requester: 'فني الصيانة',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل صيانة عام',
    technician: 'الفني المعتمد',
    actionTaken: 'تم الإصلاح',
    completionNotes: 'تمت المعايرة',
    status: 'تم',
    createdAt: '2026-03-15T10:00:00Z'
  });
}

// Direct Strict Station Filter testing on mock requests
const st1Filtered = mockRequests.filter(r => matchesStrictStationFilter({ stationId: r.stationId, stationCode: r.stationCode, stationName: r.stationName }, 'st-1'));
const st2Filtered = mockRequests.filter(r => matchesStrictStationFilter({ stationId: r.stationId, stationCode: r.stationCode, stationName: r.stationName }, 'st-2'));
const st10Filtered = mockRequests.filter(r => matchesStrictStationFilter({ stationId: r.stationId, stationCode: r.stationCode, stationName: r.stationName }, 'st-10'));
const allFiltered = mockRequests.filter(r => matchesStrictStationFilter({ stationId: r.stationId, stationCode: r.stationCode, stationName: r.stationName }, 'all'));

console.log('\n--- RECONCILIATION TEST RESULTS ---');
console.log(`Station 1 Count: ${st1Filtered.length} (Expected: 11)`);
console.log(`Station 2 Count: ${st2Filtered.length} (Expected: 14)`);
console.log(`Station 10 Count: ${st10Filtered.length} (Expected: 10)`);
console.log(`All Stations Count: ${allFiltered.length} (Expected: 137)`);

assert(st1Filtered.length === 11, 'Reconciliation: Station 1 count is EXACTLY 11');
assert(st2Filtered.length === 14, 'Reconciliation: Station 2 count is EXACTLY 14');
assert(st10Filtered.length === 10, 'Reconciliation: Station 10 count is EXACTLY 10');
assert(allFiltered.length === 137, 'Reconciliation: All Stations count is EXACTLY 137');

// Verify Station 10 records do NOT leak into Station 1 report
const station10LeakedToStation1 = st1Filtered.some(r => r.stationCode === '10' || r.stationName.includes('المحالة'));
assert(!station10LeakedToStation1, 'Reconciliation: ZERO Station 10 records leaked into Station 1 report');

console.log(`\nTEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);

if (passedTests === totalTests) {
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
} else {
  console.error('SOME TESTS FAILED!');
  process.exit(1);
}
