import { supabase } from './supabaseClient';
import { AuthAuditLogPayload } from '../types/auth';

/**
 * Logs an authentication or administrative event to the immutable audit_logs table
 */
export async function logAuthEvent(
  payload: AuthAuditLogPayload,
  user?: { id: string; email?: string } | null
): Promise<void> {
  if (!supabase) return;

  try {
    const currentUserId = user?.id || (await supabase.auth.getUser()).data.user?.id || null;
    const currentUserEmail = user?.email || (await supabase.auth.getUser()).data.user?.email || null;

    await supabase.from('audit_logs').insert({
      user_id: currentUserId,
      user_email: currentUserEmail,
      action: payload.action,
      entity: 'profiles',
      entity_id: payload.entityId || currentUserId,
      old_data: payload.details?.oldData || null,
      new_data: payload.details || null
    });
  } catch (err) {
    // Audit logging failure should not crash the user experience
    console.warn('[AUDIT LOG] Failed to record audit log:', err);
  }
}
