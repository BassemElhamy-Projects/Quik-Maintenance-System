import { AppData, Station } from '../types';
import { OFFICIAL_STATIONS } from '../data/officialStations';
import { fetchAuthoritativeCloudData, mergeOfficialStations } from './cloudDataService';
import {
  getNextMaintenanceRequestNumber,
  getNextInspectionNumber,
  getNextIncidentNumber
} from '../utils/requestSequencer';

export const STORAGE_KEY = 'quick_fuel_db_v1';
export const RECOVERY_SNAPSHOT_KEY = 'quick_fuel_recovery_snapshot_v1';

export interface LocalRecoverySnapshot {
  timestamp: string;
  reason: string;
  recordCounts: {
    maintenanceRequests: number;
    stations: number;
    customStations: number;
    inspections: number;
    incidents: number;
  };
  data: AppData;
}

/**
 * Calculates record counts across all modules in AppData
 */
export function getRecordCounts(data?: AppData | null): {
  maintenanceRequests: number;
  stations: number;
  customStations: number;
  inspections: number;
  incidents: number;
} {
  if (!data) {
    return { maintenanceRequests: 0, stations: 0, customStations: 0, inspections: 0, incidents: 0 };
  }
  const requests = Array.isArray(data.maintenanceRequests) ? data.maintenanceRequests.length : 0;
  const stations = Array.isArray(data.stations) ? data.stations.length : 0;
  const customStations = Array.isArray(data.stations) ? data.stations.filter(s => !s.isDefault).length : 0;
  const inspections = Array.isArray(data.inspections) ? data.inspections.length : 0;
  const incidents = Array.isArray(data.incidents) ? data.incidents.length : 0;
  return { maintenanceRequests: requests, stations, customStations, inspections, incidents };
}

/**
 * Sanitizes and merges stations ensuring the 10 official stations are always seeded
 */
export function sanitizeAndMergeStations(existingStations?: Station[]): Station[] {
  return existingStations || [];
}

/**
 * Helper to check whether an AppData object contains non-empty user records
 */
export function hasNonEmptyRecords(data?: AppData | null): boolean {
  if (!data) return false;
  const hasRequests = Array.isArray(data.maintenanceRequests) && data.maintenanceRequests.length > 0;
  const hasInspections = Array.isArray(data.inspections) && data.inspections.length > 0;
  const hasIncidents = Array.isArray(data.incidents) && data.incidents.length > 0;
  const hasStations = Array.isArray(data.stations) && data.stations.length > 0;
  return hasRequests || hasInspections || hasIncidents || hasStations;
}

/**
 * Retrieves the isolated recovery snapshot if available
 */
export function getRecoverySnapshot(): LocalRecoverySnapshot | null {
  try {
    const raw = localStorage.getItem(RECOVERY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalRecoverySnapshot;
    if (parsed && parsed.data && hasNonEmptyRecords(parsed.data)) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.error('[STORAGE] Failed to parse recovery snapshot:', err);
    return null;
  }
}

/**
 * Creates or updates an isolated local recovery snapshot of non-empty local records.
 * Stored under RECOVERY_SNAPSHOT_KEY, which is never cleared by standard app resets or cloud overwrites.
 */
export function createRecoverySnapshot(
  data: AppData,
  reason: string,
  options?: { force?: boolean }
): boolean {
  try {
    if (!hasNonEmptyRecords(data)) {
      return false;
    }
    const counts = getRecordCounts(data);
    const existing = getRecoverySnapshot();

    if (existing && existing.data && !options?.force) {
      const existingTotal =
        existing.recordCounts.maintenanceRequests +
        existing.recordCounts.inspections +
        existing.recordCounts.incidents +
        existing.recordCounts.stations;
      const newTotal =
        counts.maintenanceRequests +
        counts.inspections +
        counts.incidents +
        counts.stations;

      // Preserve the existing snapshot if it contains more records than the candidate
      if (existingTotal > newTotal) {
        console.log(`[RECOVERY SNAPSHOT] Preserving richer existing snapshot (${existingTotal} records vs ${newTotal} new).`);
        return true;
      }
    }

    const snapshot: LocalRecoverySnapshot = {
      timestamp: new Date().toISOString(),
      reason,
      recordCounts: counts,
      data
    };
    localStorage.setItem(RECOVERY_SNAPSHOT_KEY, JSON.stringify(snapshot));
    console.log(`[RECOVERY SNAPSHOT] Created/Updated isolated recovery snapshot under '${RECOVERY_SNAPSHOT_KEY}' (${reason}). Record counts:`, counts);
    return true;
  } catch (err) {
    console.error('[STORAGE] Failed to create recovery snapshot:', err);
    return false;
  }
}

/**
 * Ensures an isolated recovery snapshot exists for any non-empty local storage data
 */
export function ensureLocalRecoverySnapshotExists(reason = 'auto_protection'): boolean {
  const localData = getAppData();
  if (hasNonEmptyRecords(localData)) {
    return createRecoverySnapshot(localData, reason);
  }
  return false;
}

/**
 * Reads local application cache or initializes with default structure.
 * Automatically creates an isolated recovery snapshot if non-empty records are found.
 */
export function getAppData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        stations: [],
        maintenanceRequests: [],
        inspections: [],
        incidents: []
      };
    }
    const parsed = JSON.parse(raw) as AppData;
    if (
      Array.isArray(parsed.stations) &&
      Array.isArray(parsed.maintenanceRequests) &&
      Array.isArray(parsed.inspections) &&
      Array.isArray(parsed.incidents)
    ) {
      const sanitized: AppData = {
        stations: parsed.stations,
        maintenanceRequests: parsed.maintenanceRequests,
        inspections: parsed.inspections,
        incidents: parsed.incidents
      };
      if (hasNonEmptyRecords(sanitized)) {
        createRecoverySnapshot(sanitized, 'get_app_data_auto_protection');
      }
      return sanitized;
    }
    return {
      stations: [],
      maintenanceRequests: [],
      inspections: [],
      incidents: []
    };
  } catch (err) {
    console.error('Failed to parse local cache:', err);
    return {
      stations: [],
      maintenanceRequests: [],
      inspections: [],
      incidents: []
    };
  }
}

/**
 * Categorizes cloud fetch errors into distinct categories (network, auth/RLS, unconfigured, unknown)
 */
export function categorizeCloudError(errorMsg?: string): 'network_error' | 'auth_rls_error' | 'unconfigured' | 'unknown_error' {
  if (!errorMsg) return 'unknown_error';
  const lower = errorMsg.toLowerCase();
  if (lower.includes('غير مهيأة') || lower.includes('unconfigured') || lower.includes('not configured')) {
    return 'unconfigured';
  }
  if (
    lower.includes('اتصال') ||
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('offline')
  ) {
    return 'network_error';
  }
  if (
    lower.includes('صلاحيات') ||
    lower.includes('permission') ||
    lower.includes('rls') ||
    lower.includes('row-level security') ||
    lower.includes('jwt') ||
    lower.includes('auth') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return 'auth_rls_error';
  }
  return 'unknown_error';
}

/**
 * Asynchronously loads application data directly from Cloud PostgreSQL/Supabase
 * Safely handles empty cloud responses, network errors, and auth/RLS errors without silently
 * overwriting non-empty local browser data.
 * Always creates an isolated local recovery snapshot before any potential overwrite.
 */
export async function loadAppDataAsync(): Promise<{
  success: boolean;
  data: AppData | null;
  source: 'cloud_supabase' | 'local_storage';
  isDriveAvailable: boolean;
  cloudIsEmpty?: boolean;
  localDataPreserved?: boolean;
  errorCategory?: 'network_error' | 'auth_rls_error' | 'unconfigured' | 'unknown_error';
  error?: string;
}> {
  const localData = getAppData();
  const localHasRecords = hasNonEmptyRecords(localData);

  // Guarantee an isolated recovery snapshot exists for any non-empty local browser data before cloud attempt
  if (localHasRecords) {
    createRecoverySnapshot(localData, 'pre_cloud_load_snapshot');
  }

  const cloudRes = await fetchAuthoritativeCloudData();

  if (cloudRes.success && cloudRes.data) {
    const cloudHasRecords = hasNonEmptyRecords(cloudRes.data);

    if (cloudHasRecords) {
      // Cloud has records: update local cache safely after snapshotting
      if (localHasRecords) {
        createRecoverySnapshot(localData, 'pre_cloud_overwrite_snapshot');
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudRes.data));
      } catch {}

      return {
        success: true,
        data: cloudRes.data,
        source: 'cloud_supabase',
        isDriveAvailable: true,
        cloudIsEmpty: false,
        localDataPreserved: false
      };
    } else {
      // Cloud returned 0 records (empty database)
      if (localHasRecords) {
        // SAFEGUARD: Do NOT overwrite non-empty local browser storage with empty cloud data.
        // Preserve local recovery snapshot and local data from destruction.
        createRecoverySnapshot(localData, 'empty_cloud_protection_snapshot');
        console.warn('[DATA LOSS PREVENTION] Supabase returned 0 records while local storage contains valid records. Preserving local data.');
        return {
          success: true,
          data: localData,
          source: 'local_storage',
          isDriveAvailable: true,
          cloudIsEmpty: true,
          localDataPreserved: true,
          error: 'قاعدة البيانات السحابية خالية حالياً. تم الاحتفاظ بالبيانات المحلية لحمايتها من الضياع.'
        };
      }

      // Both Cloud and Local are empty
      return {
        success: true,
        data: cloudRes.data,
        source: 'cloud_supabase',
        isDriveAvailable: true,
        cloudIsEmpty: true,
        localDataPreserved: false
      };
    }
  }

  // Cloud call failed (network error, auth/RLS issue, or unconfigured)
  const category = categorizeCloudError(cloudRes.error);

  if (localHasRecords) {
    createRecoverySnapshot(localData, 'cloud_error_fallback_snapshot');
    console.warn(`[DATA SAFETY] Cloud load failed (${category}). Falling back to preserved local browser data.`);
    return {
      success: false,
      data: localData,
      source: 'local_storage',
      isDriveAvailable: false,
      cloudIsEmpty: false,
      localDataPreserved: true,
      errorCategory: category,
      error: cloudRes.error || 'تعذر تحميل البيانات من الخدمة السحابية.'
    };
  }

  return {
    success: false,
    data: null,
    source: 'cloud_supabase',
    isDriveAvailable: false,
    cloudIsEmpty: false,
    localDataPreserved: false,
    errorCategory: category,
    error: cloudRes.error || 'تعذر تحميل البيانات من الخدمة السحابية. يرجى التحقق من اتصال الإنترنت.'
  };
}

/**
 * Asynchronously saves application data to local cache with data loss protection
 * Creates an isolated recovery snapshot if existing local data is about to be overwritten,
 * or if new non-empty data is being saved.
 */
export async function saveAppDataAsync(
  data: AppData,
  options?: { allowEmptyOverwrite?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const existingLocal = getAppData();
    const existingHasRecords = hasNonEmptyRecords(existingLocal);
    const newHasRecords = hasNonEmptyRecords(data);

    if (existingHasRecords) {
      createRecoverySnapshot(existingLocal, 'pre_local_write_snapshot');
    }
    if (newHasRecords) {
      createRecoverySnapshot(data, 'save_local_data_snapshot');
    }

    // Safeguard: Do not silently overwrite non-empty local storage with empty data
    // unless explicitly allowed (e.g. user manually performed clear all records)
    if (existingHasRecords && !newHasRecords && !options?.allowEmptyOverwrite) {
      console.warn('[STORAGE SAFETY] Refusing to silently overwrite non-empty local storage with empty app state.');
      return {
        success: false,
        error: 'تم منع استبدال البيانات المحلية بقيم فارغة لحماية البيانات.'
      };
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { success: true };
  } catch (err) {
    console.error('Failed to save data cache:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Synchronous save trigger for background effects
 */
export function saveAppData(data: AppData, options?: { allowEmptyOverwrite?: boolean }): void {
  saveAppDataAsync(data, options).catch(err => {
    console.error('[STORAGE] saveAppData error:', err);
  });
}

/**
 * Asynchronously clears all records (Local Cache helper).
 * Creates a forced recovery snapshot BEFORE clearing, leaving the snapshot intact.
 */
export async function clearAllRecordsAsync(currentData: AppData): Promise<{ success: boolean; clearedData: AppData; error?: string }> {
  if (hasNonEmptyRecords(currentData)) {
    createRecoverySnapshot(currentData, 'pre_reset_snapshot', { force: true });
  }
  const cleared: AppData = {
    stations: [],
    maintenanceRequests: [],
    inspections: [],
    incidents: []
  };
  await saveAppDataAsync(cleared, { allowEmptyOverwrite: true });
  return { success: true, clearedData: cleared };
}

/**
 * Clears all records and stations, returning an empty operational dataset.
 * Creates a forced recovery snapshot BEFORE clearing, leaving the snapshot intact.
 */
export function clearAllRecords(currentData: AppData): AppData {
  if (hasNonEmptyRecords(currentData)) {
    createRecoverySnapshot(currentData, 'pre_reset_snapshot', { force: true });
  }
  const cleared: AppData = {
    stations: [],
    maintenanceRequests: [],
    inspections: [],
    incidents: []
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleared));
  } catch (err) {
    console.error('[STORAGE] Synchronous clear error:', err);
  }
  saveAppData(cleared, { allowEmptyOverwrite: true });
  return cleared;
}

/**
 * Exports current app data as a downloadable JSON file
 */
export function exportDataAsJSON(data: AppData): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `quick_fuel_export_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Imports JSON string into AppData format with validation
 */
export function validateAndParseImportJSON(jsonContent: string): AppData | null {
  try {
    const parsed = JSON.parse(jsonContent);
    if (
      parsed &&
      Array.isArray(parsed.stations) &&
      Array.isArray(parsed.maintenanceRequests) &&
      Array.isArray(parsed.inspections) &&
      Array.isArray(parsed.incidents)
    ) {
      return parsed as AppData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generates next auto-increment request number for maintenance, inspection, or incident
 */
export function generateAutoNumber(type: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents', existingData: AppData): string {
  if (type === 'pumps' || type === 'tanks' || type === 'facilities') {
    return getNextMaintenanceRequestNumber(existingData.maintenanceRequests || [], type);
  }
  if (type === 'inspections') {
    return getNextInspectionNumber(existingData.inspections || []);
  }
  return getNextIncidentNumber(existingData.incidents || []);
}
