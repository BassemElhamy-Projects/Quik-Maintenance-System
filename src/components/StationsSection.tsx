import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  MapPin,
  Phone,
  User,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  ClipboardCheck,
  AlertTriangle,
  Zap,
  RotateCcw,
  Sparkles,
  Info,
  X,
  Power
} from 'lucide-react';
import { Station, StationStatus, AppData, MaintenanceRequest, InternalInspection, IncidentRecord } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { ModalPortal } from './ModalPortal';

interface StationsSectionProps {
  stations: Station[];
  appData: AppData;
  onSaveStation: (st: Station) => void;
  onDeleteStation: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

export const StationsSection: React.FC<StationsSectionProps> = ({
  stations,
  appData,
  onSaveStation,
  onDeleteStation,
  onToggleStatus
}) => {
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'نشطة' | 'غير نشطة'>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete & Protection State
  const [stationToDelete, setStationToDelete] = useState<Station | null>(null);
  const [linkedRecordsWarning, setLinkedRecordsWarning] = useState<{
    station: Station;
    pumpsCount: number;
    tanksCount: number;
    facilitiesCount: number;
    inspectionsCount: number;
    incidentsCount: number;
    totalRecords: number;
    isOfficial: boolean;
  } | null>(null);

  // Unique list of regions
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    stations.forEach(s => {
      if (s.region && s.region.trim()) set.add(s.region.trim());
    });
    return Array.from(set);
  }, [stations]);

  // Compute linked records for any station
  const getStationLinkedCounts = (st: Station) => {
    const pumpsCount = appData.maintenanceRequests.filter(
      r => r.section === 'pumps' && (r.stationId === st.id || r.stationCode === st.code)
    ).length;
    const tanksCount = appData.maintenanceRequests.filter(
      r => r.section === 'tanks' && (r.stationId === st.id || r.stationCode === st.code)
    ).length;
    const facilitiesCount = appData.maintenanceRequests.filter(
      r => r.section === 'facilities' && (r.stationId === st.id || r.stationCode === st.code)
    ).length;
    const inspectionsCount = appData.inspections.filter(
      i => i.stationId === st.id || i.stationCode === st.code
    ).length;
    const incidentsCount = appData.incidents.filter(
      inc => inc.stationId === st.id || inc.stationCode === st.code
    ).length;
    const totalRecords = pumpsCount + tanksCount + facilitiesCount + inspectionsCount + incidentsCount;

    return {
      pumpsCount,
      tanksCount,
      facilitiesCount,
      inspectionsCount,
      incidentsCount,
      totalRecords
    };
  };

  // Filter and sort stations by numeric station code so the list stays in 1, 2, 3... order.
  const filteredStations = useMemo(() => {
    const getNumericCode = (code: string | number | null | undefined): number => {
      const normalizedCode = String(code ?? '')
        .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776));
      const digits = normalizedCode.match(/\d+/g)?.join('');
      return digits ? Number.parseInt(digits, 10) : Number.POSITIVE_INFINITY;
    };

    const sortedStations = [...stations].sort((a, b) => {
      const codeA = getNumericCode(a.code);
      const codeB = getNumericCode(b.code);
      if (codeA !== codeB) return codeA - codeB;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ar');
    });

    return sortedStations.filter(st => {
      if (statusFilter !== 'all') {
        const currentStatus = st.status || 'نشطة';
        if (currentStatus !== statusFilter) return false;
      }
      if (regionFilter !== 'all' && st.region !== regionFilter) {
        return false;
      }
      if (!searchTerm.trim()) return true;

      const q = searchTerm.toLowerCase().trim();
      return (
        st.name.toLowerCase().includes(q) ||
        st.code.toLowerCase().includes(q) ||
        st.region.toLowerCase().includes(q) ||
        (st.city && st.city.toLowerCase().includes(q)) ||
        (st.supervisor && st.supervisor.toLowerCase().includes(q)) ||
        (st.phone && st.phone.includes(q)) ||
        (st.address && st.address.toLowerCase().includes(q))
      );
    });
  }, [stations, searchTerm, statusFilter, regionFilter]);

  // Summary Metrics
  const activeCount = stations.filter(s => (s.status || 'نشطة') === 'نشطة').length;
  const inactiveCount = stations.filter(s => (s.status || 'نشطة') === 'غير نشطة').length;

  const handleOpenNewModal = () => {
    setEditingStation({
      id: '',
      code: '',
      name: '',
      region: 'عسير',
      city: '',
      address: '',
      status: 'نشطة',
      phone: '',
      supervisor: '',
      notes: '',
      isDefault: false,
      createdAt: new Date().toISOString()
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (st: Station) => {
    setEditingStation({ ...st });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStation) return;

    if (!editingStation.code.trim()) {
      setFormError('يرجى إدخال رقم المحطة (Code).');
      return;
    }

    if (!editingStation.name.trim()) {
      setFormError('يرجى إدخال اسم المحطة الكامل.');
      return;
    }

    if (!editingStation.region.trim()) {
      setFormError('يرجى تحديد منطقة المحطة.');
      return;
    }

    // Check duplicate code
    const isCodeDuplicate = stations.some(
      s => s.code.trim() === editingStation.code.trim() && s.id !== editingStation.id
    );
    if (isCodeDuplicate) {
      setFormError(`رقم المحطة [${editingStation.code}] مسجل مسبقاً لمحطة أخرى.`);
      return;
    }

    const updated: Station = {
      ...editingStation,
      status: editingStation.status || 'نشطة',
      updatedAt: new Date().toISOString()
    };

    setFormError(null);
    try {
      const res = await Promise.resolve(onSaveStation(updated) as any);
      if (res && typeof res === 'object' && res.success === false) {
        setFormError(res.error || 'تعذر حفظ بيانات المحطة. يرجى المحاولة مرة أخرى.');
        return;
      }
      setIsModalOpen(false);
      setEditingStation(null);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر حفظ بيانات المحطة. يرجى المحاولة مرة أخرى.');
    }
  };

  // Attempt Delete with Protection checks
  const handleAttemptDelete = (st: Station) => {
    const linked = getStationLinkedCounts(st);

    if (st.isDefault || linked.totalRecords > 0) {
      setLinkedRecordsWarning({
        station: st,
        ...linked,
        isOfficial: Boolean(st.isDefault)
      });
      return;
    }

    setStationToDelete(st);
  };

  const handleConfirmDelete = () => {
    if (stationToDelete) {
      onDeleteStation(stationToDelete.id);
      setStationToDelete(null);
    }
  };

  return (
    <div className="space-y-5 animate-page-enter">
      
      {/* SECTION HEADER & PRIMARY ACTION */}
      <div className="bg-white p-5 rounded-2xl shadow-2xs border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl border border-orange-200/80">
            <Building2 className="w-7 h-7 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              إدارة المحطات المركزية
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
              الدليل الرسمي والتأسيسي لمحطات كويك للوقود المعتمدة في كافة النماذج والأقسام
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenNewModal}
          className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>إضافة محطة جديدة</span>
        </button>
      </div>

      {/* STATS SUMMARY BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-slate-500">إجمالي المحطات المسجلة</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums font-mono">{stations.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-emerald-600">المحطات النشطة</p>
          <p className="text-2xl font-black text-emerald-700 mt-1 tabular-nums font-mono">{activeCount}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs text-right">
          <p className="text-xs font-bold text-slate-500">المحطات غير النشطة</p>
          <p className="text-2xl font-black text-slate-700 mt-1 tabular-nums font-mono">{inactiveCount}</p>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث برقم المحطة، اسمها، المنطقة، المدينة، أو المشرف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full py-2.5 px-3 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
            >
              <option value="all">جميع الحالات (الكل)</option>
              <option value="نشطة">🟢 المحطات النشطة فقط</option>
              <option value="غير نشطة">⚪ المحطات غير النشطة</option>
            </select>
          </div>

          {/* Region Filter */}
          <div className="sm:col-span-3">
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
            >
              <option value="all">جميع المناطق</option>
              {availableRegions.map(reg => (
                <option key={reg} value={reg}>منطقة {reg}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Active Filter Tags */}
        {(searchTerm || statusFilter !== 'all' || regionFilter !== 'all') && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-bold">النتائج المصفاة: {filteredStations.length} من {stations.length}</span>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setRegionFilter('all');
              }}
              className="text-orange-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>إعادة تعيين الفلاتر</span>
            </button>
          </div>
        )}
      </div>

      {/* STATIONS TABLE */}
      <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden">
        <div className="table-container-responsive overflow-x-auto w-full max-w-full">
          <table className="w-full min-w-[1100px] text-right text-xs table-fixed">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[17%]" />
              <col className="w-[10%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-y border-slate-200">
              <tr>
                <th className="py-3 px-4 text-right">اسم المحطة</th>
                <th className="py-3 px-4 text-right">المنطقة والمدينة</th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4 text-right">المشرف والتواصل</th>
                <th className="py-3 px-4 text-center">السجلات</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-sm">لا توجد محطات مطابقة للبحث</p>
                    <p className="text-xs text-slate-400 mt-0.5">جرّب تغيير كلمات البحث أو إعادة ضبط الفلاتر</p>
                  </td>
                </tr>
              ) : (
                filteredStations.map(st => {
                  const linked = getStationLinkedCounts(st);
                  const isActive = (st.status || 'نشطة') === 'نشطة';

                  return (
                    <tr key={st.id} className="hover:bg-orange-50/30 transition-colors even:bg-slate-50/40 group">
                      
                      {/* Station Name */}
                      <td className="py-4 px-4 font-bold text-slate-900 text-right">
                        <div className="flex min-w-0 items-center justify-start">
                          <span
                            className="min-w-0 text-sm font-bold text-slate-900 leading-tight break-words"
                            title={st.name}
                          >
                            {st.name}
                          </span>
                        </div>
                        {st.address && (
                          <div className="text-[11px] text-slate-500 font-normal mt-0.5 flex items-center gap-1 break-words justify-start" title={st.address}>
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{st.address}</span>
                          </div>
                        )}
                      </td>

                      {/* Region & City */}
                      <td className="py-4 px-4 text-slate-700 text-right">
                        <div className="font-bold text-slate-800">منطقة {st.region}</div>
                        {st.city && (
                          <div className="text-[11px] text-slate-500 font-medium">مدينة: {st.city}</div>
                        )}
                      </td>

                      {/* Station Status Toggle */}
                      <td className="py-4 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => onToggleStatus(st.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer shadow-2xs active:scale-95 ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200'
                          }`}
                          title="اضغط للتبديل بين نشطة وغير نشطة"
                        >
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                          <span>{isActive ? 'نشطة' : 'غير نشطة'}</span>
                        </button>
                      </td>

                      {/* Supervisor & Phone */}
                      <td className="py-4 px-5 text-slate-700">
                        {st.supervisor ? (
                          <div className="flex items-center gap-1 font-semibold text-slate-800 break-words" title={st.supervisor}>
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{st.supervisor}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">غير محدد</span>
                        )}
                        {st.phone && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{st.phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Linked Records Breakdown */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold">
                          <span>{linked.totalRecords} سجل</span>
                          {linked.totalRecords > 0 && (
                            <span className="text-slate-500 text-[10px] font-normal" title="صيانة | تفتيش | حوادث">
                              ({linked.pumpsCount + linked.tanksCount + linked.facilitiesCount} ص | {linked.inspectionsCount} ف | {linked.incidentsCount} ح)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-center whitespace-nowrap shrink-0">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(st)}
                            className="p-1.5 bg-white hover:bg-orange-50 text-orange-600 rounded-lg border border-slate-200 hover:border-orange-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title="تعديل بيانات المحطة"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleAttemptDelete(st)}
                            aria-label={`حذف محطة ${st.name}`}
                            className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 shadow-sm transition-all cursor-pointer active:scale-95"
                            title={
                              st.isDefault
                                ? 'محطة رسمية تأسيسية محمية من الحذف'
                                : linked.totalRecords > 0
                                ? `لا يمكن حذف المحطة لوجود ${linked.totalRecords} سجل مرتبط بها`
                                : 'حذف المحطة'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT STATION MODAL */}
      {editingStation && (
        <ModalPortal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          maxWidthClass="max-w-xl"
        >
          {/* Modal Header (Fixed) */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 text-orange-600 border border-orange-200/80 rounded-xl font-bold">
                <Building2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingStation.id ? 'تعديل بيانات المحطة' : 'إضافة محطة جديدة للدليل المركزي'}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  إدارة بيانات وهوية المحطة الرسمية
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
                
                {/* Station Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم المحطة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 11"
                    value={editingStation.code}
                    onChange={(e) => setEditingStation({ ...editingStation, code: e.target.value })}
                    disabled={Boolean(editingStation.isDefault)}
                    className={`w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold font-mono text-slate-900 outline-none focus:border-orange-500 focus:bg-white ${
                      editingStation.isDefault ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''
                    }`}
                    required
                  />
                  {editingStation.isDefault && (
                    <p className="text-[10px] text-orange-600 font-bold mt-1">
                      ⭐ رقم المحطة ثابت للمحطات التأسيسية الرسمية
                    </p>
                  )}
                </div>

                {/* Station Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حالة المحطة <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editingStation.status || 'نشطة'}
                    onChange={(e) => setEditingStation({ ...editingStation, status: e.target.value as StationStatus })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-orange-500 focus:bg-white cursor-pointer"
                  >
                    <option value="نشطة">🟢 نشطة (متاحة في كافة النماذج)</option>
                    <option value="غير نشطة">⚪ غير نشطة (معطلة مؤقتاً)</option>
                  </select>
                </div>

                {/* Station Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المحطة الكامل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: كويك - 11 طريق الملك فهد"
                    value={editingStation.name}
                    onChange={(e) => setEditingStation({ ...editingStation, name: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-orange-500 focus:bg-white"
                    required
                  />
                </div>

                {/* Region */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المنطقة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: عسير / جازان / الرياض..."
                    value={editingStation.region}
                    onChange={(e) => setEditingStation({ ...editingStation, region: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:bg-white"
                    required
                  />
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المدينة</label>
                  <input
                    type="text"
                    placeholder="مثال: أبها / خميس مشيط / الدرب..."
                    value={editingStation.city || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, city: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>

                {/* Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / الموقع بالتفصيل</label>
                  <input
                    type="text"
                    placeholder="مثال: طريق الملك خالد - بجوار المطار..."
                    value={editingStation.address || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, address: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>

                {/* Supervisor Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المشرف المسؤول</label>
                  <input
                    type="text"
                    placeholder="اسم المشرف..."
                    value={editingStation.supervisor || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, supervisor: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف / التواصل</label>
                  <input
                    type="text"
                    placeholder="05xxxx..."
                    value={editingStation.phone || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, phone: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:bg-white font-mono"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                  <textarea
                    rows={2}
                    placeholder="أي تفاصيل تشغيلية أو ملاحظات خاصة بالمحطة..."
                    value={editingStation.notes || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, notes: e.target.value })}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:bg-white resize-none"
                  />
                </div>

              </div>

            </div>

            {/* Fixed Modal Footer */}
            <div className="border-t border-slate-200 px-6 py-3.5 bg-slate-50/90 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer transition-all active:scale-95"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                {editingStation.id ? 'حفظ التعديلات' : 'إضافة المحطة'}
              </button>
            </div>

          </form>
        </ModalPortal>
      )}

      {/* LINKED RECORDS WARNING / PROTECTION MODAL */}
      {linkedRecordsWarning && (
        <ModalPortal
          isOpen={Boolean(linkedRecordsWarning)}
          onClose={() => setLinkedRecordsWarning(null)}
          maxWidthClass="max-w-lg"
        >
          <div className="p-6 text-right space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-50 text-orange-700 rounded-2xl border border-orange-200/80">
                <AlertTriangle className="w-6 h-6 stroke-[2.2] text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {linkedRecordsWarning.isOfficial ? 'محطة رسمية تأسيسية محمية' : 'حماية السجلات التاريخية للمحطة'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {linkedRecordsWarning.station.name}
                </p>
              </div>
            </div>

            <div className="bg-orange-50/40 p-4 rounded-xl border border-orange-200/80 text-xs text-slate-800 space-y-2">
              {linkedRecordsWarning.isOfficial ? (
                <p className="font-semibold">
                  ⚠️ هذه المحطة من المحطات الرسمية التأسيسية العشر المعتمدة للنظام ولا يمكن حذفها نهائياً لضمان سلامة العمليات.
                </p>
              ) : (
                <p className="font-semibold">
                  ⚠️ لا يمكن حذف هذه المحطة لأنها تحتوي على <strong className="text-rose-700">{linkedRecordsWarning.totalRecords} سجل</strong> مرتبط بها لحماية سلامة قاعدة البيانات وسجلات التدقيق:
                </p>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-white p-2 rounded-lg border border-orange-200/80 text-center">
                  <span className="block text-slate-500 font-sans">طلبات صيانة</span>
                  <span className="font-bold text-slate-900">{linkedRecordsWarning.pumpsCount + linkedRecordsWarning.tanksCount + linkedRecordsWarning.facilitiesCount}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-orange-200/80 text-center">
                  <span className="block text-slate-500 font-sans">تفتيش دوري</span>
                  <span className="font-bold text-slate-900">{linkedRecordsWarning.inspectionsCount}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-orange-200/80 text-center">
                  <span className="block text-slate-500 font-sans">حوادث</span>
                  <span className="font-bold text-slate-900">{linkedRecordsWarning.incidentsCount}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setLinkedRecordsWarning(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-95 shadow-2xs"
              >
                فهمت ذلك
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      <ConfirmModal
        isOpen={stationToDelete !== null}
        title="تأكيد حذف المحطة"
        message={`هل أنت متأكد من حذف محطة "${stationToDelete?.name}" نهائياً من دليل المحطات؟`}
        confirmLabel="حذف المحطة"
        cancelLabel="إلغاء"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setStationToDelete(null)}
      />

    </div>
  );
};
