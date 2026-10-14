import {
  hasNonEmptyRecords,
  saveAppDataAsync,
  getAppData,
  clearAllRecords,
  STORAGE_KEY
} from './storage';
import { AppData, Station, MaintenanceRequest } from '../types';
import { OFFICIAL_STATIONS } from '../data/officialStations';
import {
  parseAndValidateLocalBackupFile
} from './cloudBackupService';

/**
 * Mock localStorage for Node test runner environment
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
 * End-to-End station clear and restore cycle test
 */
export async function runStationClearRestoreCycleTest(): Promise<boolean> {
  console.log('=== Starting Station Clear & Restore Lifecycle Test ===');

  // Step 1: Create a custom test station and linked maintenance request
  const testStation: Station = {
    id: 'test-st-999',
    code: 'ST-999',
    name: 'محطة تجريبية لاختبار الحذف والاستعادة',
    region: 'الرياض',
    city: 'الرياض',
    address: 'شارع الملك فهد',
    status: 'نشطة',
    phone: '0500000000',
    supervisor: 'مهندس الاختبار',
    notes: 'محطة تجريبية للتحقق',
    isDefault: false,
    createdAt: '2026-03-01T12:00:00Z',
    updatedAt: '2026-03-01T12:00:00Z'
  };

  const testRequest: MaintenanceRequest = {
    id: 'test-req-888',
    requestNumber: '888',
    section: 'pumps',
    date: '2026-03-01',
    stationId: testStation.id,
    stationName: testStation.name,
    stationCode: testStation.code,
    requester: 'سامي',
    requestType: 'طارئة',
    maintenanceType: 'مضخات',
    problemDescription: 'عطل تجريبي لاختبار دورة المحطات',
    technician: 'سليم',
    actionTaken: 'تم الفحص',
    completionNotes: '',
    status: 'جديد',
    createdAt: '2026-03-01T12:30:00Z'
  };

  const appStateWithTestStation: AppData = {
    stations: [...OFFICIAL_STATIONS, testStation],
    maintenanceRequests: [testRequest],
    inspections: [],
    incidents: []
  };

  localStorage.clear();
  await saveAppDataAsync(appStateWithTestStation, { allowEmptyOverwrite: true });
  console.log('✓ Step 1 Passed: Created test station [ST-999] and linked maintenance request');

  // Step 2 & 3: Create backup JSON snapshot & verify station data inside JSON
  const generatedSnapshot = {
    backupVersion: 2,
    architecture: 'supabase_cloud_only',
    createdAt: new Date().toISOString(),
    backupType: 'manual',
    filename: 'TestStationBackup_2026.json',
    recordCounts: {
      stations: appStateWithTestStation.stations.length,
      maintenance_requests: appStateWithTestStation.maintenanceRequests.length,
      internal_inspections: 0,
      incident_records: 0,
      section_counters: 5
    },
    tables: {
      stations: appStateWithTestStation.stations,
      maintenance_requests: appStateWithTestStation.maintenanceRequests,
      internal_inspections: [],
      incident_records: [],
      section_counters: [
        { section_name: 'pumps', last_number: 1, updated_at: new Date().toISOString() }
      ]
    }
  };

  const snapshotJsonString = JSON.stringify(generatedSnapshot, null, 2);
  const valResult = parseAndValidateLocalBackupFile(snapshotJsonString);

  if (!valResult.isValid) {
    throw new Error(`Step 3 Failed: Snapshot validation error: ${valResult.error}`);
  }

  // Verify custom station exists inside JSON snapshot tables
  const snapshotStations = valResult.rawSnapshot?.tables?.stations || [];
  const foundInSnapshot = snapshotStations.find((s: any) => s.code === 'ST-999' || s.id === 'test-st-999');
  if (!foundInSnapshot) {
    throw new Error('Step 3 Failed: Custom test station ST-999 was NOT found in the backup JSON snapshot!');
  }
  console.log('✓ Step 2 & 3 Passed: Backup JSON created and verified containing test station ST-999');

  // Step 4: Execute Clear All Records -> verify test station and linked record disappear from state & cache
  const clearedState = clearAllRecords(appStateWithTestStation);
  const currentStoredData = getAppData();

  const customStationInClearedState = clearedState.stations.find(s => s.code === 'ST-999' || s.id === 'test-st-999');
  const customStationInCache = currentStoredData.stations.find(s => s.code === 'ST-999' || s.id === 'test-st-999');

  if (customStationInClearedState || customStationInCache) {
    throw new Error('Step 4 Failed: Custom test station ST-999 was NOT deleted after Clear All Records!');
  }
  if (clearedState.maintenanceRequests.length !== 0 || currentStoredData.maintenanceRequests.length !== 0) {
    throw new Error('Step 4 Failed: Linked maintenance request was NOT cleared!');
  }
  console.log('✓ Step 4 Passed: Clear All Records executed; test station ST-999 and linked request completely disappeared');

  // Step 5 & 6: Restore backup JSON file -> verify station and linked records return without duplicates or errors
  const restoredStations = valResult.rawSnapshot.tables.stations;
  const restoredRequests = valResult.rawSnapshot.tables.maintenance_requests;

  const restoredState: AppData = {
    stations: restoredStations,
    maintenanceRequests: restoredRequests,
    inspections: [],
    incidents: []
  };

  await saveAppDataAsync(restoredState, { allowEmptyOverwrite: true });
  const postRestoreData = getAppData();

  const restoredTestStation = postRestoreData.stations.find(s => s.code === 'ST-999' || s.id === 'test-st-999');
  if (!restoredTestStation) {
    throw new Error('Step 6 Failed: Custom test station ST-999 was NOT restored from the backup file!');
  }

  const restoredTestRequest = postRestoreData.maintenanceRequests.find(r => r.id === 'test-req-888' || r.requestNumber === '888' || (r as any).request_number === '888');
  if (!restoredTestRequest) {
    throw new Error('Step 6 Failed: Linked maintenance request test-req-888 was NOT restored!');
  }

  // Check for duplicate stations
  const stCount = postRestoreData.stations.filter(s => s.code === 'ST-999').length;
  if (stCount !== 1) {
    throw new Error(`Step 6 Failed: Station ST-999 was duplicated during restore! Count: ${stCount}`);
  }

  console.log('✓ Step 5 & 6 Passed: Backup file restored successfully; test station ST-999 and linked request restored without duplicates');

  console.log('=== All 6 Station Clear & Restore Lifecycle Steps Passed 100% ===');
  return true;
}

if (import.meta.url.endsWith('testStationClearRestoreCycle.test.ts') || process.argv[1]?.endsWith('testStationClearRestoreCycle.test.ts')) {
  runStationClearRestoreCycleTest().catch(err => {
    console.error('Lifecycle Test Error:', err);
    process.exit(1);
  });
}
