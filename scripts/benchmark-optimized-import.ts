import { supabase } from '../src/services/supabaseClient';
import { executeCloudSafetyBackup } from '../src/services/cloudBackupService';
import { importExcelRecordsToCloud, fetchAuthoritativeCloudData } from '../src/services/cloudDataService';
import { parseExcelFileForPreview } from '../src/services/excelService';
import { AppData } from '../src/types';
import ExcelJS from 'exceljs';

async function generateSampleExcelBuffer(recordCount: number): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('المضخات');

  ws.addRow([
    'م',
    'رقم الطلب',
    'التاريخ',
    'اسم المحطة',
    'رقم المحطة',
    'مقدم الطلب',
    'نوع الطلب',
    'نوع الصيانة',
    'وصف المشكلة / العطل',
    'تاريخ إغلاق الصيانة',
    'الفني المسؤول',
    'الإجراء المتخذ',
    'ملاحظات الإنجاز',
    'الحالة'
  ]);

  for (let i = 1; i <= recordCount; i++) {
    ws.addRow([
      i,
      i,
      '2026-03-01',
      'محطة أبها الأولى',
      '1',
      'مشرف المحطة',
      'صيانة مضخات',
      'كهرباء',
      `عطل بالمضخة رقم ${i} يحتاج صيانة عاجلة - benchmark ${Date.now()}`,
      '2026-03-02',
      'فني الصيانة',
      'تم الإصلاح',
      'تم إنجاز العمل',
      'تم'
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as ArrayBuffer;
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('   QUIK MAINTENANCE SYSTEM - EXCEL IMPORT STAGE BENCHMARKING    ');
  console.log('================================================================\n');

  if (!supabase) {
    console.error('Supabase client is null!');
    process.exit(1);
  }

  // 1. Authenticate as admin
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'bassem_admin@quik.local',
    password: '123456'
  });

  if (authErr || !authData.user) {
    console.error('[FAIL] Could not authenticate admin:', authErr?.message);
    process.exit(1);
  }
  console.log('[PASS] Signed in as admin successfully.\n');

  const testCounts = [10, 100, 284];

  for (const count of testCounts) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`  BENCHMARKING WITH ${count} RECORDS`);
    console.log(`----------------------------------------------------------------`);

    // Load initial data
    const t0Fetch = performance.now();
    const initialDataRes = await fetchAuthoritativeCloudData();
    const t1Fetch = performance.now();
    const existingData: AppData = initialDataRes.data || {
      stations: [],
      maintenanceRequests: [],
      inspections: [],
      incidents: []
    };
    console.log(`[INIT] Initial data fetch: ${(t1Fetch - t0Fetch).toFixed(2)} ms`);

    // Generate test excel buffer
    const excelBuffer = await generateSampleExcelBuffer(count);

    // Stage 1 & 2 & 3 & 4: Excel parsing, validation, duplicate detection, station matching
    const t0Parse = performance.now();
    const previewResult = await parseExcelFileForPreview(excelBuffer, 'pumps', existingData);
    const t1Parse = performance.now();
    const parseAndMatchTime = t1Parse - t0Parse;
    console.log(`• Stage 1-4 (Excel Validation, Normalization, Station Matching & Duplicate Detection): ${parseAndMatchTime.toFixed(2)} ms`);
    console.log(`  - Valid Maintenance Rows: ${previewResult.validMaintenanceRows.length}`);
    console.log(`  - Duplicates Detected: ${previewResult.duplicateCount}`);
    console.log(`  - Unmatched Stations: ${previewResult.unmatchedStationsCount}`);

    const reqsToAdd = previewResult.validMaintenanceRows.slice(0, count);

    // Stage 5: Cloud Safety Backup Creation
    const t0Backup = performance.now();
    const backupRes = await executeCloudSafetyBackup(`قياس الأداء لـ ${count} سجل`);
    const t1Backup = performance.now();
    const backupTime = t1Backup - t0Backup;
    console.log(`• Stage 5 (Cloud Safety Backup Creation): ${backupTime.toFixed(2)} ms (Success: ${backupRes.success})`);

    // Stage 6: Sequence Number Allocation & Database Writes (via importExcelRecordsToCloud)
    const t0Import = performance.now();
    const importRes = await importExcelRecordsToCloud(
      reqsToAdd,
      [],
      [],
      () => {}
    );
    const t1Import = performance.now();
    const totalImportTime = t1Import - t0Import;
    console.log(`• Stage 6 (Sequence Allocation & Supabase DB Writes - Batch RPC & Chunked Inserts): ${totalImportTime.toFixed(2)} ms`);
    console.log(`  - Imported Count: ${importRes.importedCount} (Success: ${importRes.success})`);

    // Stage 7: Final Data Refresh & UI Updates (re-fetching authoritative cloud data)
    const t0Refresh = performance.now();
    const finalRefreshRes = await fetchAuthoritativeCloudData();
    const t1Refresh = performance.now();
    const refreshTime = t1Refresh - t0Refresh;
    console.log(`• Stage 7 (Final Data Refresh & State Synchronization): ${refreshTime.toFixed(2)} ms`);

    const totalPipelineTime = parseAndMatchTime + backupTime + totalImportTime + refreshTime;
    console.log(`\n>> TOTAL PIPELINE ELAPSED TIME FOR ${count} RECORDS: ${totalPipelineTime.toFixed(2)} ms (${(totalPipelineTime / 1000).toFixed(2)} s)`);
  }

  console.log('\n================================================================');
  console.log('   BENCHMARK COMPLETED SUCCESSFULLY                             ');
  console.log('================================================================\n');
}

runBenchmark().catch(err => {
  console.error('[BENCHMARK ERROR]:', err);
  process.exit(1);
});
