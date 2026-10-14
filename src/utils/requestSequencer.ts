import { MaintenanceRequest, InternalInspection, IncidentRecord, AppData } from '../types';

/**
 * Utility for independent sequential numeric numbering & migration per section.
 * Sequence starts at 1 for each section (Pumps, Tanks, Facilities, Inspections, Incidents).
 * Allows identical request numbers across different sections (e.g., Pumps #1, Tanks #1, Facilities #1).
 * Guarantees zero duplicate request numbers within the SAME section.
 */

/**
 * Parses valid numeric request/report numbers.
 * Returns a positive integer if `val` is or contains a valid numeric sequence number.
 * Returns null for invalid or missing values like "", "---", undefined, "ABC", etc.
 */
export function parseValidRequestNumber(val?: string | null): number | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '---') return null;

  // Pure numeric string (e.g. "1", "2", "10", "100")
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    return isNaN(num) || num <= 0 ? null : num;
  }

  // Legacy or prefixed numeric string (e.g. REQ-5, REQ-2026-005, INS-2026-001, INC-001) - extract trailing integer
  const match = trimmed.match(/(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return isNaN(num) || num <= 0 ? null : num;
  }

  return null;
}

/**
 * Normalizes any request number into a clean unpadded numeric string (e.g. "1", "2", "3").
 * Converts legacy formats like "REQ-PUMP-T1-001", "001", "INS-2026-001", "INC-01" into pure numeric string.
 */
export function sanitizeRequestNumber(val?: string | null): string {
  const parsed = parseValidRequestNumber(val);
  if (parsed !== null) {
    return parsed.toString();
  }
  return val ? val.trim() : '';
}

/**
 * Finds the highest existing numeric request number for a specific maintenance section.
 * If targetSection is omitted, checks across all provided requests.
 */
export function getHighestRequestNumberForSection(
  requests: Array<{ requestNumber?: string; section?: string }>,
  targetSection?: string
): number {
  let max = 0;
  if (!Array.isArray(requests)) return 0;

  for (const req of requests) {
    if (!targetSection || req.section === targetSection) {
      const parsed = parseValidRequestNumber(req?.requestNumber);
      if (parsed !== null && parsed > max) {
        max = parsed;
      }
    }
  }

  return max;
}

/**
 * Backwards-compatible alias for getHighestRequestNumberForSection
 */
export function getHighestRequestNumber(
  requests: Array<{ requestNumber?: string; section?: string }>,
  targetSection?: string
): number {
  return getHighestRequestNumberForSection(requests, targetSection);
}

/**
 * Generates the next sequential numeric maintenance request number (starting at "1") for a specific section.
 * Calculates ONLY from records belonging to that section.
 * If request #3 is deleted from [1,2,3,4,5], max is 5, so next generated number is 6 (never reuses 3).
 */
export function getNextMaintenanceRequestNumber(
  requests: Array<{ requestNumber?: string; section?: string }>,
  targetSection?: string
): string {
  const highest = getHighestRequestNumberForSection(requests, targetSection);
  return (highest + 1).toString();
}

/**
 * Generic alias for section request number generation
 */
export function getNextRequestNumber(
  requests: Array<{ requestNumber?: string; section?: string }>,
  section?: string
): string {
  return getNextMaintenanceRequestNumber(requests, section);
}

/**
 * Finds the highest existing numeric inspection number across all periodic inspections.
 */
export function getHighestInspectionNumber(inspections: Array<{ inspectionNumber?: string }>): number {
  let max = 0;
  if (!Array.isArray(inspections)) return 0;

  for (const ins of inspections) {
    const parsed = parseValidRequestNumber(ins?.inspectionNumber);
    if (parsed !== null && parsed > max) {
      max = parsed;
    }
  }

  return max;
}

/**
 * Generates the next sequential numeric inspection number (starting at "1").
 */
export function getNextInspectionNumber(inspections: Array<{ inspectionNumber?: string }>): string {
  const highest = getHighestInspectionNumber(inspections);
  return (highest + 1).toString();
}

/**
 * Finds the highest existing numeric incident report number across all incident records.
 */
export function getHighestIncidentNumber(incidents: Array<{ incidentNumber?: string }>): number {
  let max = 0;
  if (!Array.isArray(incidents)) return 0;

  for (const inc of incidents) {
    const parsed = parseValidRequestNumber(inc?.incidentNumber);
    if (parsed !== null && parsed > max) {
      max = parsed;
    }
  }

  return max;
}

/**
 * Generates the next sequential numeric incident report number (starting at "1").
 */
export function getNextIncidentNumber(incidents: Array<{ incidentNumber?: string }>): string {
  const highest = getHighestIncidentNumber(incidents);
  return (highest + 1).toString();
}

/**
 * Section Migration Statistics Interface
 */
export interface SectionStats {
  section: string;
  totalRecords: number;
  duplicateCountBefore: number;
  duplicateCountAfter: number;
  minNumber: number;
  maxNumber: number;
  nextNumber: number;
}

/**
 * Normalization Result for Maintenance Requests
 */
export interface NormalizationResult {
  normalized: MaintenanceRequest[];
  totalRecords: number;
  changedCount: number;
  duplicateCountBefore: number;
  sectionStats: Record<string, SectionStats>;
}

/**
 * Sort helper for deterministic renumbering
 */
function sortRecordsDeterministically<T extends { date?: string; createdAt?: string; id?: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    // 1. Date ascending
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    // 2. CreatedAt timestamp ascending
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    if (createdA !== createdB) {
      return createdA.localeCompare(createdB);
    }

    // 3. Stable ID tie-breaker
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Safe Existing Data Migration & Renumbering for Maintenance Requests
 * 
 * Renumbers records INDEPENDENTLY per section (Pumps: 1..N, Tanks: 1..N, Facilities: 1..N).
 * Preserves ALL other record fields completely unchanged.
 */
export function normalizeAndRenumberMaintenanceRequests(
  requests: MaintenanceRequest[]
): NormalizationResult {
  if (!Array.isArray(requests) || requests.length === 0) {
    return {
      normalized: [],
      totalRecords: 0,
      changedCount: 0,
      duplicateCountBefore: 0,
      sectionStats: {}
    };
  }

  const sections = ['pumps', 'tanks', 'facilities'];
  // Also collect any other dynamic section if present
  const allSectionsSet = new Set(sections);
  requests.forEach(r => {
    if (r.section) allSectionsSet.add(r.section);
  });

  const allSections = Array.from(allSectionsSet);
  const normalizedAll: MaintenanceRequest[] = [];
  let totalChangedCount = 0;
  let totalDuplicatesBefore = 0;
  const sectionStats: Record<string, SectionStats> = {};

  for (const sec of allSections) {
    const secRequests = requests.filter(r => (r.section || 'pumps') === sec);
    if (secRequests.length === 0) continue;

    // Count duplicate numbers within this section before migration
    const numberCountMap = new Map<string, number>();
    let secDuplicatesBefore = 0;

    for (const r of secRequests) {
      const rawNum = r.requestNumber ? r.requestNumber.trim() : '';
      if (rawNum) {
        const count = numberCountMap.get(rawNum) || 0;
        if (count === 1) {
          secDuplicatesBefore += 1;
        }
        numberCountMap.set(rawNum, count + 1);
      } else {
        secDuplicatesBefore += 1;
      }
    }

    totalDuplicatesBefore += secDuplicatesBefore;

    // Sort deterministically
    const sorted = sortRecordsDeterministically(secRequests);

    // Renumber starting from 1 for this section
    const renumbered = sorted.map((req, index) => {
      const assignedNumber = (index + 1).toString();
      if (req.requestNumber !== assignedNumber) {
        totalChangedCount++;
      }
      return {
        ...req,
        requestNumber: assignedNumber
      };
    });

    normalizedAll.push(...renumbered);

    sectionStats[sec] = {
      section: sec,
      totalRecords: renumbered.length,
      duplicateCountBefore: secDuplicatesBefore,
      duplicateCountAfter: 0,
      minNumber: renumbered.length > 0 ? 1 : 0,
      maxNumber: renumbered.length,
      nextNumber: renumbered.length + 1
    };
  }

  return {
    normalized: normalizedAll,
    totalRecords: normalizedAll.length,
    changedCount: totalChangedCount,
    duplicateCountBefore: totalDuplicatesBefore,
    sectionStats
  };
}

/**
 * Safe Migration & Renumbering for Periodic Inspections (1..N)
 */
export function normalizeAndRenumberInspections(inspections: InternalInspection[]): {
  normalized: InternalInspection[];
  totalRecords: number;
  duplicateCountBefore: number;
  duplicateCountAfter: number;
  minNumber: number;
  maxNumber: number;
  nextNumber: number;
} {
  if (!Array.isArray(inspections) || inspections.length === 0) {
    return {
      normalized: [],
      totalRecords: 0,
      duplicateCountBefore: 0,
      duplicateCountAfter: 0,
      minNumber: 0,
      maxNumber: 0,
      nextNumber: 1
    };
  }

  const numberCountMap = new Map<string, number>();
  let duplicateCountBefore = 0;

  for (const ins of inspections) {
    const rawNum = ins.inspectionNumber ? ins.inspectionNumber.trim() : '';
    if (rawNum) {
      const count = numberCountMap.get(rawNum) || 0;
      if (count === 1) duplicateCountBefore++;
      numberCountMap.set(rawNum, count + 1);
    } else {
      duplicateCountBefore++;
    }
  }

  const sorted = sortRecordsDeterministically(inspections);
  const normalized = sorted.map((ins, index) => ({
    ...ins,
    inspectionNumber: (index + 1).toString()
  }));

  return {
    normalized,
    totalRecords: normalized.length,
    duplicateCountBefore,
    duplicateCountAfter: 0,
    minNumber: normalized.length > 0 ? 1 : 0,
    maxNumber: normalized.length,
    nextNumber: normalized.length + 1
  };
}

/**
 * Safe Migration & Renumbering for Incident Records (1..N)
 */
export function normalizeAndRenumberIncidents(incidents: IncidentRecord[]): {
  normalized: IncidentRecord[];
  totalRecords: number;
  duplicateCountBefore: number;
  duplicateCountAfter: number;
  minNumber: number;
  maxNumber: number;
  nextNumber: number;
} {
  if (!Array.isArray(incidents) || incidents.length === 0) {
    return {
      normalized: [],
      totalRecords: 0,
      duplicateCountBefore: 0,
      duplicateCountAfter: 0,
      minNumber: 0,
      maxNumber: 0,
      nextNumber: 1
    };
  }

  const numberCountMap = new Map<string, number>();
  let duplicateCountBefore = 0;

  for (const inc of incidents) {
    const rawNum = inc.incidentNumber ? inc.incidentNumber.trim() : '';
    if (rawNum) {
      const count = numberCountMap.get(rawNum) || 0;
      if (count === 1) duplicateCountBefore++;
      numberCountMap.set(rawNum, count + 1);
    } else {
      duplicateCountBefore++;
    }
  }

  const sorted = sortRecordsDeterministically(incidents);
  const normalized = sorted.map((inc, index) => ({
    ...inc,
    incidentNumber: (index + 1).toString()
  }));

  return {
    normalized,
    totalRecords: normalized.length,
    duplicateCountBefore,
    duplicateCountAfter: 0,
    minNumber: normalized.length > 0 ? 1 : 0,
    maxNumber: normalized.length,
    nextNumber: normalized.length + 1
  };
}

/**
 * Full Database Migration & Renumbering Helper
 */
export function normalizeAndRenumberEntireDatabase(data: AppData): {
  data: AppData;
  report: {
    pumps: SectionStats;
    tanks: SectionStats;
    facilities: SectionStats;
    inspections: SectionStats;
    incidents: SectionStats;
  };
} {
  const maintRes = normalizeAndRenumberMaintenanceRequests(data.maintenanceRequests || []);
  const insRes = normalizeAndRenumberInspections(data.inspections || []);
  const incRes = normalizeAndRenumberIncidents(data.incidents || []);

  const pumpsStats = maintRes.sectionStats['pumps'] || {
    section: 'pumps',
    totalRecords: 0,
    duplicateCountBefore: 0,
    duplicateCountAfter: 0,
    minNumber: 0,
    maxNumber: 0,
    nextNumber: 1
  };

  const tanksStats = maintRes.sectionStats['tanks'] || {
    section: 'tanks',
    totalRecords: 0,
    duplicateCountBefore: 0,
    duplicateCountAfter: 0,
    minNumber: 0,
    maxNumber: 0,
    nextNumber: 1
  };

  const facStats = maintRes.sectionStats['facilities'] || {
    section: 'facilities',
    totalRecords: 0,
    duplicateCountBefore: 0,
    duplicateCountAfter: 0,
    minNumber: 0,
    maxNumber: 0,
    nextNumber: 1
  };

  const inspectionsStats: SectionStats = {
    section: 'inspections',
    totalRecords: insRes.totalRecords,
    duplicateCountBefore: insRes.duplicateCountBefore,
    duplicateCountAfter: insRes.duplicateCountAfter,
    minNumber: insRes.minNumber,
    maxNumber: insRes.maxNumber,
    nextNumber: insRes.nextNumber
  };

  const incidentsStats: SectionStats = {
    section: 'incidents',
    totalRecords: incRes.totalRecords,
    duplicateCountBefore: incRes.duplicateCountBefore,
    duplicateCountAfter: incRes.duplicateCountAfter,
    minNumber: incRes.minNumber,
    maxNumber: incRes.maxNumber,
    nextNumber: incRes.nextNumber
  };

  return {
    data: {
      stations: data.stations || [],
      maintenanceRequests: maintRes.normalized,
      inspections: insRes.normalized,
      incidents: incRes.normalized
    },
    report: {
      pumps: pumpsStats,
      tanks: tanksStats,
      facilities: facStats,
      inspections: inspectionsStats,
      incidents: incidentsStats
    }
  };
}
