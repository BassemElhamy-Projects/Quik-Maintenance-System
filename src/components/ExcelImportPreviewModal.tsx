import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Info,
  Layers,
  Table,
  HelpCircle,
  FileText,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { ExcelImportPreviewResult } from '../services/excelService';
import { MaintenanceRequest, InternalInspection, IncidentRecord } from '../types';
import { useScrollLock } from '../utils/scrollLock';

interface ExcelImportPreviewModalProps {
  isOpen: boolean;
  previewData: ExcelImportPreviewResult | null;
  onConfirmImport: (
    importedReqs: MaintenanceRequest[],
    importedIns: InternalInspection[],
    importedIncs: IncidentRecord[],
    ignoreDuplicates: boolean,
    onProgress?: (progress: { current: number; total: number; message: string }) => void
  ) => Promise<{ success: boolean; error?: string } | void> | void;
  onCancel: () => void;
}

export const ExcelImportPreviewModal: React.FC<ExcelImportPreviewModalProps> = ({
  isOpen,
  previewData,
  onConfirmImport,
  onCancel
}) => {
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(true);
  const [activeTab, setActiveTab] = useState<'review' | 'valid' | 'sheets' | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [progressStatusMessage, setProgressStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsImporting(false);
      setImportError(null);
    }
  }, [isOpen]);

  useScrollLock(isOpen);

  if (!isOpen || !previewData) return null;

  const totalExtracted =
    previewData.validMaintenanceRows.length +
    previewData.validInspectionRows.length +
    previewData.validIncidentRows.length;

  // Build full list of records requiring review
  const reviewMaintenance = previewData.validMaintenanceRows.filter(r => r.isStationUnmatched);
  const reviewInspections = previewData.validInspectionRows.filter(i => i.isStationUnmatched);
  const reviewIncidents = previewData.validIncidentRows.filter(inc => inc.isStationUnmatched);

  const matchedMaintenance = previewData.validMaintenanceRows.filter(r => !r.isStationUnmatched);
  const matchedInspections = previewData.validInspectionRows.filter(i => !i.isStationUnmatched);
  const matchedIncidents = previewData.validIncidentRows.filter(inc => !inc.isStationUnmatched);

  const matchedCount = matchedMaintenance.length + matchedInspections.length + matchedIncidents.length;
  const needingStationCount = reviewMaintenance.length + reviewInspections.length + reviewIncidents.length;

  const allExtractedRows = [
    ...previewData.validMaintenanceRows,
    ...previewData.validInspectionRows,
    ...previewData.validIncidentRows
  ];

  const nonDuplicatesCount = allExtractedRows.filter(r => !r.isDuplicate).length;
  const actualImportCount = ignoreDuplicates ? nonDuplicatesCount : totalExtracted;

  const allReviewRecords = [
    ...reviewMaintenance.map(m => ({
      id: m.id,
      requestNumber: m.requestNumber,
      sheetName: m.sourceSheet || 'غير محدد',
      excelRow: m.sourceRow ? `#${m.sourceRow}` : '---',
      stationNameInExcel: m.originalStationValue || m.stationName || 'غير مدون',
      stationCodeInExcel: m.stationCode || '---',
      date: m.date,
      requestType: m.requestType || 'صيانة',
      maintenanceType: m.maintenanceType || 'صيانة عامة',
      problemOrCompletion: m.problemDescription + (m.completionNotes ? ` | الإنجاز: ${m.completionNotes}` : ''),
      unmatchedReason: m.unmatchedReason || 'تحتاج تحديد المحطة'
    })),
    ...reviewInspections.map(i => ({
      id: i.id,
      requestNumber: i.inspectionNumber,
      sheetName: i.sourceSheet || 'غير محدد',
      excelRow: i.sourceRow ? `#${i.sourceRow}` : '---',
      stationNameInExcel: i.originalStationValue || i.stationName || 'غير مدون',
      stationCodeInExcel: i.stationCode || '---',
      date: i.date,
      requestType: 'تفتيش دوري',
      maintenanceType: i.inspectionType || 'تفتيش',
      problemOrCompletion: `المفتش: ${i.inspectorName} (${i.evaluation}) - ${i.notes}`,
      unmatchedReason: i.unmatchedReason || 'تحتاج تحديد المحطة'
    })),
    ...reviewIncidents.map(inc => ({
      id: inc.id,
      requestNumber: inc.incidentNumber,
      sheetName: inc.sourceSheet || 'غير محدد',
      excelRow: inc.sourceRow ? `#${inc.sourceRow}` : '---',
      stationNameInExcel: inc.originalStationValue || inc.stationName || 'غير مدون',
      stationCodeInExcel: inc.stationCode || '---',
      date: inc.date,
      requestType: 'حادث',
      maintenanceType: inc.incidentType || 'حادث',
      problemOrCompletion: `المتسبب: ${inc.causingParty} - ${inc.description}`,
      unmatchedReason: inc.unmatchedReason || 'تحتاج تحديد المحطة'
    }))
  ];
  const effectiveTab = activeTab ?? (allReviewRecords.length > 0 ? 'review' : 'valid');

  const handleConfirm = async () => {
    if (isImporting || actualImportCount === 0) return;

    setIsImporting(true);
    setImportError(null);
    setProgressStatusMessage(null);

    try {
      const result = await onConfirmImport(
        previewData.validMaintenanceRows,
        previewData.validInspectionRows,
        previewData.validIncidentRows,
        ignoreDuplicates,
        (progress) => {
          setProgressStatusMessage(progress.message);
        }
      );

      if (result && !result.success) {
        setImportError(result.error || 'فشل استيراد البيانات. يرجى مراجعة الملف والمحاولة مرة أخرى.');
      }
    } catch (err: any) {
      console.error('[CONFIRM EXCEL IMPORT MODAL ERROR]:', err);
      setImportError(err?.message || 'حدث خطأ أثناء تنفيذ عملية الاستيراد.');
    } finally {
      setIsImporting(false);
      setProgressStatusMessage(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-5xl w-full my-6 overflow-hidden animate-modal-enter">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500 text-slate-950 rounded-xl font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">معاينة واستيراد ملف Excel</h3>
              <p className="text-xs text-slate-300 flex items-center gap-2">
                <span>اسم الملف: <strong>{previewData.fileName}</strong></span>
                <span>•</span>
                <span>إجمالي أوراق العمل: {previewData.sheetNamesFound.length}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isImporting}
            className={`p-1.5 rounded-lg transition-colors ${
              isImporting
                ? 'text-slate-600 cursor-not-allowed opacity-50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer'
            }`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-right max-h-[82vh] overflow-y-auto">
          
          {/* Error Alert Banner inside Modal */}
          {importError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs font-bold flex items-center justify-between gap-3 animate-fade-in shadow-sm">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{importError}</span>
              </div>
              <button
                type="button"
                onClick={() => setImportError(null)}
                className="text-rose-500 hover:text-rose-800 font-bold px-2 py-1 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          )}
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            
            {/* Total Extracted Records */}
            <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-blue-800 block">إجمالي المكتشفة</span>
                <span className="text-2xl font-extrabold text-blue-900 tabular-nums">
                  {totalExtracted}
                </span>
              </div>
              <Layers className="w-5 h-5 text-blue-600 shrink-0" />
            </div>

            {/* Matched Valid Records */}
            <div
              onClick={() => setActiveTab('valid')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                effectiveTab === 'valid'
                  ? 'bg-emerald-100/80 border-emerald-400 ring-2 ring-emerald-400'
                  : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/50'
              }`}
            >
              <div>
                <span className="text-[11px] font-bold text-emerald-800 block">السجلات الصحيحة</span>
                <span className="text-2xl font-extrabold text-emerald-900 tabular-nums">{matchedCount}</span>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            </div>

            {/* Needing Attention / Unmatched Stations */}
            <div
              onClick={() => setActiveTab('review')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                effectiveTab === 'review'
                  ? 'bg-orange-100 border-orange-400 ring-2 ring-orange-400'
                  : needingStationCount > 0
                    ? 'bg-orange-50 border-orange-200 hover:bg-orange-100/50 text-orange-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div>
                <span className="text-[11px] font-bold block">تحتاج تحديد محطة</span>
                <span className="text-2xl font-extrabold tabular-nums">{needingStationCount}</span>
              </div>
              <HelpCircle className={`w-5 h-5 shrink-0 ${needingStationCount > 0 ? 'text-orange-600' : 'text-slate-400'}`} />
            </div>

            {/* Duplicates */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              previewData.duplicateCount > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div>
                <span className="text-[11px] font-bold block">المكررات</span>
                <span className="text-2xl font-extrabold tabular-nums">{previewData.duplicateCount}</span>
              </div>
              <Info className={`w-5 h-5 shrink-0 ${previewData.duplicateCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            </div>

            {/* Dynamic Importable Total Card */}
            <div className="p-3 bg-indigo-900 text-white rounded-2xl border border-indigo-950 shadow-sm flex items-center justify-between col-span-2 sm:col-span-1">
              <div>
                <span className="text-[11px] font-bold text-indigo-200 block">إجمالي القابل للاستيراد</span>
                <span className="text-2xl font-extrabold text-white tabular-nums">
                  {actualImportCount}
                </span>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>

          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 gap-2">
            {needingStationCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('review')}
                className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  effectiveTab === 'review'
                    ? 'border-orange-600 text-orange-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <span>سجلات تحتاج تحديد محطة ({needingStationCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('valid')}
              className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                effectiveTab === 'valid'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>السجلات الصحيحة ({matchedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sheets')}
              className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                effectiveTab === 'sheets'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-4 h-4 text-blue-600" />
              <span>تفاصيل أوراق العمل ({previewData.diagnostics.length})</span>
            </button>
          </div>

          {/* TAB 1: REVIEW RECORDS LIST */}
          {effectiveTab === 'review' && (
            <div className="space-y-3">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-900 font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>
                    يتم إدراج جميع السجلات الحقيقية التي يتعذر ربط محطتها بدليل المحطات الرسمية (10 محطات) أدناه بدقة بدون حذف أو تخمين:
                  </span>
                </div>
                <span className="font-bold bg-orange-200 text-orange-950 px-2.5 py-0.5 rounded-full text-[11px]">
                  العدد المطلوب مراجعته: {allReviewRecords.length} سجل
                </span>
              </div>

              {allReviewRecords.length > 0 ? (
                <div className="table-container-responsive border border-orange-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto shadow-sm w-full max-w-full">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-orange-100/90 text-orange-950 font-extrabold border-b border-orange-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap font-mono">رقم السجل</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">اسم الورقة</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">الصف</th>
                        <th className="py-2.5 px-3">اسم المحطة بـ Excel</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">رقم المحطة</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">تاريخ الطلب</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">نوع الطلب</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">نوع الصيانة</th>
                        <th className="py-2.5 px-3 min-w-[140px] max-w-[220px]">شرح المشكلة</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">سبب المراجعة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-100 bg-white">
                      {allReviewRecords.map(item => (
                        <tr key={item.id} className="hover:bg-orange-50/50 transition-colors">
                          <td className="py-2 px-3 font-bold font-mono text-slate-900 whitespace-nowrap">{item.requestNumber}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">{item.sheetName}</td>
                          <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{item.excelRow}</td>
                          <td className="py-2 px-3 font-bold text-orange-950 bg-orange-50/80 rounded truncate max-w-[160px]" title={item.stationNameInExcel}>{item.stationNameInExcel}</td>
                          <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">{item.stationCodeInExcel}</td>
                          <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{item.date}</td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{item.requestType}</td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{item.maintenanceType}</td>
                          <td className="py-2 px-3 text-slate-600 max-w-[220px] truncate" title={item.problemOrCompletion}>
                            {item.problemOrCompletion}
                          </td>
                          <td className="py-2 px-3 text-orange-900 font-bold bg-orange-100/60 rounded whitespace-nowrap">
                            {item.unmatchedReason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-emerald-800 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-bold">
                  لا توجد سجلات تحتاج مراجعة! جميع السجلات تم ربط محطاتها بنجاح.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VALID RECORDS PREVIEW */}
          {effectiveTab === 'valid' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Table className="w-4 h-4 text-slate-500" />
                <span>عينة السجلات الصحيحة المطابقة من الملف ({matchedCount} سجل):</span>
              </h4>

              {matchedCount > 0 ? (
                <div className="table-container-responsive border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto w-full max-w-full">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3 w-20 whitespace-nowrap font-mono">رقم السجل</th>
                        <th className="py-2.5 px-3 w-28 whitespace-nowrap">تاريخ الطلب / الإغلاق</th>
                        <th className="py-2.5 px-3 min-w-[120px]">المحطة</th>
                        <th className="py-2.5 px-3 w-28 whitespace-nowrap">نوع الطلب</th>
                        <th className="py-2.5 px-3 w-28 whitespace-nowrap">نوع الصيانة</th>
                        <th className="py-2.5 px-3 min-w-[140px] max-w-[220px]">شرح المشكلة / الإنجاز</th>
                        <th className="py-2.5 px-3 w-20 text-center whitespace-nowrap">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Maintenance rows preview */}
                      {matchedMaintenance.slice(0, 15).map(m => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold font-mono text-slate-900 whitespace-nowrap">{m.requestNumber}</td>
                          <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                            <div>الطلب: {m.date}</div>
                            {m.closingDate && <div className="text-[10px] text-emerald-700">الإغلاق: {m.closingDate}</div>}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            <span className="truncate max-w-[140px] block" title={m.stationName}>{m.stationName}</span>
                          </td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap font-medium">{m.requestType || 'طلب صيانة'}</td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                            <span className="bg-orange-50 text-orange-850 px-1.5 py-0.5 rounded text-[11px] font-semibold border border-orange-200/50">
                              {m.maintenanceType || 'صيانة عامة'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[220px]" title={m.problemDescription}>
                            <div className="truncate">{m.problemDescription}</div>
                            {m.completionNotes && <div className="text-[10px] text-slate-500 font-normal truncate">الإنجاز: {m.completionNotes}</div>}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                              m.status === 'تم' ? 'bg-emerald-100 text-emerald-800' :
                              m.status === 'جاري العمل' ? 'bg-amber-100 text-amber-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      ))}

                      {/* Inspections preview */}
                      {matchedInspections.slice(0, 5).map(i => (
                        <tr key={i.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold font-mono text-indigo-900 whitespace-nowrap">{i.inspectionNumber}</td>
                          <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{i.date}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            <span className="truncate max-w-[140px] block" title={i.stationName}>{i.stationName}</span>
                          </td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap font-medium">تفتيش دوري</td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{i.inspectionType || 'تفتيش شامل'}</td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[220px]" title={`${i.inspectorName} (${i.evaluation})`}>{i.inspectorName} ({i.evaluation})</td>
                          <td className="py-2 px-3 text-center">---</td>
                        </tr>
                      ))}

                      {/* Incidents preview */}
                      {matchedIncidents.slice(0, 5).map(inc => (
                        <tr key={inc.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold font-mono text-rose-900 whitespace-nowrap">{inc.incidentNumber}</td>
                          <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{inc.date}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            <span className="truncate max-w-[140px] block" title={inc.stationName}>{inc.stationName}</span>
                          </td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap font-medium">حادث</td>
                          <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{inc.incidentType || 'حادث عام'}</td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[220px]" title={inc.description}>{inc.description}</td>
                          <td className="py-2 px-3 text-center">---</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  لا توجد سجلات مطابقة في الملف.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DETECTED WORKSHEETS SUMMARY */}
          {effectiveTab === 'sheets' && (
            <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>تفاصيل تحليل أوراق العمل والأقسام المستهدفة:</span>
              </h4>

              <div className="grid grid-cols-1 gap-2.5">
                {previewData.diagnostics.map((diag, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 font-['Cairo'] ${
                      diag.validRowsCount > 0
                        ? 'bg-white border-emerald-300'
                        : 'bg-amber-50/60 border-amber-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-slate-500" />
                          <span>اسم الورقة: "{diag.sheetName}"</span>
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          diag.detectedSection === 'unknown'
                            ? 'bg-rose-100 text-rose-900 border border-rose-300'
                            : diag.validRowsCount > 0
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                          القسم المستهدف: {diag.detectedSection === 'unknown' ? 'لم يتم التعرف على القسم' : diag.detectedSectionLabel}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium">
                        موقع العناوين: الصف <strong>#{diag.headerRowIndex || 1}</strong>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-bold">
                      <span className="text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        السجلات المكتشفة الصالحة: {diag.validRowsCount} سجل
                      </span>
                      <span className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                        السجلات المكررة: {diag.duplicateRowsCount} سجل
                      </span>
                      {diag.needingAttentionRowsCount > 0 && (
                        <span className="text-orange-800 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200 flex items-center gap-1">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>تحتاج مراجعة: {diag.needingAttentionRowsCount}</span>
                        </span>
                      )}
                    </div>

                    {diag.tableBreakdowns && diag.tableBreakdowns.length > 1 && (
                      <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] space-y-1.5">
                        <span className="block font-bold text-slate-800">
                          الجداول المستقلة المكتشفة داخل ورقة العمل ({diag.tableBreakdowns.length} جداول):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {diag.tableBreakdowns.map((tbl, tIdx) => (
                            <div key={tIdx} className="bg-white p-2 rounded border border-slate-300 font-mono text-[11px] flex justify-between items-center">
                              <span>الجدول {tbl.tableIndex} (صف الترويسة #{tbl.headerRow})</span>
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                {tbl.recordsExtracted} سجل
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {diag.unmatchedStationNames.length > 0 && (
                      <div className="p-2 bg-orange-50 rounded-lg border border-orange-200 text-[11px] text-orange-950 font-semibold space-y-1">
                        <span className="block font-bold">⚠️ أسماء محطات تم رصدها في الورقة ولم تطابق دليل المحطات:</span>
                        <div className="flex flex-wrap gap-1">
                          {diag.unmatchedStationNames.map((stName, stIdx) => (
                            <span key={stIdx} className="bg-orange-100 text-orange-900 px-2 py-0.5 rounded border border-orange-300 font-mono">
                              {stName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {diag.detectedHeaders.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[11px] font-bold text-slate-600 block">
                          الأعمدة المكتشفة ({diag.detectedHeaders.length} عمود):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {diag.detectedHeaders.map((h, hIdx) => (
                            <span
                              key={hIdx}
                              className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-[11px] border border-slate-200 font-medium"
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                      <span>{diag.statusMessage}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duplicate Handling Choice if duplicates exist */}
          {previewData.duplicateCount > 0 && (
            <div className="p-4 bg-amber-50/90 rounded-2xl border border-amber-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>تفاصيل تحليل السجلات المكررة:</span>
                </h4>
                <div className="flex items-center gap-3 text-[11px] font-semibold text-amber-900 bg-amber-100/80 px-3 py-1 rounded-lg border border-amber-300">
                  <span>موجودة مسبقًا في النظام: <strong>{previewData.duplicatesAlreadyInApp || 0}</strong></span>
                  <span>•</span>
                  <span>مكررة داخل الملف فقط: <strong>{previewData.duplicatesInExcel || 0}</strong></span>
                  <span>•</span>
                  <span>إجمالي المكرر الفريد: <strong>{previewData.duplicateCount}</strong></span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-1 border-t border-amber-200/60">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="duplicatesChoice"
                    checked={ignoreDuplicates}
                    onChange={() => setIgnoreDuplicates(true)}
                    className="text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>تجاهل المكرر (استيراد {nonDuplicatesCount} سجل غير مكرر فقط - مستحسن)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="duplicatesChoice"
                    checked={!ignoreDuplicates}
                    onChange={() => setIgnoreDuplicates(false)}
                    className="text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>استيراد الكل (استيراد كافة الـ {totalExtracted} سجل بما فيها المكرر)</span>
                </label>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="text-xs text-slate-500 font-medium">
              سيتم استيراد إجمالي <strong>{actualImportCount} سجل</strong> {ignoreDuplicates ? '(تطبيق خيار تجاهل المكرر)' : '(شامل السجلات المكررة)'}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isImporting}
                className={`px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm transition-colors ${
                  isImporting
                    ? 'opacity-50 cursor-not-allowed bg-slate-50'
                    : 'hover:bg-slate-100 cursor-pointer'
                }`}
              >
                إلغاء الاستيراد
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={actualImportCount === 0 || isImporting}
                className={`px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 ${
                  actualImportCount > 0 && !isImporting
                    ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer active:scale-95'
                    : 'bg-slate-300 cursor-not-allowed opacity-80'
                }`}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{progressStatusMessage || `جاري استيراد (${actualImportCount}) سجل...`}</span>
                  </>
                ) : (
                  <span>تأكيد الاستيراد ({actualImportCount} سجل)</span>
                )}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
