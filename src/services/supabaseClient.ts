import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

// Safely obtain public configuration across both Vite browser environment and Node/Electron test environments
function getEnvVar(key: string): string {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  return '';
}

/**
 * Sanitizes the Supabase URL to ensure it is strictly the root project URL (e.g. https://xyz.supabase.co)
 * and strips any trailing slashes, /rest/v1, /auth/v1, /functions/v1, or malformed paths that cause
 * "Invalid path specified in request URI" errors from Kong gateway.
 */
export function sanitizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  // Remove any trailing slashes
  url = url.replace(/\/+$/, '');
  // Remove accidental subpaths like /rest/v1, /auth/v1, /functions/v1, /v1
  url = url.replace(/\/(rest|auth|functions)(\/v\d+)?$/i, '');
  url = url.replace(/\/+$/, '');
  return url;
}

const DEFAULT_PROJECT_URL = 'https://oozxebwhhbxblbgptytq.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_g4346u1jcDG3UaZ6er92EQ_9NbIsQ_X';

const RAW_SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL') || DEFAULT_PROJECT_URL;
const RAW_SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY') || DEFAULT_ANON_KEY;

export const SUPABASE_URL = sanitizeSupabaseUrl(RAW_SUPABASE_URL);
export const SUPABASE_ANON_KEY = RAW_SUPABASE_ANON_KEY.trim();

/**
 * Checks if Supabase client is properly configured with valid URL & Anon Key
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY.length > 20
  );
}

// Singleton Supabase client instance (or null if unconfigured)
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured()
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  : null;

/**
 * Health check to verify live cloud database connectivity without modifying state
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  configured: boolean;
  message: string;
  latencyMs?: number;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      connected: false,
      configured: false,
      message: 'إعدادات الاتصال بقاعدة البيانات غير مهيأة بعد.'
    };
  }

  const start = performance.now();
  try {
    const { error } = await supabase
      .from('stations')
      .select('count', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      return {
        connected: false,
        configured: true,
        latencyMs,
        message: `تعذر الوصول لقاعدة البيانات: ${error.message}`
      };
    }

    return {
      connected: true,
      configured: true,
      latencyMs,
      message: `الاتصال بقاعدة البيانات نشط ومستقر (${latencyMs}ms)`
    };
  } catch (err: any) {
    return {
      connected: false,
      configured: true,
      message: `خطأ في الاتصال: ${err?.message || String(err)}`
    };
  }
}
