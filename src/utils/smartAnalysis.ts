import { MaintenanceRequest, SectionType, MaintenanceStatus } from '../types';

/**
 * Normalizes Arabic text for robust, lightweight local comparison.
 * Strips diacritics, normalizes letter variants (أ إ آ -> ا, ة -> ه, ى -> ي),
 * removes punctuation, and standardizes spacing.
 */
export function normalizeArabicText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    .trim()
    .toLowerCase()
    // Remove Arabic Tashkeel / Harakat
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize Alef variants to bare Alef
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Taa Marbouta to Haa
    .replace(/ة/g, 'ه')
    // Normalize Alif Maqsura to Yaa
    .replace(/ى/g, 'ي')
    // Normalize Hamza variants
    .replace(/[ؤئء]/g, 'ء')
    // Remove punctuation, symbols, brackets, quotes
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'«»[\]\\]/g, ' ')
    // Normalize multiple whitespaces to single space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Common Arabic stop-words in maintenance descriptions */
const ARABIC_STOP_WORDS = new Set([
  'في', 'من', 'على', 'الي', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'تم', 'يوجد', 'هناك', 'عند',
  'هو', 'هي', 'ان', 'أن', 'قد', 'التي', 'الذي', 'الذين', 'كان', 'كانت', 'لا', 'ما',
  'بسبب', 'وذلك', 'كل', 'بعد', 'قبل', 'حيث', 'او', 'أو', 'ثم', 'لكن', 'طلب', 'عمل'
]);

/**
 * Tokenizes text and removes stop-words and handles common prefixes (like 'ال').
 */
export function tokenizeArabic(text: string): string[] {
  const normalized = normalizeArabicText(text);
  if (!normalized) return [];

  const rawTokens = normalized.split(/\s+/);
  const cleanTokens: string[] = [];

  for (const token of rawTokens) {
    if (token.length < 2) continue;
    if (ARABIC_STOP_WORDS.has(token)) continue;

    // Remove leading 'ال' prefix if token is long enough (e.g. المضخة -> مضخه)
    let stemmed = token;
    if (stemmed.startsWith('ال') && stemmed.length > 4) {
      stemmed = stemmed.substring(2);
    }

    if (stemmed.length >= 2 && !ARABIC_STOP_WORDS.has(stemmed)) {
      cleanTokens.push(stemmed);
    }
  }

  return cleanTokens;
}

/**
 * Calculates Jaccard Token Similarity (0.0 to 1.0) between two texts.
 */
export function calculateJaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...tokensA, ...tokensB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Calculates character bigram Dice coefficient for fuzzy partial matching.
 */
export function calculateBigramSimilarity(strA: string, strB: string): number {
  const sA = normalizeArabicText(strA).replace(/\s+/g, '');
  const sB = normalizeArabicText(strB).replace(/\s+/g, '');

  if (sA.length < 2 || sB.length < 2) return sA === sB ? 1 : 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < sA.length - 1; i++) {
    const bg = sA.substring(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < sB.length - 1; i++) {
    const bg = sB.substring(i, i + 2);
    const count = bigramsA.get(bg) || 0;
    if (count > 0) {
      matches++;
      bigramsA.set(bg, count - 1);
    }
  }

  return (2.0 * matches) / (sA.length - 1 + sB.length - 1);
}

export interface DuplicateMatchResult {
  request: MaintenanceRequest;
  similarityPercentage: number;
  reason: string;
  isSameStation: boolean;
  isSameSection: boolean;
  isOpenStatus: boolean;
}

/**
 * Checks existing maintenance records for potential duplicates or highly similar records.
 */
export function findSimilarMaintenanceRequests(
  newDraft: {
    stationId?: string;
    stationName?: string;
    section?: string;
    problemDescription?: string;
    requestType?: string;
    maintenanceType?: string;
  },
  existingRequests: MaintenanceRequest[],
  excludeId?: string,
  minThreshold: number = 38
): DuplicateMatchResult[] {
  const problemDesc = newDraft.problemDescription?.trim() || '';
  if (problemDesc.length < 5) return [];

  const draftTokens = tokenizeArabic(problemDesc);
  if (draftTokens.length === 0) return [];

  const results: DuplicateMatchResult[] = [];

  for (const req of existingRequests) {
    if (excludeId && req.id === excludeId) continue;
    if (!req.problemDescription) continue;

    const reqTokens = tokenizeArabic(req.problemDescription);
    if (reqTokens.length === 0) continue;

    // Check station match
    const isSameStation = Boolean(
      newDraft.stationId &&
      req.stationId &&
      newDraft.stationId !== 'unmatched' &&
      (newDraft.stationId === req.stationId ||
        (newDraft.stationName && req.stationName && newDraft.stationName === req.stationName))
    );

    // Check section match
    const isSameSection = Boolean(newDraft.section && req.section && newDraft.section === req.section);

    // If both station and section differ completely, require higher similarity
    if (!isSameStation && !isSameSection) {
      // Skip comparing completely unrelated station/section unless exact text
      const jaccard = calculateJaccardSimilarity(draftTokens, reqTokens);
      if (jaccard < 0.7) continue;
    }

    const jaccardScore = calculateJaccardSimilarity(draftTokens, reqTokens);
    const bigramScore = calculateBigramSimilarity(problemDesc, req.problemDescription);

    // Weighted similarity
    let combinedScore = jaccardScore * 0.65 + bigramScore * 0.35;

    // Boost score if same station and same section
    if (isSameStation && isSameSection) {
      combinedScore = Math.min(1.0, combinedScore * 1.25);
    } else if (isSameStation) {
      combinedScore = Math.min(1.0, combinedScore * 1.1);
    }

    const percentage = Math.round(combinedScore * 100);

    if (percentage >= minThreshold) {
      const isOpenStatus = req.status === 'جديد' || req.status === 'جاري العمل';
      
      let reason = 'تشابه في تفاصيل ووصف المشكلة';
      if (isSameStation && isSameSection && isOpenStatus) {
        reason = 'طلب مفتوح بنفس المحطة والقسم بتفاصيل متطابقة';
      } else if (isSameStation && isSameSection) {
        reason = 'طلب سابق بنفس المحطة والقسم بوصف مماثل';
      } else if (isSameStation) {
        reason = 'طلب بنفس المحطة بوصف مشابه';
      }

      results.push({
        request: req,
        similarityPercentage: percentage,
        reason,
        isSameStation,
        isSameSection,
        isOpenStatus
      });
    }
  }

  // Sort: Open status first, then highest similarity, then most recent date
  return results.sort((a, b) => {
    if (a.isOpenStatus !== b.isOpenStatus) {
      return a.isOpenStatus ? -1 : 1;
    }
    if (b.similarityPercentage !== a.similarityPercentage) {
      return b.similarityPercentage - a.similarityPercentage;
    }
    return new Date(b.request.date || 0).getTime() - new Date(a.request.date || 0).getTime();
  });
}

// --------------------------------------------------------------------------
// RECURRING MAINTENANCE ISSUE ANALYSIS (FEATURE 2)
// --------------------------------------------------------------------------

export interface MaintenanceInsight {
  id: string;
  type: 'station_frequency' | 'equipment_recurring' | 'post_maintenance' | 'section_spike';
  title: string;
  stationId?: string;
  stationName: string;
  stationCode?: string;
  section: 'pumps' | 'tanks' | 'facilities';
  sectionName: string;
  count: number;
  periodText: string;
  explanation: string;
  severity: 'warning' | 'info';
  matchingRequestIds: string[];
  equipmentKeyword?: string;
}

const COMMON_EQUIPMENT_KEYWORDS = [
  // Pumps
  { word: 'مسدس', name: 'مسدسات الوقود', section: 'pumps' as const },
  { word: 'طلمبه', name: 'طلمبات ومضخات الوقود', section: 'pumps' as const },
  { word: 'مضخه', name: 'مضخات الوقود', section: 'pumps' as const },
  { word: 'عداد', name: 'شاشات وعدادات اللترات', section: 'pumps' as const },
  { word: 'شاشه', name: 'شاشات العرض الرقمية', section: 'pumps' as const },
  { word: 'تسريب', name: 'تسريب وتهريب الوقود', section: 'pumps' as const },
  { word: 'فلتر', name: 'فلاتر المضخات', section: 'pumps' as const },
  { word: 'لي', name: 'ليات وخراطيم التعبئة', section: 'pumps' as const },
  { word: 'ليات', name: 'ليات وخراطيم التعبئة', section: 'pumps' as const },

  // Tanks
  { word: 'غطاس', name: 'غطاسات الخزانات', section: 'tanks' as const },
  { word: 'عوامه', name: 'عوامات وحساسات المنسوب', section: 'tanks' as const },
  { word: 'حساس', name: 'حساسات ومنظومات القياس', section: 'tanks' as const },
  { word: 'تفريغ', name: 'فتحات ومحابس التفريغ', section: 'tanks' as const },
  { word: 'محبس', name: 'محابس وصمامات الأمان', section: 'tanks' as const },

  // Facilities
  { word: 'اناره', name: 'منظومة الإضاءة والإنارة', section: 'facilities' as const },
  { word: 'اضاءه', name: 'كشافات وإضاءة الساحات', section: 'facilities' as const },
  { word: 'كهرباء', name: 'لوحات وقواطع الكهرباء', section: 'facilities' as const },
  { word: 'مياه', name: 'شبكة ومضخات المياه', section: 'facilities' as const },
  { word: 'مظله', name: 'المظلات والساحات', section: 'facilities' as const },
  { word: 'مسجد', name: 'مرافق ومصلى المحطة', section: 'facilities' as const },
  { word: 'لوحه', name: 'لوحات التحكم والتوزيع', section: 'facilities' as const }
];

const SECTION_AR_NAMES: Record<'pumps' | 'tanks' | 'facilities', string> = {
  pumps: 'قسم المضخات',
  tanks: 'قسم الخزانات',
  facilities: 'قسم المرافق والساحات'
};

/**
 * Analyzes real maintenance requests to find genuine recurring issues, pattern frequencies,
 * and high-demand stations without inventing any data.
 */
export function analyzeRecurringMaintenancePatterns(
  requests: MaintenanceRequest[],
  selectedStationFilter: string = 'all'
): MaintenanceInsight[] {
  if (!requests || requests.length === 0) return [];

  const insights: MaintenanceInsight[] = [];

  // Group requests by Station + Section
  const stationSectionMap = new Map<string, MaintenanceRequest[]>();

  for (const req of requests) {
    if (!req.stationName || req.stationName === 'غير محددة' || req.stationId === 'unmatched') {
      continue;
    }
    const key = `${req.stationName}||${req.section}`;
    const list = stationSectionMap.get(key) || [];
    list.push(req);
    stationSectionMap.set(key, list);
  }

  // 1. Detect High Frequency in Same Station + Section (>= 3 requests)
  stationSectionMap.forEach((reqs, key) => {
    if (reqs.length >= 3) {
      const [stationName, section] = key.split('||') as [string, 'pumps' | 'tanks' | 'facilities'];
      const sample = reqs[0];

      // If user filtered by station, only match that station
      if (selectedStationFilter !== 'all' && selectedStationFilter !== stationName && selectedStationFilter !== sample.stationId) {
        return;
      }

      const openCount = reqs.filter(r => r.status === 'جديد' || r.status === 'جاري العمل').length;
      const sectionLabel = SECTION_AR_NAMES[section] || 'قسم الصيانة';

      insights.push({
        id: `freq-${stationName}-${section}`,
        type: 'station_frequency',
        title: `تكرار ملحوظ في ${sectionLabel}`,
        stationId: sample.stationId,
        stationName: stationName,
        stationCode: sample.stationCode,
        section,
        sectionName: sectionLabel,
        count: reqs.length,
        periodText: 'خلال الفترة المحددة',
        explanation: `سجلت ${stationName} عدد ${reqs.length} طلبات صيانة في ${sectionLabel}${openCount > 0 ? ` (منها ${openCount} طلبات نشطة حالياً)` : ''}، مما يستدعي إجراء مراجعة وقائية شاملة.`,
        severity: openCount >= 2 ? 'warning' : 'info',
        matchingRequestIds: reqs.map(r => r.id)
      });
    }
  });

  // 2. Detect Specific Component / Equipment Recurring Patterns across Station Requests
  const stationGroupMap = new Map<string, MaintenanceRequest[]>();
  for (const req of requests) {
    if (!req.stationName || req.stationName === 'غير محددة' || req.stationId === 'unmatched') continue;
    const list = stationGroupMap.get(req.stationName) || [];
    list.push(req);
    stationGroupMap.set(req.stationName, list);
  }

  stationGroupMap.forEach((stationReqs, stationName) => {
    if (selectedStationFilter !== 'all' && selectedStationFilter !== stationName && selectedStationFilter !== stationReqs[0]?.stationId) {
      return;
    }

    for (const eq of COMMON_EQUIPMENT_KEYWORDS) {
      const normalizedKeyword = normalizeArabicText(eq.word);
      const matched = stationReqs.filter(r => {
        if (r.section !== eq.section) return false;
        const normalizedDesc = normalizeArabicText(r.problemDescription || '');
        return normalizedDesc.includes(normalizedKeyword);
      });

      // If same equipment keyword appears 2+ times in the same station
      if (matched.length >= 2) {
        // Avoid duplicate insight if already covered by station frequency with exact same IDs
        const existingFreq = insights.find(
          i => i.stationName === stationName && i.section === eq.section && i.type === 'equipment_recurring' && i.equipmentKeyword === eq.name
        );
        if (!existingFreq) {
          insights.push({
            id: `eq-${stationName}-${eq.section}-${eq.word}`,
            type: 'equipment_recurring',
            title: `نمط متكرر: أعطال ${eq.name}`,
            stationId: matched[0].stationId,
            stationName,
            stationCode: matched[0].stationCode,
            section: eq.section,
            sectionName: SECTION_AR_NAMES[eq.section],
            count: matched.length,
            periodText: 'ضمن السجلات المسجلة',
            explanation: `رصد نمط متكرر مرتبط بـ (${eq.name}) في ${stationName} بعدد ${matched.length} بلاغات مشابهة.`,
            severity: matched.length >= 3 ? 'warning' : 'info',
            matchingRequestIds: matched.map(r => r.id),
            equipmentKeyword: eq.name
          });
        }
      }
    }
  });

  // 3. Detect repeated requests shortly after completion (Post-Maintenance Re-open/Failure)
  stationGroupMap.forEach((stationReqs, stationName) => {
    if (selectedStationFilter !== 'all' && selectedStationFilter !== stationName && selectedStationFilter !== stationReqs[0]?.stationId) {
      return;
    }

    const sortedByDate = [...stationReqs].sort(
      (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
    );

    for (let i = 0; i < sortedByDate.length - 1; i++) {
      const first = sortedByDate[i];
      const second = sortedByDate[i + 1];

      if (first.section === second.section && first.status === 'تم' && (second.status === 'جديد' || second.status === 'جاري العمل')) {
        const d1 = new Date(first.closingDate || first.date || 0).getTime();
        const d2 = new Date(second.date || 0).getTime();
        const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 14) {
          const insightId = `post-${stationName}-${first.id}-${second.id}`;
          if (!insights.some(x => x.stationName === stationName && x.type === 'post_maintenance')) {
            insights.push({
              id: insightId,
              type: 'post_maintenance',
              title: `تكرار صيانة في فترة وجيزة (${SECTION_AR_NAMES[second.section]})`,
              stationId: second.stationId,
              stationName,
              stationCode: second.stationCode,
              section: second.section,
              sectionName: SECTION_AR_NAMES[second.section],
              count: 2,
              periodText: `خلال ${diffDays === 0 ? 'نفس اليوم' : `${diffDays} أيام`}`,
              explanation: `تم تسجيل طلب صيانة جديد (${second.requestNumber}) بعد ${diffDays === 0 ? 'ساعات قليلة من' : `${diffDays} أيام من`} إغلاق طلب الصيانة السابق (${first.requestNumber}) في ${stationName}.`,
              severity: 'warning',
              matchingRequestIds: [first.id, second.id]
            });
          }
        }
      }
    }
  });

  // Sort insights: warnings first, then higher count
  return insights.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'warning' ? -1 : 1;
    }
    return b.count - a.count;
  }).slice(0, 6); // Keep top 6 actionable insights to avoid clutter
}
