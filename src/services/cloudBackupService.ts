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

export const DEFAULT_BACKUP_ERROR = 'تعذّر إتمام النسخ الاحتياطي. حاول مرة أخرى أو تواصل مع مسؤول النظام.';

/**
 * Fetches all rows from a Supabase table using pagination to bypass the default 1,000-row limit
 */
async function fetchAllTableRows(tableName: string): Promise<any[]> {
  if (!supabase) return [];
  const PAGE_SIZE = 1000;
  let allRows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`فشل قراءة جدول ${tableName}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows = allRows.concat(data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return allRows;
}

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

  console.error(`[CLOUD BACKUP SERVICE ERROR]${context ? ` [${context}]` : ''}:`, msg);

  if (isSafeArabicBusinessError(msg)) {
    return msg.trim();
  }

  const lower = msg.toLowerCase();

  if (lower.includes('cloud_backups_one_automatic_per_month')) {
    return 'تم إنشاء النسخة الاحتياطية التلقائية لهذا الشهر مسبقاً.';
  }
  if (lower.includes('row-level security') || lower.includes('rls') || lower.includes('permission') || lower.includes('42501')) {
    return 'فشل تنفيذ العملية بسبب سياسات صلاحيات الوصول (RLS). يرجى التأكد من تسجيل الدخول بحساب مدير نظام مفعّل.';
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign key constraint')) {
    return 'تعذر
