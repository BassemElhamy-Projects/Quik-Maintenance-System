import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  AppData,
  MaintenanceRequest,
  InternalInspection,
  IncidentRecord,
  Station,
  StationStatus,
  MaintenanceStatus,
  InspectionEvaluation
} from '../types';
import { OFFICIAL_STATIONS } from '../data/officialStations';

/**
 * Validates whether a string is a standard RFC 4122 UUID
 */
export function isValidUUID(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Normalizes Eastern Arabic numerals (٠-٩) to standard ASCII digits (0-9)
 */
function normalizeDigits(str: string): string {
  return str.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
}

/**
 * Validates and clamps a year, month, day triplet to a strictly valid Gregorian calendar date.
 * Strictly clamps day to the actual number of days in that month (e.g. 2026-02-30 -> 2026-02-28).
 * Prevents PostgreSQL "date/time field value out of range" exceptions.
 */
export function buildValidCalendarDate(
  rawYear: number | string,
  rawMonth: number | string,
  rawDay: number | string
): string | null {
  const y = parseInt(String(rawYear), 10);
  let m = parseInt(String(rawMonth), 10);
  let d = parseInt(String(rawDay), 10);

  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  if (y < 1970 || y > 2100) return null;

  // If month is > 12 but day is <= 12, swap them (handles inverted DD/MM vs MM/DD)
  if (m > 12 && d <= 12) {
    const temp = m;
    m = d;
    d = temp;
  }

  m = Math.min(Math.max(1, m), 12);
  const maxDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  d = Math.min(Math.max(1, d), maxDays);

  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Ensures any date value sent to PostgreSQL DATE column is strictly in valid YYYY-MM-DD format.
 * Strictly guarantees that calendar day/month bounds are respected (e.g. 2026-02-30 -> 2026-02-28).
 * Prevents "invalid input syntax for type date" and "date/time field value out of range" exceptions.
 */
export function toValidIsoDate(val: any, fallback: string = new Date().toISOString().slice(0, 10)): string {
  if (!val) return fallback;

  // Handle JavaScript Date instance directly
  if (val instanceof Date) {
    if (!isNaN(val.getTime()) && val.getFullYear() >= 1970 && val.getFullYear() <= 2100) {
      const valid = buildValidCalendarDate(val.getFullYear(), val.getMonth() + 1, val.getDate());
      if (valid) return valid;
    }
    return fallback;
  }

  let str = String(val).trim();
  if (!str) return fallback;

  // Convert Eastern Arabic numerals
  str = normalizeDigits(str);

  // If contains Arabic letters, it is definitely not a date
  if (/[\u0600-\u06FF]/.test(str)) {
    return fallback;
  }

  // Handle numeric Excel date serial (e.g. 45210)
  if (typeof val === 'number' || (!isNaN(Number(val)) && !str.includes('-') && !str.includes('/') && !str.includes('.'))) {
    const num = Number(val);
    if (num > 30000 && num < 60000) {
      const parsedDate = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().slice(0, 10);
      }
    }
  }

  // Format 1: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const valid = buildValidCalendarDate(ymdMatch[1], ymdMatch[2], ymdMatch[3]);
    if (valid) return valid;
  }

  // Format 2: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const valid = buildValidCalendarDate(dmyMatch[3], dmyMatch[2], dmyMatch[1]);
    if (valid) return valid;
  }

  // Format 3: General Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1970 && d.getFullYear() <= 2100) {
    const valid = buildValidCalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (valid) return valid;
  }

  return fallback;
}

export function toOptionalValidIsoDate(val: any): string | null {
  if (!val) return null;
  let str = String(val).trim();
  if (!str) return null;
  if (/[\u0600-\u06FF]/.test(str)) return null;
  const res = toValidIsoDate(str, '');
  return res ? res : null;
}

/**
 * Helper to safely extract authenticated user ID for audit created_by fields
 */
async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Ensures stations list always includes the 10 official founding stations if missing in DB
 */
export function mergeOfficialStations(dbStations: Station[]): Station[] {
  if (!dbStations) return [];
  return dbStations;
}

/**
 * Direct, atomic client-side cloud database renumbering procedure.
 * Updates all records directly in Supabase tables (`maintenance_requests`, `internal_inspections`, `incident_records`)
 * starting from 1 for each section (Pumps: 1..N, Tanks: 1..M, Facilities: 1..K, Inspections: 1..InsN, Incidents: 1..IncN).
 * Updates `section_counters` with exact section counts.
 */
export async function migrateAndRenumberCloudRecordsDirectly(): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const [maintRes, insRes, incRes] = await Promise.all([
      supabase.from('maintenance_requests').select('*'),
      supabase.from('internal_inspections').select('*'),
      supabase.from('incident_records').select('*')
    ]);

    if (maintRes.error) throw new Error(maintRes.error.message);
    if (insRes.error) throw new Error(insRes.error.message);
    if (incRes.error) throw new Error(incRes.error.message);

    const maintRows = maintRes.data || [];
    const insRows = insRes.data || [];
    const incRows = incRes.data || [];

    const sortFn = (a: any, b: any) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const createdA = a.created_at || '';
      const createdB = b.created_at || '';
      if (createdA !== createdB) return createdA.localeCompare(createdB);
      return (a.id || '').localeCompare(b.id || '');
    };

    const client = supabase;
    if (!client) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

    const batchUpdate = async <T>(items: T[], fn: (item: T, idx: number) => Promise<any>) => {
      const BATCH_SIZE = 25;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        await Promise.all(chunk.map((item, idx) => fn(item, i + idx)));
      }
    };

    const sections = ['pumps', 'tanks', 'facilities'];
    const sectionCounts: Record<string, number> = { pumps: 0, tanks: 0, facilities: 0, inspections: 0, incidents: 0 };

    // A. Maintenance Requests per section
    for (const sec of sections) {
      const secRows = maintRows.filter(r => (r.section || 'pumps') === sec).sort(sortFn);
      sectionCounts[sec] = secRows.length;

      // Pass 1: Assign temporary request numbers
      await batchUpdate(secRows, async (r) => {
        if (r.request_number && !r.request_number.startsWith('TEMP_')) {
          await client.from('maintenance_requests').update({ request_number: `TEMP_${r.id}` }).eq('id', r.id);
        }
      });

      // Pass 2: Assign clean sequential numbers 1..N
      await batchUpdate(secRows, async (r, idx) => {
        await client.from('maintenance_requests').update({ request_number: (idx + 1).toString() }).eq('id', r.id);
      });
    }

    // B. Internal Inspections
    const sortedIns = [...insRows].sort(sortFn);
    sectionCounts['inspections'] = sortedIns.length;

    await batchUpdate(sortedIns, async (iRow) => {
      if (iRow.inspection_number && !iRow.inspection_number.startsWith('TEMP_')) {
        await client.from('internal_inspections').update({ inspection_number: `TEMP_${iRow.id}` }).eq('id', iRow.id);
      }
    });
    await batchUpdate(sortedIns, async (iRow, idx) => {
      await client.from('internal_inspections').update({ inspection_number: (idx + 1).toString() }).eq('id', iRow.id);
    });

    // C. Incident Records
    const sortedInc = [...incRows].sort(sortFn);
    sectionCounts['incidents'] = sortedInc.length;

    await batchUpdate(sortedInc, async (incRow) => {
      if (incRow.incident_number && !incRow.incident_number.startsWith('TEMP_')) {
        await client.from('incident_records').update({ incident_number: `TEMP_${incRow.id}` }).eq('id', incRow.id);
      }
    });
    await batchUpdate(sortedInc, async (incRow, idx) => {
      await client.from('incident_records').update({ incident_number: (idx + 1).toString() }).eq('id', incRow.id);
    });

    // D. Synchronize section_counters table in Supabase
    const counterUpserts = Object.entries(sectionCounts).map(([section_name, last_number]) => ({
      section_name,
      last_number,
      updated_at: new Date().toISOString()
    }));

    await client.from('section_counters').upsert(counterUpserts);

    return { success: true };
  } catch (err: any) {
    console.error('[DIRECT CLOUD MIGRATION ERROR]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Triggers full cloud database renumbering procedure sequentially 1..N per section via RPC or Direct Fallback
 */
export async function renumberAllCloudRecords(): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };
  try {
    const { error } = await supabase.rpc('renumber_all_section_requests', {});
    if (error) {
      const directRes = await migrateAndRenumberCloudRecordsDirectly();
      if (!directRes.success) {
        return { success: false, error: directRes.error || error.message };
      }
      return { success: true };
    }
    return { success: true };
  } catch (err: any) {
    const directRes = await migrateAndRenumberCloudRecordsDirectly();
    if (!directRes.success) {
      return { success: false, error: directRes.error || err?.message || String(err) };
    }
    return { success: true };
  }
}

/**
 * Fetches the next concurrency-safe atomic sequence number from PostgreSQL section_counters via RPC
 */
export async function getNextAtomicSequence(section: string): Promise<string> {
  if (!supabase) {
    throw new Error('الخدمة غير متاحة حاليًا.');
  }

  const { data, error } = await supabase.rpc('get_next_section_sequence', {
    p_section: section
  });

  if (error) {
    console.error(`[ATOMIC SEQUENCE ERROR] Failed to fetch sequence for section '${section}':`, error.message);
    throw new Error(`فشل توليد الرقم التسلسلي للقسم (${section}). يرجى المحاولة مرة أخرى.`);
  }

  if (!data) {
    throw new Error(`تعذر الحصول على رقم تسلسلي للقسم (${section}).`);
  }

  return String(data);
}

/**
 * High-performance batch sequence allocation function.
 * Uses get_next_section_sequence_batch RPC for single-roundtrip allocation if available,
 * or bounded parallel requests as a fallback.
 */
export async function getBatchAtomicSequences(section: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  if (!supabase) {
    throw new Error('الخدمة غير متاحة حاليًا.');
  }

  // 1. Try single atomic RPC call for entire count
  try {
    const { data, error } = await (supabase.rpc as any)('get_next_section_sequence_batch', {
      p_section: section,
      p_count: count
    });

    if (!error && data) {
      let startSeq: number | null = null;
      let endSeq: number | null = null;

      if (Array.isArray(data) && data.length > 0) {
        startSeq = Number(data[0].start_seq);
        endSeq = Number(data[0].end_seq);
      } else if (typeof data === 'object' && data !== null) {
        startSeq = Number((data as any).start_seq);
        endSeq = Number((data as any).end_seq);
      }

      if (startSeq !== null && endSeq !== null && !isNaN(startSeq) && !isNaN(endSeq) && endSeq >= startSeq) {
        const result: string[] = [];
        for (let num = startSeq; num <= endSeq; num++) {
          result.push(String(num));
        }
        if (result.length === count) {
          return result;
        }
      }
    }
  } catch (err) {
    console.warn('[BATCH RPC WARN] Falling back to bounded parallel sequence allocation:', err);
  }

  // 2. Fallback: Bounded parallel requests (max 15 concurrent)
  const results: string[] = new Array(count);
  const BATCH_CONCURRENCY = 15;

  for (let i = 0; i < count; i += BATCH_CONCURRENCY) {
    const end = Math.min(i + BATCH_CONCURRENCY, count);
    const promises: Promise<{ idx: number; seq: string }>[] = [];

    for (let j = i; j < end; j++) {
      promises.push(
        getNextAtomicSequence(section).then(seq => ({ idx: j, seq }))
      );
    }

    const chunkResults = await Promise.all(promises);
    for (const item of chunkResults) {
      results[item.idx] = item.seq;
    }
  }

  return results;
}

export function sanitizeCloudFieldValue(val: string | null | undefined, fieldType: 'requester' | 'tech' | 'mType' | 'rType'): string {
  if (!val) {
    if (fieldType === 'requester') return 'غير مدون';
    if (fieldType === 'mType') return 'صيانة عامة';
    if (fieldType === 'rType') return 'طلب صيانة';
    return '';
  }
  const trimmed = String(val).trim();
  const lower = trimmed.toLowerCase();

  const isBanner =
    trimmed.length > 100 ||
    lower.includes('شركة كويك') ||
    lower.includes('سجل الصيانة') ||
    lower.includes('جدول اعطال') ||
    lower.includes('تقرير صيانة') ||
    lower.includes('بيان اعطال');

  if (isBanner) {
    if (fieldType === 'requester') return 'غير مدون';
    if (fieldType === 'tech') return '';
    if (fieldType === 'mType') return 'صيانة عامة';
    if (fieldType === 'rType') return 'طلب صيانة';
  }

  return trimmed;
}

/**
 * Fetches the single source of truth application data directly from Supabase Cloud
 */
export async function fetchAuthoritativeCloudData(): Promise<{
  success: boolean;
  data?: AppData;
  error?: string;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      success: false,
      error: 'إعدادات الاتصال بالخدمة غير مكتملة بعد.'
    };
  }

  try {
    const [stationsRes, requestsRes, inspectionsRes, incidentsRes] = await Promise.all([
      supabase.from('stations').select('*').order('created_at', { ascending: true }),
      supabase.from('maintenance_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('internal_inspections').select('*').order('created_at', { ascending: false }),
      supabase.from('incident_records').select('*').order('created_at', { ascending: false })
    ]);

    if (stationsRes.error) {
      console.error('[LOAD STATIONS ERROR]:', stationsRes.error.message);
      return { success: false, error: 'تعذر تحميل دليل المحطات. يرجى المحاولة مرة أخرى.' };
    }
    if (requestsRes.error) {
      console.error('[LOAD REQUESTS ERROR]:', requestsRes.error.message);
      return { success: false, error: 'تعذر تحميل طلبات الصيانة. يرجى المحاولة مرة أخرى.' };
    }
    if (inspectionsRes.error) {
      console.error('[LOAD INSPECTIONS ERROR]:', inspectionsRes.error.message);
      return { success: false, error: 'تعذر تحميل تقارير التفتيش. يرجى المحاولة مرة أخرى.' };
    }
    if (incidentsRes.error) {
      console.error('[LOAD INCIDENTS ERROR]:', incidentsRes.error.message);
      return { success: false, error: 'تعذر تحميل بلاغات الحوادث. يرجى المحاولة مرة أخرى.' };
    }

    // Map Stations
    const rawStations: Station[] = (stationsRes.data || []).map((s: any) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      region: s.region,
      city: s.city || '',
      address: s.address || '',
      status: (s.status as StationStatus) || 'نشطة',
      phone: s.phone || '',
      supervisor: s.supervisor || '',
      notes: s.notes || '',
      isDefault: Boolean(s.is_default),
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));

    const stationsList = mergeOfficialStations(rawStations);

    // Map Maintenance Requests with automatic field sanitization & repair
    const dirtyRecordsToFix: { id: string; requester: string; maintenance_type: string; request_type: string; technician: string }[] = [];

    const requestsList: MaintenanceRequest[] = (requestsRes.data || []).map((r: any) => {
      const cleanRequester = sanitizeCloudFieldValue(r.requester, 'requester');
      const cleanRequestType = sanitizeCloudFieldValue(r.request_type, 'rType');
      const cleanMType = sanitizeCloudFieldValue(r.maintenance_type, 'mType');
      const cleanTech = sanitizeCloudFieldValue(r.technician, 'tech');

      if (
        cleanRequester !== (r.requester || '') ||
        cleanRequestType !== (r.request_type || '') ||
        cleanMType !== (r.maintenance_type || '') ||
        cleanTech !== (r.technician || '')
      ) {
        dirtyRecordsToFix.push({
          id: r.id,
          requester: cleanRequester,
          request_type: cleanRequestType,
          maintenance_type: cleanMType,
          technician: cleanTech
        });
      }

      return {
        id: r.id,
        requestNumber: r.request_number,
        section: r.section,
        date: r.date,
        stationId: r.station_id || '',
        stationName: r.station_name,
        stationCode: r.station_code,
        requester: cleanRequester,
        requestType: cleanRequestType,
        maintenanceType: cleanMType,
        problemDescription: r.problem_description || '',
        closingDate: r.closing_date || undefined,
        technician: cleanTech,
        actionTaken: r.action_taken || '',
        completionNotes: r.completion_notes || '',
        status: r.status as MaintenanceStatus,
        isStationUnmatched: Boolean(r.is_station_unmatched),
        originalStationValue: r.original_station_value || '',
        unmatchedReason: r.unmatched_reason || '',
        sourceSheet: r.source_sheet || undefined,
        sourceRow: r.source_row || undefined,
        createdAt: r.created_at || new Date().toISOString()
      };
    });

    // Asynchronously repair dirty records in Supabase
    if (dirtyRecordsToFix.length > 0 && supabase) {
      Promise.all(
        dirtyRecordsToFix.map(fix =>
          supabase!
            .from('maintenance_requests')
            .update({
              requester: fix.requester,
              request_type: fix.request_type,
              maintenance_type: fix.maintenance_type,
              technician: fix.technician
            })
            .eq('id', fix.id)
        )
      ).catch(err => console.error('[DATA REPAIR EXCEPTION]:', err));
    }

    // Map Internal Inspections
    const inspectionsList: InternalInspection[] = (inspectionsRes.data || []).map((i: any) => ({
      id: i.id,
      inspectionNumber: i.inspection_number,
      date: i.date,
      stationId: i.station_id || '',
      stationName: i.station_name,
      stationCode: i.station_code,
      inspectionType: i.inspection_type || '',
      inspectorName: i.inspector_name || '',
      evaluation: i.evaluation as InspectionEvaluation,
      notes: i.notes || '',
      isStationUnmatched: Boolean(i.is_station_unmatched),
      originalStationValue: i.original_station_value || '',
      unmatchedReason: i.unmatched_reason || '',
      sourceSheet: i.source_sheet || undefined,
      sourceRow: i.source_row || undefined,
      createdAt: i.created_at || new Date().toISOString()
    }));

    // Map Incident Records
    const incidentsList: IncidentRecord[] = (incidentsRes.data || []).map((inc: any) => ({
      id: inc.id,
      incidentNumber: inc.incident_number,
      region: inc.region || '',
      stationCode: inc.station_code,
      stationName: inc.station_name,
      stationId: inc.station_id || '',
      date: inc.date,
      time: inc.time || '',
      incidentType: inc.incident_type || '',
      causingParty: inc.causing_party || '',
      vehicleType: inc.vehicle_type || undefined,
      generalInfo: inc.general_info || '',
      description: inc.description || '',
      preventionSuggestions: inc.prevention_suggestions || '',
      responsiblePartyReport: inc.responsible_party_report || undefined,
      notes: inc.notes || undefined,
      reporterNameAndSignature: inc.reporter_name_and_signature || undefined,
      isStationUnmatched: Boolean(inc.is_station_unmatched),
      originalStationValue: inc.original_station_value || '',
      unmatchedReason: inc.unmatched_reason || '',
      sourceSheet: inc.source_sheet || undefined,
      sourceRow: inc.source_row || undefined,
      createdAt: inc.created_at || new Date().toISOString()
    }));

    return {
      success: true,
      data: {
        stations: stationsList,
        maintenanceRequests: requestsList,
        inspections: inspectionsList,
        incidents: incidentsList
      }
    };
  } catch (err: any) {
    console.error('[CLOUD FETCH ERROR] Exception during cloud data load:', err);
    return {
      success: false,
      error: 'حدث خطأ أثناء تحميل البيانات. يرجى التحقق من الاتصال بالخادم والمحاولة مرة أخرى.'
    };
  }
}

// ---------------------------------------------------------------------------
// MAINTENANCE REQUESTS CLOUD MUTATIONS
// ---------------------------------------------------------------------------

export async function createCloudMaintenanceRequest(
  req: MaintenanceRequest
): Promise<{ success: boolean; data?: MaintenanceRequest; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const atomicNum = await getNextAtomicSequence(req.section);
    const currentUserId = await getCurrentUserId();

    const insertPayload: any = {
      request_number: atomicNum,
      section: req.section,
      date: toValidIsoDate(req.date),
      station_id: isValidUUID(req.stationId) ? req.stationId : null,
      station_name: req.stationName,
      station_code: req.stationCode,
      requester: sanitizeCloudFieldValue(req.requester, 'requester'),
      request_type: sanitizeCloudFieldValue(req.requestType, 'rType'),
      maintenance_type: sanitizeCloudFieldValue(req.maintenanceType, 'mType'),
      problem_description: req.problemDescription,
      closing_date: toOptionalValidIsoDate(req.closingDate),
      technician: sanitizeCloudFieldValue(req.technician, 'tech') || null,
      action_taken: req.actionTaken || null,
      completion_notes: req.completionNotes || null,
      status: req.status || 'جديد',
      is_station_unmatched: Boolean(req.isStationUnmatched),
      original_station_value: req.originalStationValue || null,
      unmatched_reason: req.unmatchedReason || null,
      source_sheet: req.sourceSheet || null,
      source_row: req.sourceRow || null,
      created_by: currentUserId
    };

    if (isValidUUID(req.id)) {
      insertPayload.id = req.id;
    }

    const { data, error } = await supabase
      .from('maintenance_requests')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[CREATE MAINTENANCE ERROR]:', error.message);
      return { success: false, error: 'فشل حفظ طلب الصيانة.' };
    }

    const created: MaintenanceRequest = {
      id: data.id,
      requestNumber: data.request_number,
      section: data.section as any,
      date: data.date,
      stationId: data.station_id || '',
      stationName: data.station_name,
      stationCode: data.station_code,
      requester: data.requester,
      requestType: data.request_type,
      maintenanceType: data.maintenance_type,
      problemDescription: data.problem_description,
      closingDate: data.closing_date || undefined,
      technician: data.technician || '',
      actionTaken: data.action_taken || '',
      completionNotes: data.completion_notes || '',
      status: data.status as MaintenanceStatus,
      isStationUnmatched: Boolean(data.is_station_unmatched),
      originalStationValue: data.original_station_value || '',
      unmatchedReason: data.unmatched_reason || '',
      sourceSheet: data.source_sheet || undefined,
      sourceRow: data.source_row || undefined,
      createdAt: data.created_at
    };

    return { success: true, data: created };
  } catch (err: any) {
    console.error('[CREATE MAINTENANCE EXCEPTION]:', err);
    return { success: false, error: 'تعذر إضافة طلب الصيانة.' };
  }
}

export async function updateCloudMaintenanceRequest(
  req: MaintenanceRequest
): Promise<{ success: boolean; data?: MaintenanceRequest; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const updatePayload: any = {
      date: toValidIsoDate(req.date),
      station_id: isValidUUID(req.stationId) ? req.stationId : null,
      station_name: req.stationName,
      station_code: req.stationCode,
      requester: sanitizeCloudFieldValue(req.requester, 'requester'),
      request_type: sanitizeCloudFieldValue(req.requestType, 'rType'),
      maintenance_type: sanitizeCloudFieldValue(req.maintenanceType, 'mType'),
      problem_description: req.problemDescription,
      closing_date: toOptionalValidIsoDate(req.closingDate),
      technician: sanitizeCloudFieldValue(req.technician, 'tech') || null,
      action_taken: req.actionTaken || null,
      completion_notes: req.completionNotes || null,
      status: req.status,
      is_station_unmatched: Boolean(req.isStationUnmatched),
      original_station_value: req.originalStationValue || null,
      unmatched_reason: req.unmatchedReason || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('maintenance_requests')
      .update(updatePayload)
      .eq('id', req.id)
      .select()
      .single();

    if (error) {
      console.error('[UPDATE MAINTENANCE ERROR]:', error.message);
      return { success: false, error: 'فشل تعديل طلب الصيانة.' };
    }

    const updated: MaintenanceRequest = {
      id: data.id,
      requestNumber: data.request_number,
      section: data.section as any,
      date: data.date,
      stationId: data.station_id || '',
      stationName: data.station_name,
      stationCode: data.station_code,
      requester: data.requester,
      requestType: data.request_type,
      maintenanceType: data.maintenance_type,
      problemDescription: data.problem_description,
      closingDate: data.closing_date || undefined,
      technician: data.technician || '',
      actionTaken: data.action_taken || '',
      completionNotes: data.completion_notes || '',
      status: data.status as MaintenanceStatus,
      isStationUnmatched: Boolean(data.is_station_unmatched),
      originalStationValue: data.original_station_value || '',
      unmatchedReason: data.unmatched_reason || '',
      sourceSheet: data.source_sheet || undefined,
      sourceRow: data.source_row || undefined,
      createdAt: data.created_at
    };

    return { success: true, data: updated };
  } catch (err: any) {
    console.error('[UPDATE MAINTENANCE EXCEPTION]:', err);
    return { success: false, error: 'تعذر تعديل طلب الصيانة.' };
  }
}

export async function deleteCloudMaintenanceRequest(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const { error } = await supabase
      .from('maintenance_requests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE MAINTENANCE ERROR]:', error.message);
      return { success: false, error: 'فشل حذف طلب الصيانة.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[DELETE MAINTENANCE EXCEPTION]:', err);
    return { success: false, error: 'تعذر حذف طلب الصيانة.' };
  }
}

export async function deleteMultipleCloudMaintenanceRequests(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };
  if (!ids.length) return { success: true };

  try {
    const { error } = await supabase
      .from('maintenance_requests')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('[BULK DELETE MAINTENANCE ERROR]:', error.message);
      return { success: false, error: 'فشل حذف طلبات الصيانة المحددة.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[BULK DELETE MAINTENANCE EXCEPTION]:', err);
    return { success: false, error: 'تعذر حذف الطلبات المحددة.' };
  }
}

// ---------------------------------------------------------------------------
// INTERNAL INSPECTIONS CLOUD MUTATIONS
// ---------------------------------------------------------------------------

export async function createCloudInspection(
  ins: InternalInspection
): Promise<{ success: boolean; data?: InternalInspection; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const atomicNum = await getNextAtomicSequence('inspections');
    const currentUserId = await getCurrentUserId();

    const insertPayload: any = {
      inspection_number: atomicNum,
      date: toValidIsoDate(ins.date),
      station_id: isValidUUID(ins.stationId) ? ins.stationId : null,
      station_name: ins.stationName,
      station_code: ins.stationCode,
      inspection_type: ins.inspectionType,
      inspector_name: ins.inspectorName,
      evaluation: ins.evaluation || 'جيد',
      notes: ins.notes || null,
      is_station_unmatched: Boolean(ins.isStationUnmatched),
      original_station_value: ins.originalStationValue || null,
      unmatched_reason: ins.unmatchedReason || null,
      source_sheet: ins.sourceSheet || null,
      source_row: ins.sourceRow || null,
      created_by: currentUserId
    };

    if (isValidUUID(ins.id)) {
      insertPayload.id = ins.id;
    }

    const { data, error } = await supabase
      .from('internal_inspections')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[CREATE INSPECTION ERROR]:', error.message);
      return { success: false, error: 'فشل حفظ تقرير التفتيش.' };
    }

    const created: InternalInspection = {
      id: data.id,
      inspectionNumber: data.inspection_number,
      date: data.date,
      stationId: data.station_id || '',
      stationName: data.station_name,
      stationCode: data.station_code,
      inspectionType: data.inspection_type,
      inspectorName: data.inspector_name,
      evaluation: data.evaluation as InspectionEvaluation,
      notes: data.notes || '',
      isStationUnmatched: Boolean(data.is_station_unmatched),
      originalStationValue: data.original_station_value || '',
      unmatchedReason: data.unmatched_reason || '',
      sourceSheet: data.source_sheet || undefined,
      sourceRow: data.source_row || undefined,
      createdAt: data.created_at
    };

    return { success: true, data: created };
  } catch (err: any) {
    console.error('[CREATE INSPECTION EXCEPTION]:', err);
    return { success: false, error: 'تعذر إضافة تقرير التفتيش.' };
  }
}

export async function updateCloudInspection(
  ins: InternalInspection
): Promise<{ success: boolean; data?: InternalInspection; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const updatePayload: any = {
      date: toValidIsoDate(ins.date),
      station_id: isValidUUID(ins.stationId) ? ins.stationId : null,
      station_name: ins.stationName,
      station_code: ins.stationCode,
      inspection_type: ins.inspectionType,
      inspector_name: ins.inspectorName,
      evaluation: ins.evaluation,
      notes: ins.notes || null,
      is_station_unmatched: Boolean(ins.isStationUnmatched),
      original_station_value: ins.originalStationValue || null,
      unmatched_reason: ins.unmatchedReason || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('internal_inspections')
      .update(updatePayload)
      .eq('id', ins.id)
      .select()
      .single();

    if (error) {
      console.error('[UPDATE INSPECTION ERROR]:', error.message);
      return { success: false, error: 'فشل تعديل تقرير التفتيش.' };
    }

    const updated: InternalInspection = {
      id: data.id,
      inspectionNumber: data.inspection_number,
      date: data.date,
      stationId: data.station_id || '',
      stationName: data.station_name,
      stationCode: data.station_code,
      inspectionType: data.inspection_type,
      inspectorName: data.inspector_name,
      evaluation: data.evaluation as InspectionEvaluation,
      notes: data.notes || '',
      isStationUnmatched: Boolean(data.is_station_unmatched),
      originalStationValue: data.original_station_value || '',
      unmatchedReason: data.unmatched_reason || '',
      sourceSheet: data.source_sheet || undefined,
      sourceRow: data.source_row || undefined,
      createdAt: data.created_at
    };

    return { success: true, data: updated };
  } catch (err: any) {
    console.error('[UPDATE INSPECTION EXCEPTION]:', err);
    return { success: false, error: 'تعذر تعديل تقرير التفتيش.' };
  }
}

export async function deleteCloudInspection(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const { error } = await supabase
      .from('internal_inspections')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE INSPECTION ERROR]:', error.message);
      return { success: false, error: 'فشل حذف تقرير التفتيش.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[DELETE INSPECTION EXCEPTION]:', err);
    return { success: false, error: 'تعذر حذف تقرير التفتيش.' };
  }
}

export async function deleteMultipleCloudInspections(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };
  if (!ids.length) return { success: true };

  try {
    const { error } = await supabase
      .from('internal_inspections')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('[BULK DELETE INSPECTION ERROR]:', error.message);
      return { success: false, error: 'فشل حذف سجلات التفتيش المحددة.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[BULK DELETE INSPECTION EXCEPTION]:', err);
    return { success: false, error: 'تعذر حذف سجلات التفتيش المحددة.' };
  }
}

// ---------------------------------------------------------------------------
// INCIDENT RECORDS CLOUD MUTATIONS
// ---------------------------------------------------------------------------

export async function createCloudIncident(
  inc: IncidentRecord
): Promise<{ success: boolean; data?: IncidentRecord; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const atomicNum = await getNextAtomicSequence('incidents');
    const currentUserId = await getCurrentUserId();

    const insertPayload: any = {
      incident_number: atomicNum,
      region: inc.region,
      station_id: isValidUUID(inc.stationId) ? inc.stationId : null,
      station_name: inc.stationName,
      station_code: inc.stationCode,
      date: toValidIsoDate(inc.date),
      time: inc.time || '12:00',
      incident_type: inc.incidentType,
      causing_party: inc.causingParty,
      vehicle_type: inc.vehicleType || null,
      general_info: inc.generalInfo || null,
      description: inc.description,
      prevention_suggestions: inc.preventionSuggestions || null,
      responsible_party_report: inc.responsiblePartyReport || null,
      notes: inc.notes || null,
      reporter_name_and_signature: inc.reporterNameAndSignature || null,
      is_station_unmatched: Boolean(inc.isStationUnmatched),
      original_station_value: inc.originalStationValue || null,
      unmatched_reason: inc.unmatchedReason || null,
      source_sheet: inc.sourceSheet || null,
      source_row: inc.sourceRow || null,
      created_by: currentUserId
    };

    if (isValidUUID(inc.id)) {
      insertPayload.id = inc.id;
    }

    const { data, error } = await supabase
      .from('incident_records')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[CREATE INCIDENT ERROR]:', error.message);
      return { success: false, error: 'فشل حفظ بلاغ الحادث.' };
    }

    const created: IncidentRecord = {
      id: data.id,
      incidentNumber: data.incident_number,
      region: data.region,
      stationCode: data.station_code,
      stationName: data.station_name,
      stationId: data.station_id || '',
      date: data.date,
      time: data.time || '',
      incidentType: data.incident_type,
      causingParty: data.causing_party,
      vehicleType: data.vehicle_type || undefined,
      generalInfo: data.general_info || '',
      description: data.description,
      preventionSuggestions: data.prevention_suggestions || '',
      responsiblePartyReport: data.responsible_party_report || undefined,
      notes: data.notes || undefined,
      reporterNameAndSignature: data.reporter_name_and_signature || undefined,
      isStationUnmatched: Boolean(data.is_station_unmatched),
      originalStationValue: data.original_station_value || '',
      unmatchedReason: data.unmatched_reason || '',
      sourceSheet: data.source_sheet || undefined,
      sourceRow: data.source_row || undefined,
      createdAt: data.created_at
    };

    return { success: true, data: created };
  } catch (err: any) {
    console.error('[CREATE INCIDENT EXCEPTION]:', err);
    return { success: false, error: 'تعذر إضافة بلاغ الحادث.' };
  }
}

export async function updateCloudIncident(
  inc: IncidentRecord
): Promise<{ success: boolean; data?: IncidentRecord; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const updatePayload: any = {
      region: inc.region,
      station_id: isValidUUID(inc.stationId) ? inc.stationId : null,
      station_name: inc.stationName,
      station_code: inc.stationCode,
      date: toValidIsoDate(inc.date),
      time: inc.time || '12:00',
      incident_type: inc.incidentType,
      causing_party: inc.causingParty,
      vehicle_type: inc.vehicleType || null,
      general_info: inc.generalInfo || null,
      description: inc.description,
      prevention_suggestions: inc.preventionSuggestions || null,
      responsible_party_report: inc.responsiblePartyReport || null,
      notes: inc.notes || null,
      reporter_name_and_signature: inc.reporterNameAndSignature || null,
      is_station_unmatched: Boolean(inc.isStationUnmatched),
      original_station_value: inc.originalStationValue || null,
      unmatched_reason: inc.unmatchedReason || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('incident_records')
      .update(updatePayload)
      .eq('id', inc.id)
      .select()
      .single();

    if (error) {
      console.error('[UPDATE INCIDENT ERROR]:', error.message);
      return { success: false, error: 'فشل تعديل بلاغ الحادث.' };
    }

    const updated: IncidentRecord = {
      id: data.id,
      incidentNumber: data.incident_number,
      region: data.region,
      stationCode: data.station_code,
      stationName: data.station_name,
      stationId: data.station_id || '',
      date: data.date,
      time: data.time || '',
      incidentType: data.incident_type,
      causingParty: data.causing_party,
      vehicleType: data.vehicle_type || undefined,
      generalInfo: data.general_info || '',
      description: data.description,
      preventionSuggestions: data.prevention_suggestions || '',
      responsiblePartyReport: data.responsible_party_report || undefined,
      notes: data.notes || undefined,
      reporterNameAndSignature: data.reporter_name_and_signature || undefined,
      isStationUnmatched: Boolean(data.is_station_unmatched),
      originalStationValue: data.original_station_value || '',
      unmatchedReason: data.unmatched_reason || '',
      sourceSheet: data.source_sheet || undefined,
      sourceRow: data.source_row || undefined,
      createdAt: data.created_at
    };

    return { success: true, data: updated };
  } catch (err: any) {
    console.error('[UPDATE INCIDENT EXCEPTION]:', err);
    return { success: false, error: 'تعذر تعديل بلاغ الحادث.' };
  }
}

export async function deleteCloudIncident(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const { error } = await supabase
      .from('incident_records')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE INCIDENT ERROR]:', error.message);
      return { success: false, error: 'فشل حذف بلاغ الحادث.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[DELETE INCIDENT EXCEPTION]:', err);
    return { success: false, error: 'تعذر حذف بلاغ الحادث.' };
  }
}

export async function deleteMultipleCloudIncidents(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };
  if (!ids.length) return { success: true };

  try {
    const { error } = await supabase
      .from('incident_records')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('[BULK DELETE INCIDENT ERROR]:', error.message);
      return { success: false, error: 'فشل حذف بلاغات الحوادث المحددة.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[BULK DELETE INCIDENT EXCEPTION]:', err);
    return { success: false, error: 'تعذر حذف بلاغات الحوادث المحددة.' };
  }
}

// ---------------------------------------------------------------------------
// STATIONS CLOUD MUTATIONS
// ---------------------------------------------------------------------------

export async function saveCloudStation(
  st: Station
): Promise<{ success: boolean; data?: Station; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const payload: any = {
      code: st.code.trim(),
      name: st.name.trim(),
      region: st.region.trim(),
      city: st.city?.trim() || null,
      address: st.address?.trim() || null,
      status: st.status || 'نشطة',
      phone: st.phone?.trim() || null,
      supervisor: st.supervisor?.trim() || null,
      notes: st.notes?.trim() || null,
      is_default: Boolean(st.isDefault),
      updated_at: new Date().toISOString()
    };

    if (isValidUUID(st.id)) {
      const { data, error } = await supabase
        .from('stations')
        .update(payload)
        .eq('id', st.id)
        .select()
        .single();

      if (error) {
        console.error('[UPDATE STATION ERROR]:', error.message);
        return { success: false, error: 'فشل تعديل بيانات المحطة.' };
      }

      return {
        success: true,
        data: {
          id: data.id,
          code: data.code,
          name: data.name,
          region: data.region,
          city: data.city || '',
          address: data.address || '',
          status: data.status as StationStatus,
          phone: data.phone || '',
          supervisor: data.supervisor || '',
          notes: data.notes || '',
          isDefault: Boolean(data.is_default),
          createdAt: data.created_at,
          updatedAt: data.updated_at
        }
      };
    } else {
      const { data, error } = await supabase
        .from('stations')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[INSERT STATION ERROR]:', error.message);
        return { success: false, error: 'فشل إضافة المحطة.' };
      }

      return {
        success: true,
        data: {
          id: data.id,
          code: data.code,
          name: data.name,
          region: data.region,
          city: data.city || '',
          address: data.address || '',
          status: data.status as StationStatus,
          phone: data.phone || '',
          supervisor: data.supervisor || '',
          notes: data.notes || '',
          isDefault: Boolean(data.is_default),
          createdAt: data.created_at,
          updatedAt: data.updated_at
        }
      };
    }
  } catch (err: any) {
    console.error('[SAVE STATION EXCEPTION]:', err);
    return { success: false, error: 'تعذر حفظ بيانات المحطة.' };
  }
}

export async function deleteCloudStation(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    const { error } = await supabase
      .from('stations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE STATION ERROR]:', error.message);
      return { success: false, error: 'فشل حذف المحطة.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[DELETE STATION EXCEPTION]:', err);
    return { success: false, error: 'تعذر حذف المحطة.' };
  }
}

export async function toggleCloudStationStatus(
  id: string,
  currentStatus: StationStatus
): Promise<{ success: boolean; newStatus?: StationStatus; error?: string }> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  const newStatus: StationStatus = currentStatus === 'نشطة' ? 'غير نشطة' : 'نشطة';

  try {
    const { error } = await supabase
      .from('stations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[TOGGLE STATION STATUS ERROR]:', error.message);
      return { success: false, error: 'فشل تغيير حالة المحطة.' };
    }
    return { success: true, newStatus };
  } catch (err: any) {
    console.error('[TOGGLE STATION STATUS EXCEPTION]:', err);
    return { success: false, error: 'تعذر تغيير حالة المحطة.' };
  }
}

// ---------------------------------------------------------------------------
// EXCEL IMPORT CLOUD PERSISTENCE
// ---------------------------------------------------------------------------

export async function importExcelRecordsToCloud(
  reqs: MaintenanceRequest[],
  ins: InternalInspection[],
  incs: IncidentRecord[],
  onProgress?: (progress: { current: number; total: number; message: string }) => void
): Promise<{ success: boolean; importedCount: number; error?: string }> {
  if (!supabase) return { success: false, importedCount: 0, error: 'الخدمة غير متاحة حاليًا.' };

  let totalImported = 0;
  const grandTotal = reqs.length + ins.length + incs.length;

  try {
    const currentUserId = await getCurrentUserId();

    // 1. Process and Insert Maintenance Requests
    if (reqs.length > 0) {
      onProgress?.({
        current: totalImported,
        total: grandTotal,
        message: `جاري تخصيص الأرقام التسلسلية لـ ${reqs.length} طلب صيانة...`
      });

      // Group requests by section to fetch atomic batch sequences per section
      const secGroups = new Map<string, MaintenanceRequest[]>();
      for (const r of reqs) {
        const rawSec = r.section || (r as any).section;
        const sec = (rawSec && ['pumps', 'tanks', 'facilities'].includes(rawSec)) ? rawSec : 'facilities';
        if (!secGroups.has(sec)) secGroups.set(sec, []);
        secGroups.get(sec)!.push(r);
      }

      const payloads: any[] = [];

      for (const [sec, items] of secGroups.entries()) {
        const seqs = await getBatchAtomicSequences(sec, items.length);
        for (let idx = 0; idx < items.length; idx++) {
          const r = items[idx];
          payloads.push({
            request_number: seqs[idx] || (idx + 1).toString(),
            section: sec,
            date: toValidIsoDate(r.date),
            station_id: isValidUUID(r.stationId || (r as any).station_id) ? (r.stationId || (r as any).station_id) : null,
            station_name: r.stationName || (r as any).station_name || 'محطة غير محددة',
            station_code: r.stationCode ?? (r as any).station_code ?? 0,
            requester: sanitizeCloudFieldValue(r.requester || (r as any).requester, 'requester'),
            request_type: sanitizeCloudFieldValue(r.requestType || (r as any).request_type, 'rType'),
            maintenance_type: sanitizeCloudFieldValue(r.maintenanceType || (r as any).maintenance_type, 'mType'),
            problem_description: r.problemDescription || (r as any).problem_description || '',
            closing_date: toOptionalValidIsoDate(r.closingDate || (r as any).closing_date),
            technician: sanitizeCloudFieldValue(r.technician || (r as any).technician, 'tech') || null,
            action_taken: r.actionTaken || (r as any).action_taken || null,
            completion_notes: r.completionNotes || (r as any).completion_notes || null,
            status: r.status || 'جديد',
            is_station_unmatched: Boolean(r.isStationUnmatched || (r as any).is_station_unmatched),
            original_station_value: r.originalStationValue || (r as any).original_station_value || null,
            unmatched_reason: r.unmatchedReason || (r as any).unmatched_reason || null,
            source_sheet: r.sourceSheet || (r as any).source_sheet || null,
            source_row: r.sourceRow || (r as any).source_row || null,
            created_by: currentUserId
          });
        }
      }

      // Insert in chunks of 100 with progress reporting
      const CHUNK_SIZE = 100;
      for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('maintenance_requests').insert(chunk);
        if (error) {
          console.error('[IMPORT MAINT CHUNK ERROR]:', error.message);
          throw new Error('فشل استيراد دفعة طلبات الصيانة.');
        }
        totalImported += chunk.length;
        onProgress?.({
          current: totalImported,
          total: grandTotal,
          message: `جاري استيراد ${totalImported} من ${grandTotal} سجل...`
        });
      }
    }

    // 2. Process and Insert Internal Inspections
    if (ins.length > 0) {
      onProgress?.({
        current: totalImported,
        total: grandTotal,
        message: `جاري تخصيص أرقام التفتيش لـ ${ins.length} تقرير...`
      });

      const seqs = await getBatchAtomicSequences('inspections', ins.length);
      const payloads: any[] = [];

      for (let idx = 0; idx < ins.length; idx++) {
        const i = ins[idx];
        payloads.push({
          inspection_number: seqs[idx] || (idx + 1).toString(),
          date: toValidIsoDate(i.date),
          station_id: isValidUUID(i.stationId || (i as any).station_id) ? (i.stationId || (i as any).station_id) : null,
          station_name: i.stationName || (i as any).station_name || 'محطة غير محددة',
          station_code: i.stationCode ?? (i as any).station_code ?? 0,
          inspection_type: i.inspectionType || (i as any).inspection_type || 'تفتيش دوري',
          inspector_name: i.inspectorName || (i as any).inspector_name || 'مفتش كويك',
          evaluation: i.evaluation || 'جيد',
          notes: i.notes || null,
          is_station_unmatched: Boolean(i.isStationUnmatched || (i as any).is_station_unmatched),
          original_station_value: i.originalStationValue || (i as any).original_station_value || null,
          unmatched_reason: i.unmatchedReason || (i as any).unmatched_reason || null,
          source_sheet: i.sourceSheet || (i as any).source_sheet || null,
          source_row: i.sourceRow || (i as any).source_row || null,
          created_by: currentUserId
        });
      }

      const CHUNK_SIZE = 100;
      for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('internal_inspections').insert(chunk);
        if (error) {
          console.error('[IMPORT INSP CHUNK ERROR]:', error.message);
          throw new Error('فشل استيراد دفعة التفتيش الدوري.');
        }
        totalImported += chunk.length;
        onProgress?.({
          current: totalImported,
          total: grandTotal,
          message: `جاري استيراد ${totalImported} من ${grandTotal} سجل...`
        });
      }
    }

    // 3. Process and Insert Incident Records
    if (incs.length > 0) {
      onProgress?.({
        current: totalImported,
        total: grandTotal,
        message: `جاري تخصيص أرقام الحوادث لـ ${incs.length} بلاغ...`
      });

      const seqs = await getBatchAtomicSequences('incidents', incs.length);
      const payloads: any[] = [];

      for (let idx = 0; idx < incs.length; idx++) {
        const inc = incs[idx];
        payloads.push({
          incident_number: seqs[idx] || (idx + 1).toString(),
          region: inc.region || 'عسير',
          station_id: isValidUUID(inc.stationId) ? inc.stationId : null,
          station_name: inc.stationName,
          station_code: inc.stationCode,
          date: toValidIsoDate(inc.date),
          time: inc.time || '12:00',
          incident_type: inc.incidentType || 'حادث تشغيلي',
          causing_party: inc.causingParty || '',
          vehicle_type: inc.vehicleType || null,
          general_info: inc.generalInfo || null,
          description: inc.description || '',
          prevention_suggestions: inc.preventionSuggestions || null,
          responsible_party_report: inc.responsiblePartyReport || null,
          notes: inc.notes || null,
          reporter_name_and_signature: inc.reporterNameAndSignature || null,
          is_station_unmatched: Boolean(inc.isStationUnmatched),
          original_station_value: inc.originalStationValue || null,
          unmatched_reason: inc.unmatchedReason || null,
          source_sheet: inc.sourceSheet || null,
          source_row: inc.sourceRow || null,
          created_by: currentUserId
        });
      }

      const CHUNK_SIZE = 100;
      for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('incident_records').insert(chunk);
        if (error) {
          console.error('[IMPORT INC CHUNK ERROR]:', error.message);
          throw new Error('فشل استيراد دفعة بلاغات الحوادث.');
        }
        totalImported += chunk.length;
        onProgress?.({
          current: totalImported,
          total: grandTotal,
          message: `جاري استيراد ${totalImported} من ${grandTotal} سجل...`
        });
      }
    }

    // Run authoritative cloud renumbering after bulk import to guarantee contiguous 1..N numbers per section
    await renumberAllCloudRecords();

    return { success: true, importedCount: totalImported };
  } catch (err: any) {
    console.error('[EXCEL IMPORT ERROR]:', err);
    const hasSafeArabic = typeof err?.message === 'string' && /[\u0600-\u06FF]/.test(err.message) && !/[a-zA-Z]/.test(err.message);
    return {
      success: false,
      importedCount: totalImported,
      error: hasSafeArabic ? err.message : 'حدث خطأ أثناء استيراد البيانات. يرجى المحاولة مرة أخرى.'
    };
  }
}

// ---------------------------------------------------------------------------
// CLEAR ALL RECORDS (CLOUD DELETION)
// ---------------------------------------------------------------------------

/**
 * Clears transaction records from the cloud database (Maintenance Requests, Inspections, Incidents).
 * Does not create a mandatory safety backup before deletion.
 * Preserves the central stations directory and configuration.
 */
export async function clearAllCloudRecords(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!supabase) return { success: false, error: 'الخدمة غير متاحة حاليًا.' };

  try {
    // 1. Delete records in the existing foreign-key dependency order
    // Step A: Delete child transactional tables first
    const [delMaint, delInsp, delInc] = await Promise.all([
      supabase.from('maintenance_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('internal_inspections').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('incident_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    ]);

    if (delMaint.error) {
      console.error('[CLEAR MAINT ERROR]:', delMaint.error.message);
      throw new Error('فشل مسح طلبات الصيانة.');
    }
    if (delInsp.error) {
      console.error('[CLEAR INSP ERROR]:', delInsp.error.message);
      throw new Error('فشل مسح تقارير التفتيش.');
    }
    if (delInc.error) {
      console.error('[CLEAR INC ERROR]:', delInc.error.message);
      throw new Error('فشل مسح بلاغات الحوادث.');
    }

    // Keep the central stations directory intact.

    // 2. Reset section counters to 0
    const counterResets = ['pumps', 'tanks', 'facilities', 'inspections', 'incidents'].map(sec => ({
      section_name: sec,
      last_number: 0,
      updated_at: new Date().toISOString()
    }));
    await supabase.from('section_counters').upsert(counterResets);

    // 3. Verify post-delete zero counts for transactional records
    const [maintCheck, inspCheck, incCheck] = await Promise.all([
      supabase.from('maintenance_requests').select('id', { count: 'exact', head: true }),
      supabase.from('internal_inspections').select('id', { count: 'exact', head: true }),
      supabase.from('incident_records').select('id', { count: 'exact', head: true })
    ]);

    if (maintCheck.error || (maintCheck.count !== null && maintCheck.count > 0)) {
      throw new Error('تعذر التحقق من تفريغ جدول طلبات الصيانة بالكامل.');
    }
    if (inspCheck.error || (inspCheck.count !== null && inspCheck.count > 0)) {
      throw new Error('تعذر التحقق من تفريغ جدول تقارير التفتيش بالكامل.');
    }
    if (incCheck.error || (incCheck.count !== null && incCheck.count > 0)) {
      throw new Error('تعذر التحقق من تفريغ جدول بلاغات الحوادث بالكامل.');
    }
    return { success: true };
  } catch (err: any) {
    console.error('[CLEAR ALL CLOUD ERROR]:', err);
    const hasSafeArabic = typeof err?.message === 'string' && /[\u0600-\u06FF]/.test(err.message) && !/[a-zA-Z]/.test(err.message);
    return {
      success: false,
      error: hasSafeArabic ? err.message : 'تعذر استكمال مسح السجلات.'
    };
  }
}

// ---------------------------------------------------------------------------
// REALTIME SUBSCRIPTION
// ---------------------------------------------------------------------------

/**
 * Subscribes to Realtime changes across all core tables
 * Invokes onDataChange callback when another client creates/updates/deletes a record
 */
export function subscribeToCloudChanges(onDataChange: () => void): () => void {
  if (!supabase) {
    return () => {};
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const triggerDebouncedChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      onDataChange();
      debounceTimer = null;
    }, 350);
  };

  const channelName = `quik_app_realtime_${Math.random().toString(36).substr(2, 6)}`;
  const channel = supabase.channel(channelName);

  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_requests' }, () => {
      triggerDebouncedChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_inspections' }, () => {
      triggerDebouncedChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_records' }, () => {
      triggerDebouncedChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, () => {
      triggerDebouncedChange();
    })
    .subscribe();

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    channel.unsubscribe();
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}
