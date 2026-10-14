import { supabase } from './supabaseClient';
import { migrateAndRenumberCloudRecordsDirectly, isValidUUID } from './cloudDataService';
import { OFFICIAL_STATIONS } from '../data/officialStations';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface CloudBackupItem {
  id: string;
  filename: string;
  backup_type: 'automatic' | 'manual' | 'safety';
  status: 'successful' | 'failed';
  size_bytes: number;
  created_by?: string;
  created_by_name: string;
  record_counts: {
    profiles?: number;
    stations?: number;
    section_counters?: number;
    maintenance_requests?: number;
    internal_inspections?: number;
    incident_records?: number;
    audit_logs?: number;
  };
  notes?: string;
  created_at: string;
  snapshot_data?: any;
}

export const DEFAULT_BACKUP_ERROR = 'تعذّر إتمام عملية النسخ الاحتياطي السحابي. حاول مرة أخرى أو تواصل مع مسؤول النظام.';

/**
 * Checks whether an error message is a safe Arabic business error
 */
function isSafeArabicBusinessError(msg?: string): boolean {
  if (!msg || typeof msg !== 'string') return false;
  const trimmed = msg.trim();
  if (trimmed.length === 0) return false;

  const hasArabicChars = /[\u0600-\u06FF]/.test(trimmed);
  if (!hasArabicChars) return false;

  const technicalPatterns = [
    /pgrst/i,
    /postgres/i,
    /sql/i,
    /database/i,
    /syntax\s*error/i,
    /column/i,
    /relation/i,
    /duplicate\s*key/i,
    /foreign\s*key/i,
    /violates/i,
    /null\s*value/i,
    /json/i,
    /jwt/i,
    /token/i,
    /typeerror/i,
    /error\s*:/i,
    /http[s]?:\/\//i,
    /supabase/i,
    /vite_/i,
    /\{|\}|<|>/,
    /\b(?:400|401|403|404|500|502|503)\b/
  ];

  for (const pattern of technicalPatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes and enriches error messages from cloud backup backend with developer logging
 */
function sanitizeBackupError(msg?: string, context?: string): string {
  if (!msg) return DEFAULT_BACKUP_ERROR;

  // Log detailed technical error for developer console debugging
  console.error(`[CLOUD BACKUP SERVICE ERROR]${context ? ` [${context}]` : ''}:`, msg);

  if (isSafeArabicBusinessError(msg)) {
    return msg.trim();
  }

  const lower = msg.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('rls') || lower.includes('permission') || lower.includes('42501')) {
    return 'فشل تنفيذ العملية بسبب سياسات صلاحيات الوصول (RLS). يرجى التأكد من تسجيل الدخول بحساب مدير نظام مفعّل.';
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign key constraint')) {
    return 'تعذر استكمال العملية بسبب وجود تعارض في قيود العلاقات بين المحطات والطلبات.';
  }
  if (lower.includes('duplicate key') || lower.includes('already exists')) {
    return 'تعذر استكمال العملية بسبب وجود سجلات مكررة بنفس المعرّف الرئيسي.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'تعذر الاتصال بالخدمة السحابية. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
  }

  // Clean any potential sensitive tokens or URLs while preserving clear error message
  const cleanedMsg = msg.replace(/bearer\s+[a-zA-Z0-9\._\-]+/gi, '[TOKEN]')
                        .replace(/key=[a-zA-Z0-9\._\-]+/gi, 'key=[KEY]');

  return `تعذر استكمال العملية السحابية: ${cleanedMsg}`;
}

/**
 * Flexible normalizer for JSON backup snapshots (supports cloud snake_case, camelCase exports, legacy formats, and flat objects)
 */
export function normalizeSnapshotData(input: string | object): {
  isValid: boolean;
  error?: string;
  filename?: string;
  version?: number | string;
  createdAt?: string;
  tables: {
    stations: any[];
    maintenance_requests: any[];
    internal_inspections: any[];
    incident_records: any[];
    section_counters: any[];
    profiles: any[];
    audit_logs: any[];
  };
  recordCounts: {
    stations: number;
    maintenance_requests: number;
    internal_inspections: number;
    incident_records: number;
    section_counters: number;
    profiles: number;
    audit_logs: number;
  };
  rawSnapshot?: any;
} {
  let data: any;

  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return {
        isValid: false,
        error: 'ملف النسخة الاحتياطية غير صريح أو يحتوي على صيغة JSON غير صالحة.',
        tables: { stations: [], maintenance_requests: [], internal_inspections: [], incident_records: [], section_counters: [], profiles: [], audit_logs: [] },
        recordCounts: { maintenance_requests: 0, stations: 0, section_counters: 0, internal_inspections: 0, incident_records: 0, profiles: 0, audit_logs: 0 }
      };
    }
  } else if (typeof input === 'object' && input !== null) {
    data = input;
  } else {
    return {
      isValid: false,
      error: 'محتوى ملف النسخة الاحتياطية غير صالح.',
      tables: { stations: [], maintenance_requests: [], internal_inspections: [], incident_records: [], section_counters: [], profiles: [], audit_logs: [] },
      recordCounts: { maintenance_requests: 0, stations: 0, section_counters: 0, internal_inspections: 0, incident_records: 0, profiles: 0, audit_logs: 0 }
    };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      isValid: false,
      error: 'هيكل ملف النسخة الاحتياطية غير صالح - يجب أن يكون كائناً بنية JSON.',
      tables: { stations: [], maintenance_requests: [], internal_inspections: [], incident_records: [], section_counters: [], profiles: [], audit_logs: [] },
      recordCounts: { maintenance_requests: 0, stations: 0, section_counters: 0, internal_inspections: 0, incident_records: 0, profiles: 0, audit_logs: 0 }
    };
  }

  // Support enveloped (tables/data/snapshot_data) and flat JSON structures
  const targetObj = data.snapshot_data?.tables || data.snapshot_data || data.tables || data.data?.tables || data.data || data;

  const candidateTables = data.tables || data.snapshot_data?.tables || data.data?.tables;
  if (candidateTables && typeof candidateTables === 'object') {
    const t = candidateTables;
    if (!('maintenance_requests' in t) && !('maintenanceRequests' in t)) {
      return {
        isValid: false,
        error: 'جدول طلبات الصيانة (maintenance_requests) مفقود في ملف النسخة الاحتياطية.',
        tables: { stations: [], maintenance_requests: [], internal_inspections: [], incident_records: [], section_counters: [], profiles: [], audit_logs: [] },
        recordCounts: { maintenance_requests: 0, stations: 0, section_counters: 0, internal_inspections: 0, incident_records: 0, profiles: 0, audit_logs: 0 }
      };
    }
    const maintProp = t.maintenance_requests ?? t.maintenanceRequests;
    if (maintProp !== undefined && !Array.isArray(maintProp)) {
      return {
        isValid: false,
        error: 'جدول طلبات الصيانة (maintenance_requests) يحتوي على هيكل غير صالح - يجب أن يكون مصفوفة.',
        tables: { stations: [], maintenance_requests: [], internal_inspections: [], incident_records: [], section_counters: [], profiles: [], audit_logs: [] },
        recordCounts: { maintenance_requests: 0, stations: 0, section_counters: 0, internal_inspections: 0, incident_records: 0, profiles: 0, audit_logs: 0 }
      };
    }
  }

  // Extract raw arrays with camelCase & snake_case fallbacks
  const rawStations = Array.isArray(targetObj.stations) ? targetObj.stations : (Array.isArray(targetObj.Station) ? targetObj.Station : []);
  
  const rawMaint = Array.isArray(targetObj.maintenance_requests) ? targetObj.maintenance_requests : 
                   (Array.isArray(targetObj.maintenanceRequests) ? targetObj.maintenanceRequests : []);

  const rawInsp = Array.isArray(targetObj.internal_inspections) ? targetObj.internal_inspections : 
                 (Array.isArray(targetObj.inspections) ? targetObj.inspections : []);

  const rawInc = Array.isArray(targetObj.incident_records) ? targetObj.incident_records : 
                 (Array.isArray(targetObj.incidents) ? targetObj.incidents : []);

  const rawCounters = Array.isArray(targetObj.section_counters) ? targetObj.section_counters : 
                      (Array.isArray(targetObj.sectionCounters) ? targetObj.sectionCounters : []);

  const rawProfiles = Array.isArray(targetObj.profiles) ? targetObj.profiles : [];
  const rawAudit = Array.isArray(targetObj.audit_logs) ? targetObj.audit_logs : [];

  const legacyStationToUuidMap = new Map<string, string>();

  // Normalize Stations to PostgreSQL snake_case columns with strictly valid UUIDs
  const normStations = rawStations.map((s: any, idx: number) => {
    let stationUuid: string;
    if (isValidUUID(s.id)) {
      stationUuid = String(s.id).trim().toLowerCase();
    } else {
      stationUuid = generateUUID();
      if (s.id) {
        legacyStationToUuidMap.set(String(s.id), stationUuid);
      }
    }

    if (s.code) legacyStationToUuidMap.set(String(s.code), stationUuid);
    if (s.stationCode) legacyStationToUuidMap.set(String(s.stationCode), stationUuid);
    if (s.name) legacyStationToUuidMap.set(String(s.name), stationUuid);
    if (s.stationName) legacyStationToUuidMap.set(String(s.stationName), stationUuid);

    return {
      id: stationUuid,
      code: (s.code || s.stationCode || (idx + 1)).toString(),
      name: s.name || s.stationName || `محطة ${idx + 1}`,
      region: s.region || 'الرياض',
      city: s.city || null,
      address: s.address || null,
      status: s.status || 'نشطة',
      phone: s.phone || null,
      supervisor: s.supervisor || null,
      notes: s.notes || null,
      is_default: Boolean(s.is_default ?? s.isDefault),
      created_at: s.created_at || s.createdAt || new Date().toISOString(),
      updated_at: s.updated_at || s.updatedAt || new Date().toISOString()
    };
  });

  // Helper to resolve valid UUID for station_id
  const resolveStationId = (rawStId: any, code: any, name: any): string | null => {
    if (isValidUUID(rawStId)) {
      return String(rawStId).trim().toLowerCase();
    }
    if (rawStId && legacyStationToUuidMap.has(String(rawStId))) {
      return legacyStationToUuidMap.get(String(rawStId))!;
    }
    if (code && legacyStationToUuidMap.has(String(code))) {
      return legacyStationToUuidMap.get(String(code))!;
    }
    if (name && legacyStationToUuidMap.has(String(name))) {
      return legacyStationToUuidMap.get(String(name))!;
    }
    if (normStations.length > 0) {
      return normStations[0].id;
    }
    return null;
  };

  // Normalize Maintenance Requests to PostgreSQL snake_case columns
  const normMaint = rawMaint.map((r: any, idx: number) => {
    const matchedStationId = resolveStationId(
      r.station_id || r.stationId,
      r.station_code || r.stationCode,
      r.station_name || r.stationName
    );

    return {
      id: isValidUUID(r.id) ? String(r.id).trim().toLowerCase() : generateUUID(),
      request_number: (r.request_number || r.requestNumber || (idx + 1)).toString(),
      section: r.section || 'pumps',
      date: r.date || new Date().toISOString().slice(0, 10),
      station_id: matchedStationId,
      station_name: r.station_name || r.stationName || (normStations[0]?.name || 'محطة غير محددة'),
      station_code: r.station_code || r.stationCode || (normStations[0]?.code || '1'),
      requester: r.requester || 'غير محدد',
      request_type: r.request_type || r.requestType || 'طلب صيانة',
      maintenance_type: r.maintenance_type || r.maintenanceType || 'صيانة عامة',
      problem_description: r.problem_description || r.problemDescription || 'لا يوجد وصف',
      technician: r.technician || '',
      action_taken: r.action_taken || r.actionTaken || '',
      completion_notes: r.completion_notes || r.completionNotes || '',
      status: r.status || 'جديد',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  });

  // Normalize Internal Inspections to PostgreSQL snake_case columns
  const normInsp = rawInsp.map((i: any, idx: number) => {
    const matchedStationId = resolveStationId(
      i.station_id || i.stationId,
      i.station_code || i.stationCode,
      i.station_name || i.stationName
    );

    return {
      id: isValidUUID(i.id) ? String(i.id).trim().toLowerCase() : generateUUID(),
      inspection_number: (i.inspection_number || i.inspectionNumber || (idx + 1)).toString(),
      date: i.date || new Date().toISOString().slice(0, 10),
      station_id: matchedStationId,
      station_name: i.station_name || i.stationName || (normStations[0]?.name || 'محطة غير محددة'),
      station_code: i.station_code || i.stationCode || (normStations[0]?.code || '1'),
      inspector_name: i.inspector_name || i.inspectorName || 'المفتش',
      notes: i.notes || '',
      status: i.status || 'مكتمل',
      created_at: i.created_at || i.createdAt || new Date().toISOString()
    };
  });

  // Normalize Incident Records to PostgreSQL snake_case columns
  const normInc = rawInc.map((ic: any, idx: number) => {
    const matchedStationId = resolveStationId(
      ic.station_id || ic.stationId,
      ic.station_code || ic.stationCode,
      ic.station_name || ic.stationName
    );

    return {
      id: isValidUUID(ic.id) ? String(ic.id).trim().toLowerCase() : generateUUID(),
      incident_number: (ic.incident_number || ic.incidentNumber || (idx + 1)).toString(),
      date: ic.date || new Date().toISOString().slice(0, 10),
      station_id: matchedStationId,
      station_name: ic.station_name || ic.stationName || (normStations[0]?.name || 'محطة غير محددة'),
      station_code: ic.station_code || ic.stationCode || (normStations[0]?.code || '1'),
      reporter_name: ic.reporter_name || ic.reporterName || 'المبلغ',
      incident_type: ic.incident_type || ic.incidentType || 'أخرى',
      severity: ic.severity || 'متوسطة',
      description: ic.description || '',
      action_taken: ic.action_taken || ic.actionTaken || '',
      status: ic.status || 'مغلق',
      created_at: ic.created_at || ic.createdAt || new Date().toISOString()
    };
  });

  // Normalize or Auto-generate Section Counters
  let normCounters: any[] = [];
  if (rawCounters.length > 0) {
    normCounters = rawCounters.map((sc: any) => ({
      section_name: sc.section_name || sc.sectionName || 'pumps',
      last_number: typeof sc.last_number === 'number' ? sc.last_number : (typeof sc.lastNumber === 'number' ? sc.lastNumber : 0),
      updated_at: sc.updated_at || sc.updatedAt || new Date().toISOString()
    }));
  } else {
    // Generate counters dynamically based on maximum request numbers in restored data
    const sections = ['pumps', 'tanks', 'facilities', 'inspections', 'incidents'];
    normCounters = sections.map(sec => {
      let maxNum = 0;
      if (sec === 'pumps' || sec === 'tanks' || sec === 'facilities') {
        const secReqs = normMaint.filter((r: any) => (r.section || 'pumps') === sec);
        secReqs.forEach((r: any) => {
          const num = parseInt(r.request_number, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
      } else if (sec === 'inspections') {
        normInsp.forEach((i: any) => {
          const num = parseInt(i.inspection_number, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
      } else if (sec === 'incidents') {
        normInc.forEach((ic: any) => {
          const num = parseInt(ic.incident_number, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
      }
      return {
        section_name: sec,
        last_number: maxNum,
        updated_at: new Date().toISOString()
      };
    });
  }

  const tables = {
    stations: normStations,
    maintenance_requests: normMaint,
    internal_inspections: normInsp,
    incident_records: normInc,
    section_counters: normCounters,
    profiles: rawProfiles,
    audit_logs: rawAudit
  };

  const counts = {
    stations: normStations.length,
    maintenance_requests: normMaint.length,
    internal_inspections: normInsp.length,
    incident_records: normInc.length,
    section_counters: normCounters.length,
    profiles: rawProfiles.length,
    audit_logs: rawAudit.length
  };

  return {
    isValid: true,
    filename: data.filename || 'local_backup.json',
    version: data.backupVersion || data.version || 2,
    createdAt: data.createdAt || data.created_at || new Date().toISOString(),
    tables,
    recordCounts: counts,
    rawSnapshot: data
  };
}

/**
 * Creates a manual, automatic, or safety backup in Supabase
 */
export async function createCloudBackup(
  backupType: 'manual' | 'automatic' | 'safety' = 'manual',
  notes?: string
): Promise<{ success: boolean; backup?: CloudBackupItem; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة السحابية غير متوفرة.' };

  try {
    const { data: { session } } = await supabase.auth.getSession();

    const [profilesRes, stationsRes, countersRes, maintRes, inspRes, incRes, auditRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('stations').select('*'),
      supabase.from('section_counters').select('*'),
      supabase.from('maintenance_requests').select('*'),
      supabase.from('internal_inspections').select('*'),
      supabase.from('incident_records').select('*'),
      supabase.from('audit_logs').select('*')
    ]);

    const stationsData = stationsRes.data || [];

    const recordCounts = {
      profiles: profilesRes.data?.length || 0,
      stations: stationsData.length,
      section_counters: countersRes.data?.length || 0,
      maintenance_requests: maintRes.data?.length || 0,
      internal_inspections: inspRes.data?.length || 0,
      incident_records: incRes.data?.length || 0,
      audit_logs: auditRes.data?.length || 0
    };

    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    let prefix = 'ManualCloudBackup';
    if (backupType === 'automatic') prefix = 'AutoCloudBackup';
    if (backupType === 'safety') prefix = 'SafetyCloudBackup';

    const filename = `${prefix}_${dateStr}.json`;

    const snapshotData = {
      backupVersion: 2,
      architecture: 'supabase_cloud_only',
      createdAt: now.toISOString(),
      backupType,
      filename,
      recordCounts,
      tables: {
        profiles: profilesRes.data || [],
        stations: stationsData,
        section_counters: countersRes.data || [],
        maintenance_requests: maintRes.data || [],
        internal_inspections: inspRes.data || [],
        incident_records: incRes.data || [],
        audit_logs: auditRes.data || []
      }
    };

    const serialized = JSON.stringify(snapshotData);
    const sizeBytes = new TextEncoder().encode(serialized).length;

    const { data: insertedBackup, error: insertError } = await supabase
      .from('cloud_backups')
      .insert({
        filename,
        backup_type: backupType,
        status: 'successful',
        size_bytes: sizeBytes,
        created_by: session?.user?.id || null,
        created_by_name: 'مدير النظام السحابي',
        record_counts: recordCounts,
        snapshot_data: snapshotData as any,
        notes
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
        return { success: false, error: 'عفواً، هذه العملية مقتصرة فقط على مدراء النظام المفعّلين.' };
      }
      return { success: false, error: sanitizeBackupError(insertError.message, 'createCloudBackup') };
    }

    return {
      success: true,
      backup: {
        id: insertedBackup.id,
        filename: insertedBackup.filename,
        backup_type: insertedBackup.backup_type,
        status: insertedBackup.status,
        size_bytes: insertedBackup.size_bytes,
        created_by: insertedBackup.created_by || undefined,
        created_by_name: insertedBackup.created_by_name,
        record_counts: (insertedBackup.record_counts as any) || {},
        notes: insertedBackup.notes || undefined,
        created_at: insertedBackup.created_at,
        snapshot_data: insertedBackup.snapshot_data
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: sanitizeBackupError(err?.message, 'createCloudBackup')
    };
  }
}

/**
 * Restores cloud database from a stored backup ID
 */
export async function restoreCloudBackup(backupId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة السحابية غير متوفرة.' };

  try {
    // 1. Create a mandatory Cloud Safety Backup
    const safetyRes = await createCloudBackup('safety', 'نسخة أمان أوتوماتيكية قبل تنفيذ استعادة النسخة السحابية');
    if (!safetyRes.success || !safetyRes.backup?.id) {
      return {
        success: false,
        error: `فشل إنشاء نسخة الأمان السحابية الإلزامية: ${safetyRes.error || 'خطأ غير معروف'}`
      };
    }
    const safetyBackupId = safetyRes.backup.id;

    // 2. Fetch target backup record
    const { data: targetBackup, error: fetchErr } = await supabase
      .from('cloud_backups')
      .select('*')
      .eq('id', backupId)
      .maybeSingle();

    if (fetchErr || !targetBackup || !targetBackup.snapshot_data) {
      return { success: false, error: 'تعذر العثور على بيانات النسخة الاحتياطية المطلوبة.' };
    }

    const norm = normalizeSnapshotData(targetBackup.snapshot_data as any);
    if (!norm.isValid) {
      return { success: false, error: norm.error };
    }

    const tables = norm.tables;

    // 3. Clear existing table records in FK order
    const { error: delMaintErr } = await supabase.from('maintenance_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delMaintErr) throw new Error(`فشل تفريغ جدول طلبات الصيانة: ${delMaintErr.message}`);

    const { error: delInspErr } = await supabase.from('internal_inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delInspErr) throw new Error(`فشل تفريغ جدول التفتيش: ${delInspErr.message}`);

    const { error: delIncErr } = await supabase.from('incident_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delIncErr) throw new Error(`فشل تفريغ جدول الحوادث: ${delIncErr.message}`);

    const { error: delStErr } = await supabase.from('stations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delStErr) throw new Error(`فشل تفريغ جدول المحطات: ${delStErr.message}`);

    // 4. Restore stations
    if (tables.stations.length > 0) {
      const { error: stErr } = await supabase.from('stations').upsert(tables.stations);
      if (stErr) throw new Error(`فشل إدراج المحطات: ${stErr.message}`);
    }

    // 5. Restore section_counters
    if (tables.section_counters.length > 0) {
      const { error: scErr } = await supabase.from('section_counters').upsert(tables.section_counters);
      if (scErr) throw new Error(`فشل إدراج عدادات الأقسام: ${scErr.message}`);
    }

    // 6. Restore maintenance_requests
    if (tables.maintenance_requests.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < tables.maintenance_requests.length; i += BATCH_SIZE) {
        const chunk = tables.maintenance_requests.slice(i, i + BATCH_SIZE);
        const { error: mErr } = await supabase.from('maintenance_requests').insert(chunk);
        if (mErr) throw new Error(`فشل إدراج طلبات الصيانة: ${mErr.message}`);
      }
    }

    // 7. Restore internal_inspections
    if (tables.internal_inspections.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < tables.internal_inspections.length; i += BATCH_SIZE) {
        const chunk = tables.internal_inspections.slice(i, i + BATCH_SIZE);
        const { error: iErr } = await supabase.from('internal_inspections').insert(chunk);
        if (iErr) throw new Error(`فشل إدراج سجلات التفتيش: ${iErr.message}`);
      }
    }

    // 8. Restore incident_records
    if (tables.incident_records.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < tables.incident_records.length; i += BATCH_SIZE) {
        const chunk = tables.incident_records.slice(i, i + BATCH_SIZE);
        const { error: icErr } = await supabase.from('incident_records').insert(chunk);
        if (icErr) throw new Error(`فشل إدراج بلاغات الحوادث: ${icErr.message}`);
      }
    }

    // 9. Renumber records safely
    await migrateAndRenumberCloudRecordsDirectly();

    return {
      success: true,
      data: {
        message: 'تم استعادة قاعدة البيانات السحابية بنجاح.',
        safetyBackupId
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: sanitizeBackupError(err?.message, 'restoreCloudBackup')
    };
  }
}

export interface BackupValidationResult {
  isValid: boolean;
  error?: string;
  filename?: string;
  version?: number | string;
  createdAt?: string;
  recordCounts: {
    maintenance_requests: number;
    stations: number;
    section_counters: number;
    internal_inspections: number;
    incident_records: number;
    profiles: number;
    audit_logs: number;
  };
  tables?: any;
  rawSnapshot?: any;
}

/**
 * Parses and validates a JSON backup file content before restoration.
 */
export function parseAndValidateLocalBackupFile(input: string | object): BackupValidationResult {
  const norm = normalizeSnapshotData(input);
  return {
    isValid: norm.isValid,
    error: norm.error,
    filename: norm.filename,
    version: norm.version,
    createdAt: norm.createdAt,
    recordCounts: norm.recordCounts,
    tables: norm.tables,
    rawSnapshot: norm.isValid ? {
      ...norm.rawSnapshot,
      tables: norm.tables
    } : norm.rawSnapshot
  };
}

/**
 * Restores cloud database state directly from a validated local JSON snapshot with safety backup
 * and verified restored row count assertions.
 */
export function restoreFromLocalBackupSnapshot(snapshotData: any): Promise<{
  success: boolean;
  message?: string;
  safetyBackupId?: string;
  verifiedCounts?: {
    maintenance_requests: number;
    stations: number;
    internal_inspections: number;
    incident_records: number;
    section_counters: number;
  };
  error?: string;
}> {
  return (async () => {
    const norm = normalizeSnapshotData(snapshotData);
    if (!norm.isValid) {
      return { success: false, error: norm.error };
    }

    if (!supabase) {
      return { success: false, error: DEFAULT_BACKUP_ERROR };
    }

    try {
      // 1. Create a mandatory Cloud Safety Backup of current live data before restoring
      const safetyRes = await createCloudBackup('safety', 'نسخة أمان أوتوماتيكية قبل الاستعادة من ملف حاسوب محلي');
      if (!safetyRes.success || !safetyRes.backup?.id) {
        return {
          success: false,
          error: `فشل إنشاء نسخة الأمان السحابية الإلزامية قبل الاستعادة: ${safetyRes.error || 'لم يتم استرجاع معرّف النسخة بنجاح'}. تم إيقاف عملية الاستعادة لحماية البيانات.`
        };
      }
      const safetyBackupId = safetyRes.backup.id;

      const tables = norm.tables;

      // 2. Clear existing operational tables in strict FK dependency order
      const { error: delMaintErr } = await supabase.from('maintenance_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delMaintErr) throw new Error(`فشل تفريغ جدول طلبات الصيانة: ${delMaintErr.message}`);

      const { error: delInspErr } = await supabase.from('internal_inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delInspErr) throw new Error(`فشل تفريغ جدول التفتيش: ${delInspErr.message}`);

      const { error: delIncErr } = await supabase.from('incident_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delIncErr) throw new Error(`فشل تفريغ جدول الحوادث: ${delIncErr.message}`);

      const { error: delStErr } = await supabase.from('stations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delStErr) throw new Error(`فشل تفريغ جدول المحطات: ${delStErr.message}`);

      // 3. Restore stations (upsert)
      if (tables.stations && tables.stations.length > 0) {
        const { error: stErr } = await supabase.from('stations').upsert(tables.stations);
        if (stErr) throw new Error(`فشل إدراج المحطات: ${stErr.message}`);
      }

      // 4. Restore section_counters (upsert)
      if (tables.section_counters && tables.section_counters.length > 0) {
        const { error: scErr } = await supabase.from('section_counters').upsert(tables.section_counters);
        if (scErr) throw new Error(`فشل إدراج عدادات الأقسام: ${scErr.message}`);
      }

      // 5. Restore maintenance_requests (batch insert, preserved request_type & maintenance_type)
      if (tables.maintenance_requests && tables.maintenance_requests.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < tables.maintenance_requests.length; i += BATCH_SIZE) {
          const chunk = tables.maintenance_requests.slice(i, i + BATCH_SIZE);
          const { error: mErr } = await supabase.from('maintenance_requests').insert(chunk);
          if (mErr) throw new Error(`فشل إدراج دفعة طلبات الصيانة (${i}-${i + chunk.length}): ${mErr.message}`);
        }
      }

      // 6. Restore internal_inspections (batch insert)
      if (tables.internal_inspections && tables.internal_inspections.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < tables.internal_inspections.length; i += BATCH_SIZE) {
          const chunk = tables.internal_inspections.slice(i, i + BATCH_SIZE);
          const { error: iErr } = await supabase.from('internal_inspections').insert(chunk);
          if (iErr) throw new Error(`فشل إدراج دفعة التفتيش: ${iErr.message}`);
        }
      }

      // 7. Restore incident_records (batch insert)
      if (tables.incident_records && tables.incident_records.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < tables.incident_records.length; i += BATCH_SIZE) {
          const chunk = tables.incident_records.slice(i, i + BATCH_SIZE);
          const { error: icErr } = await supabase.from('incident_records').insert(chunk);
          if (icErr) throw new Error(`فشل إدراج دفعة الحوادث: ${icErr.message}`);
        }
      }

      // 8. VERIFY RESTORED ROW COUNTS
      const [maintRes, inspRes, incRes, stRes, scRes] = await Promise.all([
        supabase.from('maintenance_requests').select('id', { count: 'exact', head: true }),
        supabase.from('internal_inspections').select('id', { count: 'exact', head: true }),
        supabase.from('incident_records').select('id', { count: 'exact', head: true }),
        supabase.from('stations').select('id', { count: 'exact', head: true }),
        supabase.from('section_counters').select('section_name', { count: 'exact', head: true })
      ]);

      if (maintRes.error || maintRes.count === null || maintRes.count === undefined) {
        throw new Error(`فشل الاستعلام عن عدد طلبات الصيانة أثناء التحقق من الاستعادة: ${maintRes.error?.message || 'استجابة غير صالحة'}`);
      }
      if (inspRes.error || inspRes.count === null || inspRes.count === undefined) {
        throw new Error(`فشل الاستعلام عن عدد سجلات التفتيش أثناء التحقق من الاستعادة: ${inspRes.error?.message || 'استجابة غير صالحة'}`);
      }
      if (incRes.error || incRes.count === null || incRes.count === undefined) {
        throw new Error(`فشل الاستعلام عن عدد بلاغات الحوادث أثناء التحقق من الاستعادة: ${incRes.error?.message || 'استجابة غير صالحة'}`);
      }
      if (stRes.error || stRes.count === null || stRes.count === undefined) {
        throw new Error(`فشل الاستعلام عن عدد المحطات أثناء التحقق من الاستعادة: ${stRes.error?.message || 'استجابة غير صالحة'}`);
      }
      if (scRes.error || scRes.count === null || scRes.count === undefined) {
        throw new Error(`فشل الاستعلام عن عدد عدادات الأقسام أثناء التحقق من الاستعادة: ${scRes.error?.message || 'استجابة غير صالحة'}`);
      }

      const actualMaint = maintRes.count;
      const actualInsp = inspRes.count;
      const actualInc = incRes.count;
      const actualSt = stRes.count;
      const actualSc = scRes.count;

      const expectedMaint = tables.maintenance_requests.length;
      const expectedInsp = tables.internal_inspections.length;
      const expectedInc = tables.incident_records.length;
      const expectedSt = tables.stations.length;
      const expectedSc = tables.section_counters.length;

      if (actualMaint !== expectedMaint) {
        throw new Error(`تعذر التحقق من اكتمال استعادة طلبات الصيانة: تم إدراج ${actualMaint} من أصل ${expectedMaint} سجل.`);
      }
      if (actualInsp !== expectedInsp) {
        throw new Error(`تعذر التحقق من اكتمال استعادة سجلات التفتيش: تم إدراج ${actualInsp} من أصل ${expectedInsp} سجل.`);
      }
      if (actualInc !== expectedInc) {
        throw new Error(`تعذر التحقق من اكتمال استعادة بلاغات الحوادث: تم إدراج ${actualInc} من أصل ${expectedInc} سجل.`);
      }
      if (actualSt < expectedSt) {
        throw new Error(`تعذر التحقق من اكتمال استعادة المحطات: تم إدراج ${actualSt} من أصل ${expectedSt} محطة.`);
      }
      if (actualSc !== expectedSc) {
        throw new Error(`تعذر التحقق من اكتمال استعادة عدادات الأقسام: تم إدراج ${actualSc} من أصل ${expectedSc} سجل.`);
      }

      // 9. Renumber cloud records directly
      await migrateAndRenumberCloudRecordsDirectly();

      return {
        success: true,
        message: 'تمت استعادة قاعدة البيانات السحابية من ملف الحاسوب بنجاح والتحقق من مطابقة كافة أعداد السجلات.',
        safetyBackupId,
        verifiedCounts: {
          maintenance_requests: actualMaint,
          stations: actualSt,
          internal_inspections: actualInsp,
          incident_records: actualInc,
          section_counters: actualSc
        }
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      return {
        success: false,
        error: sanitizeBackupError(errorMsg, 'restoreFromLocalBackupSnapshot')
      };
    }
  })();
}

/**
 * Lists all cloud backups stored in Supabase
 */
export async function listCloudBackups(): Promise<{ success: boolean; backups?: CloudBackupItem[]; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة السحابية غير متوفرة.' };

  try {
    const { data, error } = await supabase
      .from('cloud_backups')
      .select('id, filename, backup_type, status, size_bytes, created_by, created_by_name, record_counts, notes, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        return { success: false, error: 'عفواً، هذه القائمة مقتصرة على مدراء النظام المفعّلين.' };
      }
      return { success: false, error: sanitizeBackupError(error.message, 'listCloudBackups') };
    }

    const backups: CloudBackupItem[] = (data || []).map((b: any) => ({
      id: b.id,
      filename: b.filename,
      backup_type: b.backup_type || 'manual',
      status: b.status || 'successful',
      size_bytes: b.size_bytes || 0,
      created_by: b.created_by,
      created_by_name: b.created_by_name || 'مدير النظام',
      record_counts: b.record_counts || {},
      notes: b.notes,
      created_at: b.created_at
    }));

    return { success: true, backups };
  } catch (err: any) {
    return { success: false, error: sanitizeBackupError(err?.message, 'listCloudBackups') };
  }
}

/**
 * Fetches single cloud backup with full snapshot data
 */
export async function getCloudBackup(id: string): Promise<{ success: boolean; backup?: CloudBackupItem; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة السحابية غير متوفرة.' };

  try {
    const { data, error } = await supabase
      .from('cloud_backups')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return { success: false, error: sanitizeBackupError(error.message, 'getCloudBackup') };
    }

    return {
      success: true,
      backup: {
        id: data.id,
        filename: data.filename,
        backup_type: data.backup_type,
        status: data.status,
        size_bytes: data.size_bytes,
        created_by: data.created_by || undefined,
        created_by_name: data.created_by_name,
        record_counts: (data.record_counts as any) || {},
        notes: data.notes || undefined,
        created_at: data.created_at,
        snapshot_data: data.snapshot_data
      }
    };
  } catch (err: any) {
    return { success: false, error: sanitizeBackupError(err?.message, 'getCloudBackup') };
  }
}

/**
 * Deletes a single cloud backup entry from cloud_backups table
 */
export async function deleteCloudBackup(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة السحابية غير متوفرة.' };

  try {
    const { error } = await supabase
      .from('cloud_backups')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        return { success: false, error: 'عفواً، خيار حذف النسخ مقتصر على مدراء النظام المفعّلين.' };
      }
      return { success: false, error: sanitizeBackupError(error.message, 'deleteCloudBackup') };
    }

    return { success: true, message: 'تم حذف النسخة الاحتياطية السحابية بنجاح.' };
  } catch (err: any) {
    return { success: false, error: sanitizeBackupError(err?.message, 'deleteCloudBackup') };
  }
}

/**
 * Executes a verified Cloud Safety Backup
 */
export async function executeCloudSafetyBackup(reason = 'نسخة أمان أوتوماتيكية'): Promise<{
  success: boolean;
  safetyBackupId?: string;
  error?: string;
}> {
  const res = await createCloudBackup('safety', reason);
  if (res.success && res.backup?.id) {
    return {
      success: true,
      safetyBackupId: res.backup.id
    };
  }
  return {
    success: false,
    error: res.error || 'فشل تخليد نسخة الأمان السحابية.'
  };
}

/**
 * Checks and creates automatic cloud backup if needed
 */
export async function checkAndRunAutomaticCloudBackup(): Promise<{ success: boolean; backup?: CloudBackupItem; error?: string }> {
  return createCloudBackup('automatic', 'نسخة أوتوماتيكية دورية');
}
