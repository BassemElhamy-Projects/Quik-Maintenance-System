import { normalizeArabicText, tokenizeArabic } from './smartAnalysis';

export interface SmartClassificationSuggestion {
  section?: {
    value: 'pumps' | 'tanks' | 'facilities';
    label: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  requestType?: {
    value: string;
    label: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  maintenanceType?: {
    value: string;
    label: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  priority?: {
    value: 'عادية' | 'متوسطة' | 'عالية' | 'طارئة';
    label: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  equipment?: {
    name: string;
    number?: string | number;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  location?: {
    name: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  safetyRisk?: {
    level: 'high' | 'medium' | 'low' | 'none';
    warningMessage?: string;
    reason?: string;
  };
  hasAnySuggestion: boolean;
  overallConfidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// 1. NEGATION HANDLING
// ---------------------------------------------------------------------------
const NEGATION_PREFIXES = [
  'لا يوجد', 'لا توجد', 'بدون', 'ليس', 'ليست', 'ما فيه', 'مافي', 'غير موجود',
  'غير موجودة', 'بلا', 'خالي من', 'خالية من', 'ما عاد فيه', 'لا'
];

/**
 * Checks if a target keyword or phrase appears in a negated context within the text.
 * E.g., "لا يوجد تسريب" -> isNegated(text, "تسريب") === true
 */
export function isNegated(normalizedText: string, keyword: string): boolean {
  const normKw = normalizeArabicText(keyword);
  if (!normKw) return false;

  for (const neg of NEGATION_PREFIXES) {
    const normNeg = normalizeArabicText(neg);
    // Direct succession: "لا يوجد تسريب"
    if (normalizedText.includes(`${normNeg} ${normKw}`)) return true;
    // With particle: "لا يوجد اي تسريب"
    if (normalizedText.includes(`${normNeg} اي ${normKw}`)) return true;
    if (normalizedText.includes(`${normNeg} اية ${normKw}`)) return true;
    if (normalizedText.includes(`${normNeg} هناك ${normKw}`)) return true;
    if (normalizedText.includes(`${normNeg} به ${normKw}`)) return true;
    if (normalizedText.includes(`${normNeg} فيه ${normKw}`)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 2. SECTION KEYWORDS
// ---------------------------------------------------------------------------
interface KeywordRule<T> {
  target: T;
  label: string;
  weight: number;
  keywords: string[];
}

const SECTION_RULES: KeywordRule<'pumps' | 'tanks' | 'facilities'>[] = [
  {
    target: 'pumps',
    label: 'قسم المضخات',
    weight: 1.2,
    keywords: [
      'مضخه', 'مضخات', 'طلمبه', 'طلمبات', 'طرمبه', 'طرمبات', 'ديسبنسر', 'dispenser',
      'مسدس', 'مسدسات', 'مسدس بنزين', 'مسدس ديزل', 'هوز', 'خراطيم', 'خرطوم', 'لي',
      'ليات', 'لي التعبئه', 'عداد اللترات', 'شاشه المضخه', 'توتالايزر', 'totalizer',
      'بالسر', 'pulser', 'سويفت', 'كيبورد المضخه', 'لوحه المضخه', 'فلتر مضخه',
      'فلاتر مضخات', 'تصفير العداد', 'عيار المضخه', 'معايره المضخه', 'بنزين 91',
      'بنزين 95', 'ديزل', 'اوكتان', 'zva', 'opw', 'tatsuno', 'tokheim', 'gilbarco',
      'موزع وقود', 'صمام مسدس', 'سوسته مسدس', 'حامل المسدس'
    ]
  },
  {
    target: 'tanks',
    label: 'قسم الخزانات',
    weight: 1.3,
    keywords: [
      'خزان', 'خزانات', 'تنك', 'صهريج', 'منهل', 'مناهل', 'منهل تفريغ', 'مناهل تفريغ',
      'تفريغ الوقود', 'تفريغ صهريج', 'غطاس', 'غطاسات', 'stp', 'red jacket', 'fe petro',
      'عوامة', 'عوامات', 'حساس خزان', 'انبوب خزان', 'غطاء خزان', 'بئر خزان', 'بئر المراقبه',
      'monitoring well', 'atg', 'veeder root', 'فيدر روت', 'تسريب خزان', 'تهريب خزان',
      'مستوى الوقود', 'سعة خزان', 'بلف تنفيس', 'vent valve', 'حجرة تفريغ', 'محبس تفريغ',
      'مستوى الخزان', 'فحص ماء بالخزان', 'كثافه الوقود', 'حمايه كاثوديه', 'ماسوره التفريغ'
    ]
  },
  {
    target: 'facilities',
    label: 'قسم المرافق والساحات',
    weight: 1.1,
    keywords: [
      'غرفة الكهرباء', 'غرفه كهرباء', 'حمام', 'حمامات', 'دورة مياه', 'دورات مياه',
      'مغسله', 'مغاسل', 'مسجد', 'مصلى', 'مظله', 'مظلات', 'ساحه', 'ساحات', 'مدخل',
      'مخرج', 'رصيف', 'ارصفه', 'اسفلت', 'بلاط', 'اناره', 'إناره', 'اضاءه', 'إضاءه',
      'كشاف', 'كشافات', 'كشاف مظله', 'لمبه', 'لمبات', 'توتيم', 'totem', 'لوحه الاسعار',
      'لوحه اعلانيه', 'باب', 'ابواب', 'قفل', 'شباك', 'نافذه', 'زجاج', 'الومنيوم',
      'مواقف', 'مبنى', 'اداره', 'تموينات', 'بقاله', 'دهان', 'بويه', 'نظافه', 'براميل',
      'قمامه', 'مياه', 'سباكه', 'محبس ماء', 'ماسوره ماء', 'تصريف', 'بالوعه', 'سيفون',
      'خلاط', 'كاميرات', 'cctv', 'مصدات', 'لوحات ارشاديه', 'مواقف سيارات', 'طفايه حريق'
    ]
  }
];

// ---------------------------------------------------------------------------
// 3. REQUEST TYPE RULES
// ---------------------------------------------------------------------------
const REQUEST_TYPE_RULES: KeywordRule<string>[] = [
  {
    target: 'صيانة تصحيحية',
    label: 'صيانة تصحيحية',
    weight: 1.2,
    keywords: [
      'مشكله', 'مشكلة', 'عطل', 'عطلان', 'خربان', 'تالف', 'كسر', 'مكسور', 'صوت',
      'ضجيج', 'بطيء', 'ضعف', 'محروق', 'لا يضيء', 'لا يفتح', 'لا يقفل', 'مفكوك',
      'تغيير', 'اصلاح', 'تصليح', 'صعوبه', 'معلق', 'سقوط', 'خدش', 'خلل',
      'لا يعمل', 'لا تعمل', 'شاشه سوداء', 'عدم استجابه', 'فصل متكرر', 'مقطوع',
      'يسرب', 'تسريب', 'تهريب', 'تسرب'
    ]
  },
  {
    target: 'صيانة طارئة',
    label: 'صيانة طارئة',
    weight: 1.4,
    keywords: [
      'حريق', 'دخان', 'التماس', 'ماس كهربائي', 'شرار', 'شراره', 'انفجار',
      'توقف كامل', 'متوقفه تماما', 'انقطاع تام', 'زر الطوارئ', 'esd',
      'خطر داهم', 'انسكاب كبير'
    ]
  },
  {
    target: 'صيانة وقائية',
    label: 'صيانة وقائية',
    weight: 1.15,
    keywords: [
      'وقائي', 'وقائيه', 'وقايه', 'استباقي', 'تشحيم', 'تزييت', 'تنظيف فلاتر',
      'فحص وقائي', 'استبدال وقائي', 'صيانه استباقيه', 'تغيير روتيني للجلد'
    ]
  },
  {
    target: 'صيانة دورية',
    label: 'صيانة دورية',
    weight: 1.15,
    keywords: [
      'دوري', 'دوريه', 'جدول', 'شهري', 'سنوي', 'نصف سنوي', 'روتين', 'روتيني',
      'معايره دوريه', 'فحص دوري', 'كشف دوري', 'متابعه دوريه', 'زياره مجدوله'
    ]
  }
];

// ---------------------------------------------------------------------------
// 4. MAINTENANCE TYPE RULES (STRICT EVIDENCE REQUIRED)
// ---------------------------------------------------------------------------
const MAINTENANCE_TYPE_RULES: KeywordRule<string>[] = [
  {
    target: 'كهرباء وميكانيكا',
    label: 'كهرباء وميكانيكا',
    weight: 1.2,
    keywords: [
      'سلك كهرباء', 'سلك', 'اسلاك', 'كيبل', 'كابل', 'كابلات', 'طبلون',
      'قاطع كهربائي', 'قاطع', 'فيوز', 'دينامو', 'موتور', 'محرك', 'سير',
      'بكره', 'لوحه تحكم', 'لوحه الكترونيه', 'دائره كهربائيه', 'التماس',
      'ماس كهربائي', 'محول', 'سويتش'
    ]
  },
  {
    target: 'معايرة وفلاتر',
    label: 'معايرة وفلاتر',
    weight: 1.3,
    keywords: [
      'معايره', 'معايرة', 'عيار', 'فلتر', 'فلاتر', 'فلتر بنزين', 'فلتر ديزل',
      'مكيال', 'دقه العداد', 'زياده لترات', 'نقص لترات', 'شوائب وقود',
      'تصفيه وقود'
    ]
  },
  {
    target: 'إنارة وكهرباء',
    label: 'إنارة وكهرباء',
    weight: 1.25,
    keywords: [
      'اناره', 'إناره', 'اضاءه', 'إضاءه', 'لمبه', 'لمبات', 'كشاف', 'كشافات',
      'كشاف مظله', 'ليد', 'led', 'فلورسنت', 'نيون', 'عمود اناره', 'ضوء',
      'اضواء', 'لوحه مضيئه', 'توتيم اناره'
    ]
  },
  {
    target: 'سباكة وصحي',
    label: 'سباكة وصحي',
    weight: 1.25,
    keywords: [
      'سباكه', 'صحي', 'صنبور', 'حنفيه', 'بزبوز', 'خلاط', 'محبس ماء',
      'ماسوره ماء', 'تسريب ماء', 'مجاري', 'انسداد بالوعه', 'سيفون',
      'خزان ماء', 'لي ماء', 'مضخه ماء'
    ]
  },
  {
    target: 'مدني وإنشاءات',
    label: 'مدني وإنشاءات',
    weight: 1.15,
    keywords: [
      'بلاط', 'سيراميك', 'رصيف', 'ارصفه', 'اسفلت', 'هبوط', 'حفره',
      'مظله حديد', 'حداده', 'لحام', 'بناء', 'مبنى', 'واجهه',
      'مصدات سيارات', 'لوحه اسعار', 'باب', 'ابواب', 'قفل', 'مقبض',
      'مفصلات', 'الومنيوم', 'المنيوم', 'زجاج', 'نافذه', 'شباك',
      'دهان', 'بويه', 'صبغ'
    ]
  },
  {
    target: 'نظافة وخدمات',
    label: 'نظافة وخدمات',
    weight: 1.1,
    keywords: [
      'نظافه', 'غسيل', 'تنظيف', 'قمامه', 'براميل', 'مخلفات', 'كنس',
      'تعقيم', 'اتربه', 'زيوت بالارض', 'تلميع', 'تنظيف ساحه'
    ]
  },
  {
    target: 'أمن وسلامة',
    label: 'أمن وسلامة',
    weight: 1.25,
    keywords: [
      'طفايه حريق', 'طفايه', 'طفايات', 'انذار حريق', 'جهاز انذار',
      'كاميرات مراقبه', 'لوحات سلامه', 'صمام امان', 'مخرج طوارئ'
    ]
  }
];

/**
 * Evaluates a rule set against normalized description tokens and phrases,
 * taking strict account of negations and unambiguous evidence.
 */
function scoreRuleSet<T>(
  normalizedText: string,
  tokens: string[],
  rules: KeywordRule<T>[]
): { bestMatch: KeywordRule<T> | null; confidence: 'high' | 'medium' | 'low'; reason: string } {
  if (!normalizedText || tokens.length === 0) {
    return { bestMatch: null, confidence: 'low', reason: '' };
  }

  const scores = new Map<KeywordRule<T>, number>();
  const matchedWords = new Map<KeywordRule<T>, string[]>();

  for (const rule of rules) {
    let score = 0;
    const wordsFound: string[] = [];

    for (const kw of rule.keywords) {
      const normalizedKw = normalizeArabicText(kw);
      if (!normalizedKw) continue;

      // Skip if negated in text
      if (isNegated(normalizedText, kw)) {
        continue;
      }

      // Multi-word phrase exact match in text (e.g. 'سلك كهرباء', 'غرفة الكهرباء')
      if (normalizedKw.includes(' ')) {
        if (normalizedText.includes(normalizedKw)) {
          score += 6 * rule.weight;
          wordsFound.push(kw);
        }
      } else {
        // Single word token match
        if (tokens.includes(normalizedKw)) {
          score += 3.5 * rule.weight;
          wordsFound.push(kw);
        } else if (normalizedText.includes(normalizedKw) && normalizedKw.length >= 4) {
          score += 2 * rule.weight;
          wordsFound.push(kw);
        }
      }
    }

    if (score > 0) {
      scores.set(rule, score);
      matchedWords.set(rule, wordsFound);
    }
  }

  if (scores.size === 0) {
    return { bestMatch: null, confidence: 'low', reason: '' };
  }

  // Sort scores descending
  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [topRule, topScore] = sorted[0];
  const secondScore = sorted.length > 1 ? sorted[1][1] : 0;

  const words = matchedWords.get(topRule) || [];
  const uniqueWords = Array.from(new Set(words)).slice(0, 3);
  const wordsText = uniqueWords.length > 0 ? ` (استناداً إلى: ${uniqueWords.join('، ')})` : '';

  if (topScore >= 4.0 && (sorted.length === 1 || topScore >= secondScore * 1.3)) {
    return {
      bestMatch: topRule,
      confidence: 'high',
      reason: `تطابق عالي${wordsText}`
    };
  }

  if (topScore >= 2.5) {
    return {
      bestMatch: topRule,
      confidence: 'medium',
      reason: `تطابق مرجّح${wordsText}`
    };
  }

  return {
    bestMatch: topRule,
    confidence: 'low',
    reason: `اقتراح غير مؤكد (يحتاج تحديد)`
  };
}

/**
 * Converts Eastern Arabic numerals (١, ٢, ٣, ...) to standard digits (1, 2, 3, ...)
 */
function standardizeDigits(str: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));
}

/**
 * Extracts equipment details and equipment number if present.
 */
function extractEquipmentDetails(normalizedText: string, originalText: string) {
  const stdText = standardizeDigits(originalText);
  const normStd = normalizeArabicText(stdText);

  let name = '';
  let number: string | number | undefined = undefined;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let reason = '';

  // Extract number associated with equipment: e.g. "مضخة رقم 3", "مسدس المضخة رقم 3", "مضخة 3", "خزان 2"
  const numMatch = stdText.match(/(?:رقم\s*|مضخة\s*|مسدس\s*|خزان\s*|طلمبة\s*)(\d+)/i) ||
                   normStd.match(/(?:رقم\s*|مضخه\s*|مسدس\s*|خزان\s*|طلمبه\s*)(\d+)/);
  if (numMatch && numMatch[1]) {
    number = parseInt(numMatch[1], 10);
  }

  if (normStd.includes('مسدس')) {
    name = 'مسدس تعبئة الوقود';
    confidence = 'high';
    reason = number ? `مسدس تعبئة مرتبط بالمضخة/الموزع رقم ${number}` : 'مسدس تعبئة وقود';
  } else if (normStd.includes('مضخه') || normStd.includes('طلمبه') || normStd.includes('ديسبنسر')) {
    name = 'مضخة وقود';
    confidence = 'high';
    reason = number ? `مضخة الوقود رقم ${number}` : 'مضخة وقود';
  } else if (normStd.includes('خزان') || normStd.includes('صهريج')) {
    name = 'خزان الوقود';
    confidence = 'high';
    reason = number ? `خزان الوقود رقم ${number}` : 'خزان وقود';
  } else if (normStd.includes('سلك') || normStd.includes('كيبل')) {
    name = 'سلك / كابل كهربائي';
    confidence = 'high';
    reason = 'سلك وتمديدات كهربائية';
  } else if (normStd.includes('حساس')) {
    name = 'حساس';
    confidence = 'medium';
    reason = 'حساس (يحتاج تحديد النوع)';
  }

  if (!name) return undefined;

  return {
    name,
    number,
    confidence,
    reason
  };
}

/**
 * Extracts location details if present.
 */
function extractLocationDetails(normalizedText: string) {
  if (normalizedText.includes('غرفه الكهرباء') || normalizedText.includes('غرفة الكهرباء')) {
    return {
      name: 'غرفة الكهرباء',
      confidence: 'high' as const,
      reason: 'غرفة التحكم والتوزيع الكهربائي'
    };
  }
  if (normalizedText.includes('دورة مياه') || normalizedText.includes('دورات مياه') || normalizedText.includes('حمام')) {
    return {
      name: 'مبنى الخدمات / دورات المياه',
      confidence: 'high' as const,
      reason: 'مرافق ودورات المياه'
    };
  }
  if (normalizedText.includes('مظله') || normalizedText.includes('ساحه')) {
    return {
      name: 'ساحة التعبئة / المظلة',
      confidence: 'high' as const,
      reason: 'ساحة المحطة وتحت المظلة'
    };
  }
  return undefined;
}

/**
 * Determines Safety Risk & Priority based on evidence.
 */
function evaluateSafetyAndPriority(normalizedText: string): {
  priority?: { value: 'عادية' | 'متوسطة' | 'عالية' | 'طارئة'; label: string; confidence: 'high' | 'medium' | 'low'; reason: string };
  safetyRisk: { level: 'high' | 'medium' | 'low' | 'none'; warningMessage?: string; reason?: string };
} {
  // Check for negated leak / fire / spark
  const hasFuelLeak = (normalizedText.includes('يسرب') || normalizedText.includes('تسريب') || normalizedText.includes('تهريب')) &&
                      !isNegated(normalizedText, 'تسريب') &&
                      !isNegated(normalizedText, 'تهريب') &&
                      !isNegated(normalizedText, 'يسرب') &&
                      (normalizedText.includes('بنزين') || normalizedText.includes('وقود') || normalizedText.includes('ديزل') || normalizedText.includes('مسدس') || normalizedText.includes('مضخه') || normalizedText.includes('خزان'));

  const hasFireOrHazard = (normalizedText.includes('حريق') || normalizedText.includes('دخان') || normalizedText.includes('التماس') || normalizedText.includes('ماس كهربائي') || normalizedText.includes('انفجار') || (normalizedText.includes('سلك') && normalizedText.includes('مقطوع'))) &&
                          !isNegated(normalizedText, 'حريق') &&
                          !isNegated(normalizedText, 'دخان') &&
                          !isNegated(normalizedText, 'التماس');

  const hasCompleteStoppage = (normalizedText.includes('لا تعمل') || normalizedText.includes('لا يعمل') || normalizedText.includes('توقف كامل') || normalizedText.includes('عطل كلي')) &&
                              !isNegated(normalizedText, 'لا تعمل') &&
                              !isNegated(normalizedText, 'لا يعمل');

  // Emergency level risk
  if (hasFuelLeak) {
    return {
      priority: {
        value: 'طارئة',
        label: 'طارئة (تسريب وقود)',
        confidence: 'high',
        reason: 'تسريب وقود مباشر يشكل خطراً أمنياً واشتعالياً عاجلاً'
      },
      safetyRisk: {
        level: 'high',
        warningMessage: '⚠️ تحذير سلامة عاجل: تم رصد تسريب وقود مباشر. يجب إيقاف المعدة وفصل التغذية واتخاذ تدابير السلامة فوراً.',
        reason: 'تسريب وقود نشط'
      }
    };
  }

  if (hasFireOrHazard) {
    return {
      priority: {
        value: 'طارئة',
        label: 'طارئة (خطر كهربائي/سلامة)',
        confidence: 'high',
        reason: 'خطر كهربائي / حريق يتطلب التدخل الفوري'
      },
      safetyRisk: {
        level: 'high',
        warningMessage: '⚠️ تحذير أمان: رصد خطر كهربائي / تماس / سلك مقطوع. يرجى فصل التيار الكهربائي فوراً لتفادي الصعق أو الحريق.',
        reason: 'خطر كهربائي أو تماسي'
      }
    };
  }

  // High priority stoppage
  if (hasCompleteStoppage) {
    return {
      priority: {
        value: 'عالية',
        label: 'عالية (توقف معدة)',
        confidence: 'high',
        reason: 'المعدة متوقفة عن العمل وتؤثر على الخدمة بالمحطة'
      },
      safetyRisk: {
        level: 'low',
        reason: 'توقف تشغيلي بدون خطر داهم'
      }
    };
  }

  return {
    safetyRisk: { level: 'none' }
  };
}

/**
 * Classifies a maintenance problem description locally and returns field suggestions.
 * Conservative, context-aware, in-memory, robust heuristic classifier.
 */
export function classifyMaintenanceDescription(
  problemDescription: string
): SmartClassificationSuggestion {
  if (!problemDescription || typeof problemDescription !== 'string') {
    return {
      hasAnySuggestion: false,
      overallConfidence: 'low'
    };
  }

  const normalized = normalizeArabicText(problemDescription);
  const tokens = tokenizeArabic(problemDescription);

  // Require at least 1 meaningful token or at least 3 normalized characters
  if (normalized.length < 3 || (tokens.length < 1 && normalized.length < 3)) {
    return {
      hasAnySuggestion: false,
      overallConfidence: 'low'
    };
  }

  // Disallow vague single generic words from triggering random suggestions
  if (normalized === 'مشكله' || normalized === 'عطل' || normalized === 'طلب' || normalized === 'صيانه') {
    return {
      hasAnySuggestion: false,
      overallConfidence: 'low'
    };
  }

  const sectionResult = scoreRuleSet(normalized, tokens, SECTION_RULES);
  const requestTypeResult = scoreRuleSet(normalized, tokens, REQUEST_TYPE_RULES);
  const maintenanceTypeResult = scoreRuleSet(normalized, tokens, MAINTENANCE_TYPE_RULES);
  const equipmentDetails = extractEquipmentDetails(normalized, problemDescription);
  const locationDetails = extractLocationDetails(normalized);
  const safetyAndPriority = evaluateSafetyAndPriority(normalized);

  let hasAny = false;
  let hasHigh = false;
  let hasMedium = false;

  const result: SmartClassificationSuggestion = {
    hasAnySuggestion: false,
    overallConfidence: 'low'
  };

  // Section Suggestion
  if (sectionResult.bestMatch && sectionResult.confidence !== 'low') {
    result.section = {
      value: sectionResult.bestMatch.target,
      label: sectionResult.bestMatch.label,
      confidence: sectionResult.confidence,
      reason: sectionResult.reason
    };
    hasAny = true;
    if (sectionResult.confidence === 'high') hasHigh = true;
    if (sectionResult.confidence === 'medium') hasMedium = true;
  }

  // Request Type Suggestion
  if (requestTypeResult.bestMatch && requestTypeResult.confidence !== 'low') {
    result.requestType = {
      value: requestTypeResult.bestMatch.target,
      label: requestTypeResult.bestMatch.label,
      confidence: requestTypeResult.confidence,
      reason: requestTypeResult.reason
    };
    hasAny = true;
    if (requestTypeResult.confidence === 'high') hasHigh = true;
    if (requestTypeResult.confidence === 'medium') hasMedium = true;
  }

  // Maintenance Type Suggestion - STRICT EVIDENCE ONLY
  if (maintenanceTypeResult.bestMatch && maintenanceTypeResult.confidence !== 'low') {
    result.maintenanceType = {
      value: maintenanceTypeResult.bestMatch.target,
      label: maintenanceTypeResult.bestMatch.label,
      confidence: maintenanceTypeResult.confidence,
      reason: maintenanceTypeResult.reason
    };
    hasAny = true;
    if (maintenanceTypeResult.confidence === 'high') hasHigh = true;
    if (maintenanceTypeResult.confidence === 'medium') hasMedium = true;
  }

  // Priority Suggestion
  if (safetyAndPriority.priority) {
    result.priority = safetyAndPriority.priority;
    hasAny = true;
    if (safetyAndPriority.priority.confidence === 'high') hasHigh = true;
  }

  // Equipment Details
  if (equipmentDetails) {
    result.equipment = equipmentDetails;
    hasAny = true;
    if (equipmentDetails.confidence === 'high') hasHigh = true;
  }

  // Location Details
  if (locationDetails) {
    result.location = locationDetails;
    hasAny = true;
    if (locationDetails.confidence === 'high') hasHigh = true;
  }

  // Safety Risk
  if (safetyAndPriority.safetyRisk && safetyAndPriority.safetyRisk.level !== 'none') {
    result.safetyRisk = safetyAndPriority.safetyRisk;
  }

  result.hasAnySuggestion = hasAny;
  result.overallConfidence = hasHigh ? 'high' : hasMedium ? 'medium' : 'low';

  return result;
}
