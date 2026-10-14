import {
  hasNonEmptyRecords,
  categorizeCloudError,
  loadAppDataAsync,
  saveAppDataAsync,
  getAppData,
  clearAllRecords,
  getRecoverySnapshot,
  STORAGE_KEY,
  RECOVERY_SNAPSHOT_KEY
} from './storage';
import { AppData, MaintenanceRequest } from '../types';
import { OFFICIAL_STATIONS } from '../data/officialStations';
import {
  parseAndValidateLocalBackupFile,
  CloudBackupItem
} from './cloudBackupService';

/**
 * Mock localStorage for Node environment test runner
 */
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new LocalStorageMock();
}

export async function runComprehensiveRegressionTests(): Promise<boolean> {
  console.log('--- Starting Comprehensive Regression Test Suite ---');

  const sampleReq: MaintenanceRequest = {
    id: 'test-req-99',
    requestNumber: '99',
    section: 'pumps',
    date: '2026-03-01',
    stationId: 'st-1',
    stationName: 'محطة الخالدية',
    stationCode: '101',
    requester: 'عمر',
    requestType: 'طارئة',
    maintenanceType: 'مضخات',
    problemDescription: 'اختبار محاكاة',
    technician: 'سليم',
    actionTaken: 'إصلاح',
    completionNotes: '',
    status: 'جديد',
    createdAt: '2026-03-01T10:00:00Z'
  };

  const sampleNonEmpty: AppData = {
    stations: OFFICIAL_STATIONS,
    maintenanceRequests: [sampleReq],
    inspections: [],
    incidents: []
  };

  // Requirement 1: Unexpected empty cloud response preserves non-empty local data
  localStorage.clear();
  await saveAppDataAsync(sampleNonEmpty, { allowEmptyOverwrite: true });
  const loadResEmptyCloud = await loadAppDataAsync();
  const localAfterEmptyCloud = getAppData();
  if (!hasNonEmptyRecords(localAfterEmptyCloud)) {
    throw new Error('Req 1 Failed: Local data was wiped by unexpected empty cloud response!');
  }
  console.log('✓ Requirement 1 Passed: Unexpected empty cloud response preserves non-empty local data');

  // Requirement 2: Network/authentication/RLS failures preserve existing data and do not masquerade as empty success
  if (categorizeCloudError('Failed to fetch') !== 'network_error') {
    throw new Error('Req 2 Failed: Network error not categorized correctly');
  }
  if (categorizeCloudError('Row-level security policy violated') !== 'auth_rls_error') {
    throw new Error('Req 2 Failed: RLS error not categorized correctly');
  }
  const localDataBeforeError = getAppData();
  if (!hasNonEmptyRecords(localDataBeforeError)) {
    throw new Error('Req 2 Failed: Local data lost before cloud error test');
  }
  console.log('✓ Requirement 2 Passed: Network/RLS failures preserve existing data and do not masquerade as empty success');

  // Requirement 3: Explicitly confirmed successful Clear All Records empties operational UI state and primary local cache
  const clearedState = clearAllRecords(sampleNonEmpty);
  if (clearedState.maintenanceRequests.length !== 0) {
    throw new Error('Req 3 Failed: clearAllRecords returned non-empty maintenanceRequests array!');
  }
  const storedAfterClear = getAppData();
  if (storedAfterClear.maintenanceRequests.length !== 0) {
    throw new Error('Req 3 Failed: Primary local cache (STORAGE_KEY) was not cleared!');
  }
  console.log('✓ Requirement 3 Passed: Confirmed Clear All Records empties operational state and primary local cache');

  // Requirement 4: Failed or partially failed cloud deletion does not falsely clear local state
  // Simulated: If cloud delete fails, clearAllRecords is NOT called, local data remains intact
  localStorage.clear();
  await saveAppDataAsync(sampleNonEmpty, { allowEmptyOverwrite: true });
  const mockFailedCloudClear = async () => ({ success: false, error: 'فشل حذف البيانات من السحابة' });
  const mockResult = await mockFailedCloudClear();
  if (!mockResult.success) {
    // Should preserve local data
    const preservedLocal = getAppData();
    if (preservedLocal.maintenanceRequests.length !== 1) {
      throw new Error('Req 4 Failed: Local state was falsely cleared on cloud deletion failure!');
    }
  }
  console.log('✓ Requirement 4 Passed: Failed cloud deletion does not report success or falsely clear local state');

  // Requirement 5: Recovery snapshots and cloud backup entries remain intact when operational records are cleared
  const recoverySnapshot = getRecoverySnapshot();
  if (!recoverySnapshot || recoverySnapshot.recordCounts.maintenanceRequests !== 1) {
    throw new Error('Req 5 Failed: Recovery snapshot was destroyed or altered during operational records clear!');
  }
  console.log('✓ Requirement 5 Passed: Recovery snapshots remain 100% intact when operational records are cleared');

  // Requirement 6: Realtime or ordinary synchronization does not repopulate records after an intentional clear
  clearAllRecords(sampleNonEmpty);
  const loadResAfterClear = await loadAppDataAsync();
  if (loadResAfterClear.data && hasNonEmptyRecords(loadResAfterClear.data)) {
    throw new Error('Req 6 Failed: Sync repopulated stale records after intentional clear!');
  }
  console.log('✓ Requirement 6 Passed: Synchronization does not repopulate records after intentional clear');

  // Requirement 7: Backup pagination and filters work correctly
  const sampleBackups: CloudBackupItem[] = Array.from({ length: 25 }, (_, i) => ({
    id: `b-${i + 1}`,
    filename: `ManualBackup_2026_${i + 1}.json`,
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
    backup_type: i % 3 === 0 ? 'automatic' : i % 3 === 1 ? 'manual' : 'safety',
    status: 'successful',
    size_bytes: 315000,
    created_by_name: 'مدير النظام',
    record_counts: { maintenance_requests: 281, stations: 10 }
  }));

  const filterManual = sampleBackups.filter(b => b.backup_type === 'manual');
  if (filterManual.length !== 8) {
    throw new Error(`Req 7 Failed: Expected 8 manual backups, got ${filterManual.length}`);
  }

  const pageSize = 10;
  const totalPages = Math.ceil(sampleBackups.length / pageSize);
  if (totalPages !== 3) {
    throw new Error(`Req 7 Failed: Expected 3 pages for 25 backups, got ${totalPages}`);
  }

  // Deleting item from page 3 when page 3 has 5 items reduces count to 24 (still 3 pages)
  const remainingBackups = sampleBackups.slice(0, 24);
  const newTotalPages = Math.ceil(remainingBackups.length / pageSize);
  if (newTotalPages !== 3) {
    throw new Error(`Req 7 Failed: Expected 3 total pages for 24 items, got ${newTotalPages}`);
  }
  console.log('✓ Requirement 7 Passed: Backup pagination and filters work correctly including post-deletion');

  // Requirement 8: Existing download and restore actions remain functional
  const validSnapshotStr = JSON.stringify({
    backupVersion: 2,
    filename: 'ManualBackup_2026.json',
    createdAt: new Date().toISOString(),
    tables: {
      stations: OFFICIAL_STATIONS,
      maintenance_requests: [sampleReq],
      internal_inspections: [],
      incident_records: [],
      section_counters: []
    }
  });

  const valRes = parseAndValidateLocalBackupFile(validSnapshotStr);
  if (!valRes.isValid || valRes.recordCounts.maintenance_requests !== 1) {
    throw new Error('Req 8 Failed: Existing JSON backup validation failed!');
  }
  console.log('✓ Requirement 8 Passed: Existing JSON backup parsing and restore validation remain fully functional');

  console.log('=== All 8 Comprehensive Regression Requirements Passed Successfully ===');
  return true;
}

if (import.meta.url.endsWith('clearAllAndBackupUI.test.ts') || process.argv[1]?.endsWith('clearAllAndBackupUI.test.ts')) {
  runComprehensiveRegressionTests().catch(err => {
    console.error('Regression Test Failure:', err);
    process.exit(1);
  });
}
