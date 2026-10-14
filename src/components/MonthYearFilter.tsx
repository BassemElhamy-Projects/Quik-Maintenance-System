import React from 'react';
import { Calendar } from 'lucide-react';
import { MONTH_OPTIONS } from '../utils/dateFilters';

interface MonthYearFilterProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  selectedYear: string;
  onYearChange: (year: string) => void;
  availableYears: string[];
  className?: string;
}

export const MonthYearFilter: React.FC<MonthYearFilterProps> = ({
  selectedMonth,
  onMonthChange,
  selectedYear,
  onYearChange,
  availableYears,
  className = ''
}) => {
  const isMonthActive = selectedMonth !== 'all';
  const isYearActive = selectedYear !== 'all';

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {/* Month Filter */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-bold text-slate-500 whitespace-nowrap">الشهر:</label>
        <select
          value={selectedMonth}
          onChange={(e) => onMonthChange(e.target.value)}
          className={`border rounded-xl px-2.5 py-2 text-xs font-bold transition-colors cursor-pointer outline-none ${
            isMonthActive
              ? 'bg-orange-50 border-orange-400 text-orange-900 font-black ring-2 ring-orange-500/15'
              : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
          title="تصفية السجلات حسب الشهر"
        >
          {MONTH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Year Filter */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-bold text-slate-500 whitespace-nowrap">السنة:</label>
        <select
          value={selectedYear}
          onChange={(e) => onYearChange(e.target.value)}
          className={`border rounded-xl px-2.5 py-2 text-xs font-bold transition-colors cursor-pointer outline-none ${
            isYearActive
              ? 'bg-orange-50 border-orange-400 text-orange-900 font-black ring-2 ring-orange-500/15'
              : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
          title="تصفية السجلات حسب السنة"
        >
          <option value="all">كل السنين</option>
          {availableYears.map(yr => (
            <option key={yr} value={yr}>
              {yr}
            </option>
          ))}
        </select>
      </div>

      {/* Reset button if month or year is active */}
      {(isMonthActive || isYearActive) && (
        <button
          type="button"
          onClick={() => {
            onMonthChange('all');
            onYearChange('all');
          }}
          className="px-2 py-1 text-[11px] font-bold text-orange-700 bg-orange-100/70 hover:bg-orange-200/80 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
          title="إعادة تعيين تصفية الشهر والسنة"
        >
          <span>إلغاء تصفية التاريخ</span>
        </button>
      )}
    </div>
  );
};
