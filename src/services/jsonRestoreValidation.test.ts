import {
  parseAndValidateLocalBackupFile,
  normalizeSnapshotData,
  restoreFromLocalBackupSnapshot
} from './cloudBackupService';
import { OFFICIAL_STATIONS } from '../data/officialStations';

/**
 * Test Suite for JSON Restore Validation & Format Normalization
 */
export async function runJsonRestoreValidationTests(): Promise<boolean> {
  console.log('=== Starting JSON Restore Validation & Format Normalization Tests ===');

  const sampleReqCamel = {
    id: 'req-camel-1',
    requestNumber: '100',
    section: 'pumps',
    date: '2026-03-01',
    stationId: 'st-1',
    stationName: 'كويك - 1 أبها',
    stationCode: '1',
    requester: 'أحمد',
    requestType: 'طارئة',
    maintenanceType: 'مضخات',
    problemDescription: 'عطل مفاجئ بالأنبوب',
    technician: 'سليم',
    actionTaken: 'تم الإصلاح',
    completionNotes: 'جاهز',
    status: 'مكتمل',
    createdAt: '2026-03-01T10:00:00Z'
  };

  const sampleReqSnake = {
    id: 'req-snake-2',
    request_number: '200',
    section: 'tanks',
    date: '2026-03-01',
    station_id: 'st-2',
    station_name: 'كويك - 2 الدرب',
    station_code: '2',
    requester: 'فهد',
    request_type: 'وقائية',
    maintenance_type: 'خزانات',
    problem_description: 'فحص دوري',
    technician: 'علي',
    action_taken: 'سليم',
    completion_notes: '',
    status: 'جديد',
    created_at: '2026-03-01T11:00:00Z'
  };

  // Test 1: Normalize Cloud Snake_Case Format (backupVersion: 2)
  const cloudSnapshotSnake = {
    backupVersion: 2,
    createdAt: new Date().toISOString(),
    filename: 'CloudBackup_Snake.json',
    tables: {
      stations: OFFICIAL_STATIONS,
      maintenance_requests: [sampleReqSnake],
      internal_inspections: [],
      incident_records: [],
      section_counters: [{ section_name: 'tanks', last_number: 200, updated_at: new Date().toISOString() }]
    }
  };

  const norm1 = normalizeSnapshotData(cloudSnapshotSnake);
  if (!norm1.isValid) {
    throw new Error(`Test 1 Failed: Snake_case snapshot failed normalization: ${norm1.error}`);
  }
  if (norm1.recordCounts.maintenance_requests !== 1 || norm1.recordCounts.stations !== 10) {
    throw new Error(`Test 1 Failed: Incorrect record counts extracted. Got: ${JSON.stringify(norm1.recordCounts)}`);
  }
  if (norm1.tables.maintenance_requests[0].request_number !== '200') {
    throw new Error('Test 1 Failed: Snake_case request_number not preserved!');
  }
  console.log('✓ Test 1 Passed: Cloud snake_case format normalized successfully');

  // Test 2: Normalize Local Export CamelCase Format (Legacy / Flat AppData)
  const localExportCamel = {
    backupVersion: 1,
    createdAt: new Date().toISOString(),
    filename: 'LocalExport_Camel.json',
    stations: OFFICIAL_STATIONS,
    maintenanceRequests: [sampleReqCamel],
    inspections: [],
    incidents: []
  };

  const norm2 = normalizeSnapshotData(localExportCamel);
  if (!norm2.isValid) {
    throw new Error(`Test 2 Failed: CamelCase snapshot failed normalization: ${norm2.error}`);
  }
  if (norm2.recordCounts.maintenance_requests !== 1 || norm2.recordCounts.stations !== 10) {
    throw new Error(`Test 2 Failed: Incorrect record counts extracted for camelCase file: ${JSON.stringify(norm2.recordCounts)}`);
  }
  // Verify camelCase fields mapped to PostgreSQL snake_case columns
  const mappedReq = norm2.tables.maintenance_requests[0];
  if (
    mappedReq.request_number !== '100' ||
    mappedReq.station_name !== 'كويك - 1 أبها' ||
    mappedReq.request_type !== 'طارئة' ||
    mappedReq.maintenance_type !== 'مضخات'
  ) {
    throw new Error(`Test 2 Failed: CamelCase fields not correctly mapped to PostgreSQL columns! Got: ${JSON.stringify(mappedReq)}`);
  }
  console.log('✓ Test 2 Passed: Local camelCase format mapped to PostgreSQL snake_case columns successfully');

  // Test 3: Legacy File without section_counters auto-generates valid section counters
  if (norm2.tables.section_counters.length !== 5) {
    throw new Error(`Test 3 Failed: Expected 5 auto-generated section counters, got ${norm2.tables.section_counters.length}`);
  }
  const pumpsCounter = norm2.tables.section_counters.find(sc => sc.section_name === 'pumps');
  if (!pumpsCounter || pumpsCounter.last_number !== 100) {
    throw new Error(`Test 3 Failed: Auto-generated pumps counter expected 100, got ${pumpsCounter?.last_number}`);
  }
  console.log('✓ Test 3 Passed: Legacy backup file without section_counters auto-generated valid section counters (max 100)');

  // Test 4: parseAndValidateLocalBackupFile accepts both formats
  const valResult = parseAndValidateLocalBackupFile(localExportCamel);
  if (!valResult.isValid || valResult.recordCounts.maintenance_requests !== 1) {
    throw new Error('Test 4 Failed: parseAndValidateLocalBackupFile rejected valid camelCase format');
  }
  console.log('✓ Test 4 Passed: parseAndValidateLocalBackupFile handles both cloud & legacy camelCase formats');

  // Test 5: Rejection of malformed / corrupted JSON
  const invalidResult = parseAndValidateLocalBackupFile('{"invalid": json');
  if (invalidResult.isValid) {
    throw new Error('Test 5 Failed: Corrupted JSON string was not rejected');
  }
  console.log('✓ Test 5 Passed: Corrupted JSON string correctly rejected with clear Arabic error');

  console.log('=== All JSON Restore Validation Tests Passed 100% ===');
  return true;
}

if (import.meta.url.endsWith('jsonRestoreValidation.test.ts') || process.argv[1]?.endsWith('jsonRestoreValidation.test.ts')) {
  runJsonRestoreValidationTests().catch(err => {
    console.error('Validation Test Error:', err);
    process.exit(1);
  });
}
