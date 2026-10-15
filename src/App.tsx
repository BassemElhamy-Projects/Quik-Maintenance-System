import React, { useState, useEffect, useRef } from 'react';
import { AppData, MaintenanceRequest, InternalInspection, IncidentRecord, Station, SectionType } from './types';
import { getAppData, saveAppData, loadAppDataAsync, clearAllRecords } from './services/storage';
import {
  parseExcelFileForPreview,
  exportSectionToExcel,
  exportAllDataToExcel,
  ExcelImportPreviewResult
} from './services/excelService';
import {
  validateNewRecord,
  checkDriveStatusAsync
} from './services/backupService';
import {
  checkAndRunAutomaticCloudBackup,
  executeCloudSafetyBackup
} from './services/cloudBackupService';
import {
  createCloudMaintenanceRequest,
  updateCloudMaintenanceRequest,
  deleteCloudMaintenanceRequest,
  deleteMultipleCloudMaintenanceRequests,
  createCloudInspection,
  updateCloudInspection,
  deleteCloudInspection,
  deleteMultipleCloudInspections,
  createCloudIncident,
  updateCloudIncident,
  deleteCloudIncident,
  deleteMultipleCloudIncidents,
  saveCloudStation,
  deleteCloudStation,
  toggleCloudStationStatus,
  clearAllCloudRecords,
  importExcelRecordsToCloud,
  subscribeToCloudChanges,
  isValidUUID
} from './services/cloudDataService';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MaintenanceSection } from './components/MaintenanceSection';
import { InspectionSection } from './components/InspectionSection';
import { IncidentsSection } from './components/IncidentsSection';
import { StationsSection } from './components/StationsSection';
import { BackupModal } from './components/BackupModal';
import { PrintReportModal } from './components/PrintReportModal';
import { ExcelImportPreviewModal } from './components/ExcelImportPreviewModal';
import { MaintenanceInsight } from './utils/smartAnalysis';
import { ArrowRight, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginScreen } from './components/Auth/LoginScreen';

const EMPTY_APP_DATA: AppData = {
  stations: [],
  maintenanceRequests: [],
  inspections: [],
  incidents: []
};

const VALID_SECTIONS: Array<SectionType | 'home'> = ['home', 'pumps', 'tanks', 'facilities', 'inspections', 'incidents', 'stations'];

function getValidInitialSection(): SectionType | 'home' {
  try {
    const saved = sessionStorage.getItem('quik_active_section');
    if (saved && VALID_SECTIONS.includes(saved as any)) {
      return saved as SectionType | 'home';
    }
  } catch (e) {
    // Ignore storage restrictions
  }
  return 'home';
}

const QuikAppInner = React.memo(function QuikAppInner() {
  const { role } = useAuth();

  // Main persistent state - Initial state is empty until authoritative cloud load succeeds
  const [appData, setAppData] = useState<AppData>(EMPTY_APP_DATA);
  const [isDatabaseInitialized, setIsDatabaseInitialized] = useState<boolean>(false);
  const [isDatabaseLoadError, setIsDatabaseLoadError] = useState<string | null>(null);

  // Active section view with session persistence
  const [activeSection, setActiveSection] = useState<SectionType | 'home'>(getValidInitialSection);

  useEffect(() => {
    try {
      sessionStorage.setItem('quik_active_section', activeSection);
    } catch (e) {
      // Ignore storage restrictions
    }
  }, [activeSection]);

  // Smart Maintenance Insight filter
  const [activeInsightFilter, setActiveInsightFilter] = useState<MaintenanceInsight | null>(null);

  // Modal controls
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Excel File Input & Preview Modal State
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [targetExcelSection, setTargetExcelSection] = useState<'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'all'>('all');
  const [excelPreviewData, setExcelPreviewData] = useState<ExcelImportPreviewResult | null>(null);
  const [isExcelPreviewOpen, setIsExcelPreviewOpen] = useState(false);
  const [importNotification, setImportNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Print Modal control
  const [printTarget, setPrintTarget] = useState<{
    type: 'maintenance' | 'inspection' | 'incident';
    data: MaintenanceRequest | InternalInspection | IncidentRecord;
  } | null>(null);

  // Direct editing request bridge when clicked from dashboard
  const [initialEditingRequest, setInitialEditingRequest] = useState<MaintenanceRequest | null>(null);
  const [openNewModalDirectly, setOpenNewModalDirectly] = useState(false);

  // Startup Database Loading & Hydration
  useEffect(() => {
    async function initStorage() {
      try {
        const loadRes = await loadAppDataAsync();
        if (loadRes.success && loadRes.data) {
          setAppData(loadRes.data);
          setIsDatabaseInitialized(true);
          setIsDatabaseLoadError(null);
        } else if (loadRes.error) {
          setIsDatabaseLoadError(loadRes.error);
          setIsDatabaseInitialized(false);
        } else {
          setIsDatabaseInitialized(true);
        }
      } catch (err) {
        console.error('[STORAGE INIT] Error initializing cloud data:', err);
        setIsDatabaseLoadError(err instanceof Error ? err.message : String(err));
        setIsDatabaseInitialized(false);
      }
    }
    initStorage();
  }, []);

  // Supabase Realtime Subscription: Update client state when any change occurs across active devices
  useEffect(() => {
    if (!isDatabaseInitialized) return;

    const unsubscribe = subscribeToCloudChanges(async () => {
      try {
        const loadRes = await loadAppDataAsync();
        if (loadRes.success && loadRes.data) {
          setAppData(loadRes.data);
        }
      } catch (err) {
        console.warn('[REALTIME] Cloud refresh notice:', err);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isDatabaseInitialized]);

  // Sync appData to local cache for offline browsing
  useEffect(() => {
    if (!isDatabaseInitialized) {
      return;
    }
    saveAppData(appData);
  }, [appData, isDatabaseInitialized]);

  // Check for the scheduled monthly automatic cloud backup after database initialization
  useEffect(() => {
    // Automatic backups are restricted to active administrators.
    if (!isDatabaseInitialized || role !== 'admin') return;

    async function runDailyBackup() {
      try {
        await checkAndRunAutomaticCloudBackup();
      } catch (err) {
        console.warn('[CLOUD BACKUP] Automatic backup check notice:', err);
      }
    }

    runDailyBackup();
  }, [isDatabaseInitialized, role]);

  // Retry loading database from cloud if failed
  const handleRetryDatabaseLoad = async () => {
    setIsDatabaseLoadError(null);
    try {
      const loadRes = await loadAppDataAsync();
      if (loadRes.success && loadRes.data) {
        setAppData(loadRes.data);
        setIsDatabaseInitialized(true);
        setIsDatabaseLoadError(null);
      } else {
        setIsDatabaseLoadError(loadRes.error || 'تعذر تحميل البيانات. يرجى المحاولة مرة أخرى.');
      }
    } catch (err) {
      setIsDatabaseLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  // CRUD Handlers - Maintenance Requests (Cloud-First with atomic numbering)
  const handleSaveMaintenanceRequest = async (req: MaintenanceRequest): Promise<{ success: boolean; error?: string }> => {
    if (!validateNewRecord(req)) {
      console.warn('[DATA SAFETY] Rejected empty maintenance record.');
      return { success: false, error: 'سجل الصيانة غير صالح أو فارغ.' };
    }

    const isEditing = isValidUUID(req.id) && appData.maintenanceRequests.some(r => r.id === req.id);

    if (isEditing) {
      const res = await updateCloudMaintenanceRequest(req);
      if (!res.success || !res.data) {
        const errMsg = res.error || 'تعذر تعديل طلب الصيانة.';
        setImportNotification({ type: 'error', message: errMsg });
        setTimeout(() => setImportNotification(null), 5000);
        return { success: false, error: errMsg };
      }
      setAppData(prev => ({
        ...prev,
        maintenanceRequests: prev.maintenanceRequests.map(r => r.id === req.id ? res.data! : r)
      }));
      setImportNotification({
        type: 'success',
        message: `تم تعديل طلب الصيانة (#${res.data.requestNumber}) بنجاح.`
      });
      setTimeout(() => setImportNotification(null), 4000);
      return { success: true };
    } else {
      const res = await createCloudMaintenanceRequest(req);
      if (!res.success || !res.data) {
        const errMsg = res.error || 'تعذر إضافة طلب الصيانة.';
        setImportNotification({ type: 'error', message: errMsg });
        setTimeout(() => setImportNotification(null), 5000);
        return { success: false, error: errMsg };
      }
      setAppData(prev => ({
        ...prev,
        maintenanceRequests: [res.data!, ...prev.maintenanceRequests]
      }));
      setImportNotification({
        type: 'success',
        message: `تم إنشاء طلب الصيانة الجديد (#${res.data.requestNumber}) برقم تسلسلي بنجاح.`
      });
      setTimeout(() => setImportNotification(null), 4000);
      return { success: true };
    }
  };

  const handleDeleteMaintenanceRequest = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteCloudMaintenanceRequest(id);
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل حذف طلب الصيانة.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }
    setAppData(prev => ({
      ...prev,
      maintenanceRequests: prev.maintenanceRequests.filter(r => r.id !== id)
    }));
    setImportNotification({
      type: 'success',
      message: 'تم حذف طلب الصيانة بنجاح.'
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  const handleDeleteMultipleRequests = async (ids: string[]): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteMultipleCloudMaintenanceRequests(ids);
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل حذف الطلبات المحددة.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }
    setAppData(prev => ({
      ...prev,
      maintenanceRequests: prev.maintenanceRequests.filter(r => !ids.includes(r.id))
    }));
    setImportNotification({
      type: 'success',
      message: `تم حذف (${ids.length}) طلب صيانة بنجاح.`
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  // CRUD Handlers - Internal Inspections
  const handleSaveInspection = async (ins: InternalInspection): Promise<{ success: boolean; error?: string }> => {
    if (!validateNewRecord(ins)) {
      console.warn('[DATA SAFETY] Rejected empty inspection record.');
      return { success: false, error: 'سجل التفتيش غير صالح أو فارغ.' };
    }

    const isEditing = isValidUUID(ins.id) && appData.inspections.some(i => i.id === ins.id);

    if (isEditing) {
      const res = await updateCloudInspection(ins);
      if (!res.success || !res.data) {
        const errMsg = res.error || 'تعذر تعديل تقرير التفتيش.';
        setImportNotification({ type: 'error', message: errMsg });
        setTimeout(() => setImportNotification(null), 5000);
        return { success: false, error: errMsg };
      }
      setAppData(prev => ({
        ...prev,
        inspections: prev.inspections.map(i => i.id === ins.id ? res.data! : i)
      }));
      setImportNotification({
        type: 'success',
        message: `تم تعديل تقرير التفتيش (#${res.data.inspectionNumber}) بنجاح.`
      });
      setTimeout(() => setImportNotification(null), 4000);
      return { success: true };
    } else {
      const res = await createCloudInspection(ins);
      if (!res.success || !res.data) {
        const errMsg = res.error || 'تعذر إضافة تقرير التفتيش.';
        setImportNotification({ type: 'error', message: errMsg });
        setTimeout(() => setImportNotification(null), 5000);
        return { success: false, error: errMsg };
      }
      setAppData(prev => ({
        ...prev,
        inspections: [res.data!, ...prev.inspections]
      }));
      setImportNotification({
        type: 'success',
        message: `تم إنشاء تقرير التفتيش الجديد (#${res.data.inspectionNumber}) بنجاح.`
      });
      setTimeout(() => setImportNotification(null), 4000);
      return { success: true };
    }
  };

  const handleDeleteInspection = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteCloudInspection(id);
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل حذف تقرير التفتيش.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }
    setAppData(prev => ({
      ...prev,
      inspections: prev.inspections.filter(i => i.id !== id)
    }));
    setImportNotification({
      type: 'success',
      message: 'تم حذف تقرير التفتيش بنجاح.'
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  const handleDeleteMultipleInspections = async (ids: string[]): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteMultipleCloudInspections(ids);
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل حذف سجلات التفتيش المحددة.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }
    setAppData(prev => ({
      ...prev,
      inspections: prev.inspections.filter(i => !ids.includes(i.id))
    }));
    setImportNotification({
      type: 'success',
      message: `تم حذف (${ids.length}) تقرير تفتيش بنجاح.`
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  // CRUD Handlers - Incidents
  const handleSaveIncident = async (inc: IncidentRecord): Promise<{ success: boolean; error?: string }> => {
    if (!validateNewRecord(inc)) {
      console.warn('[DATA SAFETY] Rejected empty incident record.');
      return { success: false, error: 'سجل الحادث غير صالح أو فارغ.' };
    }

    const isEditing = isValidUUID(inc.id) && appData.incidents.some(i => i.id === inc.id);

    if (isEditing) {
      const res = await updateCloudIncident(inc);
      if (!res.success || !res.data) {
        const errMsg = res.error || 'تعذر تعديل بلاغ الحادث.';
        setImportNotification({ type: 'error', message: errMsg });
        setTimeout(() => setImportNotification(null), 5000);
        return { success: false, error: errMsg };
      }
      setAppData(prev => ({
        ...prev,
        incidents: prev.incidents.map(i => i.id === inc.id ? res.data! : i)
      }));
      setImportNotification({
        type: 'success',
        message: `تم تعديل بلاغ الحادث (#${res.data.incidentNumber}) بنجاح.`
      });
      setTimeout(() => setImportNotification(null), 4000);
      return { success: true };
    } else {
      const res = await createCloudIncident(inc);
      if (!res.success || !res.data) {
        const errMsg = res.error || 'تعذر إضافة بلاغ الحادث.';
        setImportNotification({ type: 'error', message: errMsg });
        setTimeout(() => setImportNotification(null), 5000);
        return { success: false, error: errMsg };
      }
      setAppData(prev => ({
        ...prev,
        incidents: [res.data!, ...prev.incidents]
      }));
      setImportNotification({
        type: 'success',
        message: `تم تسجيل بلاغ الحادث الجديد (#${res.data.incidentNumber}) بنجاح.`
      });
      setTimeout(() => setImportNotification(null), 4000);
      return { success: true };
    }
  };

  const handleDeleteIncident = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteCloudIncident(id);
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل حذف بلاغ الحادث.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }
    setAppData(prev => ({
      ...prev,
      incidents: prev.incidents.filter(i => i.id !== id)
    }));
    setImportNotification({
      type: 'success',
      message: 'تم حذف بلاغ الحادث بنجاح.'
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  const handleDeleteMultipleIncidents = async (ids: string[]): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteMultipleCloudIncidents(ids);
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل حذف بلاغات الحوادث المحددة.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }
    setAppData(prev => ({
      ...prev,
      incidents: prev.incidents.filter(i => !ids.includes(i.id))
    }));
    setImportNotification({
      type: 'success',
      message: `تم حذف (${ids.length}) بلاغ حادث بنجاح.`
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  // CRUD Handlers - Stations
  const handleSaveStation = async (st: Station): Promise<{ success: boolean; error?: string }> => {
    const res = await saveCloudStation(st);
    if (!res.success || !res.data) {
      const errMsg = res.error || 'تعذر حفظ بيانات المحطة.';
      setImportNotification({ type: 'error', message: errMsg });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: errMsg };
    }
    setAppData(prev => {
      const exists = prev.stations.some(s => s.id === res.data!.id || s.code === res.data!.code);
      let updatedStations: Station[];
      if (exists) {
        updatedStations = prev.stations.map(s => (s.id === res.data!.id || s.code === res.data!.code) ? res.data! : s);
      } else {
        updatedStations = [...prev.stations, res.data!];
      }
      return { ...prev, stations: updatedStations };
    });
    setImportNotification({
      type: 'success',
      message: `تم حفظ بيانات المحطة (${res.data.name}) بنجاح.`
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  const handleDeleteStation = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteCloudStation(id);
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل حذف المحطة.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }
    setAppData(prev => ({
      ...prev,
      stations: prev.stations.filter(s => s.id !== id)
    }));
    setImportNotification({
      type: 'success',
      message: 'تم حذف المحطة بنجاح.'
    });
    setTimeout(() => setImportNotification(null), 4000);
    return { success: true };
  };

  const handleToggleStationStatus = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const target = appData.stations.find(s => s.id === id);
    if (!target) return { success: false, error: 'المحطة غير موجودة.' };

    const res = await toggleCloudStationStatus(id, target.status || 'نشطة');
    if (!res.success || !res.newStatus) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشل تحديث حالة المحطة.'
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: false, error: res.error };
    }

    setAppData(prev => ({
      ...prev,
      stations: prev.stations.map(s => s.id === id ? { ...s, status: res.newStatus! } : s)
    }));
    return { success: true };
  };

  // Backup, Clear & Import Handlers
  const handleImportData = (newData: AppData) => {
    setAppData(newData);
    saveAppData(newData);
  };

  const handleClearAllRecords = async (): Promise<{ success: boolean; error?: string }> => {
    const res = await clearAllCloudRecords();
    if (!res.success) {
      setImportNotification({
        type: 'error',
        message: res.error || 'فشلت عملية مسح السجلات.'
      });
      setTimeout(() => setImportNotification(null), 6000);
      return { success: false, error: res.error };
    }

    // Intentionally clear primary local cache (quick_fuel_db_v1)
    // while creating forced recovery snapshot and preserving central stations directory
    const clearedData = clearAllRecords(appData);

    // Intentionally update React state to empty operational dataset
    setAppData(clearedData);

    setImportNotification({
      type: 'success',
      message: 'تم مسح السجلات بنجاح.'
    });
    setTimeout(() => setImportNotification(null), 5000);
    return { success: true };
  };

  // Excel Import & Export Functions
  const handleTriggerExcelImport = (section: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'all' = 'all') => {
    setTargetExcelSection(section);
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
      excelFileInputRef.current.click();
    }
  };

  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const preview = await parseExcelFileForPreview(file, targetExcelSection, appData);
      setExcelPreviewData(preview);
      setIsExcelPreviewOpen(true);
    } catch {
      setImportNotification({
        type: 'error',
        message: 'حدث خطأ أثناء قراءة ملف Excel. يرجى التأكد من أن الملف بصيغة .xlsx صالحة.'
      });
      setTimeout(() => setImportNotification(null), 5000);
    }
  };

  const handleConfirmExcelImport = async (
    importedReqs: MaintenanceRequest[],
    importedIns: InternalInspection[],
    importedIncs: IncidentRecord[],
    ignoreDuplicates: boolean,
    onProgress?: (progress: { current: number; total: number; message: string }) => void
  ): Promise<{ success: boolean; importedCount?: number; error?: string }> => {
    try {
      let reqsToAdd = importedReqs;
      let insToAdd = importedIns;
      let incsToAdd = importedIncs;

      if (ignoreDuplicates) {
        reqsToAdd = importedReqs.filter(r => !r.isDuplicate);
        insToAdd = importedIns.filter(i => !i.isDuplicate);
        incsToAdd = importedIncs.filter(inc => !inc.isDuplicate);
      }

      const totalToImport = reqsToAdd.length + insToAdd.length + incsToAdd.length;
      if (totalToImport === 0) {
        const errMsg = 'لا توجد سجلات جديدة للاستيراد بعد استبعاد السجلات المكررة.';
        setImportNotification({
          type: 'error',
          message: errMsg
        });
        setTimeout(() => setImportNotification(null), 5000);
        return { success: false, error: errMsg };
      }

      // Only administrators create safety backups. Regular users can still
      // import records without triggering a backup attempt that RLS will reject.
      if (totalToImport >= 5 && role === 'admin') {
        onProgress?.({
          current: 0,
          total: totalToImport,
          message: `جاري تجهيز نسخة أمان لـ ${totalToImport} سجل...`
        });
        const safetyRes = await executeCloudSafetyBackup(`استيراد Excel لـ ${totalToImport} سجل`);
        if (!safetyRes.success) {
          const errMsg = `تم إلغاء عملية الاستيراد لتعذر إنشاء نسخة الأمان: ${safetyRes.error || ''}`;
          setImportNotification({
            type: 'error',
            message: errMsg
          });
          setTimeout(() => setImportNotification(null), 6000);
          return { success: false, error: errMsg };
        }
      }

      const importRes = await importExcelRecordsToCloud(reqsToAdd, insToAdd, incsToAdd, onProgress);

      if (!importRes.success) {
        const errMsg = `فشل استيراد السجلات: ${importRes.error || 'خطأ غير معروف'}`;
        setImportNotification({
          type: 'error',
          message: errMsg
        });
        setTimeout(() => setImportNotification(null), 6000);
        return { success: false, error: errMsg };
      }

      onProgress?.({
        current: totalToImport,
        total: totalToImport,
        message: 'جاري تحديث البيانات...'
      });

      // Reconcile and refresh authoritative cloud data
      const refreshRes = await loadAppDataAsync();
      if (refreshRes.success && refreshRes.data) {
        setAppData(refreshRes.data);
      }

      setIsExcelPreviewOpen(false);
      setExcelPreviewData(null);
      setImportNotification({
        type: 'success',
        message: `تم الاستيراد بنجاح! تم حفظ ${importRes.importedCount} سجل.`
      });
      setTimeout(() => setImportNotification(null), 5000);
      return { success: true, importedCount: importRes.importedCount };
    } catch (err: any) {
      console.error('[CONFIRM EXCEL IMPORT EXCEPTION]:', err);
      const errMsg = err?.message || 'حدث خطأ أثناء معالجة استيراد Excel.';
      setImportNotification({
        type: 'error',
        message: errMsg
      });
      setTimeout(() => setImportNotification(null), 6000);
      return { success: false, error: errMsg };
    }
  };

  const handleExportExcelSection = (sec: 'pumps' | 'tanks' | 'facilities' | 'inspections' | 'incidents' | 'all') => {
    if (sec === 'all') {
      exportAllDataToExcel(appData);
    } else {
      exportSectionToExcel(sec, appData);
    }
  };

  // Handle Cloud Restore Completion: preserve active section view and re-hydrate data in-place
  const handleRestoreSuccess = async () => {
    const currentSection = activeSection;
    try {
      const loadRes = await loadAppDataAsync();
      if (loadRes.success && loadRes.data) {
        setAppData(loadRes.data);
      }
    } catch (err) {
      console.error('[RESTORE HYDRATION ERROR]:', err);
    }

    if (VALID_SECTIONS.includes(currentSection)) {
      setActiveSection(currentSection);
    } else {
      setActiveSection('home');
    }

    setImportNotification({
      type: 'success',
      message: 'تمت استعادة قاعدة البيانات وتحديث السجلات بنجاح مع الحفاظ على القسم الحالي.'
    });
    setTimeout(() => setImportNotification(null), 5000);
  };

  // Open filtered records from Smart Maintenance Insight
  const handleOpenInsightRecords = (insight: MaintenanceInsight) => {
    setActiveInsightFilter(insight);
    setActiveSection(insight.section);
  };

  // Open existing request from Dashboard table directly
  const handleOpenRequestFromDashboard = (req: MaintenanceRequest) => {
    setInitialEditingRequest(req);
    setActiveSection(req.section);
  };

  // Quick "New Request" button click
  const handleQuickNewRequestClick = (sec?: SectionType) => {
    const targetSection = sec || (activeSection === 'home' ? 'pumps' : activeSection);
    if (activeSection !== targetSection) {
      setActiveSection(targetSection);
    }
    setOpenNewModalDirectly(true);
  };

  // Initial Authoritative Cloud Loading View (Blocks stale local cache from rendering)
  if (!isDatabaseInitialized && !isDatabaseLoadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 dir-rtl text-slate-800 font-['Cairo',sans-serif] quik-brand-background">
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 max-w-sm w-full shadow-xl shadow-slate-200/50 text-center space-y-4 animate-in fade-in duration-300">
          <div className="quik-loader-mark">
            <img
              src="/quik-arrow-mark.png"
              alt=""
              aria-hidden="true"
              className="quik-loader-mark__arrows"
            />
            <span className="quik-loader-mark__ring" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 mb-1">جاري تحميل البيانات</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              يتم الاتصال بقاعدة البيانات والتحقق من التحديثات المعتمدة...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Database Load Error View (Cloud database unreachable / network offline)
  if (isDatabaseLoadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 dir-rtl text-slate-800 font-['Cairo',sans-serif] quik-brand-background">
        <div className="bg-white border border-rose-200/80 rounded-3xl p-8 max-w-lg w-full shadow-xl shadow-slate-200/60 text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-2">تعذر تحميل البيانات</h2>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">{isDatabaseLoadError}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl text-xs text-slate-600 font-medium text-center border border-slate-200">
            يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleRetryDatabaseLoad}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col dir-rtl text-slate-800 font-['Cairo',sans-serif] quik-brand-background">
      
      {/* Top Header */}
      <Header
        activeSection={activeSection}
        onNavigateHome={() => {
          setActiveSection('home');
          setActiveInsightFilter(null);
        }}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Breadcrumb Navigation when inside section */}
        {activeSection !== 'home' && (
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-500 no-print">
            <button
              onClick={() => {
                setActiveSection('home');
                setActiveInsightFilter(null);
              }}
              className="hover:text-orange-600 transition-colors cursor-pointer"
            >
              الرئيسية
            </button>
            <ArrowRight className="w-3.5 h-3.5 rotate-180 text-slate-400" />
            <span className="text-slate-900 font-bold">
              {activeSection === 'pumps' && 'قسم المضخات'}
              {activeSection === 'tanks' && 'قسم الخزانات'}
              {activeSection === 'facilities' && 'قسم المرافق والساحات'}
              {activeSection === 'inspections' && 'التفتيش الدوري'}
              {activeSection === 'incidents' && 'سجل الحوادث'}
              {activeSection === 'stations' && 'إدارة المحطات المركزية'}
            </span>
          </div>
        )}

        {/* Import / Toast Notification Banner */}
        {importNotification && (
          <div className={`mb-4 p-4 rounded-2xl shadow-sm text-xs font-bold flex items-center justify-between no-print animate-toast ${
            importNotification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90'
              : 'bg-rose-50 text-rose-900 border border-rose-200/90'
          }`}>
            <div className="flex items-center gap-2">
              {importNotification.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span>{importNotification.message}</span>
            </div>
            <button
              onClick={() => setImportNotification(null)}
              aria-label="إغلاق التنبيه"
              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Hidden File Input for Excel Import */}
        <input
          type="file"
          ref={excelFileInputRef}
          onChange={handleExcelFileSelected}
          accept=".xlsx, .xls"
          className="hidden"
        />

        {/* Active Section Content with Smooth Fast Transition */}
        <div key={activeSection} className="animate-page-enter">
          {/* Dashboard View */}
          {activeSection === 'home' && (
            <Dashboard
              appData={appData}
              onSelectSection={(sec) => {
                setActiveSection(sec);
                setActiveInsightFilter(null);
              }}
              onOpenRequest={handleOpenRequestFromDashboard}
              onNewRequestClick={handleQuickNewRequestClick}
              onSelectInsight={handleOpenInsightRecords}
            />
          )}

          {/* Maintenance Request Sections (Pumps, Tanks, Facilities) */}
          {(activeSection === 'pumps' || activeSection === 'tanks' || activeSection === 'facilities') && (
            <MaintenanceSection
              key={activeSection}
              section={activeSection}
              requests={appData.maintenanceRequests}
              stations={appData.stations}
              onSaveRequest={handleSaveMaintenanceRequest}
              onDeleteRequest={handleDeleteMaintenanceRequest}
              onDeleteMultipleRequests={handleDeleteMultipleRequests}
              onPrintRequest={(req) => setPrintTarget({ type: 'maintenance', data: req })}
              onExportExcel={() => handleExportExcelSection(activeSection as any)}
              initialEditingRequest={initialEditingRequest}
              onClearInitialEditing={() => setInitialEditingRequest(null)}
              onOpenNewModalDirectly={openNewModalDirectly}
              onClearOpenNewModalDirectly={() => setOpenNewModalDirectly(false)}
              activeInsightFilter={activeInsightFilter?.section === activeSection ? activeInsightFilter : null}
              onClearInsightFilter={() => setActiveInsightFilter(null)}
            />
          )}

          {/* Periodic Internal Inspection Section */}
          {activeSection === 'inspections' && (
            <InspectionSection
              inspections={appData.inspections}
              stations={appData.stations}
              onSaveInspection={handleSaveInspection}
              onDeleteInspection={handleDeleteInspection}
              onDeleteMultipleInspections={handleDeleteMultipleInspections}
              onPrintInspection={(ins) => setPrintTarget({ type: 'inspection', data: ins })}
              onExportExcel={() => handleExportExcelSection('inspections')}
            />
          )}

          {/* Incidents Section */}
          {activeSection === 'incidents' && (
            <IncidentsSection
              incidents={appData.incidents}
              stations={appData.stations}
              onSaveIncident={handleSaveIncident}
              onDeleteIncident={handleDeleteIncident}
              onDeleteMultipleIncidents={handleDeleteMultipleIncidents}
              onPrintIncident={(inc) => setPrintTarget({ type: 'incident', data: inc })}
              onExportExcel={() => handleExportExcelSection('incidents')}
            />
          )}

          {/* Stations Central Management Section */}
          {activeSection === 'stations' && (
            <StationsSection
              stations={appData.stations}
              appData={appData}
              onSaveStation={handleSaveStation}
              onDeleteStation={handleDeleteStation}
              onToggleStatus={handleToggleStationStatus}
            />
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 no-print mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            نظام إدارة الصيانة والتفتيش الدوري والحوادث - محطات كويك للوقود (Quick Fuel Stations) © {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-2 text-slate-500 font-semibold">
            <span>نظام متكامل لإدارة وتشغيل محطات الوقود</span>
          </div>
        </div>
      </footer>

      {/* Backup & Import Data Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        appData={appData}
        onImportData={handleImportData}
        onClearAllRecords={handleClearAllRecords}
        onClose={() => setIsBackupModalOpen(false)}
        onTriggerExcelImport={() => handleTriggerExcelImport('all')}
        onTriggerExcelExportAll={() => handleExportExcelSection('all')}
        onRestoreSuccess={handleRestoreSuccess}
      />

      {/* Excel Import Preview Modal */}
      <ExcelImportPreviewModal
        isOpen={isExcelPreviewOpen}
        previewData={excelPreviewData}
        onConfirmImport={handleConfirmExcelImport}
        onCancel={() => {
          setIsExcelPreviewOpen(false);
          setExcelPreviewData(null);
        }}
      />

      {/* Print Report Modal */}
      {printTarget && (
        <PrintReportModal
          isOpen={printTarget !== null}
          type={printTarget.type}
          data={printTarget.data}
          onClose={() => setPrintTarget(null)}
        />
      )}

    </div>
  );
});

function AppGate() {
  const { isAuthenticated, isLoading } = useAuth();

  // 1. Initial startup loading: only show full-screen loader while session is unresolved
  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 dir-rtl font-['Cairo',sans-serif] selection:bg-orange-500 selection:text-white relative overflow-hidden quik-brand-background">
        {/* Ambient Subtle Background Accents */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-600/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="bg-white border border-slate-200/90 py-8 px-10 rounded-3xl shadow-xl shadow-slate-200/60 text-center flex flex-col items-center justify-center gap-3.5 relative z-10 max-w-sm w-full">
          <div className="quik-loader-mark">
            <img
              src="/quik-arrow-mark.png"
              alt=""
              aria-hidden="true"
              className="quik-loader-mark__arrows"
            />
            <span className="quik-loader-mark__ring" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">كويك لمحطات الوقود</p>
            <p className="text-xs font-bold text-slate-600 leading-tight mt-1">جاري استعادة الجلسة والتحقق من الصلاحيات...</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Strict Gate: If not authenticated, ALWAYS show LoginScreen (which handles First Admin Setup or Standard Login)
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // 3. Only fully authenticated and active users can reach the operational Dashboard
  return <QuikAppInner />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
