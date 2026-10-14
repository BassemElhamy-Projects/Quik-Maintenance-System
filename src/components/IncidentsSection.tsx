import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Plus,
  Search,
  Filter,
  Printer,
  Edit3,
  Trash2,
  X,
  MapPin,
  ShieldAlert,
  CheckSquare,
  Square,
  UserCheck,
  AlertCircle,
  Download
} from 'lucide-react';
import { IncidentRecord, Station } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { ModalPortal } from './ModalPortal';
import { getNextIncidentNumber, parseValidRequestNumber } from '../utils/requestSequencer';
import { getDynamicYearOptions, matchMonthAndYear } from '../utils/dateFilters';
import { MonthYearFilter } from './MonthYearFilter';

interface IncidentsSectionProps {
  incidents: IncidentRecord[];
  stations: Station[];
  onSaveIncident: (inc: IncidentRecord) => void;
  onDeleteIncident: (id: string) => void;
  onDeleteMultipleIncidents?: (ids: string[]) => void;
  onPrintIncident: (inc: IncidentRecord) => void;
  onExportExcel?: () => void;
  onImportExcelClick?: () => void;
}

export const IncidentsSection: React.FC<IncidentsSectionProps> = ({
  incidents,
  stations,
  onSaveIncident,
  onDeleteIncident,
  onDeleteMultipleIncidents,
  onPrintIncident,
  onExportExcel
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [stationFilter, setStationFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<IncidentRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Extract unique regions for filter
  const regionsList = useMemo(() => {
    const list = new Set<string>();
    stations.forEach(s => { if (s.region) list.add(s.region); });
    incidents.forEach(i => { if (i.region) list.add(i.region); });
    return Array.from(list);
  }, [stations, incidents]);

  // Dynamically compute available years from existing incident dates
  const availableYears = useMemo(() => {
    return getDynamicYearOptions(incidents.map(i => i.date));
  }, [incidents]);

  // Filter incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      if (regionFilter !== 'all' && inc.region !== regionFilter) return false;
      if (stationFilter !== 'all' && inc.stationId !== stationFilter) return false;

      // Month & Year Date Filters (based on actual business date inc.date)
      if (!matchMonthAndYear(inc.date, monthFilter, yearFilter)) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      return (
        inc.incidentNumber.toLowerCase().includes(q) ||
        inc.stationName.toLowerCase().includes(q) ||
        inc.stationCode.toLowerCase().includes(q) ||
        inc.region.toLowerCase().includes(q) ||
        inc.date.includes(q) ||
        inc.incidentType.toLowerCase().includes(q) ||
        inc.causingParty.toLowerCase().includes(q) ||
        (inc.vehicleType && inc.vehicleType.toLowerCase().includes(q)) ||
        inc.description.toLowerCase().includes(q) ||
        (inc.responsiblePartyReport && inc.responsiblePartyReport.toLowerCase().includes(q)) ||
        (inc.reporterNameAndSignature && inc.reporterNameAndSignature.toLowerCase().includes(q))
      );
    });
  }, [incidents, searchTerm, regionFilter, stationFilter, monthFilter, yearFilter]);

  // Default Display Sort: strictly ASCENDING by incident record number (1 -> 2 -> 3 ...)
  const sortedIncidents = useMemo(() => {
    return [...filteredIncidents].sort((a, b) => {
      const numA = parseValidRequestNumber(a.incidentNumber) ?? 0;
      const numB = parseValidRequestNumber(b.incidentNumber) ?? 0;
      if (numA !== numB) {
        return numA - numB;
      }
      return (a.date || '').localeCompare(b.date || '');
    });
  }, [filteredIncidents]);

  // Bulk Select
  const isAllSelected = useMemo(() => {
    if (sortedIncidents.length === 0) return false;
    return sortedIncidents.every(i => selectedIds.includes(i.id));
  }, [sortedIncidents, selectedIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const filteredItemIds = sortedIncidents.map(i => i.id);
      setSelectedIds(prev => prev.filter(id => !filteredItemIds.includes(id)));
    } else {
      const filteredItemIds = sortedIncidents.map(i => i.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredItemIds])));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleExecuteBulkDelete = () => {
    if (onDeleteMultipleIncidents && selectedIds.length > 0) {
      onDeleteMultipleIncidents(selectedIds);
    } else {
      selectedIds.forEach(id => onDeleteIncident(id));
    }
    setSelectedIds([]);
    setIsBulkDeleteModalOpen(false);
  };

  const handleOpenNewModal = () => {
    const autoNumber = getNextIncidentNumber(incidents);
    const today = new Date().toISOString().slice(0, 10);

    const firstStation = stations[0] || { id: 'unmatched', name: 'غير محددة', code: '---', region: 'عسير' };

    setEditingIncident({
      id: '',
      incidentNumber: autoNumber,
      region: firstStation.region || 'عسير',
      stationId: firstStation.id,
      stationName: firstStation.name,
      stationCode: firstStation.code,
      date: today,
      time: '12:00',
      incidentType: 'اصطدام بالمضخة أو المظلة',
      causingParty: '',
      vehicleType: 'سيارة صالون / سيدان',
      generalInfo: '',
      description: '',
      preventionSuggestions: 'تركيب مصدات حماية إضافية وتحديث كاميرات المراقبة',
      responsiblePartyReport: 'تم إعداد تقرير نجم ومحضر المرور',
      notes: '',
      reporterNameAndSignature: 'مشرف السلامة والتشغيل بالمحطة',
      createdAt: new Date().toISOString()
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (inc: IncidentRecord) => {
    setEditingIncident({ ...inc });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIncident) return;

    if (!editingIncident.causingParty.trim()) {
      setFormError('يرجى كتابة اسم المتسبب أو تفاصيل الطرف المسؤول عن الحادث.');
      return;
    }

    if (!editingIncident.description.trim()) {
      setFormError('يرجى كتابة وصف تفصيلي للحادث.');
      return;
    }

    const updated: IncidentRecord = {
      ...editingIncident,
      createdAt: editingIncident.createdAt || new Date().toISOString()
    };

    setFormError(null);
    try {
      const res = await Promise.resolve(onSaveIncident(updated) as any);
      if (res && typeof res === 'object' && res.success === false) {
        setFormError(res.error || 'تعذر حفظ بلاغ الحادث. يرجى المحاولة مرة أخرى.');
        return;
      }
      setIsModalOpen(false);
      setEditingIncident(null);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر حفظ بلاغ الحادث. يرجى المحاولة مرة أخرى.');
    }
  };

  return (
    <div className="space-y-5 animate-page-enter">
      
      {/* SECTION HEADER & PRIMARY ACTIONS */}
      <div className="bg-white p-5 rounded-2xl shadow-2xs border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200/80">
            <AlertTriangle className="w-7 h-7 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              سجل الحوادث
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
              توثيق بلاغات الحوادث والاصطدامات بالمحطات، ومتابعة محاضر الجهات المسؤولة
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-200/90 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="تصدير سجل الحوادث إلى Excel"
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
            <span>تسجيل بلاغ حادث جديد</span>
          </button>
        </div>
      </div>

      {/* STATS SUMMARY BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-slate-500">إجمالي الحوادث المسجلة</p>
          <p className="text-2xl font-black text-rose-600 mt-1 tabular-nums font-mono">{incidents.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-slate-500">المناطق المتأثرة</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums font-mono">{regionsList.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-amber-600">اصطدام بالمضخات</p>
          <p className="text-2xl font-black text-amber-700 mt-1 tabular-nums font-mono">
            {incidents.filter(i => i.incidentType.includes('مضخ') || i.incidentType.includes('مظلة')).length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-emerald-600">محاضر مكتملة</p>
          <p className="text-2xl font-black text-emerald-700 mt-1 tabular-nums font-mono">
            {incidents.filter(i => i.responsiblePartyReport && i.responsiblePartyReport.trim().length > 0).length}
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
              placeholder="ابحث برقم البلاغ، المحطة، المتسبب، نوع الحادث، السيارة..."
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

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
                className="bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
              >
                <option value="all">كل المحطات ({stations.length})</option>
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
              >
                <option value="all">كل المناطق</option>
                {regionsList.map(reg => (
                  <option key={reg} value={reg}>منطقة {reg}</option>
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

        {/* Bulk Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSelectAll}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-orange-600" /> : <Square className="w-3.5 h-3.5" />}
              <span>تحديد الكل ({filteredIncidents.length})</span>
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

          <div className="text-xs text-slate-500 font-bold">
            عدد النتائج: {filteredIncidents.length} من {incidents.length}
          </div>
        </div>
      </div>

      {/* INCIDENTS TABLE */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden">
        {filteredIncidents.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto border border-slate-200">
              <AlertTriangle className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-700">لا توجد بلاغات حوادث مسجلة</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">لم يتم العثور على أي حوادث تطابق محددات البحث الحالية.</p>
            <button
              onClick={handleOpenNewModal}
              className="px-4 py-2 bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer active:scale-95 mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل بلاغ حادث الآن</span>
            </button>
          </div>
        ) : (
          <div className="table-container-responsive overflow-x-auto w-full max-w-full">
            <table className="w-full text-right text-xs table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-[110px]" />
                <col className="w-[30%]" />
                <col className="w-[130px]" />
                <col className="w-[26%]" />
                <col className="w-[20%]" />
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
                  <th className="py-3 px-4 text-center font-mono">رقم البلاغ</th>
                  <th className="py-3 px-4 text-right">المحطة والمنطقة</th>
                  <th className="py-3 px-4 text-center">التاريخ والوقت</th>
                  <th className="py-3 px-4 text-right">المتسبب والسيارة</th>
                  <th className="py-3 px-4 text-right">تقرير الجهة المسؤولة</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedIncidents.map(inc => {
                  const isSelected = selectedIds.includes(inc.id);
                  return (
                    <tr
                      key={inc.id}
                      className={`hover:bg-orange-50/30 transition-colors even:bg-slate-50/40 ${
                        isSelected ? 'bg-orange-50/60' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectItem(inc.id)}
                          className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 font-mono text-center whitespace-nowrap">
                        {inc.incidentNumber}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-slate-900 leading-tight break-words" title={inc.stationName}>{inc.stationName}</div>
                        {inc.region && (
                          <div className="text-[10px] text-slate-500 break-words">منطقة {inc.region}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono dir-ltr text-center whitespace-nowrap text-[11px]">
                        {inc.date} <span className="text-slate-400 text-[10px]">({inc.time})</span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-slate-900 leading-tight break-words" title={inc.causingParty}>{inc.causingParty}</div>
                        {inc.vehicleType && (
                          <div className="text-[10px] text-slate-500 leading-tight break-words" title={inc.vehicleType}>{inc.vehicleType}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-700 text-[11px] break-words" title={inc.responsiblePartyReport || '---'}>
                        {inc.responsiblePartyReport || '---'}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap shrink-0">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(inc)}
                            className="p-1.5 bg-white hover:bg-orange-50 text-orange-600 rounded-lg border border-slate-200 hover:border-orange-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="تعديل البلاغ"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onPrintIncident(inc)}
                            className="p-1.5 bg-white hover:bg-slate-50 text-slate-600 rounded-lg border border-slate-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="طباعة التقرير"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTargetId(inc.id)}
                            className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="حذف البلاغ"
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

      {/* ADD / EDIT INCIDENT MODAL */}
      {editingIncident && (
        <ModalPortal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          maxWidthClass="max-w-2xl"
        >
          {/* Modal Header (Fixed) */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 border border-rose-200/80 rounded-xl font-bold">
                <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingIncident.id ? 'تعديل ومتابعة بلاغ الحادث' : 'تسجيل بلاغ حادث جديد بالمحطة'}
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  رقم البلاغ: {editingIncident.incidentNumber}
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

              {/* Section 1: Basic Station & Date Info */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-orange-600" />
                  بيانات الموقع والوقت
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      المحطة <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editingIncident.stationId}
                      onChange={(e) => {
                        const st = stations.find(s => s.id === e.target.value);
                        if (st) {
                          setEditingIncident({
                            ...editingIncident,
                            stationId: st.id,
                            stationName: st.name,
                            stationCode: st.code,
                            region: st.region || editingIncident.region
                          });
                        } else {
                          setEditingIncident({
                            ...editingIncident,
                            stationId: '',
                            stationName: '',
                            stationCode: ''
                          });
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 cursor-pointer"
                      required
                    >
                      {stations.length === 0 ? (
                        <option value="">لا توجد محطات</option>
                      ) : (
                        <>
                          <option value="">-- اختر المحطة --</option>
                          {stations.map(st => (
                            <option key={st.id} value={st.id}>
                              {st.name} ({st.region})
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      المنطقة <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="اسم المنطقة..."
                      value={editingIncident.region}
                      onChange={(e) => setEditingIncident({ ...editingIncident, region: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      التاريخ <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editingIncident.date}
                      onChange={(e) => setEditingIncident({ ...editingIncident, date: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      وقت الحادث <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={editingIncident.time}
                      onChange={(e) => setEditingIncident({ ...editingIncident, time: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      نوع الحادث
                    </label>
                    <select
                      value={editingIncident.incidentType}
                      onChange={(e) => setEditingIncident({ ...editingIncident, incidentType: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 cursor-pointer"
                    >
                      <option value="اصطدام بالمضخة أو المظلة">اصطدام بالمضخة أو المظلة</option>
                      <option value="اصطدام بالرصيف أو اللوحات">اصطدام بالرصيف أو اللوحات</option>
                      <option value="هروب بدون دفع / سحب المسدس">هروب بدون دفع / سحب المسدس</option>
                      <option value="حادث مروري داخل الساحة">حادث مروري داخل الساحة</option>
                      <option value="حريق أو تسريب وقود">حريق أو تسريب وقود</option>
                      <option value="أخرى">أخرى</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Causing Party & Vehicle */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-orange-600" />
                  بيانات المتسبب والسيارة
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      المتسبب بالحادث <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="اسم السائق أو رقم اللوحة..."
                      value={editingIncident.causingParty}
                      onChange={(e) => setEditingIncident({ ...editingIncident, causingParty: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      نوع السيارة وموديلها
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: تويوتا كامري 2023 - أبيض..."
                      value={editingIncident.vehicleType || ''}
                      onChange={(e) => setEditingIncident({ ...editingIncident, vehicleType: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      معلومات إضافية (رقم الهوية / الجوال / التأمين)
                    </label>
                    <input
                      type="text"
                      placeholder="رقم التواصل أو وثيقة التأمين..."
                      value={editingIncident.generalInfo || ''}
                      onChange={(e) => setEditingIncident({ ...editingIncident, generalInfo: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Description & Actions */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    وصف الحادث والأضرار بالتفصيل <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="اشرح بدقة كيفية وقوع الحادث والأضرار المادية اللاحقة بالمحطة ومرافقها..."
                    value={editingIncident.description}
                    onChange={(e) => setEditingIncident({ ...editingIncident, description: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      تقرير الجهة المسؤولة (المرور / نجم / الدفاع المدني)
                    </label>
                    <input
                      type="text"
                      placeholder="رقم وتفاصيل التقرير الرسمي..."
                      value={editingIncident.responsiblePartyReport || ''}
                      onChange={(e) => setEditingIncident({ ...editingIncident, responsiblePartyReport: e.target.value })}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      معد التقرير والتوقيع
                    </label>
                    <input
                      type="text"
                      placeholder="اسم المشرف أو مسؤول السلامة..."
                      value={editingIncident.reporterNameAndSignature || ''}
                      onChange={(e) => setEditingIncident({ ...editingIncident, reporterNameAndSignature: e.target.value })}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    مقترحات لتجنب هذا النوع من الحوادث مستقبلاً
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: وضع حواجز أسمنتية، زيادة لوحات التحذير..."
                    value={editingIncident.preventionSuggestions}
                    onChange={(e) => setEditingIncident({ ...editingIncident, preventionSuggestions: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
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
                {editingIncident.id ? 'حفظ التعديلات' : 'حفظ بلاغ الحادث'}
              </button>
            </div>

          </form>
        </ModalPortal>
      )}

      {/* SINGLE DELETE CONFIRMATION */}
      <ConfirmModal
        isOpen={deleteTargetId !== null}
        title="تأكيد حذف بلاغ الحادث"
        message="هل أنت متأكد من رغبتك في حذف بلاغ الحادث هذا؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف البلاغ"
        cancelLabel="إلغاء"
        isDanger={true}
        onConfirm={() => {
          if (deleteTargetId) onDeleteIncident(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* BULK DELETE CONFIRMATION */}
      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        title="تأكيد الحذف الجماعي"
        message={`هل أنت متأكد من حذف ${selectedIds.length} بلاغ حادث محدد نهائياً؟`}
        confirmLabel={`نعم، احذف ${selectedIds.length} بلاغ`}
        cancelLabel="إلغاء"
        isDanger={true}
        onConfirm={handleExecuteBulkDelete}
        onCancel={() => setIsBulkDeleteModalOpen(false)}
      />

    </div>
  );
};
