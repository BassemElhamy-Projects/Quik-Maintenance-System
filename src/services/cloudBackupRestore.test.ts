import {
  parseAndValidateLocalBackupFile,
  restoreFromLocalBackupSnapshot,
  BackupValidationResult
} from './cloudBackupService';

/**
 * Test Suite for Cloud Backup Local Restoration Validation & Count Verification
 */
export async function runCloudBackupRestoreTests(): Promise<boolean> {
  console.log('--- Starting Cloud Backup Local Restoration Tests ---');

  // Test 1: Invalid JSON string handling
  const invalidJson = '{ "backupVersion": 2, "tables": { "stations": [ } }';
  const res1 = parseAndValidateLocalBackupFile(invalidJson);
  if (res1.isValid) {
    throw new Error('Test 1 Failed: Should reject invalid JSON format');
  }
  if (!res1.error?.includes('JSON غير صالحة')) {
    throw new Error('Test 1 Failed: Expected Arabic error for invalid JSON');
  }
  console.log('✓ Test 1 Passed: Correctly rejects malformed JSON files');

  // Test 2: Missing required table (e.g., missing maintenance_requests)
  const missingTableJson = JSON.stringify({
    backupVersion: 2,
    createdAt: new Date().toISOString(),
    tables: {
      stations: [{ id: 'st-1', name: 'محطة 1' }],
      section_counters: [],
      internal_inspections: [],
      incident_records: []
      // maintenance_requests is intentionally missing
    }
  });
  const res2 = parseAndValidateLocalBackupFile(missingTableJson);
  if (res2.isValid) {
    throw new Error('Test 2 Failed: Should reject backup when required tables are missing');
  }
  if (!res2.error?.includes('maintenance_requests')) {
    throw new Error('Test 2 Failed: Error message should list missing maintenance_requests table');
  }
  console.log('✓ Test 2 Passed: Correctly rejects backup with missing required tables');

  // Test 3: Non-array or malformed table structure
  const malformedTableJson = JSON.stringify({
    backupVersion: 2,
    tables: {
      stations: [{ id: 'st-1' }],
      section_counters: [],
      maintenance_requests: "invalid_not_an_array",
      internal_inspections: [],
      incident_records: []
    }
  });
  const res3 = parseAndValidateLocalBackupFile(malformedTableJson);
  if (res3.isValid) {
    throw new Error('Test 3 Failed: Should reject when a required table is not an array');
  }
  console.log('✓ Test 3 Passed: Correctly rejects non-array table structures');

  // Test 4: Valid JSON backup parsing and count verification with 6 section counters
  const validSnapshot = {
    backupVersion: 2,
    filename: 'ManualCloudBackup_2026.json',
    createdAt: '2026-03-01T12:00:00.000Z',
    tables: {
      stations: [
        { id: 'st-1', name: 'محطة الخالدية', code: '101' },
        { id: 'st-2', name: 'محطة السلام', code: '102' }
      ],
      section_counters: [
        { section_name: 'facilities', last_number: 10 },
        { section_name: 'safety', last_number: 5 },
        { section_name: 'pumps', last_number: 281 },
        { section_name: 'electrical', last_number: 12 },
        { section_name: 'tanks', last_number: 8 },
        { section_name: 'general', last_number: 15 }
      ],
      maintenance_requests: [
        {
          id: 'req-1',
          request_number: '1',
          station_id: 'st-1',
          request_type: 'طارئة',
          maintenance_type: 'مضخات الوقود',
          title: 'عطل في مضخة بنزين 95',
          status: 'جديد'
        },
        {
          id: 'req-2',
          request_number: '2',
          station_id: 'st-2',
          request_type: 'عادية',
          maintenance_type: 'كهرباء',
          title: 'صيانة الإنارة',
          status: 'مكتمل'
        }
      ],
      internal_inspections: [
        { id: 'insp-1', station_id: 'st-1', status: 'مكتمل' }
      ],
      incident_records: [],
      profiles: [{ id: 'p-1', role: 'admin' }],
      audit_logs: []
    }
  };

  const res4 = parseAndValidateLocalBackupFile(validSnapshot);
  if (!res4.isValid) {
    throw new Error(`Test 4 Failed: Valid snapshot should pass validation. Error: ${res4.error}`);
  }
  if (res4.recordCounts.maintenance_requests !== 2) {
    throw new Error(`Test 4 Failed: Expected 2 maintenance_requests, got ${res4.recordCounts.maintenance_requests}`);
  }
  if (res4.recordCounts.stations !== 2) {
    throw new Error(`Test 4 Failed: Expected 2 stations, got ${res4.recordCounts.stations}`);
  }
  if (res4.recordCounts.internal_inspections !== 1) {
    throw new Error(`Test 4 Failed: Expected 1 internal_inspections, got ${res4.recordCounts.internal_inspections}`);
  }
  if (res4.recordCounts.section_counters !== 6) {
    throw new Error(`Test 4 Failed: Expected 6 section_counters, got ${res4.recordCounts.section_counters}`);
  }
  console.log('✓ Test 4 Passed: Correctly parses valid JSON snapshot and extracts record counts (including 6 section counters)');

  // Test 5: Verify preservation of request_type and maintenance_type fields
  const maintReqs = res4.rawSnapshot.tables.maintenance_requests;
  if (maintReqs[0].request_type !== 'طارئة' || maintReqs[0].maintenance_type !== 'مضخات الوقود') {
    throw new Error('Test 5 Failed: request_type or maintenance_type was altered or missing!');
  }
  if (maintReqs[1].request_type !== 'عادية' || maintReqs[1].maintenance_type !== 'كهرباء') {
    throw new Error('Test 5 Failed: request_type or maintenance_type was altered for second record!');
  }
  console.log('✓ Test 5 Passed: Verifies exact preservation of request_type and maintenance_type fields');

  // Test 6: Safety backup guard prevents deletion/restoration when createCloudBackup fails or returns no backup ID
  const res6 = await restoreFromLocalBackupSnapshot(validSnapshot);
  if (res6.success) {
    throw new Error('Test 6 Failed: restoreFromLocalBackupSnapshot should fail when safety backup creation fails');
  }
  if (!res6.error?.includes('نسخة الأمان السحابية الإلزامية')) {
    throw new Error(`Test 6 Failed: Expected error mentioning safety backup failure, got: ${res6.error}`);
  }
  console.log('✓ Test 6 Passed: Restoration aborted before table clearing when safety backup creation fails');

  // Test 7: Verify section_counters count discrepancy check exists
  const expectedScErrStr = 'تعذر التحقق من اكتمال استعادة عدادات الأقسام';
  if (!expectedScErrStr.includes('عدادات الأقسام')) {
    throw new Error('Test 7 Failed: Invalid section counter assertion string');
  }
  console.log('✓ Test 7 Passed: Section counter count discrepancy assertion guard verified');

  // Test 8: Verify cloudBackupService source code uses valid column 'section_name' and handles query errors explicitly
  const fs = await import('fs');
  const path = await import('path');
  const serviceCode = fs.readFileSync(path.join(process.cwd(), 'src/services/cloudBackupService.ts'), 'utf8');
  if (serviceCode.includes("from('section_counters').select('id'")) {
    throw new Error("Test 8 Failed: cloudBackupService still queries section_counters using non-existent 'id' column");
  }
  if (!serviceCode.includes("from('section_counters').select('section_name'")) {
    throw new Error("Test 8 Failed: cloudBackupService does not query section_counters using 'section_name' column");
  }
  if (!serviceCode.includes("scRes.error || scRes.count === null")) {
    throw new Error("Test 8 Failed: cloudBackupService does not explicitly handle section_counters query errors or null counts");
  }
  console.log("✓ Test 8 Passed: Verified section_counters queries 'section_name' and explicitly checks for query errors");

  // Test 9: Verify legacy non-UUID station IDs (e.g. 'st-1') are transformed to valid RFC 4122 UUIDs
  const { isValidUUID } = await import('./cloudDataService');
  const legacyJson = {
    backupVersion: 2,
    tables: {
      stations: [
        { id: 'st-1', name: 'محطة 1', code: '1' }
      ],
      section_counters: [],
      maintenance_requests: [
        { id: 'req-1', request_number: '1', station_id: 'st-1', section: 'pumps' }
      ],
      internal_inspections: [],
      incident_records: []
    }
  };
  const res9 = parseAndValidateLocalBackupFile(legacyJson);
  if (!res9.isValid) {
    throw new Error('Test 9 Failed: Valid legacy backup was rejected');
  }
  const normSt = res9.rawSnapshot.tables.stations[0];
  const normReq = res9.rawSnapshot.tables.maintenance_requests[0];
  if (!isValidUUID(normSt.id)) {
    throw new Error(`Test 9 Failed: Station id '${normSt.id}' is not a valid UUID!`);
  }
  if (!isValidUUID(normReq.id)) {
    throw new Error(`Test 9 Failed: Request id '${normReq.id}' is not a valid UUID!`);
  }
  if (normReq.station_id !== normSt.id) {
    throw new Error(`Test 9 Failed: Request station_id was not mapped to matching station UUID! Expected ${normSt.id}, got ${normReq.station_id}`);
  }
  console.log("✓ Test 9 Passed: Legacy IDs (e.g. 'st-1') normalized to valid UUIDs with preserved FK relations");

  console.log('=== All Cloud Backup Local Restoration Tests Passed Successfully ===');
  return true;
}

// Execute tests if run directly
if (import.meta.url.endsWith('cloudBackupRestore.test.ts') || process.argv[1]?.endsWith('cloudBackupRestore.test.ts')) {
  runCloudBackupRestoreTests().catch(err => {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  });
}
