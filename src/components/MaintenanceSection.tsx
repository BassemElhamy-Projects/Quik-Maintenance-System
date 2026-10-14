import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Filter,
  Printer,
  Edit3,
  Trash2,
  X,
  Zap,
  Container,
  Building,
  Wrench,
  FileSpreadsheet,
  CheckSquare,
  Square,
  AlertCircle,
  Download,
} from 'lucide-react';
import { MaintenanceRequest, Station, MaintenanceStatus } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { ModalPortal } from './ModalPortal';
import { getNextMaintenanceRequestNumber, parseValidRequestNumber } from '../utils/requestSequencer';
import { getDynamicYearOptions, matchMonthAndYear } from '../utils/dateFilters';
import { MonthYearFilter } from './MonthYearFilter';

interface MaintenanceSectionProps {
  section: 'pumps' | 'tanks' | 'facilities';
  requests: MaintenanceRequest[];
  stations: Station[];
  onSaveRequest: (req: MaintenanceRequest) => void;
  onDeleteRequest: (id: string) => void;
  onDeleteMultipleRequests?: (ids: string[]) => void;
  onPrintRequest: (req: MaintenanceRequest) => void;
  onExportExcel: () => void;
  onImportExcelClick?: () => void;
  initialEditingRequest?: MaintenanceRequest | null;
  onClearInitialEditing?: () => void;
  onOpenNewModalDirectly?: boolean;
  onClearOpenNewModalDirectly?: () => void;
  activeInsightFilter?: MaintenanceInsight | null;
  onClearInsightFilter?: () => void;
}

export const MaintenanceSection: React.FC<MaintenanceSectionProps> = ({
  section,
  requests,
  stations,
  onSaveRequest,
  onDeleteRequest,
  onDeleteMultipleRequests,
  onPrintRequest,
  onExportExcel,
  initialEditingRequest,
  onClearInitialEditing,
  onOpenNewModalDirectly,
  onClearOpenNewModalDirectly,
  activeInsightFilter,
  onClearInsightFilter
}) => {
  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stationFilter, setStationFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<MaintenanceRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirm Modal for single item
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Handle external edit trigger from dashboard
  React.useEffect(() => {
    if (initialEditingRequest) {
      setEditingRequest(initialEditingRequest);
      setFormError(null);
      setIsModalOpen(true);
      if (onClearInitialEditing) onClearInitialEditing();
    }
  }, [initialEditingRequest]);

  React.useEffect(() => {
    if (onOpenNewModalDirectly) {
      handleOpenNewModal();
      if (onClearOpenNewModalDirectly) onClearOpenNewModalDirectly();
    }
  }, [onOpenNewModalDirectly]);

  // Section details mapping
  const sectionMeta = useMemo(() => {
    switch (section) {
      case 'pumps':
        return {
          title: 'طلب صيانة المضخات',
          subtitle: 'تسجيل ومتابعة أعطال ومعايرة مضخات الوقود والمسدسات والشاشات',
          icon: Zap,
          iconBg: 'bg-orange-50 text-orange-600 border border-orange-200/80',
          accentColor: 'orange'
        };
      case 'tanks':
        return {
          title: 'طلب صيانة الخزانات',
          subtitle: 'تسجيل ومتابعة أعطال الخزانات الأرضية والحساسات والحمايات',
          icon: Container,
          iconBg: 'bg-orange-50 text-orange-600 border border-orange-200/80',
          accentColor: 'orange'
        };
      case 'facilities':
      default:
        return {
          title: 'طلب صيانة المرافق',
          subtitle: 'المدخل والمخرج + المساجد ودورات المياه والساحات',
          icon: Building,
          iconBg: 'bg-orange-50 text-orange-600 border border-orange-200/80',
          accentColor: 'orange'
        };
    }
  }, [section]);

  // Filter requests for this specific section
  const sectionRequests = useMemo(() => {
    return requests.filter(r => r.section === section);
  }, [requests, section]);

  // Dynamically compute available years from existing business record dates
  const availableYears = useMemo(() => {
    return getDynamicYearOptions(sectionRequests.map(r => r.date));
  }, [sectionRequests]);

  // Apply Search, Dropdown Filters, Date Filters, and Smart Insight Filtering
  const filteredRequests = useMemo(() => {
    return sectionRequests.filter(req => {
      // 1. Smart Insight Filter
      if (activeInsightFilter) {
        if (activeInsightFilter.matchingRequestIds && activeInsightFilter.matchingRequestIds.length > 0) {
          if (!activeInsightFilter.matchingRequestIds.includes(req.id)) {
            return false;
          }
        } else if (activeInsightFilter.stationId && activeInsightFilter.stationId !== 'unmatched') {
          if (req.stationId !== activeInsightFilter.stationId && req.stationName !== activeInsightFilter.stationName) {
            return false;
          }
        }
      }

      // 2. Status & Station Dropdown Filters
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (stationFilter !== 'all' && req.stationId !== stationFilter) return false;

      // 3. Month & Year Date Filters (based on actual business record date req.date)
      if (!matchMonthAndYear(req.date, monthFilter, yearFilter)) return false;

      // 4. Search Term
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      return (
        req.requestNumber.toLowerCase().includes(q) ||
        req.stationName.toLowerCase().includes(q) ||
        req.stationCode.toLowerCase().includes(q) ||
        req.requester.toLowerCase().includes(q) ||
        (req.requestType && req.requestType.toLowerCase().includes(q)) ||
        (req.maintenanceType && req.maintenanceType.toLowerCase().includes(q)) ||
        req.problemDescription.toLowerCase().includes(q) ||
        (req.technician && req.technician.toLowerCase().includes(q)) ||
        req.status.toLowerCase().includes(q)
      );
    });
  }, [sectionRequests, searchTerm, statusFilter, stationFilter, monthFilter, yearFilter, activeInsightFilter]);

  // Default Display Sort: strictly ASCENDING by section request number (1 -> 2 -> 3 ... -> 46 -> 47)
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      const numA = parseValidRequestNumber(a.requestNumber) ?? 0;
      const numB = parseValidRequestNumber(b.requestNumber) ?? 0;
      if (numA !== numB) {
        return numA - numB;
      }
      return (a.date || '').localeCompare(b.date || '');
    });
  }, [filteredRequests]);

  // Bulk Selection Handlers
  const isAllSelected = sortedRequests.length > 0 && selectedIds.length === sortedRequests.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedRequests.map(r => r.id));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleExecuteBulkDelete = () => {
    if (onDeleteMultipleRequests) {
      onDeleteMultipleRequests(selectedIds);
    } else {
      selectedIds.forEach(id => onDeleteRequest(id));
    }
    setSelectedIds([]);
    setIsBulkDeleteModalOpen(false);
  };

  const handleOpenNewModal = () => {
    const autoNumber = getNextMaintenanceRequestNumber(requests, section);
    const today = new Date().toISOString().slice(0, 10);

    const firstStation = stations[0] || { id: 'unmatched', name: 'غير محددة', code: '---' };

    setEditingRequest({
      id: '',
      requestNumber: autoNumber,
      section,
      date: today,
      stationId: firstStation.id,
      stationName: firstStation.name,
      stationCode: firstStation.code,
      requester: '',
      requestType: section === 'pumps' ? 'مضخات الوقود' : (section === 'tanks' ? 'خزانات الوقود' : 'دورات المياه والمسجد والساحة والمدخل والمخرج'),
      maintenanceType: '',
      problemDescription: '',
      status: 'جديد',
      technician: '',
      actionTaken: '',
      completionNotes: '',
      closingDate: '',
      createdAt: new Date().toISOString()
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (req: MaintenanceRequest) => {
    setEditingRequest({ ...req });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;

    if (!editingRequest.problemDescription.trim()) {
      setFormError('يرجى كتابة شرح المشكلة أو العطل المطلوب صيانته.');
      return;
    }

    if (!editingRequest.requester.trim()) {
      setFormError('يرجى تحديد اسم رافع الطلب.');
      return;
    }

    const updated: MaintenanceRequest = {
      ...editingRequest,
      createdAt: editingRequest.createdAt || new Date().toISOString()
    };

    setFormError(null);
    try {
      const res = await Promise.resolve(onSaveRequest(updated) as any);
      if (res && typeof res === 'object' && res.success === false) {
        setFormError(res.error || 'تعذر حفظ طلب الصيانة في قاعدة البيانات السحابية.');
        return;
      }
      setIsModalOpen(false);
      setEditingRequest(null);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر حفظ طلب الصيانة في قاعدة البيانات السحابية.');
    }
  };

  const IconComp = sectionMeta.icon;

  return (
    <div className="space-y-5 animate-page-enter">
      
      {/* SECTION HEADER & PRIMARY ACTIONS */}
      <div className="bg-white p-5 rounded-2xl shadow-2xs border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-2xl ${sectionMeta.iconBg}`}>
            <IconComp className="w-7 h-7 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {sectionMeta.title}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
              {sectionMeta.subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
          <button
            onClick={onExportExcel}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-200/90 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="تصدير هذا القسم إلى Excel"
          >
            <Download className="w-4 h-4 text-orange-600" />
            <span>تصدير القسم</span>
          </button>

          <button
            onClick={handleOpenNewModal}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>إضافة طلب جديد</span>
          </button>
        </div>
      </div>

      {/* STATS BREAKDOWN SUMMARY FOR THIS SECTION */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-slate-500">إجمالي الطلبات بالقسم</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums font-mono">{sectionRequests.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-blue-600">جديد</p>
          <p className="text-2xl font-black text-blue-700 mt-1 tabular-nums font-mono">
            {sectionRequests.filter(r => r.status === 'جديد').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-amber-600">جاري العمل</p>
          <p className="text-2xl font-black text-amber-700 mt-1 tabular-nums font-mono">
            {sectionRequests.filter(r => r.status === 'جاري العمل').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-emerald-600">تم الإنجاز</p>
          <p className="text-2xl font-black text-emerald-700 mt-1 tabular-nums font-mono">
            {sectionRequests.filter(r => r.status === 'تم').length}
          </p>
        </div>
      </div>

      {/* SMART MAINTENANCE INSIGHT CONTEXT BANNER */}
      {activeInsightFilter && (
        <div className="p-4 rounded-2xl bg-orange-50/90 border-2 border-orange-300 text-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start md:items-center gap-3">
            <div className="p-2.5 bg-orange-500 text-white rounded-xl shadow-xs shrink-0 flex items-center justify-center">
              <Sparkles className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black px-2.5 py-0.5 rounded-md bg-orange-600 text-white">
                  نتائج التحليل الذكي
                </span>
                <span className="text-xs font-extrabold text-slate-900">
                  {activeInsightFilter.title}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-700 flex flex-wrap items-center gap-1.5">
                <span className="text-orange-950 font-black">{activeInsightFilter.stationName}</span>
                <span className="text-orange-400">·</span>
                <span className="text-slate-800 font-bold">{activeInsightFilter.sectionName}</span>
                <span className="text-orange-400">·</span>
                <span className="font-mono text-orange-700 font-black tabular-nums">{filteredRequests.length} طلبات مرتبطة</span>
                <span className="text-orange-400">·</span>
                <span className="text-slate-600 font-semibold">{activeInsightFilter.periodText}</span>
              </p>
              {activeInsightFilter.explanation && (
                <p className="text-[11px] text-slate-600 font-normal leading-relaxed">
                  {activeInsightFilter.explanation}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClearInsightFilter}
            className="px-4 py-2 bg-white hover:bg-orange-100/70 text-orange-900 border border-orange-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0 active:scale-95 self-end md:self-auto"
          >
            <span>مسح الفلتر</span>
            <X className="w-3.5 h-3.5 text-orange-600 stroke-[2.5]" />
          </button>
        </div>
      )}

      {/* SEARCH AND FILTERS TOOLBAR */}
      <div className="bg-white p-4 rounded-2xl shadow-2xs border border-slate-200/90 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم الطلب، اسم المحطة، التاريخ، الفني، أو حالة الطلب..."
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
            {/* Station Filter */}
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

            {/* Month + Year Filters */}
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

        {/* Status Pills Filter & Bulk Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-500 shrink-0 ml-1">الحالة:</span>
            
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-orange-500 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({sectionRequests.length})
            </button>

            <button
              onClick={() => setStatusFilter('جديد')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'جديد'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              جديد ({sectionRequests.filter(r => r.status === 'جديد').length})
            </button>

            <button
              onClick={() => setStatusFilter('جاري العمل')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'جاري العمل'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              جاري العمل ({sectionRequests.filter(r => r.status === 'جاري العمل').length})
            </button>

            <button
              onClick={() => setStatusFilter('تم')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'تم'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              تم الإنجاز ({sectionRequests.filter(r => r.status === 'تم').length})
            </button>
          </div>

          {/* Bulk Action Controls */}
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

      {/* REQUESTS DATA TABLE */}
      <div className={`bg-white rounded-2xl shadow-2xs border overflow-hidden transition-all ${
        activeInsightFilter ? 'border-orange-300 ring-2 ring-orange-500/10' : 'border-slate-200/90'
      }`}>
        {activeInsightFilter && (
          <div className="bg-orange-500/10 px-4 py-2.5 border-b border-orange-200/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-orange-950 font-bold">
              <Sparkles className="w-4 h-4 text-orange-600 shrink-0" />
              <span>معروضة وفق التحليل الذكي: <span className="font-mono text-orange-700 font-black">{filteredRequests.length}</span> سجلات مرتبطة</span>
            </div>
            <button
              type="button"
              onClick={onClearInsightFilter}
              className="text-orange-700 hover:text-orange-900 font-bold text-xs hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>مسح الفلتر وعرض كافة السجلات</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {filteredRequests.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto border border-slate-200">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-700">لا توجد طلبات صيانة مطابقة</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {activeInsightFilter
                ? 'لا توجد سجلات مطابقة للتحليل الذكي المحدد حالياً.'
                : 'لم يتم العثور على أي طلبات تطابق معايير البحث المحددة حالياً.'}
            </p>
            {activeInsightFilter ? (
              <button
                type="button"
                onClick={onClearInsightFilter}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs mt-2"
              >
                <X className="w-3.5 h-3.5" />
                <span>مسح الفلتر وعرض جميع السجلات</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenNewModal}
                className="px-4 py-2 bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer active:scale-95 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة طلب جديد الآن</span>
              </button>
            )}
          </div>
        ) : (
          <div className="table-container-responsive overflow-x-auto w-full max-w-full">
            <table className="w-full text-right text-xs table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-[90px]" />
                <col className="w-[22%]" />
                <col className="w-[110px]" />
                <col className="w-[18%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[110px]" />
                <col className="w-[100px]" />
              </colgroup>
              <thead className="bg-slate-50/80 text-slate-700 font-bold border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 text-center font-mono">رقم الطلب</th>
                  <th className="py-3 px-4 text-right">المحطة</th>
                  <th className="py-3 px-4 text-center">التاريخ</th>
                  <th className="py-3 px-4 text-right">رافع الطلب</th>
                  <th className="py-3 px-4 text-right">نوع الصيانة</th>
                  <th className="py-3 px-4 text-right">الفني / الإجراء</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRequests.map(req => {
                  const isSelected = selectedIds.includes(req.id);
                  return (
                    <tr
                      key={req.id}
                      className={`hover:bg-orange-50/30 transition-colors even:bg-slate-50/40 ${
                        isSelected ? 'bg-orange-50/60' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectItem(req.id)}
                          className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 font-mono text-center whitespace-nowrap">
                        {req.requestNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 leading-tight break-words" title={req.stationName}>
                          {req.stationName}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono dir-ltr text-center whitespace-nowrap text-[11px]">
                        {req.date}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 break-words" title={req.requester}>
                        {req.requester}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span className="inline-block bg-orange-50/80 text-orange-900 border border-orange-200/50 px-2 py-0.5 rounded-md font-bold text-[10px] xl:text-[11px] whitespace-nowrap">
                          {req.maintenanceType || 'صيانة عامة'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600 text-[11px] break-words text-right" title={req.technician ? `${req.technician} ${req.actionTaken ? `(${req.actionTaken})` : ''}` : 'قيد التعيين'}>
                        {req.technician ? (
                          <span>{req.technician} {req.actionTaken && `(${req.actionTaken})`}</span>
                        ) : (
                          <span className="text-slate-400">قيد التعيين</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {req.status === 'جديد' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] xl:text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                            جديد
                          </span>
                        )}
                        {req.status === 'جاري العمل' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] xl:text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                            جاري العمل
                          </span>
                        )}
                        {req.status === 'تم' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] xl:text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                            تم الإنجاز
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap shrink-0">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(req)}
                            className="p-1.5 bg-white hover:bg-orange-50 text-orange-600 rounded-lg border border-slate-200 hover:border-orange-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="عرض وتعديل"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onPrintRequest(req)}
                            className="p-1.5 bg-white hover:bg-slate-50 text-slate-600 rounded-lg border border-slate-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="طباعة التقرير"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTargetId(req.id)}
                            className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="حذف الطلب"
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

      {/* ADD / EDIT MAINTENANCE REQUEST MODAL */}
      {editingRequest && (
        <ModalPortal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          maxWidthClass="max-w-2xl"
        >
          {/* Modal Header (Fixed) */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 text-orange-600 border border-orange-200/80 rounded-xl font-bold">
                <Wrench className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingRequest.id ? 'تعديل ومتابعة طلب صيانة' : 'إضافة طلب صيانة جديد'}
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  رقم الطلب: {editingRequest.requestNumber}
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

          {/* Modal Form Body with internal scrolling & fixed footer */}
          <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden text-right">
              
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {formError && (
                  <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-toast">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                
                {/* Station Selection Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الموقع / المحطة <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editingRequest.stationId === 'unmatched' ? '' : editingRequest.stationId}
                    onChange={(e) => {
                      const st = stations.find(s => s.id === e.target.value);
                      if (st) {
                        setEditingRequest({
                          ...editingRequest,
                          stationId: st.id,
                          stationName: st.name,
                          stationCode: st.code,
                          isStationUnmatched: false,
                          unmatchedReason: undefined
                        });
                      } else {
                        setEditingRequest({
                          ...editingRequest,
                          stationId: 'unmatched',
                          stationName: 'غير محددة',
                          stationCode: '---',
                          isStationUnmatched: true
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
                        <option value="">
                          -- {editingRequest.isStationUnmatched ? 'المحطة غير محددة حالياً (اختر محطة للربط) ⚠️' : 'اختر المحطة'} --
                        </option>
                        {stations.map(st => (
                          <option key={st.id} value={st.id}>
                            {st.name} ({st.region})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* Section Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      القسم <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <select
                    value={editingRequest.section}
                    onChange={(e) => setEditingRequest({ ...editingRequest, section: e.target.value as 'pumps' | 'tanks' | 'facilities' })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
                    required
                  >
                    <option value="pumps">قسم المضخات</option>
                    <option value="tanks">قسم الخزانات</option>
                    <option value="facilities">قسم المرافق والساحات</option>
                  </select>
                </div>

                {/* Request Type */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      نوع الطلب <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    list="request-type-options"
                    value={editingRequest.requestType}
                    onChange={(e) => setEditingRequest({ ...editingRequest, requestType: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                    placeholder="مثال: مضخات الوقود، دورات المياه والمسجد والساحة والمدخل والمخرج..."
                    required
                  />
                  <datalist id="request-type-options">
                    <option value="مضخات الوقود" />
                    <option value="دورات المياه والمسجد والساحة والمدخل والمخرج" />
                    <option value="خزانات الوقود" />
                    <option value="إنارة وكهرباء" />
                    <option value="سباكة وصحي" />
                    <option value="مباني ومرافق" />
                    <option value="لوحات ومظلات" />
                  </datalist>
                </div>

                {/* Maintenance Type */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      نوع الصيانة
                    </label>
                  </div>
                  <input
                    type="text"
                    list="maintenance-type-options"
                    placeholder="مثال: طارئة، إصلاحية، دورية، وقائية، كهرباء وميكانيكا..."
                    value={editingRequest.maintenanceType}
                    onChange={(e) => setEditingRequest({ ...editingRequest, maintenanceType: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                  />
                  <datalist id="maintenance-type-options">
                    <option value="طارئة" />
                    <option value="إصلاحية" />
                    <option value="دورية" />
                    <option value="وقائية" />
                    <option value="كهرباء وميكانيكا" />
                    <option value="معايرة وفلاتر" />
                    <option value="سباكة وصحي" />
                    <option value="مدني وإنشاءات" />
                    <option value="إنارة وكهرباء" />
                    <option value="نظافة وخدمات" />
                    <option value="أمن وسلامة" />
                    <option value="أخرى" />
                  </datalist>
                </div>

                {/* Request Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ الطلب <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editingRequest.date}
                    onChange={(e) => setEditingRequest({ ...editingRequest, date: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                    required
                  />
                </div>

                {/* Requester Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رافع الطلب (اسم المشرف / الموظف) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: عبدالله السلمان"
                    value={editingRequest.requester}
                    onChange={(e) => setEditingRequest({ ...editingRequest, requester: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                    required
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حالة الطلب
                  </label>
                  <select
                    value={editingRequest.status}
                    onChange={(e) => setEditingRequest({ ...editingRequest, status: e.target.value as MaintenanceStatus })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
                  >
                    <option value="جديد">جديد</option>
                    <option value="جاري العمل">جاري العمل</option>
                    <option value="تم">تم الإنجاز</option>
                  </select>
                </div>

                {/* Technician */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الفني المسؤول
                  </label>
                  <input
                    type="text"
                    placeholder="اسم الفني أو المقاول..."
                    value={editingRequest.technician || ''}
                    onChange={(e) => setEditingRequest({ ...editingRequest, technician: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>

              </div>

              {/* Problem Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  شرح المشكلة / العطل <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="اكتب تفاصيل العطل والمطلوب تنفيذه بدقة..."
                  value={editingRequest.problemDescription}
                  onChange={(e) => setEditingRequest({ ...editingRequest, problemDescription: e.target.value })}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white resize-none"
                  required
                />
              </div>

              {/* SMART MAINTENANCE REQUEST CLASSIFICATION SUGGESTIONS (FEATURE 3) */}

              {/* SMART DUPLICATE REQUEST WARNING (LOCAL AI-ASSISTED) */}

              {/* Action Taken */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الإجراء المتخذ
                </label>
                <textarea
                  rows={2}
                  placeholder="الإجراء المنفذ لحل العطل..."
                  value={editingRequest.actionTaken || ''}
                  onChange={(e) => setEditingRequest({ ...editingRequest, actionTaken: e.target.value })}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white resize-none"
                />
              </div>

              {/* Completion Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات الإنجاز / الإغلاق
                </label>
                <input
                  type="text"
                  placeholder="أي تفاصيل أو ضمانات..."
                  value={editingRequest.completionNotes || ''}
                  onChange={(e) => setEditingRequest({ ...editingRequest, completionNotes: e.target.value })}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
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
                {editingRequest.id ? 'حفظ التعديلات' : 'إضافة الطلب'}
              </button>
            </div>

          </form>
        </ModalPortal>
      )}

      {/* SINGLE ITEM DELETE CONFIRMATION */}
      <ConfirmModal
        isOpen={deleteTargetId !== null}
        title="تأكيد حذف طلب الصيانة"
        message="هل أنت متأكد من رغبتك في حذف طلب الصيانة هذا؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف الطلب"
        cancelLabel="إلغاء"
        isDanger={true}
        onConfirm={() => {
          if (deleteTargetId) onDeleteRequest(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* BULK DELETE CONFIRMATION */}
      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        title="تأكيد الحذف الجماعي"
        message={`هل أنت متأكد من حذف ${selectedIds.length} طلب صيانة محدد نهائياً؟`}
        confirmLabel={`نعم، احذف ${selectedIds.length} سجل`}
        cancelLabel="إلغاء"
        isDanger={true}
        onConfirm={handleExecuteBulkDelete}
        onCancel={() => setIsBulkDeleteModalOpen(false)}
      />

    </div>
  );
};
