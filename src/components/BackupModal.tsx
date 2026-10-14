import React, { useRef, useState, useEffect } from 'react';
import {
  Download,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  Trash2,
  Database,
  FileSpreadsheet,
  ShieldCheck,
  Clock,
  RefreshCw,
  Loader2,
  Lock,
  MoreVertical,
  Search,
  ChevronRight,
  ChevronLeft,
  Server,
  Filter,
  Info
} from 'lucide-react';
import { AppData } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  CloudBackupItem,
  listCloudBackups,
  createCloudBackup,
  getCloudBackup,
  restoreCloudBackup,
  deleteCloudBackup,
  parseAndValidateLocalBackupFile,
  restoreFromLocalBackupSnapshot,
  BackupValidationResult
} from '../services/cloudBackupService';
import { ConfirmModal } from './ConfirmModal';
import { useScrollLock } from '../utils/scrollLock';

interface BackupModalProps {
  isOpen: boolean;
  appData: AppData;
  onImportData: (newData: AppData) => void;
  onClearAllRecords: () => Promise<{ success: boolean; error?: string } | void> | void;
  onClose: () => void;
  onTriggerExcelImport?: () => void;
  onTriggerExcelExportAll?: () => void;
  onRestoreSuccess?: () => Promise<void> | void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  appData,
  onImportData,
  onClearAllRecords,
  onClose,
  onTriggerExcelImport,
  onTriggerExcelExportAll,
  onRestoreSuccess
}) => {
  const { role, profile } = useAuth();
  const isAdmin = role === 'admin';
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backups, setBackups] = useState<CloudBackupItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'automatic' | 'manual' | 'safety'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Restore Modal State
  const [selectedBackupToRestore, setSelectedBackupToRestore] = useState<CloudBackupItem | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  // Local File Restore Modal State
  const [localBackupPreview, setLocalBackupPreview] = useState<BackupValidationResult | null>(null);
  const [localRestoreConfirmOpen, setLocalRestoreConfirmOpen] = useState(false);

  // Delete Modal State
  const [selectedBackupToDelete, setSelectedBackupToDelete] = useState<CloudBackupItem | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Clear All Modal State
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  useScrollLock(isOpen);

  const fetchBackupsList = async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    const res = await listCloudBackups();
    setIsLoading(false);

    if (res.success && res.backups) {
      setBackups(res.backups);
    } else if (res.error) {
      setMessage({ type: 'error', text: res.error });
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchBackupsList();
    }
  }, [isOpen, isAdmin]);

  if (!isOpen) return null;

  // Filtered & Searched Backups List
  const filteredBackups = backups.filter(b => {
    const matchesType = filterType === 'all' || b.backup_type === filterType;
    const searchLower = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !searchLower ||
      b.filename.toLowerCase().includes(searchLower) ||
      (b.created_by_name && b.created_by_name.toLowerCase().includes(searchLower));
    return matchesType && matchesSearch;
  });

  // Pagination Logic
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredBackups.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedBackups = filteredBackups.slice(
    (validCurrentPage - 1) * pageSize,
    validCurrentPage * pageSize
  );

  const latestBackup = backups.length > 0 ? backups[0] : null;

  // Format File Size
  const formatSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return 'أقل من 1 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Format Date in Arabic
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // Get total record count summary for a backup item
  const getRecordSummaryText = (item: CloudBackupItem) => {
    const counts = item.record_counts || {};
    const total =
      (counts.maintenance_requests || 0) +
      (counts.internal_inspections || 0) +
      (counts.incident_records || 0) +
      (counts.stations || 0);

    if (counts.maintenance_requests) {
      return `${counts.maintenance_requests} طلب صيانة (${total} إجمالي)`;
    }
    return `${total} سجل`;
  };

  // Handle Manual Backup Creation
  const handleCreateManualBackup = async () => {
    setMessage(null);
    setIsActionLoading(true);
    const res = await createCloudBackup('manual', `نسخة احتياطية يدوية تم إنشاؤها بواسطة [${profile?.full_name || profile?.username}]`);
    setIsActionLoading(false);

    if (res.success) {
      setMessage({ type: 'success', text: 'تم إنشاء النسخة الاحتياطية بنجاح.' });
      fetchBackupsList();
    } else {
      setMessage({ type: 'error', text: res.error || 'تعذر إنشاء النسخة الاحتياطية.' });
    }
  };

  // Handle Download JSON Backup
  const handleDownloadBackup = async (item: CloudBackupItem) => {
    setActiveMenuId(null);
    setMessage(null);
    setIsActionLoading(true);
    const res = await getCloudBackup(item.id);
    setIsActionLoading(false);

    if (res.success && res.backup?.snapshot_data) {
      const jsonStr = JSON.stringify(res.backup.snapshot_data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `تم تحميل ملف النسخة الاحتياطية [${item.filename}] بنجاح.` });
    } else {
      setMessage({ type: 'error', text: res.error || 'تعذر تحميل ملف النسخة الاحتياطية.' });
    }
  };

  // Handle Confirm Restore
  const handleConfirmRestore = async () => {
    if (!selectedBackupToRestore) return;
    setRestoreConfirmOpen(false);
    setMessage({
      type: 'success',
      text: 'جاري تأمين البيانات واستعادة النسخة الاحتياطية...'
    });
    setIsActionLoading(true);

    try {
      const res = await restoreCloudBackup(selectedBackupToRestore.id);

      if (res.success) {
        setMessage({
          type: 'success',
          text: `${res.data?.message || 'تمت استعادة البيانات بنجاح.'} (تمت إعادة الترقيم الأوتوماتيكية في قاعدة البيانات وحفظ التغييرات).`
        });
        fetchBackupsList();

        if (onRestoreSuccess) {
          await onRestoreSuccess();
        }
      } else {
        setMessage({ type: 'error', text: res.error || 'فشلت عملية الاستعادة.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'حدث خطأ أثناء استعادة البيانات.' });
    } finally {
      setIsActionLoading(false);
      setSelectedBackupToRestore(null);
    }
  };

  // Handle Local JSON Backup File Selection
  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const validation = parseAndValidateLocalBackupFile(content);
      if (!validation.isValid) {
        setMessage({ type: 'error', text: validation.error || 'ملف النسخة الاحتياطية غير صالح.' });
        if (localFileInputRef.current) localFileInputRef.current.value = '';
        return;
      }
      setLocalBackupPreview(validation);
      setLocalRestoreConfirmOpen(true);
      if (localFileInputRef.current) localFileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء قراءة الملف من جهاز الكمبيوتر.' });
      if (localFileInputRef.current) localFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Handle Confirm Local Restore
  const handleConfirmLocalRestore = async () => {
    if (!localBackupPreview || !localBackupPreview.rawSnapshot) return;
    setLocalRestoreConfirmOpen(false);
    setMessage({
      type: 'success',
      text: 'جاري إنشاء نسخة الأمان الأوتوماتيكية وتأمين البيانات، ثم استعادة ملف الحاسوب والتحقق من السجلات...'
    });
    setIsActionLoading(true);

    try {
      const res = await restoreFromLocalBackupSnapshot(localBackupPreview.rawSnapshot);

      if (res.success && res.verifiedCounts) {
        setMessage({
          type: 'success',
          text: `تمت استعادة البيانات بنجاح! تم استعادة ${res.verifiedCounts.maintenance_requests} طلب صيانة و ${res.verifiedCounts.stations} محطة والتحقق أوتوماتيكياً من مطابقة السجلات.`
        });
        fetchBackupsList();

        if (onRestoreSuccess) {
          await onRestoreSuccess();
        }
      } else {
        setMessage({ type: 'error', text: res.error || 'فشلت عملية استعادة الملف المحتي.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'حدث خطأ أثناء تنفيذ عملية الاستعادة.' });
    } finally {
      setIsActionLoading(false);
      setLocalBackupPreview(null);
    }
  };

  // Handle Confirm Delete Backup
  const handleConfirmDelete = async () => {
    if (!selectedBackupToDelete) return;
    setDeleteConfirmOpen(false);
    setMessage(null);
    setIsActionLoading(true);

    const res = await deleteCloudBackup(selectedBackupToDelete.id);
    setIsActionLoading(false);

    if (res.success) {
      setMessage({ type: 'success', text: res.message || 'تم حذف النسخة الاحتياطية بنجاح.' });
      fetchBackupsList();
    } else {
      setMessage({ type: 'error', text: res.error || 'فشل حذف النسخة الاحتياطية.' });
    }
    setSelectedBackupToDelete(null);
  };

  // Handle Clear All Records
  const handleConfirmClearAll = async () => {
    setClearConfirmOpen(false);
    setMessage(null);
    setIsActionLoading(true);

    try {
      const res = await Promise.resolve(onClearAllRecords() as any);
      setIsActionLoading(false);
      if (res && typeof res === 'object' && res.success === false) {
        setMessage({
          type: 'error',
          text: res.error || 'تعذر مسح السجلات.'
        });
        return;
      }
      setMessage({
        type: 'success',
        text: 'تم مسح جميع السجلات بنجاح بعد إنشاء نسخة أمان تلقائية.'
      });
      fetchBackupsList();
    } catch (err: any) {
      setIsActionLoading(false);
      setMessage({
        type: 'error',
        text: err?.message || 'تعذر استكمال عملية المسح.'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md font-['Cairo',sans-serif] dir-rtl animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
        
        {/* Compact Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-white text-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-2xl border border-orange-100 shadow-2xs">
              <Database className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-['Cairo'] text-slate-900">
                  إدارة النسخ الاحتياطية
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  النظام يعمل
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                حماية واستعادة بيانات النظام والنسخ الاحتياطية بشكل آمن
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">

          {/* Non-Admin Banner */}
          {!isAdmin ? (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs sm:text-sm font-bold flex items-center gap-3">
              <Lock className="w-5 h-5 text-amber-600 shrink-0" />
              <span>عفواً، خيارات إدارة وتصدير النسخ الاحتياطية مقتصرة حصرياً على مدراء النظام المعتمدين.</span>
            </div>
          ) : (
            <>
              {/* Notification Banner */}
              {message && (
                <div
                  className={`p-3.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
                    message.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {message.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                    <span>{message.text}</span>
                  </div>
                  <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Summary Stats & Primary Action Section */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-3 gap-2 w-full sm:w-auto text-right">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                      <span className="block text-[10px] text-slate-500 font-medium">إجمالي النسخ</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900">{backups.length} نسخة</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                      <span className="block text-[10px] text-slate-500 font-medium">آخر نسخة</span>
                      <span className="text-[11px] sm:text-xs font-bold text-slate-800 truncate block">
                        {latestBackup ? formatDate(latestBackup.created_at) : 'لا توجد'}
                      </span>
                    </div>
                    <div className="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/80">
                      <span className="block text-[10px] text-emerald-700 font-medium">حالة الأمان</span>
                      <span className="text-[11px] sm:text-xs font-bold text-emerald-900 block">مكتمل ومؤمن</span>
                    </div>
                  </div>

                  {/* Primary Action Button */}
                  <button
                    onClick={handleCreateManualBackup}
                    disabled={isActionLoading}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isActionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Database className="w-4 h-4 stroke-[2.5]" />
                    )}
                    <span>إنشاء نسخة احتياطية جديدة</span>
                  </button>
                </div>
              </div>

              {/* Hidden File Input for Local JSON Backup Restoration */}
              <input
                type="file"
                ref={localFileInputRef}
                accept=".json"
                onChange={handleLocalFileSelect}
                className="hidden"
              />

              {/* Secondary Actions Toolbar */}
              <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Restore from Computer */}
                  <button
                    onClick={() => localFileInputRef.current?.click()}
                    disabled={isActionLoading}
                    className="px-3 py-2 bg-slate-50 hover:bg-orange-50 hover:text-orange-700 border border-slate-200 hover:border-orange-300 rounded-xl font-bold text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                    <span>استعادة من ملف JSON (الحاسوب)</span>
                  </button>

                  {/* Excel Import */}
                  {onTriggerExcelImport && (
                    <button
                      onClick={onTriggerExcelImport}
                      className="px-3 py-2 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-xl font-bold text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>استيراد Excel</span>
                    </button>
                  )}

                  {/* Excel Export All */}
                  {onTriggerExcelExportAll && (
                    <button
                      onClick={onTriggerExcelExportAll}
                      className="px-3 py-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-xl font-bold text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>تصدير Excel شامل</span>
                    </button>
                  )}
                </div>

                {/* Clear All Data */}
                <button
                  onClick={() => setClearConfirmOpen(true)}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer mr-auto"
                  title="مسح كافة سجلات الصيانة والتفتيش والحوادث مع تأمين نسخة احتياطية"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>مسح كل البيانات</span>
                </button>
              </div>

              {/* Backups Catalog Section */}
              <div className="space-y-3">
                {/* Search & Filters Toolbar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="بحث في النسخ الاحتياطية باسم الملف..."
                      className="w-full pr-9 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-orange-500 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 text-xs font-bold bg-slate-200/60 p-1 rounded-xl shrink-0">
                    <button
                      onClick={() => { setFilterType('all'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        filterType === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      الكل ({backups.length})
                    </button>
                    <button
                      onClick={() => { setFilterType('manual'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        filterType === 'manual' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      يدوي
                    </button>
                    <button
                      onClick={() => { setFilterType('automatic'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        filterType === 'automatic' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      تلقائي
                    </button>
                    <button
                      onClick={() => { setFilterType('safety'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        filterType === 'safety' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      أمان
                    </button>
                  </div>

                </div>

                {/* Backups List Container */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  {isLoading ? (
                    <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                      <span className="text-xs font-bold">جاري تحميل سجل النسخ الاحتياطية...</span>
                    </div>
                  ) : filteredBackups.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 space-y-1">
                      <p className="text-xs sm:text-sm font-bold">لا توجد نسخ احتياطية متاحة تطابق نتائج البحث والفلترة.</p>
                      <p className="text-xs text-slate-400">يمكنك إنشاء نسخة احتياطية جديدة من الزر أعلاه.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {paginatedBackups.map(item => {
                        let typeBadge = (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
                            يدوي
                          </span>
                        );
                        if (item.backup_type === 'automatic') {
                          typeBadge = (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                              تلقائي
                            </span>
                          );
                        } else if (item.backup_type === 'safety') {
                          typeBadge = (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">
                              أمان
                            </span>
                          );
                        }

                        const isMenuOpen = activeMenuId === item.id;

                        return (
                          <div
                            key={item.id}
                            className="p-3 sm:px-4 sm:py-3 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 text-xs relative"
                          >
                            {/* Right info (Type, Filename, Date) */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="shrink-0">{typeBadge}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900 truncate max-w-[200px] sm:max-w-[280px]" title={item.filename}>
                                    {item.filename}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-md font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    ناجح
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 font-medium">
                                  <span>{formatDate(item.created_at)}</span>
                                  <span>•</span>
                                  <span>{item.created_by_name || 'النظام'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Middle stats (Record count, Size) */}
                            <div className="hidden md:flex items-center gap-4 shrink-0 text-slate-600 font-medium text-[11px]">
                              <span className="bg-slate-100 px-2 py-1 rounded-lg font-bold text-slate-800">
                                {getRecordSummaryText(item)}
                              </span>
                              <span className="font-mono">{formatSize(item.size_bytes)}</span>
                            </div>

                            {/* Overflow Actions Menu */}
                            <div className="relative shrink-0">
                              <button
                                onClick={() => setActiveMenuId(isMenuOpen ? null : item.id)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer"
                                title="خيارات النسخة"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {/* Dropdown Menu Popup */}
                              {isMenuOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setActiveMenuId(null)}
                                  />
                                  <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 z-30 py-1.5 text-xs dir-rtl animate-in fade-in zoom-in-95 duration-150">
                                    <button
                                      onClick={() => handleDownloadBackup(item)}
                                      className="w-full px-3 py-2 text-right text-slate-700 hover:bg-slate-100 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5 text-blue-600" />
                                      <span>تحميل ملف JSON</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setSelectedBackupToRestore(item);
                                        setRestoreConfirmOpen(true);
                                      }}
                                      className="w-full px-3 py-2 text-right text-slate-700 hover:bg-slate-100 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5 text-orange-600" />
                                      <span>استعادة هذه النسخة</span>
                                    </button>

                                    <div className="my-1 border-t border-slate-100"></div>

                                    <button
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setSelectedBackupToDelete(item);
                                        setDeleteConfirmOpen(true);
                                      }}
                                      className="w-full px-3 py-2 text-right text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-bold cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                      <span>حذف النسخة</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Pagination Footer */}
                  {filteredBackups.length > 0 && (
                    <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-600 font-medium">
                      <div>
                        عرض {Math.min((validCurrentPage - 1) * pageSize + 1, filteredBackups.length)} - {Math.min(validCurrentPage * pageSize, filteredBackups.length)} من أصل {filteredBackups.length} نسخة
                      </div>

                      {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={validCurrentPage === 1}
                            className="p-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="الصفحة السابقة"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <span className="px-2 font-bold text-slate-800">
                            صفحة {validCurrentPage} من {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={validCurrentPage === totalPages}
                            className="p-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="الصفحة التالية"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>نظام حماية النسخ الاحتياطية والتحقق من سلامة البيانات</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-200 transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>

      {/* Confirmation Modal - Restore Backup */}
      <ConfirmModal
        isOpen={restoreConfirmOpen}
        title="تأكيد استعادة النسخة الاحتياطية"
        message={`هل أنت متأكد من استعادة النسخة الاحتياطية [${selectedBackupToRestore?.filename}]؟ سيتم إنشاء نسخة أمان أوتوماتيكية مسبقاً قبل البدء.`}
        confirmLabel="استعادة النسخة الآن"
        isDanger={false}
        onConfirm={handleConfirmRestore}
        onCancel={() => setRestoreConfirmOpen(false)}
      />

      {/* Confirmation Modal - Delete Backup */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="تأكيد حذف النسخة الاحتياطية"
        message={`هل أنت متأكد من حذف النسخة الاحتياطية [${selectedBackupToDelete?.filename}] نهائياً؟`}
        confirmLabel="حذف النسخة"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* Confirmation Modal - Clear All Records */}
      <ConfirmModal
        isOpen={clearConfirmOpen}
        title="تأكيد الحذف الكلي للسجلات"
        message="هل أنت متأكد من مسح جميع سجلات الصيانة والتفتيش والحوادث ؟ سيتم إنشاء نسخة أمان تلقائية قبل عملية المسح."
        confirmLabel="مسح الكل مع إنشاء نسخة أمان"
        isDanger={true}
        onConfirm={handleConfirmClearAll}
        onCancel={() => setClearConfirmOpen(false)}
      />

      {/* Local File Restore Preview & Confirmation Modal */}
      {localRestoreConfirmOpen && localBackupPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md font-['Cairo',sans-serif] dir-rtl animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-slate-800">
            
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 bg-orange-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500 text-white rounded-xl shadow-xs">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">معاينة وتأكيد الاستعادة من الحاسوب</h3>
                  <p className="text-[11px] text-slate-500">فحص وتأكيد بيانات النسخة الاحتياطية قبل الاستعادة</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setLocalRestoreConfirmOpen(false);
                  setLocalBackupPreview(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1 font-mono">
                <p className="font-bold text-slate-800 text-xs font-sans">اسم الملف: <span className="text-orange-600">{localBackupPreview.filename}</span></p>
                <p className="text-slate-500">إصدار الهيكل: v{localBackupPreview.version}</p>
                <p className="text-slate-500">تاريخ الإنشاء: {formatDate(localBackupPreview.createdAt || '')}</p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs font-['Cairo']">تفاصيل السجلات المكتشفة في الملف:</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-emerald-900">
                    <span className="block text-[10px] text-emerald-700 font-medium">طلبات الصيانة</span>
                    <span className="font-bold text-sm">{localBackupPreview.recordCounts.maintenance_requests} سجل</span>
                  </div>
                  <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-200 text-blue-900">
                    <span className="block text-[10px] text-blue-700 font-medium">المحطات</span>
                    <span className="font-bold text-sm">{localBackupPreview.recordCounts.stations} محطة</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-800">
                    <span className="block text-[10px] text-slate-500 font-medium">سجلات التفتيش</span>
                    <span className="font-bold text-sm">{localBackupPreview.recordCounts.internal_inspections} سجل</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-800">
                    <span className="block text-[10px] text-slate-500 font-medium">بلاغات الحوادث</span>
                    <span className="font-bold text-sm">{localBackupPreview.recordCounts.incident_records} بلاغ</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-2 text-[11px] font-medium leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>سيتم إنشاء نسخة أمان أوتوماتيكية للبيانات الحالية قبل الاستعادة، ثم رفع السجلات من الحاسوب والتحقق الدقيق من مطابقة عدد السجلات المستعادة مع الملف.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setLocalRestoreConfirmOpen(false);
                  setLocalBackupPreview(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmLocalRestore}
                className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>تأكيد واستعادة البيانات من الحاسوب</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
