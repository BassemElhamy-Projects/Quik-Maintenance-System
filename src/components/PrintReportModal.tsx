import React from 'react';
import { Printer, X, Fuel } from 'lucide-react';
import { MaintenanceRequest, InternalInspection, IncidentRecord } from '../types';
import { ModalPortal } from './ModalPortal';

interface PrintReportModalProps {
  isOpen: boolean;
  type: 'maintenance' | 'inspection' | 'incident' | null;
  data: MaintenanceRequest | InternalInspection | IncidentRecord | null;
  onClose: () => void;
}

export const PrintReportModal: React.FC<PrintReportModalProps> = ({
  isOpen,
  type,
  data,
  onClose
}) => {
  if (!isOpen || !data || !type) return null;

  const handlePrint = () => {
    try {
      window.print();
    } catch (err) {
      console.warn('Print command error handling:', err);
    }
  };

  const renderContent = () => {
    if (type === 'maintenance') {
      const req = data as MaintenanceRequest;
      const getSectionName = (sec: string) => {
        if (sec === 'pumps') return 'قسم المضخات';
        if (sec === 'tanks') return 'قسم الخزانات';
        return 'قسم المدخل والمخرج والمرافق والساحات';
      };

      return (
        <div className="space-y-6 text-right">
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white font-bold rounded-xl shadow-2xs">
                <Fuel className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">محطات كويك للوقود - Quik Fuel</h2>
                <p className="text-xs text-slate-600 font-medium">نموذج طلب ومتابعة صيانة ميدانية</p>
              </div>
            </div>
            <div className="text-left font-mono">
              <div className="text-sm font-bold text-slate-900">{req.requestNumber}</div>
              <div className="text-xs text-slate-500">التاريخ: {req.date}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">الموقع / المحطة:</span>
              <span className="text-sm font-bold text-slate-900">{req.stationName}</span>
              <span className="text-slate-500 block font-mono">رقم المحطة: {req.stationCode}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">قسم وتصنيف الصيانة:</span>
              <span className="text-sm font-bold text-slate-900">{getSectionName(req.section)}</span>
              <span className="text-slate-600 block text-xs">نوع الطلب: <strong>{req.requestType}</strong></span>
              <span className="text-slate-600 block text-xs">نوع الصيانة: <strong>{req.maintenanceType || 'صيانة عامة'}</strong></span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">رافع الطلب:</span>
              <span className="text-sm font-bold text-slate-900">{req.requester}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">حالة الطلب:</span>
              <span className="text-sm font-bold text-slate-900">{req.status}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-xs font-bold text-slate-700 block">شرح المشكلة / العطل:</span>
            <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{req.problemDescription}</p>
          </div>

          {req.actionTaken && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-slate-700 block">الإجراء المتخذ:</span>
              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{req.actionTaken}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">الفني / الجهة المنفذة:</span>
              <span className="text-slate-900 font-bold">{req.technician || 'غير محدد'}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">تاريخ الإغلاق / الإنجاز:</span>
              <span className="text-slate-900 font-bold font-mono">{req.closingDate || 'لم يغلق بعد'}</span>
            </div>
          </div>

          {req.completionNotes && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <span className="text-slate-500 block font-semibold">ملاحظات الإنجاز:</span>
              <span className="text-slate-900 font-bold">{req.completionNotes}</span>
            </div>
          )}

          <div className="pt-8 border-t border-slate-300 grid grid-cols-2 text-center text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-800">توقيع رافع الطلب / المشرف</p>
              <div className="h-10"></div>
              <p>.......................................</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">توقيع الفني / مسؤول الصيانة</p>
              <div className="h-10"></div>
              <p>.......................................</p>
            </div>
          </div>
        </div>
      );
    }

    if (type === 'inspection') {
      const ins = data as InternalInspection;
      return (
        <div className="space-y-6 text-right">
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white font-bold rounded-xl shadow-2xs">
                <Fuel className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">محطات كويك للوقود - Quik Fuel</h2>
                <p className="text-xs text-slate-600 font-medium">نموذج تقرير التفتيش الدوري الداخلي</p>
              </div>
            </div>
            <div className="text-left font-mono">
              <div className="text-sm font-bold text-slate-900">{ins.inspectionNumber}</div>
              <div className="text-xs text-slate-500">التاريخ: {ins.date}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">الموقع / المحطة:</span>
              <span className="text-sm font-bold text-slate-900">{ins.stationName}</span>
              <span className="text-slate-500 block font-mono">رقم المحطة: {ins.stationCode}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">نوع التفتيش:</span>
              <span className="text-sm font-bold text-slate-900">{ins.inspectionType}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">اسم المفتش:</span>
              <span className="text-sm font-bold text-slate-900">{ins.inspectorName}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">نتيجة التقييم:</span>
              <span className="text-sm font-bold text-slate-900">{ins.evaluation}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-xs font-bold text-slate-700 block">الملاحظات والتوصيات الميدانية:</span>
            <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{ins.notes || 'لا توجد ملاحظات إضافية مسجلة.'}</p>
          </div>

          <div className="pt-8 border-t border-slate-300 grid grid-cols-2 text-center text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-800">اسم وتوقيع المفتش</p>
              <div className="h-10"></div>
              <p>{ins.inspectorName}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">مدير التشغيل والجودة</p>
              <div className="h-10"></div>
              <p>.......................................</p>
            </div>
          </div>
        </div>
      );
    }

    if (type === 'incident') {
      const inc = data as IncidentRecord;
      return (
        <div className="space-y-6 text-right">
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500 text-white font-bold rounded-xl shadow-2xs">
                <Fuel className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">محطات كويك للوقود - Quik Fuel</h2>
                <p className="text-xs text-slate-600 font-medium">سجل وبلاغ حادث رسمي بالمحطة</p>
              </div>
            </div>
            <div className="text-left font-mono">
              <div className="text-sm font-bold text-slate-900">{inc.incidentNumber}</div>
              <div className="text-xs text-slate-500">التاريخ: {inc.date} - {inc.time}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">المحطة:</span>
              <span className="text-sm font-bold text-slate-900">{inc.stationName}</span>
              <span className="text-slate-500 block font-mono">رقم: {inc.stationCode}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">المنطقة:</span>
              <span className="text-sm font-bold text-slate-900">{inc.region}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">نوع الحادث:</span>
              <span className="text-sm font-bold text-slate-900">{inc.incidentType}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">المتسبب بالحادث:</span>
              <span className="text-sm font-bold text-slate-900">{inc.causingParty}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">نوع السيارات المعنية:</span>
              <span className="text-sm font-bold text-slate-900">{inc.vehicleType || 'غير مدون'}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-xs font-bold text-slate-700 block">وصف وتفاصيل الحادث:</span>
            <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{inc.description}</p>
          </div>

          {inc.preventionSuggestions && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-slate-700 block">مقترحات لتجنب الحوادث مستقبلاً:</span>
              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{inc.preventionSuggestions}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">تقرير الجهة المسؤولة (المرور / الدفاع المدني / نجم):</span>
              <span className="text-slate-900 font-bold">{inc.responsiblePartyReport || 'غير مدون'}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-slate-500 block font-semibold">ملاحظات إضافية:</span>
              <span className="text-slate-900 font-bold">{inc.notes || 'لا توجد'}</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
            <span className="text-slate-500 block font-semibold">معد التقرير والتوقيع:</span>
            <span className="text-slate-900 font-bold">{inc.reporterNameAndSignature || 'مسؤول السلامة بالمحطة'}</span>
          </div>

          <div className="pt-8 border-t border-slate-300 grid grid-cols-2 text-center text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-800">معد التقرير والتوقيع</p>
              <div className="h-10"></div>
              <p>{inc.reporterNameAndSignature || '.......................................'}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">اعتماد إدارة محطات كويك</p>
              <div className="h-10"></div>
              <p>.......................................</p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
    >
      {/* Top Control Bar (Hidden on Print) */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-xl border border-orange-200/80">
            <Printer className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">معاينة وطباعة التقرير الرسمي</h3>
            <p className="text-[11px] text-slate-500 font-medium">تجهيز المستند للطباعة بتنسيق رسمي A4</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة المستند</span>
          </button>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Paper Area */}
      <div className="p-8 bg-white print-area max-h-[80vh] overflow-y-auto">
        {renderContent()}
      </div>
    </ModalPortal>
  );
};
