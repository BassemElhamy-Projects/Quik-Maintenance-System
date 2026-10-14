import React, { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  Plus,
  Search,
  Filter,
  Printer,
  Edit3,
  Trash2,
  X,
  Award,
  AlertCircle,
  CheckCircle,
  CheckSquare,
  Square,
  Download
} from 'lucide-react';
import { InternalInspection, Station, InspectionEvaluation } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { ModalPortal } from './ModalPortal';
import { getNextInspectionNumber, parseValidRequestNumber } from '../utils/requestSequencer';
import { getDynamicYearOptions, matchMonthAndYear } from '../utils/dateFilters';
import { MonthYearFilter } from './MonthYearFilter';

interface InspectionSectionProps {
  inspections: InternalInspection[];
  stations: Station[];
  onSaveInspection: (ins: InternalInspection) => void;
  onDeleteInspection: (id: string) => void;
  onDeleteMultipleInspections?: (ids: string[]) => void;
  onPrintInspection: (ins: InternalInspection) => void;
  onExportExcel?: () => void;
  onImportExcelClick?: () => void;
}

export const InspectionSection: React.FC<InspectionSectionProps> = ({
  inspections,
  stations,
  onSaveInspection,
  onDeleteInspection,
  onDeleteMultipleInspections,
  onPrintInspection,
  onExportExcel
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [evaluationFilter, setEvaluationFilter] = useState<string>('all');
  const [stationFilter, setStationFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInspection, setEditingInspection] = useState<InternalInspection | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Dynamically compute available years from existing inspection record dates
  const availableYears = useMemo(() => {
    return getDynamicYearOptions(inspections.map(i => i.date));
  }, [inspections]);

  // Filter inspections
  const filteredInspections = useMemo(() => {
    return inspections.filter(ins => {
      if (evaluationFilter !== 'all' && ins.evaluation !== evaluationFilter) return false;
      if (stationFilter !== 'all' && ins.stationId !== stationFilter) return false;

      // Month & Year Date Filters (based on actual business date ins.date)
      if (!matchMonthAndYear(ins.date, monthFilter, yearFilter)) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      return (
        ins.inspectionNumber.toLowerCase().includes(q) ||
        ins.stationName.toLowerCase().includes(q) ||
        ins.stationCode.toLowerCase().includes(q) ||
        ins.date.includes(q) ||
        ins.inspectorName.toLowerCase().includes(q) ||
        ins.inspectionType.toLowerCase().includes(q) ||
        ins.evaluation.toLowerCase().includes(q) ||
        ins.notes.toLowerCase().includes(q)
      );
    });
  }, [inspections, searchTerm, evaluationFilter, stationFilter, monthFilter, yearFilter]);

  // Default Display Sort: strictly ASCENDING by inspection record number (1 -> 2 -> 3 ...)
  const sortedInspections = useMemo(() => {
    return [...filteredInspections].sort((a, b) => {
      const numA = parseValidRequestNumber(a.inspectionNumber) ?? 0;
      const numB = parseValidRequestNumber(b.inspectionNumber) ?? 0;
      if (numA !== numB) {
        return numA - numB;
      }
      return (a.date || '').localeCompare(b.date || '');
    });
  }, [filteredInspections]);

  // Bulk select toggles
  const isAllSelected = useMemo(() => {
    if (sortedInspections.length === 0) return false;
    return sortedInspections.every(i => selectedIds.includes(i.id));
  }, [sortedInspections, selectedIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const filteredItemIds = sortedInspections.map(i => i.id);
      setSelectedIds(prev => prev.filter(id => !filteredItemIds.includes(id)));
    } else {
      const filteredItemIds = sortedInspections.map(i => i.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredItemIds])));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleExecuteBulkDelete = () => {
    if (onDeleteMultipleInspections && selectedIds.length > 0) {
      onDeleteMultipleInspections(selectedIds);
    } else {
      selectedIds.forEach(id => onDeleteInspection(id));
    }
    setSelectedIds([]);
    setIsBulkDeleteModalOpen(false);
  };

  const handleOpenNewModal = () => {
    const autoNumber = getNextInspectionNumber(inspections);
    const today = new Date().toISOString().slice(0, 10);

    const firstStation = stations[0] || { id: 'unmatched', name: 'غير محددة', code: '---' };

    setEditingInspection({
      id: '',
      inspectionNumber: autoNumber,
      date: today,
      stationId: firstStation.id,
      stationName: firstStation.name,
      stationCode: firstStation.code,
      inspectionType: 'تفتيش شامل والسلامة',
      inspectorName: '',
      evaluation: 'ممتاز',
      notes: '',
      createdAt: new Date().toISOString()
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ins: InternalInspection) => {
    setEditingInspection({ ...ins });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInspection) return;

    if (!editingInspection.inspectorName.trim()) {
      setFormError('يرجى تحديد اسم المفتش المسؤول عن الزيارة.');
      return;
    }

    const updated: InternalInspection = {
      ...editingInspection,
      createdAt: editingInspection.createdAt || new Date().toISOString()
    };

    setFormError(null);
    try {
      const res = await Promise.resolve(onSaveInspection(updated) as any);
      if (res && typeof res === 'object' && res.success === false) {
        setFormError(res.error || 'تعذر حفظ تقرير التفتيش في قاعدة البيانات السحابية.');
        return;
      }
      setIsModalOpen(false);
      setEditingInspection(null);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر حفظ تقرير التفتيش في قاعدة البيانات السحابية.');
    }
  };

  const getEvaluationBadge = (evaluation: InspectionEvaluation) => {
    switch (evaluation) {
      case 'ممتاز':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            ممتاز
          </span>
        );
      case 'جيد جدا':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <Award className="w-3 h-3 text-blue-600" />
            جيد جداً
          </span>
        );
      case 'جيد':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
            جيد
          </span>
        );
      case 'يحتاج متابعة':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            يحتاج متابعة
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-page-enter">
      
      {/* SECTION HEADER & PRIMARY ACTIONS */}
      <div className="bg-white p-5 rounded-2xl shadow-2xs border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl border border-orange-200/80">
            <ClipboardCheck className="w-7 h-7 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              قسم التفتيش الدوري الداخلي
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
              سجل الزيارات الميدانية وتقييم معايير السلامة والجودة والتشغيل
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-200/90 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="تصدير تقارير التفتيش إلى Excel"
            >
              <Download className="w-4 h-4 text-orange-600" />
              <span>تصدير Excel</span>
            </button>
          )}

          <button
            onClick={handleOpenNewModal}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>تسجيل تقرير تفتيش جديد</span>
          </button>
        </div>
      </div>

      {/* STATS SUMMARY BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-slate-500">إجمالي الجولات الميدانية</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums font-mono">{inspections.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-emerald-600">تقييم ممتاز</p>
          <p className="text-2xl font-black text-emerald-700 mt-1 tabular-nums font-mono">
            {inspections.filter(i => i.evaluation === 'ممتاز').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-blue-600">تقييم جيد جداً</p>
          <p className="text-2xl font-black text-blue-700 mt-1 tabular-nums font-mono">
            {inspections.filter(i => i.evaluation === 'جيد جدا').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-rose-600">يحتاج متابعة وتصحيح</p>
          <p className="text-2xl font-black text-rose-700 mt-1 tabular-nums font-mono">
            {inspections.filter(i => i.evaluation === 'يحتاج متابعة').length}
          </p>
        </div>
      </div>

      {/* SEARCH AND FILTERS TOOLBAR */}
      <div className="bg-white p-4 rounded-2xl shadow-2xs border border-slate-200/90 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم التفتيش، اسم المحطة، المفتش، الملاحظات، أو نوع الفحص..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Station Selector & Date Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
                className="bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
              >
                <option value="all">
                  {stations.length === 0 ? 'لا توجد محطات' : `كل المحطات (${stations.length})`}
                </option>
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-r border-slate-200 pr-3 mr-1">
              <MonthYearFilter
                selectedMonth={monthFilter}
                onMonthChange={setMonthFilter}
                selectedYear={yearFilter}
                onYearChange={setYearFilter}
                availableYears={availableYears}
              />
            </div>
          </div>

        </div>

        {/* Evaluation Pills & Bulk Selection Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-500 shrink-0 ml-1">التقييم:</span>
            
            <button
              onClick={() => setEvaluationFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                evaluationFilter === 'all'
                  ? 'bg-orange-500 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({inspections.length})
            </button>

            <button
              onClick={() => setEvaluationFilter('ممتاز')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                evaluationFilter === 'ممتاز'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              ممتاز ({inspections.filter(i => i.evaluation === 'ممتاز').length})
            </button>

            <button
              onClick={() => setEvaluationFilter('جيد جدا')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                evaluationFilter === 'جيد جدا'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              جيد جداً ({inspections.filter(i => i.evaluation === 'جيد جدا').length})
            </button>

            <button
              onClick={() => setEvaluationFilter('جيد')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                evaluationFilter === 'جيد'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              جيد ({inspections.filter(i => i.evaluation === 'جيد').length})
            </button>

            <button
              onClick={() => setEvaluationFilter('يحتاج متابعة')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                evaluationFilter === 'يحتاج متابعة'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              يحتاج متابعة ({inspections.filter(i => i.evaluation === 'يحتاج متابعة').length})
            </button>
          </div>

          {/* Bulk Controls */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              onClick={handleToggleSelectAll}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-orange-600" /> : <Square className="w-3.5 h-3.5" />}
              <span>تحديد الكل</span>
            </button>

            {selectedIds.length > 0 && (
              <button
                onClick={() => setIsBulkDeleteModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer animate-in fade-in active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد ({selectedIds.length})</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* INSPECTIONS TABLE */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden">
        {filteredInspections.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto border border-slate-200">
              <ClipboardCheck className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-700">لا توجد تقارير تفتيش مطابقة</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">جرب تغيير محددات البحث أو اضغط على "تسجيل تقرير تفتيش جديد".</p>
            <button
              onClick={handleOpenNewModal}
              className="px-4 py-2 bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer active:scale-95 mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل تقرير الآن</span>
            </button>
          </div>
        ) : (
          <div className="table-container-responsive overflow-x-auto w-full max-w-full">
            <table className="w-full text-right text-xs table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[32%]" />
                <col className="w-[28%]" />
                <col className="w-[120px]" />
                <col className="w-[110px]" />
              </colgroup>
              <thead className="bg-slate-50/80 text-slate-700 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                      title="تحديد الكل"
                    />
                  </th>
                  <th className="py-3 px-4 text-center font-mono">رقم التفتيش</th>
                  <th className="py-3 px-4 text-center">التاريخ</th>
                  <th className="py-3 px-4 text-right">المحطة</th>
                  <th className="py-3 px-4 text-right">اسم المفتش</th>
                  <th className="py-3 px-4 text-center">التقييم</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedInspections.map(ins => {
                  const isSelected = selectedIds.includes(ins.id);
                  return (
                    <tr
                      key={ins.id}
                      className={`hover:bg-orange-50/30 transition-colors even:bg-slate-50/40 ${
                        isSelected ? 'bg-orange-50/60' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectItem(ins.id)}
                          className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 font-mono text-center whitespace-nowrap">
                        {ins.inspectionNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px] dir-ltr text-center whitespace-nowrap">
                        {ins.date}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-slate-900 leading-tight break-words" title={ins.stationName}>
                          {ins.stationName}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-800 font-semibold leading-tight break-words text-right" title={ins.inspectorName}>
                        {ins.inspectorName}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {getEvaluationBadge(ins.evaluation)}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap shrink-0">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(ins)}
                            className="p-1.5 bg-white hover:bg-orange-50 text-orange-600 rounded-lg border border-slate-200 hover:border-orange-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="تعديل التقرير"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onPrintInspection(ins)}
                            className="p-1.5 bg-white hover:bg-slate-50 text-slate-600 rounded-lg border border-slate-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="طباعة التقرير"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTargetId(ins.id)}
                            className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="حذف التقرير"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT INSPECTION MODAL */}
      {editingInspection && (
        <ModalPortal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          maxWidthClass="max-w-xl"
        >
          {/* Modal Header (Fixed) */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 text-orange-600 border border-orange-200/80 rounded-xl font-bold">
                <ClipboardCheck className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingInspection.id ? 'تعديل تقرير التفتيش الدوري' : 'تسجيل تقرير تفتيش جديد'}
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  رقم التفتيش: {editingInspection.inspectionNumber}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsModalOpen(false)}
              aria-label="إغلاق"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Form with internal scrolling & fixed footer */}
          <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden text-right">
              
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {formError && (
                  <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-toast">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  
                  {/* Station */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      المحطة المستهدفة <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editingInspection.stationId}
                      onChange={(e) => {
                        const st = stations.find(s => s.id === e.target.value);
                        if (st) {
                          setEditingInspection({
                            ...editingInspection,
                            stationId: st.id,
                            stationName: st.name,
                            stationCode: st.code
                          });
                        } else {
                          setEditingInspection({
                            ...editingInspection,
                            stationId: '',
                            stationName: '',
                            stationCode: ''
                          });
                        }
                      }}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
                      required
                    >
                      {stations.length === 0 ? (
                        <option value="">لا توجد محطات</option>
                      ) : (
                        <>
                          <option value="">-- اختر المحطة --</option>
                          {stations.map(st => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      تاريخ التفتيش <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editingInspection.date}
                      onChange={(e) => setEditingInspection({ ...editingInspection, date: e.target.value })}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                      required
                    />
                  </div>

                  {/* Inspection Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      نوع التفتيش
                    </label>
                    <select
                      value={editingInspection.inspectionType}
                      onChange={(e) => setEditingInspection({ ...editingInspection, inspectionType: e.target.value })}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
                    >
                      <option value="تفتيش شامل والسلامة">تفتيش شامل والسلامة</option>
                      <option value="تفتيش النظافة والمرافق العامة">تفتيش النظافة والمرافق العامة</option>
                      <option value="تفتيش بيئي ومعايرة مضخات">تفتيش بيئي ومعايرة مضخات</option>
                    </select>
                  </div>

                  {/* Evaluation */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      التقييم والنتيجة
                    </label>
                    <select
                      value={editingInspection.evaluation}
                      onChange={(e) => setEditingInspection({ ...editingInspection, evaluation: e.target.value as InspectionEvaluation })}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
                    >
                      <option value="ممتاز">ممتاز ⭐</option>
                      <option value="جيد جدا">جيد جداً</option>
                      <option value="جيد">جيد</option>
                      <option value="يحتاج متابعة">يحتاج متابعة وتصحيح ⚠️</option>
                    </select>
                  </div>

                </div>

                {/* Inspector Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المفتش الزائر <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="اسم المفتش أو المشرف الزائر..."
                    value={editingInspection.inspectorName}
                    onChange={(e) => setEditingInspection({ ...editingInspection, inspectorName: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                    required
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الملاحظات والتوصيات الميدانية
                  </label>
                  <textarea
                    rows={3}
                    placeholder="سجل أهم الملاحظات والنقاط الإيجابية أو السلبية المطلوب متابعتها..."
                    value={editingInspection.notes}
                    onChange={(e) => setEditingInspection({ ...editingInspection, notes: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white resize-none"
                  />
                </div>

              </div>

              {/* Fixed Modal Footer */}
              <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50/90 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all cursor-pointer active:scale-95"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  {editingInspection.id ? 'حفظ التعديلات' : 'حفظ التقرير'}
                </button>
              </div>

            </form>
        </ModalPortal>
      )}

      {/* SINGLE DELETE CONFIRMATION */}
      <ConfirmModal
        isOpen={deleteTargetId !== null}
        title="تأكيد حذف تقرير التفتيش"
        message="هل أنت متأكد من حذف تقرير التفتيش هذا؟ لا يمكن التراجع بعد الحذف."
        confirmLabel="حذف التقرير"
        cancelLabel="إلغاء"
        isDanger={true}
        onConfirm={() => {
          if (deleteTargetId) onDeleteInspection(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* BULK DELETE CONFIRMATION */}
      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        title="تأكيد الحذف الجماعي"
        message={`هل أنت متأكد من حذف ${selectedIds.length} تقرير تفتيش محدد نهائياً؟`}
        confirmLabel={`نعم، احذف ${selectedIds.length} تقرير`}
        cancelLabel="إلغاء"
        isDanger={true}
        onConfirm={handleExecuteBulkDelete}
        onCancel={() => setIsBulkDeleteModalOpen(false)}
      />

    </div>
  );
};
