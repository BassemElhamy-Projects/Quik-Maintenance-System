/**
 * Utility functions and constants for Month + Year filtering
 * and dynamic year generation across Quik Maintenance System.
 */

export interface MonthOption {
  value: string;
  label: string;
}

export const MONTH_OPTIONS: MonthOption[] = [
  { value: 'all', label: 'كل الشهور' },
  { value: '1', label: 'يناير' },
  { value: '2', label: 'فبراير' },
  { value: '3', label: 'مارس' },
  { value: '4', label: 'أبريل' },
  { value: '5', label: 'مايو' },
  { value: '6', label: 'يونيو' },
  { value: '7', label: 'يوليو' },
  { value: '8', label: 'أغسطس' },
  { value: '9', label: 'سبتمبر' },
  { value: '10', label: 'أكتوبر' },
  { value: '11', label: 'نوفمبر' },
  { value: '12', label: 'ديسمبر' }
];

/**
 * Dynamically generates the list of available years.
 * Generates a comprehensive range from 2020 through at least 2050.
 *
 * Rules:
 * - Start year is 2020
 * - End year is at least 2050, or (currentYear + 5) if currentYear progresses beyond 2045
 * - Automatically includes any custom/earlier/later years present in the dataset
 * - Sorted ascending (2020, 2021, 2022, ... 2050)
 */
export function getDynamicYearOptions(dates?: Array<string | undefined | null>): string[] {
  const currentYear = new Date().getFullYear();
  const startYear = 2020;
  const endYear = Math.max(2050, currentYear + 5);

  const yearSet = new Set<number>();

  // Add all standard years from 2020 to endYear (at least 2050)
  for (let y = startYear; y <= endYear; y++) {
    yearSet.add(y);
  }

  // Include any extra years from existing data if outside this range
  if (dates && Array.isArray(dates)) {
    for (const dateStr of dates) {
      if (!dateStr || typeof dateStr !== 'string') continue;
      const trimmed = dateStr.trim();

      // 1. Try regex extraction of 4-digit year
      const match = trimmed.match(/\b((?:19|20|21)\d\d)\b/);
      if (match) {
        const y = parseInt(match[1], 10);
        if (y >= 1990 && y <= 2100) {
          yearSet.add(y);
          continue;
        }
      }

      // 2. Try standard Date parsing
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        if (y >= 1990 && y <= 2100) {
          yearSet.add(y);
        }
      }
    }
  }

  return Array.from(yearSet).sort((a, b) => a - b).map(String);
}

/**
 * Extracts month (1-12) and year from any valid record date string.
 */
export function parseDateMonthAndYear(dateStr?: string | null): { month: number; year: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '---') return null;

  // 1. Check YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    if (y >= 2000 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }

  // 2. Check DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const m = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    if (y >= 2000 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }

  // 3. Fallback to JavaScript Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1
    };
  }

  return null;
}

/**
 * Matches a business record date against independent month and year filter values.
 *
 * @param recordDate The actual business date of the record
 * @param selectedMonth 'all' or '1'..'12'
 * @param selectedYear 'all' or '2026', '2027', etc.
 */
export function matchMonthAndYear(
  recordDate: string | undefined | null,
  selectedMonth: string,
  selectedYear: string
): boolean {
  // If both are "all", include everything
  if (selectedMonth === 'all' && selectedYear === 'all') {
    return true;
  }

  const parsed = parseDateMonthAndYear(recordDate);
  if (!parsed) {
    // If user filtered by specific month or year, but record has no parseable date, exclude it
    return false;
  }

  if (selectedYear !== 'all' && parsed.year.toString() !== selectedYear) {
    return false;
  }

  if (selectedMonth !== 'all' && parsed.month.toString() !== selectedMonth) {
    return false;
  }

  return true;
}
