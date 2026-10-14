import {
  hasNonEmptyRecords,
  categorizeCloudError,
  loadAppDataAsync,
  saveAppDataAsync,
  getAppData,
  clearAllRecords,
  getRecoverySnapshot,
  ensureLocalRecoverySnapshotExists,
  RECOVERY_SNAPSHOT_KEY,
  STORAGE_KEY
} from './storage';
import { AppData, MaintenanceRequest } from '../types';
import { OFFICIAL_STATIONS } from '../data/officialStations';

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

/**
 * Test Suite for Storage Data Loss Prevention & Fallback Logic
 */
export async function runStorageDataLossPreventionTests(): Promise<boolean> {
  console.log('--- Starting Storage Data Loss Prevention Tests ---');

  // Helper sample data
  const sampleRequest: MaintenanceRequest = {
    id: 'test-req-1',
    requestNumber: '1',
    section: 'pumps',
    date: '2026-03-01',
    stationId: 'st-1',
    stationName: 'محطة الخالدية',
    stationCode: '101',
    requester: 'أحمد',
    requestType: 'طارئة',
    maintenanceType: 'مضخات',
    problemDescription: 'عطل مفاجئ',
    technician: 'سليم',
    actionTaken: 'إصلاح',
    completionNotes: '',
    status: 'جديد',
    createdAt: '2026-03-01T10:00:00Z'
  };

  const nonEmtpyData: AppData = {
    stations: OFFICIAL_STATIONS,
    maintenanceRequests: [sampleRequest],
    inspections: [],
    incidents: []
  };

  const emptyData: AppData = {
    stations: [],
    maintenanceRequests: [],
    inspections: [],
    incidents: []
  };

  // Test 1: hasNonEmptyRecords detection
  if (!hasNonEmptyRecords(nonEmtpyData)) {
    throw new Error('Test 1 Failed: hasNonEmptyRecords should return true for non-empty dataset');
  }
  if (hasNonEmptyRecords(emptyData)) {
    throw new Error('Test 1 Failed: hasNonEmptyRecords should return false for empty dataset');
  }
  console.log('✓ Test 1 Passed: hasNonEmptyRecords correctly identifies empty vs non-empty datasets');

  // Test 2: Categorization of Cloud Errors
  if (categorizeCloudError('Failed to fetch network request') !== 'network_error') {
    throw new Error('Test 2 Failed: Should categorize as network_error');
  }
  if (categorizeCloudError('Row-level security policy violated') !== 'auth_rls_error') {
    throw new Error('Test 2 Failed: Should categorize as auth_rls_error');
  }
  if (categorizeCloudError('إعدادات الاتصال بالخدمة السحابية غير مهيأة بعد') !== 'unconfigured') {
    throw new Error('Test 2 Failed: Should categorize as unconfigured');
  }
  console.log('✓ Test 2 Passed: categorizeCloudError correctly distinguishes network, auth/RLS, and config errors');

  // Test 3: saveAppDataAsync prevents silent empty overwrites over non-empty local storage
  localStorage.clear();
  await saveAppDataAsync(nonEmtpyData, { allowEmptyOverwrite: true });
  const storedBefore = getAppData();
  if (storedBefore.maintenanceRequests.length !== 1) {
    throw new Error('Test 3 Setup Failed: Local storage not populated');
  }

  // Attempt silent overwrite with empty data (should fail and keep local storage intact)
  const saveRes = await saveAppDataAsync(emptyData);
  if (saveRes.success) {
    throw new Error('Test 3 Failed: saveAppDataAsync should refuse to overwrite non-empty local storage with empty data');
  }
  const storedAfter = getAppData();
  if (storedAfter.maintenanceRequests.length !== 1) {
    throw new Error('Test 3 Failed: Local storage data was wiped during silent empty save!');
  }
  console.log('✓ Test 3 Passed: saveAppDataAsync prevents silent overwrite of non-empty local storage');

  // Test 4: Independent Recovery Snapshot creation and preservation across resets
  localStorage.clear();
  await saveAppDataAsync(nonEmtpyData, { allowEmptyOverwrite: true });
  const snapshotBefore = getRecoverySnapshot();
  if (!snapshotBefore || snapshotBefore.recordCounts.maintenanceRequests !== 1) {
    throw new Error('Test 4 Failed: Independent recovery snapshot was not created when saving non-empty local data!');
  }

  // Execute standard app reset
  clearAllRecords(storedAfter);
  const mainStoreCleared = getAppData();
  if (mainStoreCleared.maintenanceRequests.length !== 0) {
    throw new Error('Test 4 Failed: Main working storage was not cleared by clearAllRecords');
  }

  // Verify the independent recovery snapshot remains 100% intact
  const snapshotAfterReset = getRecoverySnapshot();
  if (!snapshotAfterReset || snapshotAfterReset.recordCounts.maintenanceRequests !== 1) {
    throw new Error('Test 4 Failed: Standard reset cleared or erased the independent recovery snapshot!');
  }
  console.log('✓ Test 4 Passed: Independent recovery snapshot created and preserved across app resets');

  // Test 5: loadAppDataAsync preserves local storage when cloud returns empty dataset
  // First seed local storage with data again
  localStorage.clear();
  await saveAppDataAsync(nonEmtpyData, { allowEmptyOverwrite: true });

  const loadRes = await loadAppDataAsync();
  const postLoadLocal = getAppData();
  if (!hasNonEmptyRecords(postLoadLocal)) {
    throw new Error('Test 5 Failed: loadAppDataAsync silently wiped local browser storage!');
  }

  const postLoadSnapshot = getRecoverySnapshot();
  if (!postLoadSnapshot || postLoadSnapshot.recordCounts.maintenanceRequests !== 1) {
    throw new Error('Test 5 Failed: loadAppDataAsync lost the isolated recovery snapshot!');
  }

  if (loadRes.localDataPreserved) {
    console.log('✓ Test 5 Passed: loadAppDataAsync preserved local browser data and recovery snapshot when cloud was empty or unconfigured');
  } else if (loadRes.success && loadRes.data && hasNonEmptyRecords(loadRes.data)) {
    console.log('✓ Test 5 Passed: loadAppDataAsync fetched cloud data and updated local cache');
  } else {
    throw new Error('Test 5 Failed: Data loss safety check did not trigger as expected');
  }

  console.log('=== All Storage Data Loss Prevention Tests Passed Successfully ===');
  return true;
}

// Execute tests when run via CLI directly
if (import.meta.url.endsWith('storage.test.ts') || process.argv[1]?.endsWith('storage.test.ts')) {
  runStorageDataLossPreventionTests().catch(err => {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  });
}
