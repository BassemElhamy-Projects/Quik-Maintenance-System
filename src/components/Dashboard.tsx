import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Container,
  Building,
  ClipboardCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ListTodo,
  FileText,
  ChevronLeft,
  Building2,
  Inbox,
  BarChart2,
  PieChart,
  ArrowUpRight,
  TrendingUp,
  Activity,
  Calendar,
  Filter,
  Wrench,
  Sparkles
} from 'lucide-react';
import { AppData, MaintenanceRequest, SectionType } from '../types';
import { OFFICIAL_STATIONS } from '../data/officialStations';
import { useCountUp } from '../hooks/useCountUp';
import { analyzeRecurringMaintenancePatterns, MaintenanceInsight } from '../utils/smartAnalysis';
import { matchesStrictStationFilter } from '../utils/stationMatcher';

interface DashboardProps {
  appData: AppData;
  onSelectSection: (section: SectionType) => void;
  onOpenRequest: (req: MaintenanceRequest) => void;
  onNewRequestClick: (section?: SectionType) => void;
  onSelectInsight?: (insight: MaintenanceInsight) => void;
}

// 12 Arabic calendar months in strict chronological order (1 to 12)
const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
];

type DateFilterType = 'this_month' | 'last_3_months' | 'this_year' | 'all';

function parseDateObject(dateStr?: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  
  // Format: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const ymd = s.match(/^(\d{4})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
  }

  // Format: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  const dmy = s.match(/^(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](\d{4})/);
  if (dmy) {
    return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
  }

  // Fallback to JS Date parser
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function getMonthIndexFromDate(dateStr?: string): number | null {
  const d = parseDateObject(dateStr);
  return d ? d.getMonth() : null;
}

function matchesDateFilter(dateStr: string | undefined, filter: DateFilterType): boolean {
  if (filter === 'all') return true;
  const d = parseDateObject(dateStr);
  if (!d) return true;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (filter === 'this_year') {
    return d.getFullYear() === currentYear;
  }
  
  if (filter === 'this_month') {
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  }

  if (filter === 'last_3_months') {
    const startOfPeriod = new Date(currentYear, currentMonth - 2, 1);
    const endOfPeriod = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    return d >= startOfPeriod && d <= endOfPeriod;
  }

  return true;
}

function matchesStationFilter(
  item: {
    stationId?: string;
    stationCode?: string;
    stationName?: string;
    id?: string;
    code?: string;
    name?: string;
  },
  selectedStation: string
): boolean {
  return matchesStrictStationFilter(item, selectedStation);
}

const formatDateTimeArabic = (d: Date): string => {
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  const displayHours = (hours % 12 || 12).toString().padStart(2, '0');
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}/${m}/${day} ${displayHours}:${minutes} ${ampm}`;
};

export const Dashboard: React.FC<DashboardProps> = ({
  appData,
  onSelectSection,
  onOpenRequest,
  onNewRequestClick,
  onSelectInsight
}) => {
  // 1. Date Range Filter State (Default: "هذا العام")
  const [dateFilter, setDateFilter] = useState<DateFilterType>('this_year');

  // 2. Station Filter State (Default: "all" / "كل المحطات")
  const [selectedStation, setSelectedStation] = useState<string>('all');

  // 3. Last Updated Timestamp State
  const [lastUpdated, setLastUpdated] = useState<string>(() => formatDateTimeArabic(new Date()));

  useEffect(() => {
    setLastUpdated(formatDateTimeArabic(new Date()));
  }, [appData]);

  // Filtered maintenance requests according to selected filters
  const filteredRequests = useMemo(() => {
    return appData.maintenanceRequests.filter(req => {
      const dateMatch = matchesDateFilter(req.date || req.createdAt, dateFilter);
      const stationMatch = matchesStationFilter(req, selectedStation);
      return dateMatch && stationMatch;
    });
  }, [appData.maintenanceRequests, dateFilter, selectedStation]);

  // Filtered inspections according to selected filters
  const filteredInspections = useMemo(() => {
    return appData.inspections.filter(ins => {
      const dateMatch = matchesDateFilter(ins.date || ins.createdAt, dateFilter);
      const stationMatch = matchesStationFilter(ins, selectedStation);
      return dateMatch && stationMatch;
    });
  }, [appData.inspections, dateFilter, selectedStation]);

  // Filtered incidents according to selected filters
  const filteredIncidents = useMemo(() => {
    return appData.incidents.filter(inc => {
      const dateMatch = matchesDateFilter(inc.date || inc.createdAt, dateFilter);
      const stationMatch = matchesStationFilter(inc, selectedStation);
      return dateMatch && stationMatch;
    });
  }, [appData.incidents, dateFilter, selectedStation]);

  // Filtered metrics computation from real application state
  const totalMaintenance = filteredRequests.length;
  const openRequests = filteredRequests.filter(
    r => r.status === 'جديد' || r.status === 'جاري العمل'
  ).length;
  const completedRequests = filteredRequests.filter(
    r => r.status === 'تم'
  ).length;
  const totalIncidents = filteredIncidents.length;
  const totalInspections = filteredInspections.length;

  const totalStations = selectedStation === 'all' 
    ? appData.stations.length 
    : appData.stations.filter(s => matchesStationFilter(s, selectedStation)).length;
  const activeStations = selectedStation === 'all'
    ? appData.stations.filter(s => (s.status || 'نشطة') === 'نشطة').length
    : appData.stations.filter(s => matchesStationFilter(s, selectedStation) && (s.status || 'نشطة') === 'نشطة').length;

  const pumpsCount = filteredRequests.filter(r => r.section === 'pumps').length;
  const tanksCount = filteredRequests.filter(r => r.section === 'tanks').length;
  const facilitiesCount = filteredRequests.filter(r => r.section === 'facilities').length;

  // Real Percentage Calculations (Natural 0% when no data exists)
  const completedPercentage = totalMaintenance > 0 ? Math.round((completedRequests / totalMaintenance) * 100) : 0;
  const openPercentage = totalMaintenance > 0 ? Math.round((openRequests / totalMaintenance) * 100) : 0;

  // Animated Count-Up values for real statistics
  const animatedTotal = useCountUp(totalMaintenance);
  const animatedOpen = useCountUp(openRequests);
  const animatedCompleted = useCountUp(completedRequests);
  const animatedIncidents = useCountUp(totalIncidents);
  const animatedInspections = useCountUp(totalInspections);
  const animatedActiveStations = useCountUp(activeStations);

  // Recent requests sorted by creation date (Real filtered data only)
  const recentRequests = useMemo(() => {
    return [...filteredRequests]
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
      .slice(0, 5);
  }, [filteredRequests]);

  // Chronological 12 Calendar Months Aggregation (يناير إلى ديسمبر)
  const monthlyStats = useMemo(() => {
    const months = ARABIC_MONTHS.map((label, index) => ({
      monthNumber: index + 1,
      label,
      count: 0,
      completed: 0,
      open: 0
    }));

    filteredRequests.forEach(req => {
      const monthIdx = getMonthIndexFromDate(req.date || req.createdAt);
      if (monthIdx !== null && monthIdx >= 0 && monthIdx < 12) {
        months[monthIdx].count += 1;
        if (req.status === 'تم') {
          months[monthIdx].completed += 1;
        } else {
          months[monthIdx].open += 1;
        }
      }
    });

    return months;
  }, [filteredRequests]);

  const maxMonthlyCount = useMemo(() => {
    const max = Math.max(...monthlyStats.map(m => m.count), 0);
    return max > 0 ? max : 1;
  }, [monthlyStats]);

  // Section breakdown distribution
  const totalAllRecords = totalMaintenance + totalInspections + totalIncidents;
  const sectionBreakdown = useMemo(() => {
    return [
      {
        id: 'pumps' as SectionType,
        title: 'المضخات',
        count: pumpsCount,
        color: 'bg-orange-500',
        textColor: 'text-orange-600',
        lightBg: 'bg-orange-50',
        percentage: totalMaintenance > 0 ? Math.round((pumpsCount / totalMaintenance) * 100) : 0
      },
      {
        id: 'tanks' as SectionType,
        title: 'الخزانات',
        count: tanksCount,
        color: 'bg-amber-500',
        textColor: 'text-amber-600',
        lightBg: 'bg-amber-50',
        percentage: totalMaintenance > 0 ? Math.round((tanksCount / totalMaintenance) * 100) : 0
      },
      {
        id: 'facilities' as SectionType,
        title: 'المرافق والساحات',
        count: facilitiesCount,
        color: 'bg-blue-500',
        textColor: 'text-blue-600',
        lightBg: 'bg-blue-50',
        percentage: totalMaintenance > 0 ? Math.round((facilitiesCount / totalMaintenance) * 100) : 0
      },
      {
        id: 'inspections' as SectionType,
        title: 'التفتيش الدوري',
        count: totalInspections,
        color: 'bg-indigo-500',
        textColor: 'text-indigo-600',
        lightBg: 'bg-indigo-50',
        percentage: totalAllRecords > 0 ? Math.round((totalInspections / totalAllRecords) * 100) : 0
      },
      {
        id: 'incidents' as SectionType,
        title: 'سجل الحوادث',
        count: totalIncidents,
        color: 'bg-rose-500',
        textColor: 'text-rose-600',
        lightBg: 'bg-rose-50',
        percentage: totalAllRecords > 0 ? Math.round((totalIncidents / totalAllRecords) * 100) : 0
      }
    ];
  }, [pumpsCount, tanksCount, facilitiesCount, totalInspections, totalIncidents, totalMaintenance, totalAllRecords]);

  // Smart Maintenance Insights (Recurring Pattern Analysis)
  const recurringInsights = useMemo(() => {
    return analyzeRecurringMaintenancePatterns(filteredRequests, selectedStation);
  }, [filteredRequests, selectedStation]);

  const getSectionTitle = (sec: string) => {
    switch (sec) {
      case 'pumps': return 'المضخات';
      case 'tanks': return 'الخزانات';
      case 'facilities': return 'المرافق والساحات';
      default: return sec;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'جديد':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            جديد
          </span>
        );
      case 'جاري العمل':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            جاري العمل
          </span>
        );
      case 'تم':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            تم
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Sparkline Generator Helper for Mini Card Trends
  const renderSparkline = (count: number, color: string) => {
    const height = 18;
    const width = 64;
    if (count === 0) {
      return (
        <svg width={width} height={height} className="opacity-30">
          <line x1="0" y1="12" x2="64" y2="12" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="3 3" />
        </svg>
      );
    }
    const points = `0,14 16,${Math.max(4, 14 - Math.min(10, count * 2))} 32,${Math.max(2, 12 - Math.min(10, count * 1.5))} 48,${Math.max(6, 14 - Math.min(8, count))} 64,4`;
    return (
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <circle cx="64" cy="4" r="2.5" fill={color} />
      </svg>
    );
  };

  return (
    <div className="space-y-6 animate-page-enter">

      {/* 1. COMPACT PROFESSIONAL FILTERS & LAST UPDATED BAR */}
      <div className="dash-stagger-filters bg-white px-4.5 py-3 rounded-2xl shadow-2xs border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 transition-all duration-200">
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Date Range Filter */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/70">
            <div className="flex items-center gap-1 px-2 text-slate-500 text-xs font-bold shrink-0">
              <Calendar className="w-3.5 h-3.5 text-orange-500" />
              <span className="hidden sm:inline">الفترة:</span>
            </div>
            {(
              [
                { id: 'this_month', label: 'هذا الشهر' },
                { id: 'last_3_months', label: 'آخر 3 أشهر' },
                { id: 'this_year', label: 'هذا العام' },
                { id: 'all', label: 'الكل' }
              ] as const
            ).map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDateFilter(option.id)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                  dateFilter === option.id
                    ? 'bg-orange-500 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Station Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/70">
            <Building2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <span className="text-xs font-bold text-slate-500 shrink-0 hidden sm:inline">المحطة:</span>
            <select
              value={selectedStation}
              onChange={e => setSelectedStation(e.target.value)}
              className="text-xs font-bold text-slate-700 bg-transparent border-0 focus:ring-0 cursor-pointer outline-hidden pr-1 pl-4"
            >
              <option value="all">كل المحطات</option>
              {(appData.stations || []).map(st => (
                <option key={st.id || st.code} value={st.code}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Last Updated Indicator */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>آخر تحديث:</span>
          <span className="font-mono text-slate-700 font-bold tabular-nums dir-ltr">{lastUpdated}</span>
        </div>
      </div>
      
      {/* 2. THE SIX MAIN MODULE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        
        {/* Card 1: المضخات */}
        <button
          type="button"
          onClick={() => onSelectSection('pumps')}
          className="dash-stagger-card-1 group text-right bg-white p-4.5 rounded-2xl border border-slate-200/90 hover:border-orange-500/90 hover:-translate-y-1 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-48 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-orange-500 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-2 transition-all duration-200 shadow-2xs">
              <Zap className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-mono border border-slate-200/60 tabular-nums">
                {pumpsCount} طلب
              </span>
              {renderSparkline(pumpsCount, '#f97316')}
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-orange-600 transition-colors">
              المضخات
            </h3>
            <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">
              الأعطال والمعايرة الدورية
            </p>
          </div>
          <div className="flex items-center justify-between text-orange-600 text-[11px] font-bold pt-2.5 border-t border-slate-100 w-full">
            <span>فتح القسم</span>
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform duration-150" />
          </div>
        </button>

        {/* Card 2: الخزانات */}
        <button
          type="button"
          onClick={() => onSelectSection('tanks')}
          className="dash-stagger-card-2 group text-right bg-white p-4.5 rounded-2xl border border-slate-200/90 hover:border-orange-500/90 hover:-translate-y-1 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-48 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-orange-500 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-2 transition-all duration-200 shadow-2xs">
              <Container className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-mono border border-slate-200/60 tabular-nums">
                {tanksCount} طلب
              </span>
              {renderSparkline(tanksCount, '#f59e0b')}
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-orange-600 transition-colors">
              الخزانات
            </h3>
            <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">
              التسريبات وحساسات الوقود
            </p>
          </div>
          <div className="flex items-center justify-between text-orange-600 text-[11px] font-bold pt-2.5 border-t border-slate-100 w-full">
            <span>فتح القسم</span>
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform duration-150" />
          </div>
        </button>

        {/* Card 3: المدخل والمخرج والمرافق */}
        <button
          type="button"
          onClick={() => onSelectSection('facilities')}
          className="dash-stagger-card-3 group text-right bg-white p-4.5 rounded-2xl border border-slate-200/90 hover:border-orange-500/90 hover:-translate-y-1 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-48 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-orange-500 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-2 transition-all duration-200 shadow-2xs">
              <Building className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-mono border border-slate-200/60 tabular-nums">
                {facilitiesCount} طلب
              </span>
              {renderSparkline(facilitiesCount, '#3b82f6')}
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-orange-600 transition-colors">
              المدخل والمخرج والمرافق
            </h3>
            <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">
              المسجد والمظلات والمداخل
            </p>
          </div>
          <div className="flex items-center justify-between text-orange-600 text-[11px] font-bold pt-2.5 border-t border-slate-100 w-full">
            <span>فتح القسم</span>
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform duration-150" />
          </div>
        </button>

        {/* Card 4: التفتيش الدوري */}
        <button
          type="button"
          onClick={() => onSelectSection('inspections')}
          className="dash-stagger-card-4 group text-right bg-white p-4.5 rounded-2xl border border-slate-200/90 hover:border-orange-500/90 hover:-translate-y-1 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-48 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-orange-500 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-2 transition-all duration-200 shadow-2xs">
              <ClipboardCheck className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-mono border border-slate-200/60 tabular-nums">
                {totalInspections} تقرير
              </span>
              {renderSparkline(totalInspections, '#6366f1')}
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-orange-600 transition-colors">
              التفتيش الدوري
            </h3>
            <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">
              الجولات الميدانية والسلامة
            </p>
          </div>
          <div className="flex items-center justify-between text-orange-600 text-[11px] font-bold pt-2.5 border-t border-slate-100 w-full">
            <span>فتح القسم</span>
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform duration-150" />
          </div>
        </button>

        {/* Card 5: الحوادث */}
        <button
          type="button"
          onClick={() => onSelectSection('incidents')}
          className="dash-stagger-card-5 group text-right bg-white p-4.5 rounded-2xl border border-slate-200/90 hover:border-orange-500/90 hover:-translate-y-1 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-48 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-orange-500 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-2 transition-all duration-200 shadow-2xs">
              <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-mono border border-slate-200/60 tabular-nums">
                {totalIncidents} بلاغ
              </span>
              {renderSparkline(totalIncidents, '#e11d48')}
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-orange-600 transition-colors">
              الحوادث
            </h3>
            <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">
              البلاغات والتحقيقات المرورية
            </p>
          </div>
          <div className="flex items-center justify-between text-orange-600 text-[11px] font-bold pt-2.5 border-t border-slate-100 w-full">
            <span>فتح القسم</span>
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform duration-150" />
          </div>
        </button>

        {/* Card 6: إدارة المحطات */}
        <button
          type="button"
          onClick={() => onSelectSection('stations')}
          className="dash-stagger-card-6 group text-right bg-white p-4.5 rounded-2xl border border-slate-200/90 hover:border-orange-500/90 hover:-translate-y-1 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-48 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-orange-500 relative overflow-hidden"
        >
          <div className="flex items-start justify-between w-full">
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-2 transition-all duration-200 shadow-2xs">
              <Building2 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded-lg font-mono tabular-nums">
                {animatedActiveStations} نشطة
              </span>
              {renderSparkline(totalStations, '#10b981')}
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-orange-600 transition-colors">
              إدارة المحطات
            </h3>
            <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed font-mono">
              {totalStations} محطة مسجلة
            </p>
          </div>
          <div className="flex items-center justify-between text-orange-600 text-[11px] font-bold pt-2.5 border-t border-slate-100 w-full">
            <span>فتح القسم</span>
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform duration-150" />
          </div>
        </button>

      </div>

      {/* 3. ENHANCED STATISTICS CARDS WITH CIRCULAR METERS */}
      <div className="dash-stagger-kpi grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Total Requests */}
        <div className="bg-white p-4.5 rounded-2xl shadow-2xs border border-slate-200/90 flex items-center justify-between hover:shadow-xs transition-shadow">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي الطلبات</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums font-mono">
              {animatedTotal}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500 font-semibold">
              <span className="text-orange-600 font-mono font-bold">{pumpsCount}</span> مضخات
              <span>•</span>
              <span className="text-amber-600 font-mono font-bold">{tanksCount}</span> خزانات
              <span>•</span>
              <span className="text-blue-600 font-mono font-bold">{facilitiesCount}</span> مرافق
            </div>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200/60 shadow-2xs">
            <ListTodo className="w-5 h-5 stroke-[2.2]" />
          </div>
        </div>

        {/* Open Requests with Circular Progress Ring */}
        <div className="bg-white p-4.5 rounded-2xl shadow-2xs border border-slate-200/90 flex items-center justify-between hover:shadow-xs transition-shadow">
          <div>
            <p className="text-xs font-bold text-slate-500">الطلبات المفتوحة</p>
            <p className="text-2xl font-black text-orange-600 mt-1 tabular-nums font-mono">
              {animatedOpen}
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-1.5">
              قيد المتابعة والتنفيذ
            </p>
          </div>
          <div className="relative flex items-center justify-center">
            {/* SVG Circular Progress Meter */}
            <svg className="w-13 h-13 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-orange-500 transition-all duration-700 ease-out"
                strokeDasharray={`${openPercentage}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute text-[11px] font-black font-mono text-orange-600">
              {openPercentage}%
            </div>
          </div>
        </div>

        {/* Completed Requests with Circular Progress Ring */}
        <div className="bg-white p-4.5 rounded-2xl shadow-2xs border border-slate-200/90 flex items-center justify-between hover:shadow-xs transition-shadow">
          <div>
            <p className="text-xs font-bold text-slate-500">الطلبات المنجزة</p>
            <p className="text-2xl font-black text-emerald-600 mt-1 tabular-nums font-mono">
              {animatedCompleted}
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-1.5">
              نسبة الإنجاز الفعلية
            </p>
          </div>
          <div className="relative flex items-center justify-center">
            {/* SVG Circular Progress Meter */}
            <svg className="w-13 h-13 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-emerald-500 transition-all duration-700 ease-out"
                strokeDasharray={`${completedPercentage}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute text-[11px] font-black font-mono text-emerald-600">
              {completedPercentage}%
            </div>
          </div>
        </div>

        {/* Incidents & Inspections */}
        <div className="bg-white p-4.5 rounded-2xl shadow-2xs border border-slate-200/90 flex items-center justify-between hover:shadow-xs transition-shadow">
          <div>
            <p className="text-xs font-bold text-slate-500">الحوادث والتفتيش</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-rose-600 tabular-nums font-mono">
                {animatedIncidents}
              </span>
              <span className="text-xs font-semibold text-slate-500">حوادث</span>
              <span className="text-slate-300">|</span>
              <span className="text-2xl font-black text-indigo-600 tabular-nums font-mono">
                {animatedInspections}
              </span>
              <span className="text-xs font-semibold text-slate-500">تفتيش</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1.5">
              سجلات السلامة الميدانية
            </p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200/60 shadow-2xs">
            <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
          </div>
        </div>

      </div>

      {/* 4. DASHBOARD ANALYTICS SECTION (REAL APPLICATION DATA ONLY) */}
      <div className="dash-stagger-charts grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Monthly Trend Bar Chart (2 Cols on lg) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-2xs border border-slate-200/90 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg">
                <BarChart2 className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">مخطط الطلبات الشهري</h3>
                <p className="text-[11px] text-slate-400 font-medium">سجل حركة الصيانة الموزع على الأشهر</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500"></span>
                مفتوح
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                منجز
              </span>
            </div>
          </div>

          {/* Chart Content or Clean Empty State */}
          {totalMaintenance === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2.5">
                <TrendingUp className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-700">لا توجد بيانات كافية لرسم المخطط الشهري</p>
              <p className="text-[11px] text-slate-400 mt-0.5">ستظهر الرسوم البيانية تلقائياً عند تسجيل أو استيراد طلبات الصيانة</p>
            </div>
          ) : (
            <div className="pt-6 pb-1">
              <div className="h-48 flex items-end justify-between gap-1.5 sm:gap-2 px-1 overflow-x-auto pb-2">
                {monthlyStats.map(month => {
                  const totalHeight = month.count > 0 
                    ? Math.max(8, Math.round((month.count / maxMonthlyCount) * 100)) 
                    : 0;
                  const completedRatio = month.count > 0 ? (month.completed / month.count) : 0;
                  const openRatio = month.count > 0 ? (month.open / month.count) : 0;

                  return (
                    <div key={month.monthNumber} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end min-w-[32px] sm:min-w-[38px]">
                      {/* Count Badge on Hover */}
                      <span className="text-[10px] font-mono font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {month.count}
                      </span>

                      {/* Stacked Bar */}
                      <div
                        className={`w-full max-w-[28px] rounded-t-md overflow-hidden flex flex-col justify-end transition-all duration-300 group-hover:scale-105 ${
                          month.count > 0 ? 'bg-slate-100' : 'bg-slate-100/60'
                        }`}
                        style={{ height: `${totalHeight}%`, minHeight: month.count === 0 ? '4px' : '8px' }}
                      >
                        {/* Open Portion */}
                        {month.open > 0 && (
                          <div
                            className="bg-orange-500 w-full transition-all"
                            style={{ height: `${openRatio * 100}%` }}
                            title={`مفتوح: ${month.open}`}
                          />
                        )}
                        {/* Completed Portion */}
                        {month.completed > 0 && (
                          <div
                            className="bg-emerald-500 w-full transition-all"
                            style={{ height: `${completedRatio * 100}%` }}
                            title={`منجز: ${month.completed}`}
                          />
                        )}
                      </div>

                      {/* Full Month Label (RTL, No Truncation, No Ellipsis) */}
                      <span className="text-[10px] xl:text-[11px] font-bold text-slate-700 whitespace-nowrap text-center leading-tight">
                        {month.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section Distribution Breakdown (1 Col on lg) */}
        <div className="bg-white rounded-2xl p-5 shadow-2xs border border-slate-200/90 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
                <PieChart className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">توزيع الطلبات حسب القسم</h3>
                <p className="text-[11px] text-slate-400 font-medium">النسبة المئوية لحجم العمل</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              {totalAllRecords} إجمالي
            </span>
          </div>

          <div className="py-3 space-y-3.5">
            {sectionBreakdown.map(item => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${item.color}`}></span>
                    <span className="text-slate-800">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-500">{item.count} سجل</span>
                    <span className={`${item.textColor} font-black`}>{item.percentage}%</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500 ease-out`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>محسوبة من السجلات الفعلية</span>
            <Activity className="w-3.5 h-3.5 text-orange-500" />
          </div>
        </div>

      </div>

      {/* 5. SMART RECURRING MAINTENANCE INSIGHTS SECTION (FEATURE 2) */}
      <div className="dash-stagger-panels bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-200/80">
              <Sparkles className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">ملاحظات الصيانة الذكية</h3>
                {recurringInsights.length > 0 && (
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                    {recurringInsights.length} أنماط مرصودة
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                يقوم النظام بتحليل سجلات الصيانة والتفتيش والبلاغات لاكتشاف الأنماط والملاحظات المهمة.
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-slate-500 text-xs font-medium">
            <span>تحليل فوري لبيانات الصيانة السحابية</span>
          </div>
        </div>

        {recurringInsights.length === 0 ? (
          <div className="py-8 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5 border border-emerald-200/60">
              <CheckCircle2 className="w-5 h-5 stroke-[2]" />
            </div>
            <p className="text-xs font-bold text-slate-700">
              لا توجد أنماط متكررة أو أعطال حرجة ملحوظة في بيانات الفترة المحددة
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-md">
              يقوم محرك التحليل الذكي بفحص سجلات المحطات والأقسام تلقائياً ورصد أي تكرار متقارب للأعطال أو المكونات.
            </p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {recurringInsights.map(insight => (
              <div
                key={insight.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all hover:shadow-2xs ${
                  insight.severity === 'warning'
                    ? 'bg-orange-50/30 border-orange-200/90'
                    : 'bg-slate-50/50 border-slate-200'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900 leading-snug">
                      {insight.title}
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                        insight.severity === 'warning'
                          ? 'bg-orange-100 text-orange-800 border border-orange-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {insight.severity === 'warning' ? 'تكرار نشط ⚠️' : 'نمط متكرر ℹ️'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200/70">
                      {insight.stationName}
                    </span>
                    <span className="font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200/70">
                      {insight.sectionName}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-normal">
                    {insight.explanation}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-200/60 text-[11px]">
                  <span className="font-mono text-slate-500 font-medium">
                    {insight.count} طلبات • {insight.periodText}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectInsight) {
                        onSelectInsight(insight);
                      } else {
                        onSelectSection(insight.section);
                      }
                    }}
                    className="font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
                  >
                    <span>عرض السجلات</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. RECENT REQUESTS SECTION */}
      <div className="dash-stagger-panels bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500 stroke-[2.2]" />
            <h3 className="text-sm font-extrabold text-slate-900">آخر الطلبات المسجلة</h3>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-semibold font-mono tabular-nums">
              {recentRequests.length > 0 ? `أحدث ${recentRequests.length} طلبات` : 'سجل الطلبات'}
            </span>
            {recentRequests.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectSection('pumps')}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>عرض الكل</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {recentRequests.length === 0 ? (
          /* PURPOSEFULLY DESIGNED EMPTY STATE */
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100/90 text-slate-400 flex items-center justify-center mb-3 border border-slate-200/60">
              <Inbox className="w-6 h-6 stroke-[1.8]" />
            </div>
            <p className="text-sm font-bold text-slate-700 mb-1">
              لا توجد طلبات صيانة مسجلة ضمن المعايير المحددة
            </p>
            <p className="text-xs text-slate-400 max-w-sm">
              عند تسجيل طلبات جديدة أو تغيير خيارات التصفية، ستظهر النتائج المطابقة هنا تلقائياً للمتابعة السريعة.
            </p>
          </div>
        ) : (
          <div className="table-container-responsive overflow-x-auto w-full max-w-full">
            <table className="w-full text-right text-xs table-fixed">
              <colgroup>
                <col className="w-[90px]" />
                <col className="w-[120px]" />
                <col className="w-[24%]" />
                <col className="w-[110px]" />
                <col className="w-[15%]" />
                <col className="w-[18%]" />
                <col className="w-[110px]" />
                <col className="w-[95px]" />
              </colgroup>
              <thead className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-mono text-center">رقم الطلب</th>
                  <th className="py-3 px-4 text-right">القسم</th>
                  <th className="py-3 px-4 text-right">المحطة</th>
                  <th className="py-3 px-4 text-center">التاريخ</th>
                  <th className="py-3 px-4 text-right">نوع الصيانة</th>
                  <th className="py-3 px-4 text-right">الفني</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRequests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors even:bg-slate-50/30">
                    <td className="py-3 px-4 font-bold text-slate-900 font-mono text-xs tabular-nums text-center whitespace-nowrap">
                      {req.requestNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap text-right">
                      <span className="bg-slate-100 text-slate-800 text-[10px] xl:text-[11px] px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                        {getSectionTitle(req.section)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 text-right">
                      <div className="leading-tight break-words" title={req.stationName}>{req.stationName}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px] dir-ltr text-center tabular-nums whitespace-nowrap">
                      {req.date}
                    </td>

                    <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap text-[11px] text-right">
                      <span className="bg-orange-50/80 text-orange-850 px-1.5 py-0.5 rounded text-[10px] font-bold border border-orange-200/50">
                        {req.maintenanceType || 'صيانة عامة'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-[11px] text-right">
                      <div className="break-words font-medium" title={req.technician || 'غير محدد'}>{req.technician || '---'}</div>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {getStatusBadge(req.status)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenRequest(req)}
                        className="px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 hover:text-orange-800 border border-orange-200/80 rounded-md transition-all font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer active:scale-95 shrink-0"
                        title="عرض وتعديل التفاصيل"
                      >
                        <FileText className="w-3.5 h-3.5 text-orange-600" />
                        <span>فتح</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
