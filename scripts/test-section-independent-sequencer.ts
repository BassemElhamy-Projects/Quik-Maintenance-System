import {
  parseValidRequestNumber,
  sanitizeRequestNumber,
  getHighestRequestNumberForSection,
  getNextMaintenanceRequestNumber,
  getNextInspectionNumber,
  getNextIncidentNumber,
  normalizeAndRenumberMaintenanceRequests,
  normalizeAndRenumberInspections,
  normalizeAndRenumberIncidents,
  normalizeAndRenumberEntireDatabase
} from '../src/utils/requestSequencer';
import { AppData, MaintenanceRequest, InternalInspection, IncidentRecord } from '../src/types';

function runTests() {
  console.log('================================================================');
  console.log('  RUNNING SECTION-INDEPENDENT SEQUENCER & MIGRATION TEST SUITE  ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // TEST 1: Section-Independent Number Generation from existing records
  const existingReqs: MaintenanceRequest[] = [
    // Pumps has 137 records (1..137)
    ...Array.from({ length: 137 }, (_, i) => ({
      id: `pump-${i + 1}`,
      requestNumber: (i + 1).toString(),
      section: 'pumps' as const,
      date: '2026-03-01',
      stationId: 'st-01',
      stationName: 'كويك - 1 أبها',
      stationCode: '1',
      requester: 'أحمد',
      requestType: 'صيانة تصحيحية',
      maintenanceType: 'كهرباء وميكانيكا',
      problemDescription: 'عطل مضخة',
      technician: 'فني',
      actionTaken: 'إصلاح',
      completionNotes: 'تم',
      status: 'تم' as const,
      createdAt: '2026-03-01T10:00:00.000Z'
    })),
    // Tanks has 79 records (1..79)
    ...Array.from({ length: 79 }, (_, i) => ({
      id: `tank-${i + 1}`,
      requestNumber: (i + 1).toString(),
      section: 'tanks' as const,
      date: '2026-03-02',
      stationId: 'st-02',
      stationName: 'كويك - 2 الدرب',
      stationCode: '2',
      requester: 'محمد',
      requestType: 'صيانة وقائية',
      maintenanceType: 'نظافة وفحص',
      problemDescription: 'تنظيف خزان',
      technician: 'فني',
      actionTaken: 'إصلاح',
      completionNotes: 'تم',
      status: 'تم' as const,
      createdAt: '2026-03-02T10:00:00.000Z'
    })),
    // Facilities has 45 records (1..45)
    ...Array.from({ length: 45 }, (_, i) => ({
      id: `fac-${i + 1}`,
      requestNumber: (i + 1).toString(),
      section: 'facilities' as const,
      date: '2026-03-03',
      stationId: 'st-03',
      stationName: 'كويك - 3 محايل',
      stationCode: '3',
      requester: 'سعيد',
      requestType: 'صيانة طارئة',
      maintenanceType: 'سباكة',
      problemDescription: 'تسريب مياه',
      technician: 'فني',
      actionTaken: 'إصلاح',
      completionNotes: 'تم',
      status: 'جديد' as const,
      createdAt: '2026-03-03T10:00:00.000Z'
    }))
  ];

  const highestPumps = getHighestRequestNumberForSection(existingReqs, 'pumps');
  const highestTanks = getHighestRequestNumberForSection(existingReqs, 'tanks');
  const highestFac = getHighestRequestNumberForSection(existingReqs, 'facilities');

  assert(highestPumps === 137, `Pumps highest request number is 137 (found: ${highestPumps})`);
  assert(highestTanks === 79, `Tanks highest request number is 79 (found: ${highestTanks})`);
  assert(highestFac === 45, `Facilities highest request number is 45 (found: ${highestFac})`);

  const nextPumps = getNextMaintenanceRequestNumber(existingReqs, 'pumps');
  const nextTanks = getNextMaintenanceRequestNumber(existingReqs, 'tanks');
  const nextFac = getNextMaintenanceRequestNumber(existingReqs, 'facilities');

  assert(nextPumps === '138', `Next Pumps number is 138 (found: ${nextPumps})`);
  assert(nextTanks === '80', `Next Tanks number is 80 (found: ${nextTanks})`);
  assert(nextFac === '46', `Next Facilities number is 46 (found: ${nextFac})`);

  // TEST 2: Deletion rule - deleted numbers are not reused
  // If Pumps has 1,2,3,4,5 and request 3 is deleted, max is still 5, next is 6
  const samplePumpsWithDeletion: MaintenanceRequest[] = [
    { id: 'p1', requestNumber: '1', section: 'pumps', date: '2026-01-01', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'p2', requestNumber: '2', section: 'pumps', date: '2026-01-02', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c', createdAt: '2026-01-02T10:00:00Z' },
    // #3 was deleted!
    { id: 'p4', requestNumber: '4', section: 'pumps', date: '2026-01-04', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c', createdAt: '2026-01-04T10:00:00Z' },
    { id: 'p5', requestNumber: '5', section: 'pumps', date: '2026-01-05', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c', createdAt: '2026-01-05T10:00:00Z' }
  ];

  const nextAfterDelete = getNextMaintenanceRequestNumber(samplePumpsWithDeletion, 'pumps');
  assert(nextAfterDelete === '6', `After deleting #3 from [1,2,4,5], next Pumps request number is 6 (found: ${nextAfterDelete}) - never reuses 3`);

  // TEST 3: Migration of unmigrated data containing duplicates within sections
  // Simulate legacy database with duplicate numbers from Excel imports (e.g. 1, 1, 2, 2, 3...)
  const dirtyData: MaintenanceRequest[] = [
    // Pumps duplicates
    { id: 'p-d1', requestNumber: '1', section: 'pumps', date: '2026-01-01', createdAt: '2026-01-01T08:00:00Z', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },
    { id: 'p-d2', requestNumber: '1', section: 'pumps', date: '2026-01-02', createdAt: '2026-01-02T08:00:00Z', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },
    { id: 'p-d3', requestNumber: '2', section: 'pumps', date: '2026-01-03', createdAt: '2026-01-03T08:00:00Z', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },
    { id: 'p-d4', requestNumber: '2', section: 'pumps', date: '2026-01-04', createdAt: '2026-01-04T08:00:00Z', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },
    { id: 'p-d5', requestNumber: '3', section: 'pumps', date: '2026-01-05', createdAt: '2026-01-05T08:00:00Z', stationId: '1', stationName: 's1', stationCode: '1', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },

    // Tanks duplicates
    { id: 't-d1', requestNumber: '1', section: 'tanks', date: '2026-01-01', createdAt: '2026-01-01T09:00:00Z', stationId: '2', stationName: 's2', stationCode: '2', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },
    { id: 't-d2', requestNumber: '1', section: 'tanks', date: '2026-01-02', createdAt: '2026-01-02T09:00:00Z', stationId: '2', stationName: 's2', stationCode: '2', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },
    { id: 't-d3', requestNumber: '5', section: 'tanks', date: '2026-01-03', createdAt: '2026-01-03T09:00:00Z', stationId: '2', stationName: 's2', stationCode: '2', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },

    // Facilities duplicates
    { id: 'f-d1', requestNumber: '1', section: 'facilities', date: '2026-01-01', createdAt: '2026-01-01T10:00:00Z', stationId: '3', stationName: 's3', stationCode: '3', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' },
    { id: 'f-d2', requestNumber: '1', section: 'facilities', date: '2026-01-02', createdAt: '2026-01-02T10:00:00Z', stationId: '3', stationName: 's3', stationCode: '3', requester: 'r', requestType: 't', maintenanceType: 'm', problemDescription: 'd', status: 'تم', technician: 't', actionTaken: 'a', completionNotes: 'c' }
  ];

  const dirtyIns: InternalInspection[] = [
    { id: 'i1', inspectionNumber: 'INS-2026-001', date: '2026-01-01', createdAt: '2026-01-01T10:00:00Z', stationId: '1', stationName: 's1', stationCode: '1', inspectionType: 't', inspectorName: 'ins', evaluation: 'ممتاز', notes: 'n' },
    { id: 'i2', inspectionNumber: 'INS-2026-001', date: '2026-01-02', createdAt: '2026-01-02T10:00:00Z', stationId: '2', stationName: 's2', stationCode: '2', inspectionType: 't', inspectorName: 'ins', evaluation: 'ممتاز', notes: 'n' },
    { id: 'i3', inspectionNumber: '3', date: '2026-01-03', createdAt: '2026-01-03T10:00:00Z', stationId: '3', stationName: 's3', stationCode: '3', inspectionType: 't', inspectorName: 'ins', evaluation: 'ممتاز', notes: 'n' }
  ];

  const dirtyIncs: IncidentRecord[] = [
    { id: 'inc1', incidentNumber: 'INC-2026-001', region: 'r', stationId: '1', stationName: 's1', stationCode: '1', date: '2026-01-01', time: '12:00', incidentType: 't', causingParty: 'p', description: 'd', generalInfo: 'g', preventionSuggestions: 's', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'inc2', incidentNumber: '1', region: 'r', stationId: '2', stationName: 's2', stationCode: '2', date: '2026-01-02', time: '12:00', incidentType: 't', causingParty: 'p', description: 'd', generalInfo: 'g', preventionSuggestions: 's', createdAt: '2026-01-02T10:00:00Z' }
  ];

  const fullAppDb: AppData = {
    stations: [],
    maintenanceRequests: dirtyData,
    inspections: dirtyIns,
    incidents: dirtyIncs
  };

  const migration = normalizeAndRenumberEntireDatabase(fullAppDb);

  console.log('\n--- SECTION MIGRATION REPORT ---');
  console.log(`Pumps: ${migration.report.pumps.totalRecords} records | min: ${migration.report.pumps.minNumber} | max: ${migration.report.pumps.maxNumber} | dups before: ${migration.report.pumps.duplicateCountBefore} | dups after: ${migration.report.pumps.duplicateCountAfter} | next: ${migration.report.pumps.nextNumber}`);
  console.log(`Tanks: ${migration.report.tanks.totalRecords} records | min: ${migration.report.tanks.minNumber} | max: ${migration.report.tanks.maxNumber} | dups before: ${migration.report.tanks.duplicateCountBefore} | dups after: ${migration.report.tanks.duplicateCountAfter} | next: ${migration.report.tanks.nextNumber}`);
  console.log(`Facilities: ${migration.report.facilities.totalRecords} records | min: ${migration.report.facilities.minNumber} | max: ${migration.report.facilities.maxNumber} | dups before: ${migration.report.facilities.duplicateCountBefore} | dups after: ${migration.report.facilities.duplicateCountAfter} | next: ${migration.report.facilities.nextNumber}`);
  console.log(`Inspections: ${migration.report.inspections.totalRecords} records | min: ${migration.report.inspections.minNumber} | max: ${migration.report.inspections.maxNumber} | dups before: ${migration.report.inspections.duplicateCountBefore} | dups after: ${migration.report.inspections.duplicateCountAfter} | next: ${migration.report.inspections.nextNumber}`);
  console.log(`Incidents: ${migration.report.incidents.totalRecords} records | min: ${migration.report.incidents.minNumber} | max: ${migration.report.incidents.maxNumber} | dups before: ${migration.report.incidents.duplicateCountBefore} | dups after: ${migration.report.incidents.duplicateCountAfter} | next: ${migration.report.incidents.nextNumber}`);

  assert(migration.report.pumps.minNumber === 1 && migration.report.pumps.maxNumber === 5, 'Pumps migrated cleanly to 1..5');
  assert(migration.report.tanks.minNumber === 1 && migration.report.tanks.maxNumber === 3, 'Tanks migrated cleanly to 1..3');
  assert(migration.report.facilities.minNumber === 1 && migration.report.facilities.maxNumber === 2, 'Facilities migrated cleanly to 1..2');
  assert(migration.report.inspections.minNumber === 1 && migration.report.inspections.maxNumber === 3, 'Inspections migrated cleanly to 1..3');
  assert(migration.report.incidents.minNumber === 1 && migration.report.incidents.maxNumber === 2, 'Incidents migrated cleanly to 1..2');

  assert(migration.report.pumps.duplicateCountAfter === 0, 'Zero duplicate request numbers in Pumps after migration');
  assert(migration.report.tanks.duplicateCountAfter === 0, 'Zero duplicate request numbers in Tanks after migration');
  assert(migration.report.facilities.duplicateCountAfter === 0, 'Zero duplicate request numbers in Facilities after migration');

  // Verify identical numbers across different sections exist and are valid
  const pumpsNum1 = migration.data.maintenanceRequests.find(r => r.section === 'pumps' && r.requestNumber === '1');
  const tanksNum1 = migration.data.maintenanceRequests.find(r => r.section === 'tanks' && r.requestNumber === '1');
  const facNum1 = migration.data.maintenanceRequests.find(r => r.section === 'facilities' && r.requestNumber === '1');
  const insNum1 = migration.data.inspections.find(i => i.inspectionNumber === '1');
  const incNum1 = migration.data.incidents.find(inc => inc.incidentNumber === '1');

  assert(Boolean(pumpsNum1 && tanksNum1 && facNum1 && insNum1 && incNum1), 'Confirmed: Pumps #1, Tanks #1, Facilities #1, Inspections #1, Incidents #1 all coexist validly');

  console.log(`\nTEST SUMMARY: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
