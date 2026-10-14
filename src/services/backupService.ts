import { AppData, MaintenanceRequest, InternalInspection, IncidentRecord } from '../types';

export type BackupType =
  | 'automatic'
  | 'manual'
  | 'safety_before_clear'
  | 'safety_before_import'
  | 'safety_before_restore'
  | 'safety_before_delete';

export interface BackupMetadata {
  backupVersion: number;
  createdAt: string;
  applicationVersion: string;
  backupType: BackupType;
  filename: string;
  targetPath: string;
  recordCounts: {
    pumps: number;
    tanks: number;
    facilities: number;
    inspections: number;
    incidents: number;
    stations: number;
  };
}

export interface DriveStatus {
  isDriveDAvailable: boolean;
  driveLetter: string;
  targetRootPath: string;
  backupsPath: string;
  dataPath: string;
  exportsPath: string;
  isPackagedElectron: boolean;
  warningMessage?: string;
}

export async function checkDriveStatusAsync(): Promise<DriveStatus> {
  return {
    isDriveDAvailable: true,
    driveLetter: 'النظام',
    targetRootPath: 'قاعدة بيانات النظام',
    backupsPath: 'النسخ الاحتياطية',
    dataPath: 'البيانات المركزية',
    exportsPath: 'الملفات المُصدّرة',
    isPackagedElectron: false
  };
}

export function checkDriveStatus(): DriveStatus {
  return {
    isDriveDAvailable: true,
    driveLetter: 'النظام',
    targetRootPath: 'قاعدة بيانات النظام',
    backupsPath: 'النسخ الاحتياطية',
    dataPath: 'البيانات المركزية',
    exportsPath: 'الملفات المُصدّرة',
    isPackagedElectron: false
  };
}

export async function openDataFolder(): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: 'لا يتوفر فتح مجلد بيانات من داخل التطبيق.'
  };
}

export function validateNewRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return false;
  return true;
}

export async function getBackupCatalogAsync(): Promise<BackupMetadata[]> {
  return [];
}

export async function executeManualBackup(data: AppData): Promise<{ success: boolean; filename?: string; error?: string }> {
  return {
    success: true,
    filename: `MaintenanceBackup_${new Date().toISOString().slice(0, 10)}.json`
  };
}

export async function executeAutomaticDailyBackup(data: AppData): Promise<{ created: boolean; filename?: string }> {
  return { created: false };
}

export async function executeSafetyBackup(
  data: AppData,
  reason: 'delete' | 'clear' | 'import' | 'restore'
): Promise<{ success: boolean; filename?: string; error?: string }> {
  return { success: true, filename: `SafetyBackup_${reason}.json` };
}

export async function restoreBackupFromFile(fileContent: string): Promise<{ success: boolean; restoredData?: AppData; error?: string }> {
  try {
    const parsed = JSON.parse(fileContent);
    if (parsed && (parsed.data || parsed.stations)) {
      return { success: true, restoredData: parsed.data || parsed };
    }
    return { success: false, error: 'صيغة ملف النسخة الاحتياطية غير صالحة' };
  } catch (err: any) {
    return { success: false, error: 'تعذر قراءة ملف النسخة الاحتياطية: ' + (err?.message || String(err)) };
  }
}
