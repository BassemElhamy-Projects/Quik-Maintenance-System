import ExcelJS from 'exceljs';
import { AppData, MaintenanceRequest, InternalInspection, IncidentRecord, Station } from '../types';
import { OFFICIAL_STATIONS } from '../data/officialStations';
import {
  getHighestRequestNumberForSection,
  getHighestInspectionNumber,
  getHighestIncidentNumber
} from '../utils/requestSequencer';

/**
 * Excel Column Header Mappings in Arabic for Exporting
 */
const HEADERS_MAINTENANCE = [
  'رقم طلب الصيانة',
  'تاريخ الطلب',
  'المحطة',
  'رقم المحطة',
  'رافع الطلب',
  'نوع الطلب',
  'نوع الصيانة',
  'شرح المشكلة',
  'تاريخ إغلاق الصيانة',
  'الفني',
  'الإجراء',
  'الإنجاز',
  'حالة الطلب'
];

const HEADERS_INSPECTION = [
  'رقم التفتيش',
  'تاريخ التفتيش',
  'المحطة',
  'رقم المحطة',
  'نوع التفتيش',
  'اسم المفتش',
  'التقييم',
  'الملاحظات والتوصيات'
];

const HEADERS_INCIDENT = [
  'رقم البلاغ',
  'المنطقة',
  'رقم المحطة',
  'اسم المحطة',
  'التاريخ',
  'وقت الحادث',
  'نوع الحادث',
  'اسم المتسبب بالحادث',
  'نوع السيارات',
  'المعلومات',
  'وصف الحادث',
  'مقترحات لتجنب هذا النوع من الحوادث بالمستقبل',
  'تقرير الجهة المسؤولة',
  'ملاحظات',
  'معد التقرير والتوقيع'
];

const HEADERS_STATIONS = [
  'رقم المحطة',
  'اسم المحطة',
  'المنطقة',
  'المدينة',
  'العنوان',
  'الهاتف'
];

function formatMaintenanceRows(requests: MaintenanceRequest[]) {
  return requests.map(r => ({
    'رقم طلب الصيانة': r.requestNumber,
    'تاريخ الطلب': r.date,
    'المحطة': r.stationName,
    'رقم المحطة': r.stationCode,
    'رافع الطلب': r.requester,
    'نوع الطلب': r.requestType,
    'نوع الصيانة': r.maintenanceType,
    'شرح المشكلة': r.problemDescription,
    'تاريخ إغلاق الصيانة': r.closingDate || '',
    'الفني': r.technician || '',
    'الإجراء': r.actionTaken || '',
    'الإنجاز': r.completionNotes || '',
    'حالة الطلب': r.status
  }));
}

function formatInspectionRows(inspections: InternalInspection[]) {
  return inspections.map(i => ({
    'رقم التفتيش': i.inspectionNumber,
    'تاريخ التفتيش': i.date,
    'المحطة': i.stationName,
    'رقم المحطة': i.stationCode,
    'نوع التفتيش': i.inspectionType,
    'اسم المفتش': i.inspectorName,
    'التقييم': i.evaluation,
    'الملاحظات والتوصيات': i.notes
  }));
}

function formatIncidentRows(incidents: IncidentRecord[]) {
  return incidents.map(inc => ({
    'رقم البلاغ': inc.incidentNumber,
    'المنطقة': inc.region,
    'رقم المحطة': inc.stationCode,
    'اسم المحطة': inc.stationName,
    'التاريخ': inc.date,
    'وقت الحادث': inc.time,
    'نوع الحادث': inc.incidentType,
    'اسم المتسبب بالحادث': inc.causingParty,
    'نوع السيارات': inc.vehicleType || '',
    'المعلومات': inc.generalInfo || '',
    'وصف الحادث': inc.description,
    'مقترحات لتجنب هذا النوع من الحوادث بالمستقبل': inc.preventionSuggestions || '',
    'تقرير الجهة المسؤولة': inc.responsiblePartyReport || '',
    'ملاحظات': inc.notes || '',
    'معد التقرير والتوقيع': inc.reporterNameAndSignature || ''
  }));
}

function formatStationRows(stations: Station[]) {
  return stations.map(s => ({
    'رقم المحطة': s.code,
    'اسم المحطة': s.name,
    'المنطقة': s.region,
    'المدينة': s.city || '',
    'العنوان': s.address || '',
    'الهاتف': s.phone || ''
  }));
}

function getCellStringValue(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return '';
  if (cell.value instanceof Date) {
    const d = cell.value;
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  }
  if (typeof cell.value === 'object') {
    if ('richText' in cell.value && Array.isArray((cell.value as any).richText)) {
      return (cell.value as any).richText.map((t: any) => t.text || '').join('');
    }
    if ('result' in cell.value) {
      const res = (cell.value as any).result;
      if (res instanceof Date) {
        const year = res.getFullYear();
        const month = String(res.getMonth() + 1).padStart(2, '0');
        const day = String(res.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      return res !== null && res !== undefined ? String(res) : '';
    }
    if ('text' in cell.value && typeof (cell.value as any).text === 'string') {
      return (cell.value as any).text;
    }
  }
  if (cell.text !== undefined && cell.text !== null) {
    return String(cell.text);
  }
  return String(cell.value);
}

function addSheetWithRows(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  rows: Record<string, any>[]
): void {
  const ws = workbook.addWorksheet(sheetName);
  ws.columns = headers.map(h => ({
    header: h,
    key: h,
    width: Math.max(h.length * 2, 15)
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, name: 'Arial', size: 11 };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const r of rows) {
    ws.addRow(r);
  }
}

async function saveWorkbookAsFile(workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

export async function exportSectionToExcel(
  section: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents',
  data: AppData
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const dateStr = new Date().toISOString().slice(0, 10);
  let fileName = '';

  if (section === 'pumps' || section === 'tanks' || section === 'facilities') {
    const list = data.maintenanceRequests.filter(r => r.section === section);
    let sheetName = 'طلبات الصيانة';
    if (section === 'pumps') { sheetName = 'صيانة المضخات'; fileName = `quick_fuel_pumps_${dateStr}.xlsx`; }
    else if (section === 'tanks') { sheetName = 'صيانة الخزانات'; fileName = `quick_fuel_tanks_${dateStr}.xlsx`; }
    else { sheetName = 'صيانة المرافق'; fileName = `quick_fuel_facilities_${dateStr}.xlsx`; }

    addSheetWithRows(wb, sheetName, HEADERS_MAINTENANCE, formatMaintenanceRows(list));
  } else if (section === 'inspections') {
    fileName = `quick_fuel_inspections_${dateStr}.xlsx`;
    addSheetWithRows(wb, 'التفتيش الدوري', HEADERS_INSPECTION, formatInspectionRows(data.inspections));
  } else if (section === 'incidents') {
    fileName = `quick_fuel_incidents_${dateStr}.xlsx`;
    addSheetWithRows(wb, 'سجل الحوادث', HEADERS_INCIDENT, formatIncidentRows(data.incidents));
  }

  await saveWorkbookAsFile(wb, fileName);
}

export async function exportAllDataToExcel(data: AppData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const dateStr = new Date().toISOString().slice(0, 10);

  const pumps = data.maintenanceRequests.filter(r => r.section === 'pumps');
  addSheetWithRows(wb, 'المضخات', HEADERS_MAINTENANCE, formatMaintenanceRows(pumps));

  const tanks = data.maintenanceRequests.filter(r => r.section === 'tanks');
  addSheetWithRows(wb, 'الخزانات', HEADERS_MAINTENANCE, formatMaintenanceRows(tanks));

  const facilities = data.maintenanceRequests.filter(r => r.section === 'facilities');
  addSheetWithRows(wb, 'المدخل والمخرج والمرافق', HEADERS_MAINTENANCE, formatMaintenanceRows(facilities));

  addSheetWithRows(wb, 'التفتيش الدوري', HEADERS_INSPECTION, formatInspectionRows(data.inspections));

  addSheetWithRows(wb, 'الحوادث', HEADERS_INCIDENT, formatIncidentRows(data.incidents));

  addSheetWithRows(wb, 'المحطات', HEADERS_STATIONS, formatStationRows(data.stations));

  await saveWorkbookAsFile(wb, `quick_fuel_full_database_${dateStr}.xlsx`);
}

export interface TableDiagnosticInfo {
  tableIndex: number;
  headerRow: number;
  startRow: number;
  endRow: number;
  recordsExtracted: number;
}

// Diagnostic Info Per Worksheet for Import Preview
export interface SheetDiagnostic {
  fileName: string;
  sheetName: string;
  detectedSection: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'unknown';
  detectedSectionLabel: string;
  headerRowIndex: number;
  detectedHeaders: string[];
  totalRowsProcessed: number;
  validRowsCount: number;
  invalidRowsCount: number;
  duplicateRowsCount: number;
  needingAttentionRowsCount: number;
  unmatchedStationNames: string[];
  statusMessage: string;
  tableBreakdowns?: TableDiagnosticInfo[];
}

export interface ExcelImportPreviewResult {
  fileName: string;
  targetType: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'all';
  sheetNamesFound: string[];
  diagnostics: SheetDiagnostic[];
  validMaintenanceRows: MaintenanceRequest[];
  validInspectionRows: InternalInspection[];
  validIncidentRows: IncidentRecord[];
  invalidRows: { rowNumber: number; sheetName: string; reason: string }[];
  unmatchedStationsCount: number;
  duplicateCount: number;           // total unique duplicate records
  duplicatesAlreadyInApp: number;   // duplicates matching database
  duplicatesInExcel: number;        // duplicates repeated within Excel batch
}

/**
 * Normalizes string for Arabic spacing, hamzas, and diacritics
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u00A0\u200B-\u200F\uFEFF]/g, ' ') // Non-breaking & zero-width spaces
    .replace(/[\u064B-\u065F\u0670]/g, '')        // Arabic Tashkeel / Diacritics
    .replace(/\u0640/g, '')                        // Arabic Tatweel (ـ)
    .replace(/[أإآآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\w\u0600-\u06FF\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isMaintenanceDuplicate(
  req: { requestNumber?: string; date?: string; problemDescription?: string; stationName?: string; section?: string; id?: string },
  existingList: MaintenanceRequest[]
): boolean {
  const normProblem = req.problemDescription ? normalizeText(req.problemDescription) : '';
  const reqNo = req.requestNumber ? req.requestNumber.trim() : '';
  const isPureSeq = /^\d{1,4}$/.test(reqNo);

  return existingList.some(r => {
    // Avoid self-comparison
    if (req.id && r.id && req.id === r.id) {
      return false;
    }
    // Formal unique request number match (e.g. REQ-2024-001)
    if (!isPureSeq && reqNo && r.requestNumber && r.requestNumber.trim() === reqNo) {
      return true;
    }
    // Semantic duplicate: same section + same date + same station + same problem description
    if (
      (!req.section || !r.section || req.section === r.section) &&
      req.date && r.date === req.date &&
      req.stationName && r.stationName === req.stationName &&
      normProblem && r.problemDescription &&
      normalizeText(r.problemDescription) === normProblem
    ) {
      return true;
    }
    return false;
  });
}

export function isInspectionDuplicate(
  ins: { inspectionNumber?: string; date?: string; stationName?: string; inspectorName?: string },
  existingList: InternalInspection[]
): boolean {
  const normInspector = ins.inspectorName ? normalizeText(ins.inspectorName) : '';
  const insNo = ins.inspectionNumber ? ins.inspectionNumber.trim() : '';

  return existingList.some(i => {
    if (insNo && i.inspectionNumber && i.inspectionNumber.trim() === insNo) {
      return true;
    }
    if (
      ins.date && i.date === ins.date &&
      ins.stationName && i.stationName === ins.stationName &&
      normInspector && i.inspectorName &&
      normalizeText(i.inspectorName) === normInspector
    ) {
      return true;
    }
    return false;
  });
}

export function isIncidentDuplicate(
  inc: { incidentNumber?: string; date?: string; stationName?: string; causingParty?: string },
  existingList: IncidentRecord[]
): boolean {
  const normParty = inc.causingParty ? normalizeText(inc.causingParty) : '';
  const incNo = inc.incidentNumber ? inc.incidentNumber.trim() : '';

  return existingList.some(i => {
    if (incNo && i.incidentNumber && i.incidentNumber.trim() === incNo) {
      return true;
    }
    if (
      inc.date && i.date === inc.date &&
      inc.stationName && i.stationName === inc.stationName &&
      normParty && i.causingParty &&
      normalizeText(i.causingParty) === normParty
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Parses Excel Date value (numeric serial or formatted string)
 * Preserves exact date string where provided.
/**
 * Normalizes Eastern Arabic numerals (٠-٩) to standard ASCII digits (0-9)
 */
function normalizeDigits(str: string): string {
  return str.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
}

function buildValidCalendarDate(
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

function parseExcelDate(val: any): string {
  if (val === undefined || val === null || val === '') {
    return '';
  }

  // Handle JavaScript Date instance directly
  if (val instanceof Date) {
    if (!isNaN(val.getTime()) && val.getFullYear() >= 1970 && val.getFullYear() <= 2100) {
      const valid = buildValidCalendarDate(val.getFullYear(), val.getMonth() + 1, val.getDate());
      if (valid) return valid;
    }
    return '';
  }

  // Handle numeric Excel date serial (e.g. 45210)
  if (typeof val === 'number' || (!isNaN(Number(val)) && !String(val).includes('-') && !String(val).includes('/') && !String(val).includes('.'))) {
    const num = Number(val);
    if (num > 30000 && num < 60000) {
      const parsedDate = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().slice(0, 10);
      }
    }
  }

  let str = String(val).trim();
  if (!str) return '';

  // Reject text containing Arabic characters or words immediately
  if (/[\u0600-\u06FF]/.test(str)) {
    return '';
  }

  str = normalizeDigits(str);

  // Standard YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const valid = buildValidCalendarDate(ymdMatch[1], ymdMatch[2], ymdMatch[3]);
    if (valid) return valid;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const valid = buildValidCalendarDate(dmyMatch[3], dmyMatch[2], dmyMatch[1]);
    if (valid) return valid;
  }

  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() >= 1970 && dateObj.getFullYear() <= 2100) {
    const valid = buildValidCalendarDate(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
    if (valid) return valid;
  }

  return '';
}

/**
 * Flexible field value lookup across row object keys
 */
function findValue(row: Record<string, any>, possibleKeys: string[], excludeKeys: string[] = []): string {
  const normExcludes = excludeKeys.map(k => normalizeText(k)).filter(Boolean);
  const normRowKeys = Object.keys(row).map(k => ({
    original: k,
    normalized: normalizeText(k)
  }));

  // Pass 1: Exact key matches
  for (const pKey of possibleKeys) {
    const pNorm = normalizeText(pKey);
    const matched = normRowKeys.find(k => {
      if (normExcludes.some(ex => k.normalized === ex)) {
        return false;
      }
      return k.normalized === pNorm;
    });
    if (matched && row[matched.original] !== undefined && row[matched.original] !== null) {
      const valStr = String(row[matched.original]).trim();
      if (valStr !== '') return valStr;
    }
  }

  // Pass 2: Substring key matches with strict negative exclusions
  for (const pKey of possibleKeys) {
    const pNorm = normalizeText(pKey);
    if (pNorm.length < 3) continue;
    const matched = normRowKeys.find(k => {
      if (normExcludes.some(ex => k.normalized === ex || (ex.length >= 3 && k.normalized.includes(ex)))) {
        return false;
      }
      return (
        (k.normalized.length >= 3 && pNorm.includes(k.normalized)) ||
        (pNorm.length >= 3 && k.normalized.includes(pNorm))
      );
    });
    if (matched && row[matched.original] !== undefined && row[matched.original] !== null) {
      const valStr = String(row[matched.original]).trim();
      if (valStr !== '') return valStr;
    }
  }
  return '';
}

interface HeaderColumnIndices {
  reqNo: number;
  reqDate: number;
  stationName: number;
  stationCode: number;
  requester: number;
  requestType: number;
  rType: number;
  mType: number;
  problemDesc: number;
  closingDate: number;
  tech: number;
  action: number;
  notes: number;
  status: number;

  insNo: number;
  insDate: number;
  inspector: number;
  eval: number;
  insType: number;

  incNo: number;
  incDate: number;
  incTime: number;
  incType: number;
  region: number;
  causingParty: number;
  vehicleType: number;
}

function sanitizeFieldValue(val: string, fieldType: 'requester' | 'tech' | 'mType' | 'rType'): string {
  if (!val) {
    if (fieldType === 'requester') return 'غير مدون';
    if (fieldType === 'mType') return 'صيانة عامة';
    if (fieldType === 'rType') return 'طلب صيانة';
    return '';
  }
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  
  // Detect corporate banners or long title text incorrectly extracted into short fields
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

function findHeaderIndex(
  normCells: string[],
  keywords: string[],
  excludeIndices: number | number[] = -1,
  negativeKeywords: string[] = []
): number {
  const excludes = Array.isArray(excludeIndices) ? excludeIndices : [excludeIndices];
  const normNegatives = negativeKeywords.map(k => normalizeText(k)).filter(Boolean);

  // Pass 1: Exact matches - strictly check if normalized cell equals normalized keyword
  for (const kw of keywords) {
    const kwNorm = normalizeText(kw);
    const idx = normCells.findIndex((c, i) => {
      if (excludes.includes(i)) return false;
      if (!c || c.length > 60 || c.includes('شركة كويك') || c.includes('سجل الصيانة')) return false;
      if (normNegatives.some(neg => c === neg)) return false;
      return c === kwNorm;
    });
    if (idx !== -1) return idx;
  }
  // Pass 2: Substring match (strict, excluding other column concepts)
  for (const kw of keywords) {
    const kwNorm = normalizeText(kw);
    if (kwNorm.length < 3) continue;
    const idx = normCells.findIndex((c, i) => {
      if (excludes.includes(i)) return false;
      if (!c || c.length > 60 || c.includes('شركة كويك') || c.includes('سجل الصيانة')) return false;
      if (normNegatives.some(neg => c === neg || (neg.length >= 3 && c.includes(neg)))) return false;
      return c.includes(kwNorm);
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

function getHeaderColIndices(headerCells: string[]): HeaderColumnIndices {
  const normCells = headerCells.map(c => normalizeText(c));
  
  // Standard fixed columns to prevent stealing
  const reqNoIdx = findHeaderIndex(normCells, ['رقم طلب الصيانة', 'رقم الطلب', 'رقم طلب', 'رقم البلاغ', 'مسلسل', 'الرقم']);
  const reqDateIdx = findHeaderIndex(normCells, ['تاريخ الطلب', 'تاريخ العطل', 'تاريخ البلاغ', 'تاريخ الإغلاق', 'تاريخ الاغلاق', 'التاريخ', 'تاريخ']);
  const stationNameIdx = findHeaderIndex(normCells, ['اسم المحطة', 'اسم المحطه', 'اسم الفرع', 'الموقع', 'المحطة', 'المحطه', 'الفرع', 'موقع', 'محطة', 'فرع']);
  const requesterIdx = findHeaderIndex(normCells, ['رافع الطلب', 'مقدم الطلب', 'اسم رافع الطلب', 'اسم المشرف', 'اسم الموظف', 'رافع']);
  const closingDateIdx = findHeaderIndex(normCells, ['تاريخ إغلاق الصيانة', 'تاريخ اغلاق الصيانة', 'تاريخ الإغلاق', 'تاريخ الاغلاق', 'تاريخ الإنهاء', 'تاريخ الإنجاز']);
  const techIdx = findHeaderIndex(normCells, ['الفني المسؤول', 'اسم الفني', 'فني الصيانة', 'الشركة المنفذة', 'جهة التنفيذ', 'المقاول', 'الفني']);
  const actionIdx = findHeaderIndex(normCells, ['الإجراء المتخذ', 'الاجراء المتخذ', 'الإجراء', 'الاجراء', 'الإجراءات']);
  const statusIdx = findHeaderIndex(normCells, ['حالة الطلب', 'حالة الصيانة', 'الحالة', 'الموقف']);

  const fixedIndices = [reqNoIdx, reqDateIdx, stationNameIdx, requesterIdx, closingDateIdx, techIdx, actionIdx, statusIdx].filter(i => i !== -1);

  // 1. Identify distinct requestType column (e.g. نوع الطلب / التصنيف / فئة الطلب)
  const rTypeIdx = findHeaderIndex(
    normCells,
    [
      'نوع الطلب', 'نوع طلب', 'نوع طلب الصيانة', 'طلب الصيانة', 'فئة الطلب', 'فئه الطلب', 'التصنيف', 'تصنيف الطلب', 'طبيعة الطلب', 'طبيعه الطلب',
      'نوع البلاغ', 'نوع الاعطال', 'نوع الأعطال', 'نوع العطل',
      'نوع الاعمال', 'نوع الأعمال', 'نوع العمل', 'نوع الخدمة', 'نوع الخدمه', 'الطلب'
    ],
    fixedIndices,
    ['نوع الصيانة', 'نوع الصيانه', 'نوع صيانة', 'الصيانة', 'الصيانه', 'رقم الطلب', 'تاريخ الطلب', 'رافع الطلب', 'حالة الطلب', 'تاريخ اغلاق الصيانة', 'القسم', 'المعدة', 'المعده']
  );

  // 2. Identify distinct maintenanceType column (e.g. نوع الصيانة / تصنيف الصيانة)
  const mTypeIndicesToExclude = [...fixedIndices, ...(rTypeIdx !== -1 ? [rTypeIdx] : [])];
  const mTypeIdx = findHeaderIndex(
    normCells,
    [
      'نوع الصيانة', 'نوع الصيانه', 'نوع صيانة', 'نوع صيانه', 'تصنيف الصيانة', 'تصنيف الصيانه', 'فئة الصيانة', 'فئة الصيانه',
      'طبيعة الصيانة', 'طبيعه الصيانة', 'طبيعة الصيانه', 'طبيعه الصيانه', 'نوع أعمال الصيانة', 'نوع اعمال الصيانه', 'طبيعة العطل', 'طبيعه العطل', 
      'الصيانة', 'الصيانه', 'نوع صيانة الطلب', 'فئة صيانة'
    ],
    mTypeIndicesToExclude,
    ['نوع الطلب', 'نوع طلب', 'طلب الصيانة', 'رقم الطلب', 'تاريخ الطلب', 'رافع الطلب', 'حالة الطلب', 'تاريخ اغلاق الصيانة', 'تاريخ إغلاق الصيانة']
  );

  return {
    reqNo: reqNoIdx,
    reqDate: reqDateIdx,
    stationName: stationNameIdx,
    stationCode: findHeaderIndex(normCells, ['رقم المحطة', 'كود المحطة', 'رمز المحطة', 'رقم الفرع', 'كود الفرع']),
    requester: requesterIdx,
    requestType: rTypeIdx,
    rType: rTypeIdx,
    mType: mTypeIdx,
    problemDesc: findHeaderIndex(normCells, ['شرح المشكلة', 'شرح المشكله', 'وصف المشكلة', 'وصف المشكله', 'تفاصيل المشكلة', 'شرح العطل', 'المشكلة', 'المشكله', 'البيان', 'الوصف', 'الملاحظات']),
    closingDate: closingDateIdx,
    tech: techIdx,
    action: actionIdx,
    notes: findHeaderIndex(normCells, ['تفاصيل الإنجاز', 'ملاحظات الإنجاز', 'الإنجاز', 'الانجاز', 'الملاحظات']),
    status: statusIdx,

    // inspection
    insNo: findHeaderIndex(normCells, ['رقم التفتيش', 'رقم التتقرير', 'رقم الزيارة', 'رقم']),
    insDate: findHeaderIndex(normCells, ['تاريخ التفتيش', 'تاريخ الزيارة', 'التاريخ']),
    inspector: findHeaderIndex(normCells, ['اسم المفتش', 'قام بالتفتيش', 'المفتش', 'المراقب']),
    eval: findHeaderIndex(normCells, ['تقييم المحطة', 'نتيجة التفتيش', 'التقييم', 'التقدير']),
    insType: findHeaderIndex(normCells, ['نوع التفتيش', 'نوع الزيارة']),

    // incident
    incNo: findHeaderIndex(normCells, ['رقم البلاغ', 'رقم الحادث', 'رقم']),
    incDate: findHeaderIndex(normCells, ['تاريخ الحادث', 'التاريخ']),
    incTime: findHeaderIndex(normCells, ['وقت الحادث', 'الوقت']),
    incType: findHeaderIndex(normCells, ['نوع الحادث', 'طبيعة الحادث', 'نوع البلاغ']),
    region: findHeaderIndex(normCells, ['المنطقة', 'المنطقه']),
    causingParty: findHeaderIndex(normCells, ['اسم المتسبب', 'المتسبب']),
    vehicleType: findHeaderIndex(normCells, ['نوع السيارات', 'نوع السيارة', 'السيارة'])
  };
}

/**
 * Inspects sample rows in table to dynamically disambiguate or discover
 * requestType and maintenanceType columns if header detection left them unresolved.
 */
function refineColIndicesUsingSampleRows(
  matrix: string[][],
  startRow: number,
  endRow: number,
  colIndices: HeaderColumnIndices
): HeaderColumnIndices {
  const result = { ...colIndices };
  if (result.rType !== -1 && result.mType !== -1) {
    return result;
  }

  const sampleLimit = Math.min(startRow + 20, endRow);
  const sampleRows = matrix.slice(startRow, sampleLimit);
  if (sampleRows.length === 0) return result;

  const maxCols = Math.max(...sampleRows.map(r => r.length), 0);
  const knownIndices = new Set([
    result.reqNo, result.reqDate, result.stationName, result.stationCode,
    result.requester, result.closingDate, result.tech, result.action,
    result.notes, result.status, result.problemDesc
  ].filter(i => i !== -1));

  // If we're missing rType or mType, let's score candidate columns
  const rTypeCandidates: { col: number; score: number; uniqueCount: number }[] = [];
  const mTypeCandidates: { col: number; score: number; uniqueCount: number }[] = [];

  for (let c = 0; c < maxCols; c++) {
    if (knownIndices.has(c)) continue;

    const colValues = sampleRows.map(r => normalizeText(r[c] || '')).filter(Boolean);
    if (colValues.length === 0) continue;

    const uniqueValues = new Set(colValues);
    const uniqueCount = uniqueValues.size;

    // R-TYPE SCORING
    let rScore = 0;
    if (colValues.some(v => 
      v.includes('مضخ') || v.includes('خزان') || v.includes('مسجد') ||
      v.includes('دورات') || v.includes('مياه') || v.includes('مرافق') ||
      v.includes('ساح') || v.includes('مدخل') || v.includes('مخرج') ||
      v.includes('طلمب') || v.includes('مسدس') || v.includes('شاش') ||
      v.includes('عداد') || v.includes('اناره') || v.includes('سباك')
    )) rScore += 10;
    
    if (colValues.some(v => v.includes('صيانه') || v.includes('تصنيف') || v.includes('فئة') || v.includes('طلب'))) rScore += 5;
    
    // Entropy bonus: more unique values are better for a classification column
    if (uniqueCount > 1) rScore += 15;
    if (uniqueCount > 3) rScore += 10;
    
    // Penalize static columns or columns with very low variety that look like section/equipment descriptors
    const varietyRatio = uniqueCount / colValues.length;
    if (varietyRatio < 0.2 || uniqueCount <= 2) {
      const val = colValues[0];
      if (val.includes('مضخ') || val.includes('خزان') || val.includes('مرافق') || val.includes('ساحة') || val.includes('محطة')) {
        rScore -= 30; // Likely an "Equipment", "Station" or "Section" descriptor column, not the actual request type
      }
    }

    if (rScore > 5) rTypeCandidates.push({ col: c, score: rScore, uniqueCount });

    // M-TYPE SCORING
    let mScore = 0;
    if (colValues.some(v =>
      v.includes('طارئ') || v.includes('طارئه') || v.includes('اصلاح') ||
      v.includes('إصلاح') || v.includes('دوري') || v.includes('دوريه') ||
      v.includes('وقائ') || v.includes('وقائيه') || v.includes('تصحيح') ||
      v.includes('روتين')
    )) mScore += 15;

    if (uniqueCount > 1) mScore += 10;
    if (mScore > 10) mTypeCandidates.push({ col: c, score: mScore, uniqueCount });
  }

  // Assign best candidates
  if (result.rType === -1 && rTypeCandidates.length > 0) {
    rTypeCandidates.sort((a, b) => b.score - a.score || b.uniqueCount - a.uniqueCount);
    result.rType = rTypeCandidates[0].col;
    result.requestType = rTypeCandidates[0].col;
  }

  if (result.mType === -1 && mTypeCandidates.length > 0) {
    // Ensure we don't pick the same column as rType
    const filteredM = mTypeCandidates.filter(c => c.col !== result.rType);
    if (filteredM.length > 0) {
      filteredM.sort((a, b) => b.score - a.score || b.uniqueCount - a.uniqueCount);
      result.mType = filteredM[0].col;
    }
  }

  return result;
}

function extractCellVal(
  strCells: string[],
  colIdx: number,
  rowObj: Record<string, any>,
  possibleKeys: string[],
  excludeKeys: string[] = []
): string {
  if (colIdx !== -1 && colIdx < strCells.length && strCells[colIdx] !== undefined) {
    const val = strCells[colIdx].trim();
    if (val !== '') return val;
  }
  return findValue(rowObj, possibleKeys, excludeKeys);
}

/**
 * Checks if a row array matches a maintenance/inspection/incident header row
 * Uses worksheet-specific matching for facilities to reliably catch all multi-table headers.
 */
function checkRowIsHeader(
  rowCells: string[],
  sheetContext?: 'facilities' | 'pumps' | 'tanks' | 'inspections' | 'incidents' | 'unknown'
): { isHeader: boolean; headerType: 'maintenance' | 'inspection' | 'incident' | 'none'; headers: string[] } {
  const normCells = rowCells.map(c => normalizeText(c));
  const nonEmp = normCells.filter(c => c.length > 0);
  if (nonEmp.length < 2) return { isHeader: false, headerType: 'none', headers: [] };

  const combinedText = normCells.join(' ');
  if (
    combinedText.includes('شركة كويك') ||
    combinedText.includes('جدول اعطال') ||
    combinedText.includes('تقرير صيانة') ||
    normCells.some(c => c.length > 55)
  ) {
    return { isHeader: false, headerType: 'none', headers: [] };
  }

  // If row contains actual date strings (e.g. 2024/05/12) or long text, it's a data row, not a header row
  const hasDateValue = normCells.some(c => /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(c) || /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/.test(c));
  if (hasDateValue) {
    return { isHeader: false, headerType: 'none', headers: [] };
  }

  // Count distinct maintenance column concepts in row
  let hasReqNo = false;
  let hasDate = false;
  let hasLocation = false;
  let hasProblem = false;
  let hasAction = false;
  let hasRequester = false;
  let hasType = false;
  let hasTech = false;
  let hasClosingDate = false;
  let hasNotes = false;
  let hasStatus = false;

  for (const cell of normCells) {
    if (!cell || cell.length > 45) continue;

    if (cell === 'م' || cell === 'م.' || cell === 'مسلسل' || cell.includes('رقم طلب') || cell.includes('رقم الطلب') || cell.includes('رقم البلاغ') || cell === 'رقم' || cell === 'الرقم' || cell.startsWith('رقم')) {
      hasReqNo = true;
    }
    if (cell.includes('تاريخ الطلب') || cell.includes('تاريخ العطل') || cell.includes('تاريخ البلاغ') || cell === 'تاريخ' || cell === 'التاريخ' || cell.startsWith('تاريخ')) {
      hasDate = true;
    }
    if (cell.includes('الموقع') || cell.includes('المحطة') || cell.includes('المحطه') || cell.includes('الفرع') || cell === 'موقع' || cell === 'محطة' || cell === 'محطه' || cell === 'فرع' || cell.includes('اسم المحطة')) {
      hasLocation = true;
    }
    if (cell.includes('المشكلة') || cell.includes('المشكله') || cell.includes('العطل') || cell.includes('الوصف') || cell.includes('البيان') || cell.includes('شرح')) {
      hasProblem = true;
    }
    if (cell.includes('الاجراء') || cell.includes('الإجراء') || cell.includes('الاصلاح') || cell.includes('الإصلاح')) {
      hasAction = true;
    }
    if (cell.includes('رافع') || cell.includes('مقدم الطلب') || cell.includes('المشرف') || cell.includes('الرافع')) {
      hasRequester = true;
    }
    if (cell.includes('نوع الطلب') || cell.includes('نوع الصيانة') || cell.includes('نوع الصيانه') || cell.includes('تصنيف') || cell === 'الصيانة' || cell === 'الصيانه' || cell.includes('نوع')) {
      hasType = true;
    }
    if (cell.includes('الفني') || cell.includes('المنفذة') || cell.includes('الشركة')) {
      hasTech = true;
    }
    if (cell.includes('اغلاق') || cell.includes('إغلاق') || cell.includes('الانهاء') || cell.includes('الإنهاء') || cell.includes('الانجاز') || cell.includes('الإنجاز')) {
      hasClosingDate = true;
    }
    if (cell.includes('ملاحظات') || cell.includes('الملاحظات') || cell.includes('الانجاز') || cell.includes('الإنجاز')) {
      hasNotes = true;
    }
    if (cell.includes('حالة') || cell.includes('الموقف')) {
      hasStatus = true;
    }
  }

  const distinctConcepts = [hasReqNo, hasDate, hasLocation, hasProblem, hasAction, hasRequester, hasType, hasTech, hasClosingDate, hasNotes, hasStatus].filter(Boolean).length;

  // Specific matching for facilities worksheet ("سجل المسجد ودوات المياة")
  if (sheetContext === 'facilities') {
    if (distinctConcepts >= 2) {
      return { isHeader: true, headerType: 'maintenance', headers: rowCells };
    }
  }

  if (distinctConcepts >= 3) {
    return { isHeader: true, headerType: 'maintenance', headers: rowCells };
  }

  // Inspection Header Match
  let insMatches = 0;
  if (normCells.some(c => c.includes('تفتيش') || c.includes('تقرير') || c.includes('زيارة'))) insMatches++;
  if (normCells.some(c => c.includes('المفتش') || c.includes('المراقب') || c.includes('الزائر'))) insMatches++;
  if (normCells.some(c => c.includes('التقييم') || c.includes('التقدير'))) insMatches++;
  if (normCells.some(c => c.includes('المحطة') || c.includes('الموقع'))) insMatches++;
  if (insMatches >= 3) return { isHeader: true, headerType: 'inspection', headers: rowCells };

  // Incident Header Match
  let incMatches = 0;
  if (normCells.some(c => c.includes('حادث') || c.includes('الحادث'))) incMatches++;
  if (normCells.some(c => c.includes('المتسبب') || c.includes('السيارات') || c.includes('السيارة'))) incMatches++;
  if (normCells.some(c => c.includes('المحطة') || c.includes('المنطقة'))) incMatches++;
  if (normCells.some(c => c.includes('مقترحات') || c.includes('المعلومات'))) incMatches++;
  if (incMatches >= 3) return { isHeader: true, headerType: 'incident', headers: rowCells };

  return { isHeader: false, headerType: 'none', headers: [] };
}

/**
 * Section mapping according to user instructions:
 * - "سجل المضخات" → "المضخات" (pumps)
 * - "سجل الخزانات" → "الخزانات" (tanks)
 * - "سجل المسجد ودوات المياة" / "دورات المياه والمسجد والساحة والمدخل والمخرج" → "المدخل والمخرج والمرافق" (facilities)
 * - "التفتيش الدوري الداخلي" → "التفتيش الدوري" (inspections)
 * - "سجل الحوادث" → "الحوادث" (incidents)
 *
 * If not recognized, returns 'unknown' so it NEVER automatically imports into pumps.
 */
function mapSheetToSection(
  sheetName: string,
  targetSection: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'all'
): 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'unknown' {
  const normName = normalizeText(sheetName);

  if (normName.includes('مضخ')) return 'pumps';
  if (normName.includes('خزان')) return 'tanks';
  if (
    normName.includes('مسجد') ||
    normName.includes('دوات') ||
    normName.includes('دورات') ||
    normName.includes('مياة') ||
    normName.includes('مياه') ||
    normName.includes('مرافق') ||
    normName.includes('ساحه') ||
    normName.includes('ساحة') ||
    normName.includes('مدخل') ||
    normName.includes('مخرج')
  ) {
    return 'facilities';
  }
  if (normName.includes('تفتيش')) return 'inspections';
  if (normName.includes('حادث') || normName.includes('حوادث')) return 'incidents';

  if (targetSection !== 'all') {
    return targetSection;
  }

  return 'unknown';
}

function getSectionLabel(sec: string): string {
  switch (sec) {
    case 'pumps': return 'المضخات';
    case 'tanks': return 'الخزانات';
    case 'facilities': return 'المدخل والمخرج والمرافق';
    case 'inspections': return 'التفتيش الدوري';
    case 'incidents': return 'الحوادث';
    case 'unknown': default: return 'لم يتم التعرف على القسم';
  }
}

export interface StationMatchResult {
  station: Station | null;
  isUnmatched: boolean;
  unmatchedReason?: string;
  originalValue: string;
}

/**
 * Searches official stations list for match according to priority:
 * 1. Station Number / Code has priority over station name.
 * 2. Variations like "كويك - 2 الدرب", "كويك -2 الدرب", "كويك - 2 الدرب 1" -> Map all to "كويك - 2 الدرب"
 * 3. If station number is NOT 1-10 -> "المحطة غير معروفة"
 * 4. If station number missing but name matches -> match by normalized name.
 * 5. If neither matches -> "تحتاج مراجعة"
 */
function findStationMatch(
  stationsList: Station[],
  inputName: string,
  inputCode: string
): StationMatchResult {
  const rawOriginal = [inputCode, inputName].filter(Boolean).join(' / ') || 'غير مدون';
  const officialList = (stationsList && stationsList.length > 0) ? stationsList : OFFICIAL_STATIONS;

  // 1. Priority 1: Station Code / Number
  const normCode = String(inputCode || '').trim();
  let extractedNum: number | null = null;

  if (normCode) {
    const codeMatch = normCode.match(/\b(\d{1,2})\b/) || normCode.match(/(\d+)/);
    if (codeMatch) {
      extractedNum = parseInt(codeMatch[1], 10);
    }
  }

  // 2. If no code provided, extract station number from station name
  const normName = String(inputName || '').trim();

  // Check if normName contains equipment or problem description words
  const equipmentWords = [
    'مسدس', 'طرمبة', 'طرمبه', 'موتور', 'ماطور', 'عداد', 'شاشة', 'شاشه',
    'كيبل', 'سلك', 'ضغط', 'دفاع', 'انقطاع', 'مشكلة', 'مشكله', 'عطل',
    'اصلاح', 'إصلاح', 'صيانة', 'صيانه', 'تغيير', 'تركيب', 'مضخة', 'مضخه'
  ];
  const isEquipmentOrText = equipmentWords.some(w => normName.includes(w));

  if (extractedNum === null && normName && !isEquipmentOrText) {
    const isPureNumber = /^\d{1,2}$/.test(normName);
    const stationPrefixMatch = normName.match(/(?:كويك|محطة|محطه|فرع|الفرع|موقع|الموقع)\s*[-–—]?\s*(\d{1,2})/i);

    if (isPureNumber) {
      extractedNum = parseInt(normName, 10);
    } else if (stationPrefixMatch) {
      extractedNum = parseInt(stationPrefixMatch[1], 10);
    }
  }

  // Evaluate extracted number if found
  if (extractedNum !== null) {
    if (extractedNum >= 1 && extractedNum <= 10) {
      const matched = officialList.find(s => parseInt(s.code, 10) === extractedNum);
      if (matched) {
        return { station: matched, isUnmatched: false, originalValue: rawOriginal };
      }
    } else {
      // Station number is NOT 1–10!
      return {
        station: null,
        isUnmatched: true,
        unmatchedReason: `المحطة غير معروفة (رقم المحطة ${extractedNum} غير موجود ضمن دليل المحطات الرسمية 1-10)`,
        originalValue: rawOriginal
      };
    }
  }

  // 3. Station number missing or not found, try matching normalized station name keywords
  if (normName) {
    const normalizedInputName = normalizeText(normName);

    const keywordsMap: { [code: number]: string[] } = {
      1: ['ابها', 'أبها'],
      2: ['الدرب', 'درب'],
      3: ['محايل', 'محايل عسير'],
      4: ['المنسك', 'منسك'],
      5: ['الفرعاء', 'فرعاء'],
      6: ['جيزان', 'جازان'],
      7: ['الراسي', 'راسي'],
      8: ['احد رفيدة', 'أحد رفيدة', 'رفيدة'],
      9: ['العقبة', 'عقبة'],
      10: ['المحالة', 'محالة']
    };

    for (let codeNum = 1; codeNum <= 10; codeNum++) {
      const keywords = keywordsMap[codeNum] || [];
      if (keywords.some(kw => normalizedInputName.includes(kw))) {
        const matched = officialList.find(s => parseInt(s.code, 10) === codeNum);
        if (matched) {
          return { station: matched, isUnmatched: false, originalValue: rawOriginal };
        }
      }
    }
  }

  // 4. Neither station number nor name can be confidently matched -> Needs review
  return {
    station: null,
    isUnmatched: true,
    unmatchedReason: 'تحتاج مراجعة (لم يتم التعرف على رقم أو اسم المحطة ضمن القائمة الرسمية)',
    originalValue: rawOriginal
  };
}

/**
 * Parses Uploaded Excel Workbook and extracts ALL tables across ALL worksheets
 */
export async function parseExcelFileForPreview(
  file: File | ArrayBuffer | { name?: string; arrayBuffer: () => Promise<ArrayBuffer> },
  targetSection: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'all',
  existingData: AppData
): Promise<ExcelImportPreviewResult> {
  const fileName = (file && 'name' in file && typeof file.name === 'string') ? file.name : 'uploaded_file.xlsx';
  let arrayBuffer: ArrayBuffer;
  if (file instanceof ArrayBuffer) {
    arrayBuffer = file;
  } else if (file && 'arrayBuffer' in file && typeof file.arrayBuffer === 'function') {
    arrayBuffer = await file.arrayBuffer();
  } else {
    arrayBuffer = file as any;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheetNamesFound = workbook.worksheets.map(ws => ws.name);

  const result: ExcelImportPreviewResult = {
    fileName,
    targetType: targetSection,
    sheetNamesFound,
    diagnostics: [],
    validMaintenanceRows: [],
    validInspectionRows: [],
    validIncidentRows: [],
    invalidRows: [],
    unmatchedStationsCount: 0,
    duplicateCount: 0,
    duplicatesAlreadyInApp: 0,
    duplicatesInExcel: 0
  };

  const stationsList = existingData.stations;

  // Parse every worksheet in the workbook
  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;

    const detectedSec = mapSheetToSection(sheetName, targetSection);
    const secLabel = getSectionLabel(detectedSec);

    const sheetDiagnostic: SheetDiagnostic = {
      fileName,
      sheetName,
      detectedSection: detectedSec,
      detectedSectionLabel: secLabel,
      headerRowIndex: 0,
      detectedHeaders: [],
      totalRowsProcessed: 0,
      validRowsCount: 0,
      invalidRowsCount: 0,
      duplicateRowsCount: 0,
      needingAttentionRowsCount: 0,
      unmatchedStationNames: [],
      statusMessage: ''
    };

    if (!worksheet || worksheet.rowCount === 0) {
      sheetDiagnostic.statusMessage = 'ورقة العمل غير موجودة أو فارغة (0 سجلات).';
      result.diagnostics.push(sheetDiagnostic);
      continue;
    }

    // Convert worksheet into 2D string matrix
    const matrix: string[][] = [];
    const totalRowCount = worksheet.rowCount;
    for (let r = 1; r <= totalRowCount; r++) {
      const row = worksheet.getRow(r);
      const maxCol = Math.max(row.cellCount, (Array.isArray(row.values) ? row.values.length - 1 : 0));
      const rowCells: string[] = [];
      for (let c = 1; c <= maxCol; c++) {
        rowCells.push(getCellStringValue(row.getCell(c)));
      }
      matrix.push(rowCells);
    }

    if (matrix.length === 0 || matrix.every(row => row.every(cell => !cell || cell.trim() === ''))) {
      sheetDiagnostic.statusMessage = 'ورقة العمل فارغة تماماً (0 سجلات).';
      result.diagnostics.push(sheetDiagnostic);
      continue;
    }

    // ----------------------------------------------------
    // PASS 1: Identify all tables / headers in the sheet
    // ----------------------------------------------------
    interface DetectedTableHeader {
      headerRowIndex: number;
      headerCells: string[];
      colIndices: HeaderColumnIndices;
      headerType: 'maintenance' | 'inspection' | 'incident' | 'none';
    }

    const detectedTables: DetectedTableHeader[] = [];

    for (let r = 0; r < matrix.length; r++) {
      const rawRow = matrix[r] || [];
      const strCells = rawRow.map(c => String(c || '').replace(/[\r\n]+/g, ' ').trim());
      const nonEmpCells = strCells.filter(c => c.length > 0);
      if (nonEmpCells.length === 0) continue;

      const headerCheck = checkRowIsHeader(strCells, detectedSec);
      if (headerCheck.isHeader) {
        let colIndices = getHeaderColIndices(strCells);
        colIndices = refineColIndicesUsingSampleRows(matrix, r + 1, Math.min(r + 25, matrix.length), colIndices);
        detectedTables.push({
          headerRowIndex: r,
          headerCells: strCells,
          colIndices,
          headerType: headerCheck.headerType
        });
      }
    }

    // Fallback if no explicit header detected
    if (detectedTables.length === 0 && matrix.length > 0) {
      const firstRowCells = (matrix[0] || []).map(c => String(c || '').replace(/[\r\n]+/g, ' ').trim());
      let colIndices = getHeaderColIndices(firstRowCells);
      colIndices = refineColIndicesUsingSampleRows(matrix, 1, Math.min(25, matrix.length), colIndices);
      detectedTables.push({
        headerRowIndex: 0,
        headerCells: firstRowCells,
        colIndices,
        headerType: detectedSec === 'inspections' ? 'inspection' : (detectedSec === 'incidents' ? 'incident' : 'maintenance')
      });
    }

    sheetDiagnostic.headerRowIndex = detectedTables.length > 0 ? detectedTables[0].headerRowIndex + 1 : 1;
    sheetDiagnostic.detectedHeaders = detectedTables.length > 0 ? detectedTables[0].headerCells.filter(c => c.length > 0) : [];
    sheetDiagnostic.tableBreakdowns = [];

    console.log(`\n====================================================`);
    console.log(`SCANNING SHEET: "${sheetName}" -> Detected Tables: ${detectedTables.length}`);
    console.log(`====================================================`);

    // ----------------------------------------------------
    // PASS 2: Extract data from each detected table range
    // ----------------------------------------------------
    for (let tIdx = 0; tIdx < detectedTables.length; tIdx++) {
      const currentTable = detectedTables[tIdx];
      const startRow = currentTable.headerRowIndex + 1;
      const endRow = (tIdx + 1 < detectedTables.length) ? detectedTables[tIdx + 1].headerRowIndex : matrix.length;
      
      const activeHeaders = currentTable.headerCells;
      const activeColIndices = refineColIndicesUsingSampleRows(matrix, startRow, endRow, currentTable.colIndices);
      let tableRecordCount = 0;

      for (let r = startRow; r < endRow; r++) {
        const rawRow = matrix[r] || [];
        const strCells = rawRow.map(c => String(c || '').replace(/[\r\n]+/g, ' ').trim());
        const nonEmpCells = strCells.filter(c => c.length > 0);
        if (nonEmpCells.length === 0) continue;

        // Skip title banners or decorative text rows
        const combinedRowText = strCells.join(' ').trim();
        const normFirstCell = normalizeText(strCells[0] || '');
        const normCombinedText = normalizeText(combinedRowText);

        const isCorporateBanner =
          normCombinedText.includes('شركة كويك') ||
          normCombinedText.includes('كويك لمحطات') ||
          normFirstCell.startsWith('شركة') ||
          normFirstCell.startsWith('سجل صيانة') ||
          normFirstCell.startsWith('جدول اعطال') ||
          normFirstCell.startsWith('تقرير صيانة') ||
          normFirstCell.startsWith('بيان اعطال');

        if (isCorporateBanner) {
          // If the row doesn't have an authentic maintenance description, skip it completely
          const hasRealData = strCells.some(
            c => c.length >= 4 &&
              !c.includes('شركة كويك') &&
              !c.includes('صيانة المحطات') &&
              !c.includes('جدول اعطال') &&
              !c.includes('تقرير صيانة') &&
              !c.includes('إدارة التشغيل')
          );
          if (!hasRealData) {
            continue;
          }
        }

        // Row object
        const rowObj: Record<string, any> = {};
        activeHeaders.forEach((h, colIdx) => {
          if (h) {
            rowObj[h] = strCells[colIdx] !== undefined ? strCells[colIdx] : '';
          }
        });

        // ----------------------------------------------------
        // MAINTENANCE SECTIONS (Pumps, Tanks, Facilities)
        // ----------------------------------------------------
        if (
          currentTable.headerType === 'maintenance' ||
          detectedSec === 'pumps' ||
          detectedSec === 'tanks' ||
          detectedSec === 'facilities' ||
          (detectedSec === 'unknown' && currentTable.headerType !== 'inspection' && currentTable.headerType !== 'incident')
        ) {
          const reqNo = extractCellVal(strCells, activeColIndices.reqNo, rowObj, ['رقم طلب الصيانة', 'رقم الطلب', 'رقم طلب', 'رقم البلاغ', 'رقم الطلب/البلاغ', 'رقم', 'REQ']);
          const reqDateRaw = extractCellVal(strCells, activeColIndices.reqDate, rowObj, ['تاريخ الطلب', 'التاريخ', 'تاريخ العطل', 'تاريخ البلاغ', 'تاريخ', 'Date']);
          let stationNameInput = extractCellVal(strCells, activeColIndices.stationName, rowObj, ['الموقع', 'المحطة', 'الفرع', 'اسم المحطة', 'اسم الفرع', 'موقع', 'محطة', 'فرع', 'Station']);
          const stationCodeInput = extractCellVal(strCells, activeColIndices.stationCode, rowObj, ['رقم المحطة', 'كود المحطة', 'رمز المحطة', 'رقم الفرع', 'كود الفرع']);
          const requester = extractCellVal(strCells, activeColIndices.requester, rowObj, ['رافع الطلب', 'مقدم الطلب', 'اسم رافع الطلب', 'المشرف', 'الرافع', 'المبلغ', 'Requester']);
          const problemDesc = extractCellVal(strCells, activeColIndices.problemDesc, rowObj, ['شرح المشكلة', 'وصف المشكلة', 'المشكلة', 'البيان', 'تفاصيل المشكلة', 'شرح العطل', 'الوصف', 'الملاحظات']);
          const closingDateRaw = extractCellVal(strCells, activeColIndices.closingDate, rowObj, ['تاريخ إغلاق الصيانة', 'تاريخ اغلاق الصيانة', 'تاريخ الإغلاق', 'تاريخ الاغلاق', 'تاريخ الإنهاء', 'تاريخ الإنجاز']);
          const mTypeRaw = extractCellVal(
            strCells,
            activeColIndices.mType,
            rowObj,
            [
              'نوع الصيانة', 'نوع الصيانه', 'نوع صيانة', 'نوع صيانه', 'تصنيف الصيانة', 'تصنيف الصيانه',
              'فئة الصيانة', 'فئة الصيانه', 'طبيعة الصيانة', 'طبيعه الصيانة', 'نوع أعمال الصيانة', 'نوع اعمال الصيانه',
              'طبيعة العطل', 'طبيعه العطل', 'الصيانة', 'الصيانه'
            ],
            ['نوع الطلب', 'نوع طلب', 'طلب الصيانة', 'رقم الطلب', 'تاريخ الطلب', 'رافع الطلب', 'حالة الطلب', 'تاريخ اغلاق الصيانة', 'تاريخ إغلاق الصيانة']
          );
          const rTypeRaw = extractCellVal(
            strCells,
            activeColIndices.rType,
            rowObj,
            [
              'نوع الطلب', 'نوع طلب', 'نوع طلب الصيانة', 'طلب الصيانة', 'فئة الطلب', 'فئه الطلب',
              'تصنيف الطلب', 'طبيعة الطلب', 'طبيعه الطلب', 'نوع البلاغ',
              'نوع الاعطال', 'نوع الأعطال', 'نوع العطل', 'نوع الاعمال', 'نوع الأعمال',
              'نوع العمل', 'نوع الخدمة', 'نوع الخدمه', 'الطلب'
            ],
            [
              'نوع الصيانة', 'نوع الصيانه', 'نوع صيانة', 'الصيانة', 'الصيانه',
              'رقم الطلب', 'تاريخ الطلب', 'رافع الطلب', 'حالة الطلب',
              'تاريخ اغلاق الصيانة', 'تاريخ إغلاق الصيانة', 'رقم طلب الصيانة',
              'المعدة', 'المعده', 'اسم المعدة', 'رقم المعدة'
            ]
          );
          const tech = extractCellVal(strCells, activeColIndices.tech, rowObj, ['الفني', 'اسم الفني', 'الشركة المنفذة', 'فني الصيانة']);
          const action = extractCellVal(strCells, activeColIndices.action, rowObj, ['الإجراء', 'الاجراء', 'الإجراء المتخذ', 'الاجراء المتخذ', 'الإجراءات']);
          const notes = extractCellVal(strCells, activeColIndices.notes, rowObj, ['الإنجاز', 'الانجاز', 'ملاحظات الإنجاز', 'تفاصيل الإنجاز']);
          const statusVal = extractCellVal(strCells, activeColIndices.status, rowObj, ['حالة الطلب', 'الحالة', 'حالة الصيانة', 'الموقف']);

          // Determine effective request number or sequence number in row
          let effectiveReqNo = reqNo;
          if (!effectiveReqNo) {
            const c0 = strCells[0] ? strCells[0].trim() : '';
            const c1 = strCells[1] ? strCells[1].trim() : '';
            if (/^\d{1,4}$/.test(c0) || /^م[-_]?\d+$/i.test(c0) || /^REQ[-_]?\d+/i.test(c0)) {
              effectiveReqNo = c0;
            } else if (/^\d{1,4}$/.test(c1) || /^م[-_]?\d+$/i.test(c1)) {
              effectiveReqNo = c1;
            }
          }

          // Filter out long company banners / description paragraphs read as stationNameInput
          if (
            stationNameInput.length > 50 ||
            stationNameInput.includes('شركة كويك لمحطات الوقود') ||
            stationNameInput.includes('جدول اعطال') ||
            stationNameInput.includes('تقرير صيانة')
          ) {
            stationNameInput = '';
          }

          const parsedReqDate = parseExcelDate(reqDateRaw);

          // Check if the row contains meaningful maintenance data in at least one other relevant field
          const hasMeaningfulField = Boolean(
            (reqDateRaw && reqDateRaw.trim().length > 0) ||
            (parsedReqDate && parsedReqDate.trim().length > 0) ||
            (stationNameInput && stationNameInput.trim().length > 0) ||
            (stationCodeInput && stationCodeInput.trim().length > 0) ||
            (requester && requester.trim().length > 0) ||
            (rTypeRaw && rTypeRaw.trim().length > 0) ||
            (mTypeRaw && mTypeRaw.trim().length > 0) ||
            (problemDesc && problemDesc.trim().length > 0) ||
            (closingDateRaw && closingDateRaw.trim().length > 0) ||
            (tech && tech.trim().length > 0) ||
            (action && action.trim().length > 0) ||
            (notes && notes.trim().length > 0) ||
            (statusVal && statusVal.trim().length > 0)
          );

          // Other non-empty cells in row that are not the request number
          const otherFilledCells = strCells.filter(c => {
            const t = c.trim();
            if (!t) return false;
            if (t === effectiveReqNo) return false;
            return true;
          });

          const hasValidReqIdentifier = Boolean(effectiveReqNo && (/^\d+$/.test(effectiveReqNo) || /^م[-_]?\d+/i.test(effectiveReqNo) || /^REQ/i.test(effectiveReqNo) || effectiveReqNo.length <= 15));

          // A REAL maintenance record must have (validReqIdentifier AND at least one other field/cell) OR valid core maintenance fields
          const hasCoreRecordFields = (hasValidReqIdentifier && (hasMeaningfulField || otherFilledCells.length > 0)) ||
            Boolean(
              parsedReqDate ||
              (problemDesc && problemDesc.length >= 3) ||
              (action && action.length >= 3) ||
              (notes && notes.length >= 3)
            );

          if (!hasCoreRecordFields) {
            // Empty placeholder row (e.g. only request #2..47 with all other cells empty) or decorative banner
            continue;
          }

          // Detect incomplete records (e.g. rows 34, 35, 36)
          const isIncompleteRecord = !stationNameInput && !parsedReqDate && (!problemDesc || problemDesc.length < 2) && (!action || action.length < 2) && (!notes || notes.length < 2);

          sheetDiagnostic.totalRowsProcessed++;

          // Match station safely with official 10 stations priority logic
          const stationResult = findStationMatch(stationsList, stationNameInput, stationCodeInput);
          let finalStationId = 'unmatched';
          let finalStationName = stationNameInput || 'غير محددة';
          let finalStationCode = stationCodeInput || '---';
          let isStationUnmatched = false;
          let unmatchedReasonStr: string | undefined = undefined;

          if (isIncompleteRecord) {
            isStationUnmatched = true;
            unmatchedReasonStr = 'بيانات السجل غير مكتملة';
            sheetDiagnostic.needingAttentionRowsCount++;
            result.unmatchedStationsCount++;
            const alertMsg = `طلب رقم ${effectiveReqNo || 'غير مدون'} ← بيانات السجل غير مكتملة`;
            if (!sheetDiagnostic.unmatchedStationNames.includes(alertMsg)) {
              sheetDiagnostic.unmatchedStationNames.push(alertMsg);
            }
          } else if (stationResult.station) {
            finalStationId = stationResult.station.id;
            finalStationName = stationResult.station.name;
            finalStationCode = stationResult.station.code;
          } else {
            finalStationId = 'unmatched';
            finalStationName = 'غير محددة';
            finalStationCode = '---';
            isStationUnmatched = true;
            unmatchedReasonStr = stationResult.unmatchedReason || 'تحتاج تحديد المحطة';
            sheetDiagnostic.needingAttentionRowsCount++;
            result.unmatchedStationsCount++;
            const alertMsg = `${stationResult.originalValue} ← ${unmatchedReasonStr}`;
            if (!sheetDiagnostic.unmatchedStationNames.includes(alertMsg)) {
              sheetDiagnostic.unmatchedStationNames.push(alertMsg);
            }
          }

          // Dates handling - preserve exact Excel values
          const parsedClosingDate = parseExcelDate(closingDateRaw);

          // Status determination based on "الإنجاز" / "تاريخ إغلاق الصيانة" / "الحالة"
          let finalStatus: 'جديد' | 'جاري العمل' | 'تم' = 'جديد';
          const normNotes = normalizeText(notes);
          const normStatus = normalizeText(statusVal);

          if (
            parsedClosingDate !== '' ||
            normNotes.includes('تم') ||
            normNotes.includes('مكتمل') ||
            normNotes.includes('منجز') ||
            normStatus.includes('تم') ||
            normStatus.includes('مكتمل') ||
            normStatus.includes('منجز')
          ) {
            finalStatus = 'تم';
          } else if (normStatus.includes('جاري') || normStatus.includes('عمل') || normStatus.includes('تحت')) {
            finalStatus = 'جاري العمل';
          }

          let effectiveSec: 'pumps' | 'tanks' | 'facilities' = (detectedSec === 'pumps' || detectedSec === 'tanks' || detectedSec === 'facilities')
            ? detectedSec
            : 'facilities';

          // When sheet has mixed rows or generic sheet name, route to section based on rTypeRaw
          const normR = normalizeText(rTypeRaw);
          if (normR.includes('مضخ') || normR.includes('طلمب')) {
            effectiveSec = 'pumps';
          } else if (normR.includes('خزان')) {
            effectiveSec = 'tanks';
          } else if (
            normR.includes('مسجد') ||
            normR.includes('دورات') ||
            normR.includes('دوات') ||
            normR.includes('مياه') ||
            normR.includes('مياة') ||
            normR.includes('مرافق') ||
            normR.includes('ساح') ||
            normR.includes('مدخل') ||
            normR.includes('مخرج')
          ) {
            effectiveSec = 'facilities';
          }

          const autoReqNumber = (
            getHighestRequestNumberForSection(existingData.maintenanceRequests, effectiveSec) +
            result.validMaintenanceRows.filter(r => r.section === effectiveSec).length + 1
          ).toString();

          const defaultRType = 'طلب صيانة';

          const candidateReq: MaintenanceRequest = {
            id: `imp-req-${Date.now()}-${tIdx + 1}-${r + 1}-${Math.random().toString(36).substr(2, 7)}`,
            requestNumber: autoReqNumber,
            section: effectiveSec,
            date: parsedReqDate || new Date().toISOString().slice(0, 10),
            stationId: finalStationId,
            stationName: finalStationName,
            stationCode: finalStationCode,
            requester: sanitizeFieldValue(requester, 'requester'),
            requestType: sanitizeFieldValue(rTypeRaw || defaultRType, 'rType'),
            maintenanceType: sanitizeFieldValue(mTypeRaw || 'صيانة عامة', 'mType'),
            problemDescription: problemDesc || action || (isIncompleteRecord ? 'بيانات السجل غير مكتملة في ملف Excel الأصلي' : 'طلب صيانة مستورد من Excel'),
            closingDate: parsedClosingDate,
            technician: sanitizeFieldValue(tech, 'tech'),
            actionTaken: action,
            completionNotes: notes,
            status: finalStatus,
            isStationUnmatched,
            originalStationValue: stationResult.originalValue || stationNameInput || stationCodeInput || 'غير مدون',
            unmatchedReason: isStationUnmatched ? unmatchedReasonStr : undefined,
            sourceSheet: sheetName,
            sourceRow: r + 1,
            createdAt: new Date().toISOString()
          };

          // Check duplicate using unified rules
          const isDupInApp = isMaintenanceDuplicate(candidateReq, existingData.maintenanceRequests);
          const isDupInBatch = isMaintenanceDuplicate(candidateReq, result.validMaintenanceRows);

          candidateReq.isDuplicateInApp = isDupInApp;
          candidateReq.isDuplicateInBatch = isDupInBatch;
          candidateReq.isDuplicate = isDupInApp || isDupInBatch;

          if (isDupInApp) {
            result.duplicatesAlreadyInApp++;
          } else if (isDupInBatch) {
            result.duplicatesInExcel++;
          }
          if (candidateReq.isDuplicate) {
            sheetDiagnostic.duplicateRowsCount++;
            result.duplicateCount++;
          }

          result.validMaintenanceRows.push(candidateReq);
          sheetDiagnostic.validRowsCount++;
          tableRecordCount++;

        // ----------------------------------------------------
        // SECTION: Internal Periodic Inspection
        // ----------------------------------------------------
        } else if (detectedSec === 'inspections') {
          const insNo = extractCellVal(strCells, activeColIndices.insNo, rowObj, ['رقم التفتيش', 'رقم التقرير', 'رقم الزيارة', 'رقم', 'الرقم']);
          const insDateRaw = extractCellVal(strCells, activeColIndices.insDate, rowObj, ['تاريخ التفتيش', 'التاريخ', 'تاريخ الزيارة', 'تاريخ']);
          let stationNameInput = extractCellVal(strCells, activeColIndices.stationName, rowObj, ['المحطة', 'الموقع', 'اسم المحطة', 'محطة']);
          const stationCodeInput = extractCellVal(strCells, activeColIndices.stationCode, rowObj, ['رقم المحطة', 'كود المحطة']);
          const inspector = extractCellVal(strCells, activeColIndices.inspector, rowObj, ['اسم المفتش', 'المفتش', 'قام بالتفتيش', 'اسم الزائر', 'المراقب']);
          const evalInput = extractCellVal(strCells, activeColIndices.eval, rowObj, ['التقييم', 'تقييم المحطة', 'نتيجة التفتيش', 'التقدير']);
          const insType = extractCellVal(strCells, activeColIndices.insType, rowObj, ['نوع التفتيش', 'نوع الزيارة', 'التفتيش']) || 'تفتيش شامل والسلامة';
          const notes = extractCellVal(strCells, activeColIndices.notes, rowObj, ['الملاحظات والتوصيات', 'الملاحظات', 'التوصيات', 'ملاحظات التفتيش']);

          if (stationNameInput.length > 50) stationNameInput = '';

          if (!inspector && !notes && !stationNameInput && !insNo) continue;

          sheetDiagnostic.totalRowsProcessed++;

          const stationResult = findStationMatch(stationsList, stationNameInput, stationCodeInput);
          let finalStationId = 'unmatched';
          let finalStationName = 'غير محددة';
          let finalStationCode = '---';
          let isStationUnmatched = false;

          if (stationResult.station) {
            finalStationId = stationResult.station.id;
            finalStationName = stationResult.station.name;
            finalStationCode = stationResult.station.code;
          } else {
            isStationUnmatched = true;
            sheetDiagnostic.needingAttentionRowsCount++;
            result.unmatchedStationsCount++;
            const alertMsg = `${stationResult.originalValue} ← ${stationResult.unmatchedReason || 'تحتاج تحديد المحطة'}`;
            if (!sheetDiagnostic.unmatchedStationNames.includes(alertMsg)) {
              sheetDiagnostic.unmatchedStationNames.push(alertMsg);
            }
          }

          const dateFormatted = parseExcelDate(insDateRaw) || new Date().toISOString().slice(0, 10);
          const autoInsNumber = (
            getHighestInspectionNumber(existingData.inspections) +
            result.validInspectionRows.length + 1
          ).toString();

          let finalEval: 'ممتاز' | 'جيد جدا' | 'جيد' | 'يحتاج متابعة' = 'ممتاز';
          const normEval = normalizeText(evalInput);
          if (normEval.includes('يحتاج') || normEval.includes('متابعة') || normEval.includes('ضعيف')) finalEval = 'يحتاج متابعة';
          else if (normEval.includes('جيد جدا')) finalEval = 'جيد جدا';
          else if (normEval.includes('جيد')) finalEval = 'جيد';

          const candidateIns: InternalInspection = {
            id: `imp-ins-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            inspectionNumber: autoInsNumber,
            date: dateFormatted,
            stationId: finalStationId,
            stationName: finalStationName,
            stationCode: finalStationCode,
            inspectionType: insType,
            inspectorName: inspector || 'مفتش جودة وصيانة',
            evaluation: finalEval,
            notes: notes || 'تم استيراد التقرير من Excel',
            isStationUnmatched,
            originalStationValue: stationResult.originalValue || stationNameInput || stationCodeInput || 'غير مدون',
            unmatchedReason: isStationUnmatched ? (stationResult.unmatchedReason || 'المحطة غير معروفة (لم تتطابق مع دليل المحطات الرسمية 1-10)') : undefined,
            sourceSheet: sheetName,
            sourceRow: r + 1,
            createdAt: new Date().toISOString()
          };

          const isDupInApp = isInspectionDuplicate(candidateIns, existingData.inspections);
          const isDupInBatch = isInspectionDuplicate(candidateIns, result.validInspectionRows);

          candidateIns.isDuplicateInApp = isDupInApp;
          candidateIns.isDuplicateInBatch = isDupInBatch;
          candidateIns.isDuplicate = isDupInApp || isDupInBatch;

          if (isDupInApp) {
            result.duplicatesAlreadyInApp++;
          } else if (isDupInBatch) {
            result.duplicatesInExcel++;
          }
          if (candidateIns.isDuplicate) {
            sheetDiagnostic.duplicateRowsCount++;
            result.duplicateCount++;
          }

          result.validInspectionRows.push(candidateIns);
          sheetDiagnostic.validRowsCount++;
          tableRecordCount++;

        // ----------------------------------------------------
        // SECTION: Incidents
        // ----------------------------------------------------
        } else if (detectedSec === 'incidents') {
          const incNo = extractCellVal(strCells, activeColIndices.incNo, rowObj, ['رقم البلاغ', 'رقم الحادث', 'رقم الحادثة', 'رقم', 'الرقم']);
          const region = extractCellVal(strCells, activeColIndices.region, rowObj, ['المنطقة', 'المنطقه', 'الاقليم', 'القطاع']);
          let stationNameInput = extractCellVal(strCells, activeColIndices.stationName, rowObj, ['اسم المحطة', 'اسم المحطمه', 'المحطة', 'الموقع']);
          const stationCodeInput = extractCellVal(strCells, activeColIndices.stationCode, rowObj, ['رقم المحطة', 'كود المحطة']);
          const dateRaw = extractCellVal(strCells, activeColIndices.incDate, rowObj, ['التاريخ', 'تاريخ الحادث', 'تاريخ البلاغ']);
          const time = extractCellVal(strCells, activeColIndices.incTime, rowObj, ['وقت الحادث', 'الوقت', 'ساعة الحادث']);
          const incType = extractCellVal(strCells, activeColIndices.incType, rowObj, ['نوع الحادث', 'نوع البلاغ', 'طبيعة الحادث']) || 'اصطدام بالمضخة';
          const party = extractCellVal(strCells, activeColIndices.causingParty, rowObj, ['اسم المتسبب بالحادث', 'اسم المتسبب', 'المتسبب', 'الطرف الثاني']);
          const vehicle = extractCellVal(strCells, activeColIndices.vehicleType, rowObj, ['نوع السيارات', 'نوع السيارة', 'السيارة']);
          const info = findValue(rowObj, ['المعلومات', 'بيانات التواصل', 'معلومات المتسبب']);
          const desc = findValue(rowObj, ['وصف الحادث', 'شرح الحادث', 'تفاصيل الحادث', 'الوصف', 'البيان']);
          const suggestions = findValue(rowObj, ['مقترحات لتجنب هذا النوع من الحوادث بالمستقبل', 'مقترحات لتجنب الحادث', 'المقترحات', 'التوصيات']);
          const report = findValue(rowObj, ['تقرير الجهة المسؤولة', 'تقرير المرور', 'الجهة المسؤولة']);
          const notes = findValue(rowObj, ['ملاحظات', 'الملاحظات']);
          const reporter = findValue(rowObj, ['معد التقرير والتوقيع', 'معد التقرير', 'اسم معد التقرير']);

          if (stationNameInput.length > 50) stationNameInput = '';

          if (!party && !desc && !stationNameInput && !incNo) continue;

          sheetDiagnostic.totalRowsProcessed++;

          const stationResult = findStationMatch(stationsList, stationNameInput, stationCodeInput);
          let finalStationId = 'unmatched';
          let finalStationName = 'غير محددة';
          let finalStationCode = '---';
          let isStationUnmatched = false;

          if (stationResult.station) {
            finalStationId = stationResult.station.id;
            finalStationName = stationResult.station.name;
            finalStationCode = stationResult.station.code;
          } else {
            isStationUnmatched = true;
            sheetDiagnostic.needingAttentionRowsCount++;
            result.unmatchedStationsCount++;
            const alertMsg = `${stationResult.originalValue} ← ${stationResult.unmatchedReason || 'تحتاج تحديد المحطة'}`;
            if (!sheetDiagnostic.unmatchedStationNames.includes(alertMsg)) {
              sheetDiagnostic.unmatchedStationNames.push(alertMsg);
            }
          }

          const dateFormatted = parseExcelDate(dateRaw) || new Date().toISOString().slice(0, 10);
          const autoIncNumber = (
            getHighestIncidentNumber(existingData.incidents) +
            result.validIncidentRows.length + 1
          ).toString();

          const candidateInc: IncidentRecord = {
            id: `imp-inc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            incidentNumber: autoIncNumber,
            region: region || 'الرياض',
            stationId: finalStationId,
            stationName: finalStationName,
            stationCode: finalStationCode,
            date: dateFormatted,
            time: time || '12:00',
            incidentType: incType,
            causingParty: party || 'غير مدون',
            vehicleType: vehicle,
            generalInfo: info,
            description: desc || 'بلاغ حادث مستورد من Excel',
            preventionSuggestions: suggestions,
            responsiblePartyReport: report,
            notes: notes,
            reporterNameAndSignature: reporter,
            isStationUnmatched,
            originalStationValue: stationResult.originalValue || stationNameInput || stationCodeInput || 'غير مدون',
            unmatchedReason: isStationUnmatched ? (stationResult.unmatchedReason || 'المحطة غير معروفة (لم تتطابق مع دليل المحطات الرسمية 1-10)') : undefined,
            sourceSheet: sheetName,
            sourceRow: r + 1,
            createdAt: new Date().toISOString()
          };

          const isDupInApp = isIncidentDuplicate(candidateInc, existingData.incidents);
          const isDupInBatch = isIncidentDuplicate(candidateInc, result.validIncidentRows);

          candidateInc.isDuplicateInApp = isDupInApp;
          candidateInc.isDuplicateInBatch = isDupInBatch;
          candidateInc.isDuplicate = isDupInApp || isDupInBatch;

          if (isDupInApp) {
            result.duplicatesAlreadyInApp++;
          } else if (isDupInBatch) {
            result.duplicatesInExcel++;
          }
          if (candidateInc.isDuplicate) {
            sheetDiagnostic.duplicateRowsCount++;
            result.duplicateCount++;
          }

          result.validIncidentRows.push(candidateInc);
          sheetDiagnostic.validRowsCount++;
          tableRecordCount++;
        }
      }

      const tableDiag: TableDiagnosticInfo = {
        tableIndex: tIdx + 1,
        headerRow: currentTable.headerRowIndex + 1,
        startRow: startRow + 1,
        endRow: endRow,
        recordsExtracted: tableRecordCount
      };

      sheetDiagnostic.tableBreakdowns.push(tableDiag);
      console.log(`${sheetName} | Table ${tableDiag.tableIndex} (header row #${tableDiag.headerRow}) | rows ${tableDiag.startRow}-${tableDiag.endRow} | ${tableDiag.recordsExtracted} records`);
    }

    console.log(`\n----------------------------------------------------`);
    console.log(`${sheetName}`);
    sheetDiagnostic.tableBreakdowns?.forEach(tbl => {
      console.log(`Table ${tbl.tableIndex} → ${tbl.recordsExtracted} records`);
    });
    console.log(`TOTAL → ${sheetDiagnostic.validRowsCount} records`);
    console.log(`----------------------------------------------------\n`);

    if (detectedSec === 'unknown') {
      sheetDiagnostic.statusMessage = 'لم يتم التعرف على القسم تلقائياً. يرجى مراجعة وتحديد القسم قبل الاستيراد.';
    } else if (sheetDiagnostic.validRowsCount > 0) {
      const tableCount = sheetDiagnostic.tableBreakdowns?.length || 1;
      sheetDiagnostic.statusMessage = tableCount > 1 
        ? `تم استخراج ${sheetDiagnostic.validRowsCount} سجل بنجاح من ${tableCount} جداول متعددة.`
        : `تم استخراج ${sheetDiagnostic.validRowsCount} سجل بنجاح.`;
    } else {
      sheetDiagnostic.statusMessage = 'ورقة العمل فارغة أو لا تحتوي على سجلات مطابقة (0 سجلات).';
    }

    result.diagnostics.push(sheetDiagnostic);
  }

  // Assign projected sequential application numbers to non-duplicate valid maintenance rows per section
  let pumpsSeq = getHighestRequestNumberForSection(existingData.maintenanceRequests, 'pumps');
  let tanksSeq = getHighestRequestNumberForSection(existingData.maintenanceRequests, 'tanks');
  let facSeq = getHighestRequestNumberForSection(existingData.maintenanceRequests, 'facilities');

  result.validMaintenanceRows.forEach(m => {
    if (!m.isDuplicate) {
      if (m.section === 'pumps') {
        pumpsSeq += 1;
        m.requestNumber = pumpsSeq.toString();
      } else if (m.section === 'tanks') {
        tanksSeq += 1;
        m.requestNumber = tanksSeq.toString();
      } else if (m.section === 'facilities') {
        facSeq += 1;
        m.requestNumber = facSeq.toString();
      } else {
        const otherHighest = getHighestRequestNumberForSection(existingData.maintenanceRequests, m.section);
        m.requestNumber = (otherHighest + 1).toString();
      }
    }
  });

  // Diagnostic logging for exact review records report
  const reviewMaintenance = result.validMaintenanceRows.filter(m => m.isStationUnmatched);
  const reviewInspections = result.validInspectionRows.filter(i => i.isStationUnmatched);
  const reviewIncidents = result.validIncidentRows.filter(inc => inc.isStationUnmatched);

  const allReviews = [
    ...reviewMaintenance.map(m => ({
      worksheetName: m.sourceSheet || 'سجل الخزانات',
      excelRow: m.sourceRow,
      requestNumber: m.requestNumber,
      stationNameInExcel: m.originalStationValue || m.stationName,
      stationCodeInExcel: m.stationCode,
      reviewReason: m.unmatchedReason,
      isGenuinelyIncomplete: m.unmatchedReason?.includes('غير مكتملة') || false,
      isMissingStation: m.unmatchedReason?.includes('المحطة') || false
    })),
    ...reviewInspections.map(i => ({
      worksheetName: i.sourceSheet,
      excelRow: i.sourceRow,
      requestNumber: i.inspectionNumber,
      stationNameInExcel: i.originalStationValue || i.stationName,
      stationCodeInExcel: i.stationCode,
      reviewReason: i.unmatchedReason,
      isGenuinelyIncomplete: false,
      isMissingStation: true
    })),
    ...reviewIncidents.map(inc => ({
      worksheetName: inc.sourceSheet,
      excelRow: inc.sourceRow,
      requestNumber: inc.incidentNumber,
      stationNameInExcel: inc.originalStationValue || inc.stationName,
      stationCodeInExcel: inc.stationCode,
      reviewReason: inc.unmatchedReason,
      isGenuinelyIncomplete: false,
      isMissingStation: true
    }))
  ];

  console.log('====================================================');
  console.log('EXCEL PARSER DIAGNOSTIC: REVIEW RECORDS REPORT');
  console.log(`Total Review Records Found: ${allReviews.length}`);
  console.log('====================================================');
  allReviews.forEach((item, index) => {
    const tableNum = item.excelRow ? (item.excelRow < 75 ? 'Table 1' : 'Table 2') : 'Table 1';
    let typeClassification = 'missing station';
    if (item.isGenuinelyIncomplete) {
      typeClassification = 'genuinely incomplete';
    }

    console.log(`Review Record #${index + 1}:`);
    console.log(`1. Worksheet Name: ${item.worksheetName}`);
    console.log(`2. Table Number: ${tableNum}`);
    console.log(`3. Excel Row Number: #${item.excelRow}`);
    console.log(`4. Request Number (رقم طلب الصيانة): ${item.requestNumber}`);
    console.log(`5. Station Name in Excel (اسم المحطة): ${item.stationNameInExcel}`);
    console.log(`6. Station Code in Excel (رقم المحطة): ${item.stationCodeInExcel}`);
    console.log(`7. Exact Review Reason: ${item.reviewReason}`);
    console.log(`8. Classification: ${typeClassification}`);
    console.log('----------------------------------------------------');
  });

  // Facilities Pipeline Diagnostic Check
  const facilitiesValid = result.validMaintenanceRows.filter(r => r.section === 'facilities');
  const facilitiesNonDup = facilitiesValid.filter(r => !r.isDuplicate);

  console.log('\n====================================================');
  console.log('FACILITIES IMPORT PIPELINE (PARSER STAGE)');
  console.log(`1. Extracted: ${facilitiesValid.length}`);
  console.log(`2. Normalized: ${facilitiesValid.length}`);
  console.log(`3. Before duplicate filtering: ${facilitiesValid.length}`);
  console.log(`4. After duplicate filtering: ${facilitiesNonDup.length}`);
  console.log('====================================================\n');

  return result;
}
