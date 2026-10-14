import { UserRole } from '../types/supabase';

/**
 * Role-Based Access Control (RBAC) frontend UI permission helpers.
 * Simplified 2-Role System: 'admin' and 'user'.
 * Note: Real database security is strictly enforced by Supabase Row Level Security (RLS).
 */

export function canManageUsers(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function canDeleteRecords(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function canEditStations(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function canImportExcel(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canExportData(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canCreateMaintenanceRequest(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canEditMaintenanceRequest(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canManageInspections(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canManageIncidents(role?: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canViewAuditLogs(role?: UserRole | null): boolean {
  return role === 'admin';
}

export function isAdmin(role?: UserRole | null): boolean {
  return role === 'admin';
}
