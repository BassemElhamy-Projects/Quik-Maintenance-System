import ExcelJS from 'exceljs';
import { parseExcelFileForPreview, exportSectionToExcel, exportAllDataToExcel } from '../src/services/excelService';
import { AppData, MaintenanceRequest, InternalInspection, IncidentRecord } from '../src/types';
import { OFFICIAL_STATIONS } from '../src/data/officialStations';

console.log('================================================================');
console.log('   RUNNING EXCELJS ARABIC FIXTURES & MIGRATION TEST SUITE      ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, actual?: any, expected?: any) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName} (Actual: ${JSON.stringify(actual)}, Expected: ${JSON.stringify(expected)})`);
  }
}

async function runTestSuite() {
  const existingRequests: MaintenanceRequest[] = [
    {
      id: 'db-req-1',
      requestNumber: '1',
      section: 'pumps',
      date: '2026-01-10',
      stationId: 'st-1',
      stationName: 'كويك - 1 أبها',
      stationCode: '1',
      requester: 'فني الصيانة',
      requestType: 'صيانة مضخات',
      maintenanceType: 'كهرباء وميكانيكا',
      problemDescription: 'عطل في مضخة الديزل رقم 2',
      closingDate: '2026-01-12',
      technician: 'سالم',
      actionTaken: 'استبدال الحساس',
      completionNotes: 'تم الإصلاح بنجاح',
      status: 'تم',
      createdAt: '2026-01-10T08:00:00Z'
    }
  ];

  const appData: AppData = {
    maintenanceRequests: existingRequests,
    inspections: [],
    incidents: [],
    stations: OFFICIAL_STATIONS
  };

  // -------------------------------------------------------------------------
  // TEST 1: Standard Arabic Worksheet Import (Pumps & Tanks)
  // -------------------------------------------------------------------------
  const wb1 = new ExcelJS.Workbook();
  const wsPumps = wb1.addWorksheet('سجل المضخات');
  wsPumps.addRow(['رقم طلب الصيانة', 'تاريخ الطلب', 'المحطة', 'رقم المحطة', 'رافع الطلب', 'نوع الصيانة', 'شرح المشكلة', 'الحالة']);
  // Row 1: duplicate of db-req-1
  wsPumps.addRow(['1', '2026-01-10', 'كويك - 1 أبها', '1', 'فني الصيانة', 'كهرباء وميكانيكا', 'عطل في مضخة الديزل رقم 2', 'تم']);
  // Row 2: new valid request for station 2
  wsPumps.addRow(['2', '2026-01-15', 'كويك - 2 الدرب', '2', 'مشرف المحطة', 'كهرباء', 'عطل مسدس بنزين 91', 'تم']);
  // Row 3: duplicate in same batch of row 2
  wsPumps.addRow(['3', '2026-01-15', 'كويك - 2 الدرب', '2', 'مشرف المحطة', 'كهرباء', 'عطل مسدس بنزين 91', 'تم']);

  const buf1 = await wb1.xlsx.writeBuffer();
  const res1 = await parseExcelFileForPreview(buf1, 'pumps', appData);

  assert(res1.validMaintenanceRows.length === 3, 'Test 1.1: Extracted 3 total candidate rows from Pumps sheet');
  assert(res1.duplicatesAlreadyInApp === 1, 'Test 1.2: Identified 1 duplicate matching existing database');
  assert(res1.duplicatesInExcel === 1, 'Test 1.3: Identified 1 duplicate repeated within Excel batch');
  assert(res1.duplicateCount === 2, 'Test 1.4: Total duplicate count is 2');
  const validNonDup = res1.validMaintenanceRows.filter(r => !r.isDuplicate);
  assert(validNonDup.length === 1, 'Test 1.5: Exactly 1 unique non-duplicate row accepted');
  assert(validNonDup[0].stationCode === '2', 'Test 1.6: Correct station code mapped');

  // -------------------------------------------------------------------------
  // TEST 2: Multi-Table Worksheet (Facilities with multiple sections & banners)
  // -------------------------------------------------------------------------
  const wb2 = new ExcelJS.Workbook();
  const wsFac = wb2.addWorksheet('سجل المسجد ودوات المياة');
  // Decorative title
  wsFac.addRow(['شركة كويك لمحطات الوقود - تقرير الصيانة']);
  // Table 1: Mosque maintenance
  wsFac.addRow(['رقم', 'تاريخ العطل', 'الموقع', 'رقم المحطة', 'البيان', 'الإجراء']);
  wsFac.addRow(['1', '2026-02-01', 'كويك - 3 محايل', '3', 'صيانة إنارة المسجد', 'تم التغيير']);
  wsFac.addRow(['2', '2026-02-02', 'كويك - 4 المنسك', '4', 'صيانة مكيف المسجد', 'تم إصلاح الكمبروسر']);
  // Decorative intermediate separator
  wsFac.addRow(['جدول اعطال دورات المياه']);
  // Table 2: Restroom maintenance
  wsFac.addRow(['رقم طلب', 'تاريخ البلاغ', 'الفرع', 'كود الفرع', 'المشكلة', 'الإصلاح']);
  wsFac.addRow(['3', '2026-02-05', 'كويك - 5 الفرعاء', '5', 'تسريب مياه في المغاسل', 'تم السباكة']);

  const buf2 = await wb2.xlsx.writeBuffer();
  const res2 = await parseExcelFileForPreview(buf2, 'facilities', appData);

  assert(res2.diagnostics[0].detectedSection === 'facilities', 'Test 2.1: Recognized facilities section from Arabic sheet name');
  assert(res2.diagnostics[0].tableBreakdowns?.length === 2, 'Test 2.2: Detected exactly 2 independent tables in single worksheet');
  assert(res2.validMaintenanceRows.length === 3, 'Test 2.3: Extracted all 3 records across both tables');
  assert(res2.validMaintenanceRows[0].stationCode === '3', 'Test 2.4: Table 1 Record 1 station matched');
  assert(res2.validMaintenanceRows[2].stationCode === '5', 'Test 2.5: Table 2 Record 1 station matched');

  // -------------------------------------------------------------------------
  // TEST 3: Arabic Header Normalization & Variations
  // -------------------------------------------------------------------------
  const wb3 = new ExcelJS.Workbook();
  const wsNorm = wb3.addWorksheet('صيانة الخزانات');
  // Header with alef with hamza, taa marbuta, diacritics
  wsNorm.addRow(['رقم الطلب', 'تأريخ', 'إسم المحطة', 'رقم المحطة', 'شرح المشكله', 'الإجراء المتخذ', 'حالة الصيانة']);
  wsNorm.addRow(['101', '2026-02-10', 'كويك - 6 جيزان', '6', 'تنظيف خزان ديزل', 'تم السحب', 'تم']);

  const buf3 = await wb3.xlsx.writeBuffer();
  const res3 = await parseExcelFileForPreview(buf3, 'tanks', appData);

  assert(res3.validMaintenanceRows.length === 1, 'Test 3.1: Extracted record with non-standard Arabic normalized headers');
  assert(res3.validMaintenanceRows[0].stationCode === '6', 'Test 3.2: Correctly parsed station code');
  assert(res3.validMaintenanceRows[0].status === 'تم', 'Test 3.3: Correctly mapped status');

  // -------------------------------------------------------------------------
  // TEST 4: Missing & Out-of-Range Station Handling
  // -------------------------------------------------------------------------
  const wb4 = new ExcelJS.Workbook();
  const wsStation = wb4.addWorksheet('المضخات');
  wsStation.addRow(['م', 'التاريخ', 'المحطة', 'رقم المحطة', 'العطل']);
  // Row with invalid station number 99 (outside 1-10)
  wsStation.addRow(['1', '2026-03-01', 'محطة خارجية مجهولة', '99', 'عطل طرمبة']);
  // Row with missing station name and code
  wsStation.addRow(['2', '2026-03-02', '', '', 'تسريب زيت']);

  const buf4 = await wb4.xlsx.writeBuffer();
  const res4 = await parseExcelFileForPreview(buf4, 'pumps', appData);

  assert(res4.validMaintenanceRows.length === 2, 'Test 4.1: Retained records needing review without dropping them');
  assert(res4.validMaintenanceRows[0].isStationUnmatched === true, 'Test 4.2: Station 99 marked isStationUnmatched');
  assert(Boolean(res4.validMaintenanceRows[0].unmatchedReason?.includes('غير موجود ضمن دليل المحطات')), 'Test 4.3: Correct unmatched reason for station 99');
  assert(res4.validMaintenanceRows[1].isStationUnmatched === true, 'Test 4.4: Missing station marked isStationUnmatched');

  // -------------------------------------------------------------------------
  // TEST 5: Inspections & Incidents Sheets Detection
  // -------------------------------------------------------------------------
  const wb5 = new ExcelJS.Workbook();
  const wsInsp = wb5.addWorksheet('التفتيش الدوري الداخلي');
  wsInsp.addRow(['رقم التفتيش', 'تاريخ التفتيش', 'المحطة', 'رقم المحطة', 'اسم المفتش', 'التقييم', 'الملاحظات']);
  wsInsp.addRow(['1', '2026-03-05', 'كويك - 7 الراسي', '7', 'مهندس فهد', 'ممتاز', 'المحطة بحالة ممتازة']);

  const wsInc = wb5.addWorksheet('سجل الحوادث');
  wsInc.addRow(['رقم البلاغ', 'التاريخ', 'اسم المحطة', 'رقم المحطة', 'نوع الحادث', 'اسم المتسبب', 'وصف الحادث']);
  wsInc.addRow(['1', '2026-03-06', 'كويك - 8 أحد رفيدة', '8', 'اصطدام بالمضخة', 'محمد علي', 'اصطدام أثناء التزود']);

  const buf5 = await wb5.xlsx.writeBuffer();
  const res5 = await parseExcelFileForPreview(buf5, 'all', appData);

  assert(res5.validInspectionRows.length === 1, 'Test 5.1: Extracted inspection record');
  assert(res5.validInspectionRows[0].inspectorName === 'مهندس فهد', 'Test 5.2: Inspector name matched');
  assert(res5.validIncidentRows.length === 1, 'Test 5.3: Extracted incident record');
  assert(res5.validIncidentRows[0].causingParty === 'محمد علي', 'Test 5.4: Causing party matched');

  // -------------------------------------------------------------------------
  // TEST 6: Empty Rows & Empty Worksheets
  // -------------------------------------------------------------------------
  const wb6 = new ExcelJS.Workbook();
  const wsEmpty = wb6.addWorksheet('المضخات');
  wsEmpty.addRow(['رقم', 'التاريخ', 'المحطة']);
  wsEmpty.addRow(['', '', '']);
  wsEmpty.addRow(['   ', null, undefined]);

  const buf6 = await wb6.xlsx.writeBuffer();
  const res6 = await parseExcelFileForPreview(buf6, 'pumps', appData);

  assert(res6.validMaintenanceRows.length === 0, 'Test 6.1: Empty rows gracefully skipped');
  assert(res6.diagnostics[0].validRowsCount === 0, 'Test 6.2: 0 records reported for empty rows');

  // -------------------------------------------------------------------------
  // TEST 7: Export and Re-Import Roundtrip
  // -------------------------------------------------------------------------
  const exportWb = new ExcelJS.Workbook();
  const testReqs: MaintenanceRequest[] = [
    {
      id: 'roundtrip-1',
      requestNumber: '10',
      section: 'pumps',
      date: '2026-03-20',
      stationId: 'st-1',
      stationName: 'كويك - 1 أبها',
      stationCode: '1',
      requester: 'عبدالله',
      requestType: 'صيانة مضخات',
      maintenanceType: 'ميكانيكا',
      problemDescription: 'عطل لي المضخة',
      closingDate: '2026-03-21',
      technician: 'سالم',
      actionTaken: 'تغيير اللي',
      completionNotes: 'تم',
      status: 'تم',
      createdAt: '2026-03-20T10:00:00Z'
    }
  ];

  const roundtripAppData: AppData = {
    maintenanceRequests: testReqs,
    inspections: [],
    incidents: [],
    stations: OFFICIAL_STATIONS
  };

  const wsRoundtrip = exportWb.addWorksheet('صيانة المضخات');
  wsRoundtrip.addRow(['رقم طلب الصيانة', 'تاريخ الطلب', 'المحطة', 'رقم المحطة', 'رافع الطلب', 'نوع الطلب', 'نوع الصيانة', 'شرح المشكلة', 'تاريخ إغلاق الصيانة', 'الفني', 'الإجراء', 'الإنجاز', 'حالة الطلب']);
  wsRoundtrip.addRow(['10', '2026-03-20', 'كويك - 1 أبها', '1', 'عبدالله', 'صيانة مضخات', 'ميكانيكا', 'عطل لي المضخة', '2026-03-21', 'سالم', 'تغيير اللي', 'تم', 'تم']);

  const rtBuffer = await exportWb.xlsx.writeBuffer();
  const rtImport = await parseExcelFileForPreview(rtBuffer, 'pumps', { ...roundtripAppData, maintenanceRequests: [] });

  assert(rtImport.validMaintenanceRows.length === 1, 'Test 7.1: Roundtrip import parsed successfully');
  assert(rtImport.validMaintenanceRows[0].stationCode === '1', 'Test 7.2: Roundtrip stationCode preserved');
  assert(rtImport.validMaintenanceRows[0].problemDescription === 'عطل لي المضخة', 'Test 7.3: Roundtrip problem description preserved');
  assert(rtImport.validMaintenanceRows[0].status === 'تم', 'Test 7.4: Roundtrip status preserved');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    console.log('ALL EXCELJS ARABIC FIXTURE & REGRESSION TESTS PASSED (100%)!\n');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
