import { OFFICIAL_STATIONS } from '../data/officialStations';

export interface StationItemIdentifiable {
  stationId?: string;
  stationCode?: string;
  stationName?: string;
  id?: string;
  code?: string;
  name?: string;
}

/**
 * Resolves any station identifier (code, ID, or name) to its canonical official station code if possible.
 * Returns exact normalized string.
 */
export function resolveOfficialStationCode(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  if (!s || s === 'all') return null;

  // 1. Direct exact match by ID, Code, or Name in OFFICIAL_STATIONS
  const directMatch = OFFICIAL_STATIONS.find(
    st => st.id === s || st.code === s || st.name === s
  );
  if (directMatch) return directMatch.code;

  // 2. Handle 'st-X' or 'stX' format (e.g. 'st-1' -> '1', 'st-10' -> '10')
  const stIdMatch = s.match(/^st-?(\d+)$/i);
  if (stIdMatch) {
    const num = stIdMatch[1];
    const match = OFFICIAL_STATIONS.find(
      st => st.code === num || parseInt(st.code, 10) === parseInt(num, 10)
    );
    if (match) return match.code;
  }

  // 3. Handle pure numbers or padded numbers (e.g. '01' -> '1', '10' -> '10')
  if (/^\d+$/.test(s)) {
    const numStr = parseInt(s, 10).toString();
    const match = OFFICIAL_STATIONS.find(st => st.code === numStr);
    if (match) return match.code;
  }

  // 4. Exact match with common prefixes (e.g. "محطة 1", "كويك - 1", "محطة كويك - 1 أبها")
  for (const st of OFFICIAL_STATIONS) {
    if (
      s === `محطة ${st.code}` ||
      s === `محطة ${st.name}` ||
      s === `كويك - ${st.code}` ||
      s === `كويك ${st.code}`
    ) {
      return st.code;
    }
  }

  return s;
}

/**
 * Strict station matching helper.
 * Uses exact equality on resolved station codes/IDs/names.
 * NEVER uses substring, includes, or fuzzy matching.
 */
export function matchesStrictStationFilter(
  item: StationItemIdentifiable | string | undefined,
  targetFilter?: string
): boolean {
  if (!targetFilter || targetFilter === 'all') return true;
  if (!item) return false;

  const filterCode = resolveOfficialStationCode(targetFilter) || targetFilter.trim();

  if (typeof item === 'string') {
    const itemCode = resolveOfficialStationCode(item) || item.trim();
    return itemCode === filterCode;
  }

  const codeVal = item.stationCode || item.code;
  const idVal = item.stationId || item.id;
  const nameVal = item.stationName || item.name;

  if (!codeVal && !idVal && !nameVal) return false;

  const itemCode =
    resolveOfficialStationCode(codeVal) ||
    resolveOfficialStationCode(idVal) ||
    resolveOfficialStationCode(nameVal) ||
    (codeVal || idVal || nameVal || '').trim();

  return itemCode === filterCode;
}
