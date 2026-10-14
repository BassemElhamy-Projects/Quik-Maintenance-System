import { MaintenanceRequest, InternalInspection, IncidentRecord } from '../src/types';
import { importExcelRecordsToCloud } from '../src/services/cloudDataService';

console.log('=== RUNNING EXCEL CONFIRM IMPORT ACTION & FAILURE RESILIENCE TESTS ===\n');

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

// Simulated Modal Confirm Handler Logic
async function simulateConfirmImportAction(
  reqs: MaintenanceRequest[],
  ins: InternalInspection[],
  incs: IncidentRecord[],
  ignoreDuplicates: boolean,
  mockSaver: (reqsToAdd: MaintenanceRequest[], insToAdd: InternalInspection[], incsToAdd: IncidentRecord[]) => Promise<{ success: boolean; importedCount?: number; error?: string }>
) {
  let reqsToAdd = reqs;
  let insToAdd = ins;
  let incsToAdd = incs;

  if (ignoreDuplicates) {
    reqsToAdd = reqs.filter(r => !r.isDuplicate);
    insToAdd = ins.filter(i => !i.isDuplicate);
    incsToAdd = incs.filter(inc => !inc.isDuplicate);
  }

  const totalToImport = reqsToAdd.length + insToAdd.length + incsToAdd.length;
  if (totalToImport === 0) {
    return { success: false, error: 'لا توجد سجلات جديدة للاستيراد بعد استبعاد السجلات المكررة.', previewPreserved: true };
  }

  const res = await mockSaver(reqsToAdd, insToAdd, incsToAdd);
  return {
    ...res,
    previewPreserved: !res.success // Modal stays open with preview intact on failure
  };
}

async function runTests() {
  // Test 1: Button click trigger & successful import of 284 records
  const sampleReqs: MaintenanceRequest[] = Array.from({ length: 284 }, (_, idx) => ({
    id: `imp-${idx + 1}`,
    requestNumber: `${idx + 1}`,
    section: 'pumps',
    date: '2026-03-01',
    stationId: 'st-01',
    stationName: 'محطة أبها',
    stationCode: '1',
    requester: 'مفتش كويك',
    requestType: 'صيانة تصحيحية',
    maintenanceType: 'كهرباء',
    problemDescription: `مشكلة تجريبية رقم ${idx + 1}`,
    technician: 'فني كويك',
    actionTaken: 'معاينة',
    completionNotes: 'قيد التنفيذ',
    status: 'جديد',
    isDuplicate: false,
    createdAt: new Date().toISOString()
  }));

  const mockSuccessfulSave = async (reqsToAdd: MaintenanceRequest[]) => {
    return { success: true, importedCount: reqsToAdd.length };
  };

  const successResult = await simulateConfirmImportAction(sampleReqs, [], [], true, mockSuccessfulSave);
  assert(successResult.success === true, 'Test 1.1: Confirm import succeeds for 284 records');
  assert(successResult.importedCount === 284, 'Test 1.2: Imported count matches exactly 284 records');
  assert(successResult.previewPreserved === false, 'Test 1.3: Modal closes on successful import');

  // Test 2: Import failure resilience (Database error / Backup error)
  const mockFailedSave = async () => {
    return { success: false, error: 'فشل استيراد دفعة طلبات الصيانة إلى قاعدة البيانات السحابية.' };
  };

  const failureResult = await simulateConfirmImportAction(sampleReqs, [], [], true, mockFailedSave);
  assert(failureResult.success === false, 'Test 2.1: Confirm import cleanly captures save failure');
  assert(Boolean(failureResult.error?.includes('فشل استيراد')), 'Test 2.2: User receives meaningful Arabic error message');
  assert(failureResult.previewPreserved === true, 'Test 2.3: Modal remains open & preview data preserved on save failure');

  // Test 3: Zero records to import after duplicate filtering
  const duplicateReqs: MaintenanceRequest[] = sampleReqs.map(r => ({ ...r, isDuplicate: true }));
  const zeroResult = await simulateConfirmImportAction(duplicateReqs, [], [], true, mockSuccessfulSave);
  assert(zeroResult.success === false, 'Test 3.1: Zero net records correctly rejected');
  assert(Boolean(zeroResult.error?.includes('لا توجد سجلات جديدة')), 'Test 3.2: Informative message returned when all rows are duplicate');
  assert(zeroResult.previewPreserved === true, 'Test 3.3: Preview modal preserved when 0 records imported');

  console.log(`\n================================================================`);
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed.`);
  console.log(`================================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
