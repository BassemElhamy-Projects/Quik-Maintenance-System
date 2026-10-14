import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  X,
  MapPin,
  Phone,
  Search,
  AlertCircle,
  AlertTriangle,
  Power,
  CheckCircle2,
  ShieldCheck,
  User
} from 'lucide-react';
import { Station, StationStatus, AppData } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface StationsManagerModalProps {
  isOpen: boolean;
  stations: Station[];
  appData: AppData;
  onSaveStation: (st: Station) => void;
  onDeleteStation: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onClose: () => void;
  onNavigateToSection?: () => void;
}

export const StationsManagerModal: React.FC<StationsManagerModalProps> = ({
  isOpen,
  stations,
  appData,
  onSaveStation,
  onDeleteStation,
  onToggleStatus,
  onClose,
  onNavigateToSection
}) => {
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'نشطة' | 'غير نشطة'>('all');
  const [formError, setFormError] = useState<string | null>(null);

  // Safety Delete State
  const [stationToDelete, setStationToDelete] = useState<Station | null>(null);
  const [linkedRecordsWarning, setLinkedRecordsWarning] = useState<{
    station: Station;
    totalRecords: number;
    pumpsCount: number;
    tanksCount: number;
    facilitiesCount: number;
    inspectionsCount: number;
    incidentsCount: number;
    isOfficial: boolean;
  } | null>(null);

  if (!isOpen) return null;

  // Compute linked records
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

    return { pumpsCount, tanksCount, facilitiesCount, inspectionsCount, incidentsCount, totalRecords };
  };

  const handleOpenAdd = () => {
    const existingCodes = stations.map(s => parseInt(s.code, 10)).filter(n => !isNaN(n));
    const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 10;
    const nextCode = (maxCode + 1).toString();

    setEditingStation({
      id: '',
      code: nextCode,
      name: `كويك - ${nextCode} `,
      region: 'عسير',
      city: '',
      address: '',
      status: 'نشطة',
      phone: '',
      supervisor: '',
      notes: '',
      isDefault: false
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (st: Station) => {
    setEditingStation({
      ...st,
      status: st.status || 'نشطة'
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStation) return;

    const trimmedCode = editingStation.code.trim();
    const trimmedName = editingStation.name.trim();

    if (!trimmedCode) {
      setFormError('يرجى إدخال رقم المحطة');
      return;
    }
    if (!trimmedName) {
      setFormError('يرجى إدخال اسم المحطة');
      return;
    }

    const duplicate = stations.find(
      s => s.code.trim() === trimmedCode && s.id !== editingStation.id
    );
    if (duplicate) {
      setFormError(`رقم المحطة (${trimmedCode}) مستخدم مسبقاً للمحطة: ${duplicate.name}`);
      return;
    }

    const updated: Station = {
      ...editingStation,
      code: trimmedCode,
      name: trimmedName,
      region: editingStation.region.trim() || 'عسير',
      status: editingStation.status || 'نشطة',
      updatedAt: new Date().toISOString()
    };

    setFormError(null);
    try {
      const res = await Promise.resolve(onSaveStation(updated) as any);
      if (res && typeof res === 'object' && res.success === false) {
        setFormError(res.error || 'تعذر حفظ بيانات المحطة في قاعدة البيانات السحابية.');
        return;
      }
      setIsFormOpen(false);
      setEditingStation(null);
      setFormError(null);
    } catch (err: any) {
      setFormError(err?.message || 'تعذر حفظ بيانات المحطة في قاعدة البيانات السحابية.');
    }
  };

  const handleDeleteClick = (st: Station) => {
    const linked = getStationLinkedCounts(st);
    if (st.isDefault || linked.totalRecords > 0) {
      setLinkedRecordsWarning({
        station: st,
        ...linked,
        isOfficial: Boolean(st.isDefault)
      });
    } else {
      setStationToDelete(st);
    }
  };

  const filteredStations = stations.filter(st => {
    const currentStatus = st.status || 'نشطة';
    if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      st.name.toLowerCase().includes(q) ||
      st.code.toLowerCase().includes(q) ||
      st.region.toLowerCase().includes(q) ||
      (st.city && st.city.toLowerCase().includes(q)) ||
      (st.supervisor && st.supervisor.toLowerCase().includes(q)) ||
      (st.phone && st.phone.includes(q))
    );
  });

  const activeCount = stations.filter(s => (s.status || 'نشطة') === 'نشطة').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full my-6 overflow-hidden animate-in zoom-in-95 duration-200 text-right">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500 text-slate-950 rounded-xl font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">دليل وإدارة المحطات المركزية</h3>
              <p className="text-xs text-slate-300">
                تسجيل المحطات وتوحيد الأسماء والأرقام لتظهر تلقائياً عبر كامل أقسام النظام
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          
          {/* Top Info Bar */}
          {!isFormOpen && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    إجمالي المحطات المسجلة: <span className="text-orange-600 font-extrabold">{stations.length}</span>
                  </p>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                    {activeCount} نشطة
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  أي محطة جديدة تضاف هنا تتاح تلقائياً في قوائم الاختيار بجميع الأقسام
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenAdd}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>إضافة محطة جديدة</span>
                </button>
              </div>
            </div>
          )}

          {/* Add / Edit Station Form */}
          {isFormOpen && editingStation && (
            <form onSubmit={handleSubmit} className="bg-orange-50/40 p-4 rounded-2xl border border-orange-200 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-orange-200 pb-2">
                <h4 className="text-sm font-bold text-orange-950 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-orange-600" />
                  <span>{editingStation.id ? 'تعديل بيانات المحطة' : 'إضافة محطة جديدة'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم المحطة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 11"
                    value={editingStation.code}
                    onChange={(e) => setEditingStation({ ...editingStation, code: e.target.value })}
                    disabled={Boolean(editingStation.isDefault)}
                    className={`w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-bold font-mono text-slate-800 outline-none focus:border-orange-500 ${
                      editingStation.isDefault ? 'opacity-70 bg-slate-100 cursor-not-allowed' : ''
                    }`}
                    required
                  />
                  {editingStation.isDefault && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                      ⭐ محطة تأسيسية رسمية
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حالة المحطة <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editingStation.status || 'نشطة'}
                    onChange={(e) => setEditingStation({ ...editingStation, status: e.target.value as StationStatus })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-800 outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="نشطة">🟢 نشطة (متاحة في كافة النماذج)</option>
                    <option value="غير نشطة">⚪ غير نشطة (معطلة)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المنطقة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="عسير / جازان / الرياض..."
                    value={editingStation.region}
                    onChange={(e) => setEditingStation({ ...editingStation, region: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-800 outline-none focus:border-orange-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المحطة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: كويك - 11 طريق الملك فهد"
                    value={editingStation.name}
                    onChange={(e) => setEditingStation({ ...editingStation, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-800 outline-none focus:border-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المدينة</label>
                  <input
                    type="text"
                    placeholder="المدينة..."
                    value={editingStation.city || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, city: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-800 outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المشرف</label>
                  <input
                    type="text"
                    placeholder="اسم المشرف..."
                    value={editingStation.supervisor || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, supervisor: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-800 outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">هاتف المحطة / المشرف</label>
                  <input
                    type="text"
                    placeholder="05xxxx..."
                    value={editingStation.phone || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-800 outline-none focus:border-orange-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / الموقع</label>
                  <input
                    type="text"
                    placeholder="العنوان التفصيلي..."
                    value={editingStation.address || ''}
                    onChange={(e) => setEditingStation({ ...editingStation, address: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-800 outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-orange-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95"
                >
                  {editingStation.id ? 'حفظ التعديلات' : 'إضافة المحطة'}
                </button>
              </div>
            </form>
          )}

          {/* Search & Filter Bar */}
          {!isFormOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="text"
                  placeholder="ابحث برقم المحطة، الاسم، المنطقة أو المشرف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-orange-500 cursor-pointer"
                >
                  <option value="all">جميع الحالات ({stations.length})</option>
                  <option value="نشطة">🟢 النشطة فقط ({activeCount})</option>
                  <option value="غير نشطة">⚪ غير النشطة ({stations.length - activeCount})</option>
                </select>
              </div>
            </div>
          )}

          {/* Station List Table */}
          <div className="table-container-responsive border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto w-full max-w-full">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3 min-w-[140px]">اسم المحطة</th>
                  <th className="py-2.5 px-3 w-36">المنطقة والمدينة</th>
                  <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap">الحالة</th>
                  <th className="py-2.5 px-3 text-center w-20 whitespace-nowrap">السجلات</th>
                  <th className="py-2.5 px-3 text-center w-24 shrink-0 whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-semibold">
                      لا توجد محطات مطابقة
                    </td>
                  </tr>
                ) : (
                  filteredStations.map(st => {
                    const linked = getStationLinkedCounts(st);
                    const isActive = (st.status || 'نشطة') === 'نشطة';

                    return (
                      <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate max-w-[160px]" title={st.name}>{st.name}</span>
                            {st.isDefault && (
                              <span className="bg-amber-100 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0">
                                رسمية ⭐
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {st.region} {st.city ? `(${st.city})` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => onToggleStatus(st.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition-all ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-600 border border-slate-300'
                            }`}
                            title="تبديل الحالة"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                            <span>{isActive ? 'نشطة' : 'معطلة'}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600 font-mono text-[11px] whitespace-nowrap">
                          {linked.totalRecords > 0 ? (
                            <span className="font-bold text-orange-600">{linked.totalRecords}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap shrink-0">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenEdit(st)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                              title="تعديل"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(st)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                              title="حذف"
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

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {onNavigateToSection && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToSection();
                }}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer"
              >
                الانتقال للقسم الكامل لإدارة المحطات ←
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer mr-auto"
            >
              إغلاق
            </button>
          </div>

        </div>
      </div>

      {/* Protective Warning Modal */}
      {linkedRecordsWarning && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-5 text-right space-y-3">
            <div className="flex items-center gap-2.5 text-amber-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                {linkedRecordsWarning.isOfficial ? 'محطة رسمية تأسيسية' : 'تنبيه: محطة مرتبطة بسجلات'}
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              {linkedRecordsWarning.isOfficial
                ? 'المحطات الرسمية التأسيسية العشر لا يمكن حذفها نهائياً لضمان سلامة هيكل النظام. يمكنك تعديل بياناتها أو تعطيل حالتها.'
                : `لا يمكن حذف المحطة "${linkedRecordsWarning.station.name}" لأنها مرتبطة بـ (${linkedRecordsWarning.totalRecords}) سجل سابق لحماية الأرشيف التاريخي.`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setLinkedRecordsWarning(null)}
                className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  onToggleStatus(linkedRecordsWarning.station.id);
                  setLinkedRecordsWarning(null);
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg flex items-center gap-1"
              >
                <Power className="w-3.5 h-3.5" />
                <span>
                  {linkedRecordsWarning.station.status === 'غير نشطة' ? 'تفعيل المحطة' : 'تحويل إلى غير نشطة'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={stationToDelete !== null}
        title="تأكيد حذف المحطة"
        message={`هل أنت متأكد من حذف المحطة "${stationToDelete?.name}" (${stationToDelete?.code})؟`}
        confirmLabel="حذف المحطة"
        cancelLabel="تراجع"
        isDanger={true}
        onConfirm={() => {
          if (stationToDelete) {
            onDeleteStation(stationToDelete.id);
            setStationToDelete(null);
          }
        }}
        onCancel={() => setStationToDelete(null)}
      />

    </div>
  );
};
