import { isMaintenanceDuplicate } from '../src/services/excelService';
import { getHighestRequestNumberForSection } from '../src/utils/requestSequencer';
import { MaintenanceRequest } from '../src/types';

console.log('=== RUNNING SECTION-INDEPENDENT EXCEL IMPORT TESTS ===\n');

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

// Setup existing database state:
// Pumps has existing records: 1, 2, 3 (max: 3)
// Tanks has existing records: 1, 2 (max: 2)
// Facilities has existing records: 1 (max: 1)
const existingRequests: MaintenanceRequest[] = [
  {
    id: 'db-p1',
    requestNumber: '1',
    section: 'pumps',
    date: '2026-01-01',
    stationId: 'st-1',
    stationName: 'كويك - 1 أبها',
    stationCode: '1',
    requester: 'فني 1',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مضخة 1',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-01-01T10:00:00Z'
  },
  {
    id: 'db-p2',
    requestNumber: '2',
    section: 'pumps',
    date: '2026-01-02',
    stationId: 'st-2',
    stationName: 'كويك - 2 الدرب',
    stationCode: '2',
    requester: 'فني 2',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مضخة 2',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-01-02T10:00:00Z'
  },
  {
    id: 'db-p3',
    requestNumber: '3',
    section: 'pumps',
    date: '2026-01-03',
    stationId: 'st-3',
    stationName: 'كويك - 3 محايل',
    stationCode: '3',
    requester: 'فني 3',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مضخة 3',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-01-03T10:00:00Z'
  },
  {
    id: 'db-t1',
    requestNumber: '1',
    section: 'tanks',
    date: '2026-01-01',
    stationId: 'st-1',
    stationName: 'كويك - 1 أبها',
    stationCode: '1',
    requester: 'فني 1',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل خزان 1',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-01-01T10:00:00Z'
  },
  {
    id: 'db-t2',
    requestNumber: '2',
    section: 'tanks',
    date: '2026-01-02',
    stationId: 'st-2',
    stationName: 'كويك - 2 الدرب',
    stationCode: '2',
    requester: 'فني 2',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل خزان 2',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-01-02T10:00:00Z'
  },
  {
    id: 'db-f1',
    requestNumber: '1',
    section: 'facilities',
    date: '2026-01-01',
    stationId: 'st-1',
    stationName: 'كويك - 1 أبها',
    stationCode: '1',
    requester: 'فني 1',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مرفق 1',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-01-01T10:00:00Z'
  }
];

const highestPumps = getHighestRequestNumberForSection(existingRequests, 'pumps');
const highestTanks = getHighestRequestNumberForSection(existingRequests, 'tanks');
const highestFac = getHighestRequestNumberForSection(existingRequests, 'facilities');

assert(highestPumps === 3, 'Initial highest Pumps request is 3', highestPumps, 3);
assert(highestTanks === 2, 'Initial highest Tanks request is 2', highestTanks, 2);
assert(highestFac === 1, 'Initial highest Facilities request is 1', highestFac, 1);

// Simulated Excel candidate rows (Multi-table pumps: tables with 1..46, 1..46):
const excelCandidates: MaintenanceRequest[] = [
  // Pumps Table 1 (Row 1): Duplicate of db-p1
  {
    id: 'xl-1',
    requestNumber: '1',
    section: 'pumps',
    date: '2026-01-01',
    stationId: 'st-1',
    stationName: 'كويك - 1 أبها',
    stationCode: '1',
    requester: 'فني 1',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مضخة 1',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-02-01T10:00:00Z'
  },
  // Pumps Table 1 (Row 2): New
  {
    id: 'xl-2',
    requestNumber: '2',
    section: 'pumps',
    date: '2026-02-01',
    stationId: 'st-4',
    stationName: 'كويك - 4 المنسك',
    stationCode: '4',
    requester: 'فني 4',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مضخة 4 جديد',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-02-01T10:00:00Z'
  },
  // Pumps Table 2 (Row 1): New (Excel number 1 reset)
  {
    id: 'xl-3',
    requestNumber: '1',
    section: 'pumps',
    date: '2026-02-02',
    stationId: 'st-5',
    stationName: 'كويك - 5 الفرعاء',
    stationCode: '5',
    requester: 'فني 5',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل مضخة 5 جديد من جدول 2',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-02-02T10:00:00Z'
  },
  // Tanks Table 1: New
  {
    id: 'xl-4',
    requestNumber: '1',
    section: 'tanks',
    date: '2026-02-03',
    stationId: 'st-6',
    stationName: 'كويك - 6 جيزان',
    stationCode: '6',
    requester: 'فني 6',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء وميكانيكا',
    problemDescription: 'عطل خزان 6 جديد',
    technician: 'فني',
    actionTaken: 'إصلاح',
    completionNotes: 'تم',
    status: 'تم',
    createdAt: '2026-02-03T10:00:00Z'
  }
];

// Duplicate detection
const acceptedCandidateRows = excelCandidates.filter(candidate => {
  return !isMaintenanceDuplicate(candidate, existingRequests);
});

assert(acceptedCandidateRows.length === 3, 'Duplicate detection accepted 3 non-duplicate records', acceptedCandidateRows.length, 3);

// Assign per-section numbers
let curPumps = getHighestRequestNumberForSection(existingRequests, 'pumps');
let curTanks = getHighestRequestNumberForSection(existingRequests, 'tanks');
let curFac = getHighestRequestNumberForSection(existingRequests, 'facilities');

const finalImportedRecords = acceptedCandidateRows.map(req => {
  let assignedNum = '1';
  if (req.section === 'pumps') {
    curPumps += 1;
    assignedNum = curPumps.toString();
  } else if (req.section === 'tanks') {
    curTanks += 1;
    assignedNum = curTanks.toString();
  } else if (req.section === 'facilities') {
    curFac += 1;
    assignedNum = curFac.toString();
  }
  return {
    ...req,
    requestNumber: assignedNum
  };
});

const importedPumpsNums = finalImportedRecords.filter(r => r.section === 'pumps').map(r => r.requestNumber);
const importedTanksNums = finalImportedRecords.filter(r => r.section === 'tanks').map(r => r.requestNumber);

assert(importedPumpsNums.join(', ') === '4, 5', 'Imported Pumps records numbered 4, 5 (continuous Pumps sequence)', importedPumpsNums.join(', '), '4, 5');
assert(importedTanksNums.join(', ') === '3', 'Imported Tanks record numbered 3 (continuous Tanks sequence)', importedTanksNums.join(', '), '3');

console.log(`\nTEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('ALL SECTION-INDEPENDENT TESTS PASSED SUCCESSFULLY!');
} else {
  process.exit(1);
}
