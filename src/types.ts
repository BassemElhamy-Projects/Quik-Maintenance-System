/**
 * Data structures for Quick Fuel Stations Maintenance System
 * نظام إدارة الصيانة والتفتيش - محطات كويك
 */

export type SectionType = 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'stations';

export type StationStatus = 'نشطة' | 'غير نشطة';

export interface Station {
  id: string;
  code: string;       // رقم المحطة e.g. "1", "2", "11", "101"
  name: string;       // اسم المحطة e.g. "كويك - 1 أبها"
  region: string;     // المنطقة e.g. "عسير", "جازان", "الرياض"
  city?: string;      // المدينة
  address?: string;   // العنوان / الموقع الجغرافي
  status?: StationStatus; // حالة المحطة (نشطة / غير نشطة - الافتراضي: نشطة)
  phone?: string;     // رقم التواصل / هاتف المحطة
  supervisor?: string;// اسم المشرف المسؤول
  notes?: string;     // ملاحظات
  isDefault?: boolean;// هل هي من المحطات التأسيسية الرسمية العشر
  createdAt?: string; // تاريخ الإضافة
  updatedAt?: string; // تاريخ آخر تعديل
}

export type MaintenanceStatus = 'جديد' | 'جاري العمل' | 'تم';

export interface MaintenanceRequest {
  id: string;
  requestNumber: string;    // رقم طلب الصيانة e.g. "1", "2", "3"
  section: 'pumps' | 'tanks' | 'facilities'; // مضخات، خزانات، مرافق
  date: string;             // تاريخ الطلب (YYYY-MM-DD)
  stationId: string;        // معرف المحطة
  stationName: string;      // اسم المحطة
  stationCode: string;      // رقم المحطة
  requester: string;        // رافع الطلب
  requestType: string;      // نوع الطلب (طارئ / دوري / تصحيحي / وقائي)
  maintenanceType: string;  // نوع الصيانة (كهرباء / ميكانيكا / سباكة / مدني / نظافة / معايرة / أخرى)
  problemDescription: string; // شرح المشكلة
  closingDate?: string;     // تاريخ إغلاق الصيانة
  technician: string;       // الفني
  actionTaken: string;      // الإجراء المتخذ
  completionNotes: string;  // الإنجاز / ملاحظات Final status
  status: MaintenanceStatus;// حالة الطلب (جديد / جاري العمل / تم)
  isStationUnmatched?: boolean; // علامة إذا كانت المحطة غير مطابقة في شيت Excel
  originalStationValue?: string; // القيمة الأصلية المسجلة في Excel
  unmatchedReason?: string;     // سبب عدم التطابق
  sourceSheet?: string;
  sourceRow?: number;
  isDuplicateInApp?: boolean;
  isDuplicateInBatch?: boolean;
  isDuplicate?: boolean;
  createdAt: string;
}

export type InspectionEvaluation = 'ممتاز' | 'جيد جدا' | 'جيد' | 'يحتاج متابعة';

export interface InternalInspection {
  id: string;
  inspectionNumber: string; // رقم التفتيش e.g. "INS-2026-001"
  date: string;             // التاريخ
  stationId: string;        // معرف المحطة
  stationName: string;      // اسم المحطة
  stationCode: string;      // رقم المحطة
  inspectionType: string;   // نوع التفتيش (سلامة / نظافة / معايرة وصيانة / شامل)
  inspectorName: string;    // اسم المفتش
  evaluation: InspectionEvaluation; // التقييم
  notes: string;            // الملاحظات والتوصيات
  isStationUnmatched?: boolean;
  originalStationValue?: string;
  unmatchedReason?: string;
  sourceSheet?: string;
  sourceRow?: number;
  isDuplicateInApp?: boolean;
  isDuplicateInBatch?: boolean;
  isDuplicate?: boolean;
  createdAt: string;
}

export interface IncidentRecord {
  id: string;
  incidentNumber: string;   // رقم البلاغ / التسجيل e.g. "INC-2026-001"
  region: string;           // المنطقة
  stationCode: string;      // رقم المحطة
  stationName: string;      // اسم المحطة
  stationId: string;        // معرف المحطة
  date: string;             // التاريخ
  time: string;             // وقت الحادث e.g. "15:30"
  incidentType: string;     // نوع الحادث
  causingParty: string;     // اسم المتسبب بالحادث / الجهة المتسببة
  vehicleType?: string;     // نوع السيارات
  generalInfo: string;      // المعلومات (الهوية / رقم التواصل / تفاصيل الإثبات)
  description: string;      // وصف الحادث
  preventionSuggestions: string; // مقترحات لتجنب هذا النوع من الحوادث بالمستقبل
  responsiblePartyReport?: string; // تقرير الجهة المسؤولة
  notes?: string;           // ملاحظات
  reporterNameAndSignature?: string; // معد التقرير والتوقيع
  isStationUnmatched?: boolean;
  originalStationValue?: string;
  unmatchedReason?: string;
  sourceSheet?: string;
  sourceRow?: number;
  isDuplicateInApp?: boolean;
  isDuplicateInBatch?: boolean;
  isDuplicate?: boolean;
  createdAt: string;
}

export interface AppData {
  stations: Station[];
  maintenanceRequests: MaintenanceRequest[];
  inspections: InternalInspection[];
  incidents: IncidentRecord[];
}
