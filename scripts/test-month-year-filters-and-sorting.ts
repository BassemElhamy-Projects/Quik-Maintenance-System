import {
  getDynamicYearOptions,
  parseDateMonthAndYear,
  matchMonthAndYear,
  MONTH_OPTIONS
} from '../src/utils/dateFilters';
import { parseValidRequestNumber, getNextMaintenanceRequestNumber } from '../src/utils/requestSequencer';
import { MaintenanceRequest } from '../src/types';

console.log('================================================================');
console.log('  RUNNING MONTH/YEAR FILTERS & DEFAULT ASCENDING SORT TEST SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, actual?: any, expected?: any) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName} (Actual: ${JSON.stringify(actual)}, Expected: ${JSON.stringify(expected)})`);
  }
}

// -------------------------------------------------------------
// TEST A: Default Ascending Sort & Bottom Placement for New Requests
// -------------------------------------------------------------
const initialPumps: MaintenanceRequest[] = [
  { id: 'p1', requestNumber: '1', section: 'pumps', date: '2026-01-10', stationId: 'st-1', stationName: 'أبها', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2026-01-10T10:00:00Z' },
  { id: 'p2', requestNumber: '2', section: 'pumps', date: '2026-02-15', stationId: 'st-2', stationName: 'الدرب', stationCode: '2', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2026-02-15T10:00:00Z' },
  { id: 'p3', requestNumber: '3', section: 'pumps', date: '2026-03-20', stationId: 'st-3', stationName: 'محايل', stationCode: '3', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2026-03-20T10:00:00Z' },
  { id: 'p4', requestNumber: '4', section: 'pumps', date: '2026-04-05', stationId: 'st-4', stationName: 'المنسك', stationCode: '4', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2026-04-05T10:00:00Z' },
  { id: 'p5', requestNumber: '5', section: 'pumps', date: '2026-05-12', stationId: 'st-5', stationName: 'الفرعاء', stationCode: '5', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2026-05-12T10:00:00Z' }
];

// Generate next request number (6)
const nextNum = getNextMaintenanceRequestNumber(initialPumps, 'pumps');
const newReq6: MaintenanceRequest = {
  id: 'p6',
  requestNumber: nextNum,
  section: 'pumps',
  date: '2026-10-06',
  stationId: 'st-6',
  stationName: 'جيزان',
  stationCode: '6',
  requester: 'فني جديد',
  requestType: 'صيانة تصحيحية',
  maintenanceType: 'كهرباء',
  problemDescription: 'عطل جديد',
  technician: 'فني',
  actionTaken: 'إصلاح',
  completionNotes: 'تم',
  status: 'جديد',
  createdAt: '2026-10-06T12:00:00Z'
};

const allPumpsWithNew = [...initialPumps, newReq6];

// Sort function used in components
const sortedPumps = [...allPumpsWithNew].sort((a, b) => {
  const numA = parseValidRequestNumber(a.requestNumber) ?? 0;
  const numB = parseValidRequestNumber(b.requestNumber) ?? 0;
  if (numA !== numB) return numA - numB;
  return (a.date || '').localeCompare(b.date || '');
});

const sortedNumbers = sortedPumps.map(r => r.requestNumber);
assert(
  sortedNumbers.join(', ') === '1, 2, 3, 4, 5, 6',
  'TEST A: Default sort order is 1, 2, 3, 4, 5, 6 with newly created request 6 at the BOTTOM',
  sortedNumbers.join(', '),
  '1, 2, 3, 4, 5, 6'
);

assert(
  sortedPumps[sortedPumps.length - 1].requestNumber === '6',
  'TEST A: Last element in displayed table is new request #6',
  sortedPumps[sortedPumps.length - 1].requestNumber,
  '6'
);

// -------------------------------------------------------------
// TEST B, C, D, E: Month & Year Filters
// -------------------------------------------------------------
const sampleDataset: MaintenanceRequest[] = [
  { id: '1', requestNumber: '1', section: 'pumps', date: '2025-10-15', stationId: 'st-1', stationName: 'أبها', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2025-10-15T10:00:00Z' }, // Oct 2025
  { id: '2', requestNumber: '2', section: 'pumps', date: '2026-03-10', stationId: 'st-1', stationName: 'أبها', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2026-03-10T10:00:00Z' }, // Mar 2026
  { id: '3', requestNumber: '3', section: 'pumps', date: '2026-10-01', stationId: 'st-2', stationName: 'الدرب', stationCode: '2', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2026-10-01T10:00:00Z' }, // Oct 2026
  { id: '4', requestNumber: '4', section: 'pumps', date: '2026-10-20', stationId: 'st-3', stationName: 'محايل', stationCode: '3', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'جديد', createdAt: '2026-10-20T10:00:00Z' }, // Oct 2026
  { id: '5', requestNumber: '5', section: 'pumps', date: '2027-10-05', stationId: 'st-1', stationName: 'أبها', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2027-10-05T10:00:00Z' }, // Oct 2027
  { id: '6', requestNumber: '6', section: 'pumps', date: '2027-12-11', stationId: 'st-2', stationName: 'الدرب', stationCode: '2', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', technician: 't', actionTaken: 'a', completionNotes: 'c', status: 'تم', createdAt: '2027-12-11T10:00:00Z' }  // Dec 2027
];

// TEST B: Month Filter = أكتوبر (10) across ALL years
const octAllYears = sampleDataset.filter(r => matchMonthAndYear(r.date, '10', 'all'));
const octNumbers = octAllYears.map(r => r.requestNumber);
assert(
  octNumbers.join(', ') === '1, 3, 4, 5',
  'TEST B: Month Filter (أكتوبر) matches records from 2025, 2026, 2027 (1, 3, 4, 5)',
  octNumbers.join(', '),
  '1, 3, 4, 5'
);

// TEST C: Year Filter = 2026 across ALL months
const year2026Only = sampleDataset.filter(r => matchMonthAndYear(r.date, 'all', '2026'));
const y2026Numbers = year2026Only.map(r => r.requestNumber);
assert(
  y2026Numbers.join(', ') === '2, 3, 4',
  'TEST C: Year Filter (2026) matches all 2026 records (2, 3, 4)',
  y2026Numbers.join(', '),
  '2, 3, 4'
);

// TEST D: Combined Filter = أكتوبر (10) + 2026
const oct2026 = sampleDataset.filter(r => matchMonthAndYear(r.date, '10', '2026'));
const oct2026Numbers = oct2026.map(r => r.requestNumber);
assert(
  oct2026Numbers.join(', ') === '3, 4',
  'TEST D: Combined Filter (أكتوبر + 2026) matches ONLY October 2026 records (3, 4)',
  oct2026Numbers.join(', '),
  '3, 4'
);

// TEST E: All (كل الشهور + كل السنين)
const allFiltered = sampleDataset.filter(r => matchMonthAndYear(r.date, 'all', 'all'));
assert(
  allFiltered.length === sampleDataset.length,
  'TEST E: All (كل الشهور + كل السنين) returns all records',
  allFiltered.length,
  sampleDataset.length
);

// -------------------------------------------------------------
// TEST F: Comprehensive Dynamic Year Range (2020 through at least 2050)
// -------------------------------------------------------------
const dynamicYears = getDynamicYearOptions([]);

assert(
  dynamicYears.includes('2020') &&
  dynamicYears.includes('2025') &&
  dynamicYears.includes('2027') &&
  dynamicYears.includes('2030') &&
  dynamicYears.includes('2040') &&
  dynamicYears.includes('2050'),
  'TEST F1: Year generator contains full range 2020 to 2050',
  { has2020: dynamicYears.includes('2020'), has2050: dynamicYears.includes('2050') },
  { has2020: true, has2050: true }
);

assert(
  dynamicYears[0] === '2020' && dynamicYears[dynamicYears.length - 1] >= '2050',
  'TEST F2: Year generator starts at 2020 and ends at or beyond 2050',
  { start: dynamicYears[0], end: dynamicYears[dynamicYears.length - 1] },
  { start: '2020', end: '>= 2050' }
);

const extendedDates = ['2055-08-20'];
const extendedYears = getDynamicYearOptions(extendedDates);
assert(
  extendedYears.includes('2055'),
  'TEST F3: Year generator dynamically includes years beyond 2050 if present in dataset (2055)',
  extendedYears.includes('2055'),
  true
);

// -------------------------------------------------------------
// TEST G: Combination of Station + Month + Year + Status + Search
// -------------------------------------------------------------
const complexMatches = sampleDataset.filter(req => {
  if (req.stationId !== 'st-2') return false; // station st-2 (الدرب)
  if (req.status !== 'تم') return false;      // status 'تم'
  if (!matchMonthAndYear(req.date, '10', '2026')) return false; // Oct 2026
  return true;
});
assert(
  complexMatches.length === 1 && complexMatches[0].requestNumber === '3',
  'TEST G: Station (الدرب) + Status (تم) + Month (10) + Year (2026) works seamlessly together (finds #3)',
  complexMatches.map(r => r.requestNumber).join(', '),
  '3'
);

// -------------------------------------------------------------
// TEST H: Filtered Records Display Order Ascending
// -------------------------------------------------------------
const octDataset: MaintenanceRequest[] = [
  { id: '10', requestNumber: '10', section: 'pumps', date: '2026-10-25', status: 'تم' } as any,
  { id: '2', requestNumber: '2', section: 'pumps', date: '2026-10-02', status: 'تم' } as any,
  { id: '7', requestNumber: '7', section: 'pumps', date: '2026-10-18', status: 'تم' } as any,
  { id: '5', requestNumber: '5', section: 'pumps', date: '2026-10-12', status: 'تم' } as any
];

const sortedFilteredOct = [...octDataset].sort((a, b) => {
  const numA = parseValidRequestNumber(a.requestNumber) ?? 0;
  const numB = parseValidRequestNumber(b.requestNumber) ?? 0;
  return numA - numB;
});

const sortedOctNums = sortedFilteredOct.map(r => r.requestNumber);
assert(
  sortedOctNums.join(', ') === '2, 5, 7, 10',
  'TEST H: Filtered October records are strictly sorted ascending: 2, 5, 7, 10',
  sortedOctNums.join(', '),
  '2, 5, 7, 10'
);

console.log(`\n================================================================`);
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  console.log('ALL MONTH/YEAR & DEFAULT SORTING TESTS PASSED WITH 100% SUCCESS!');
} else {
  process.exit(1);
}
