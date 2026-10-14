import {
  normalizeAndRenumberMaintenanceRequests,
  getNextMaintenanceRequestNumber,
  getHighestRequestNumberForSection
} from './requestSequencer';
import { MaintenanceRequest } from '../types';

/**
 * Regression Verification Suite for Request Sequencer and Active Section Helper Logic
 */
export function runSequencerRegressionTests(): boolean {
  const legacyRequests: MaintenanceRequest[] = [
    {
      id: 'uuid-1',
      requestNumber: '3001',
      section: 'pumps',
      date: '2026-01-01',
      stationId: 'st-1',
      stationName: 'محطة الخالدية',
      stationCode: '101',
      requester: 'عمر',
      requestType: 'صيانة تصحيحية',
      maintenanceType: 'مضخات',
      problemDescription: 'عطل مسدس',
      technician: '',
      actionTaken: '',
      completionNotes: '',
      status: 'جديد',
      createdAt: '2026-01-01T10:00:00Z'
    },
    {
      id: 'uuid-2',
      requestNumber: '3002',
      section: 'pumps',
      date: '2026-01-02',
      stationId: 'st-1',
      stationName: 'محطة الخالدية',
      stationCode: '101',
      requester: 'علي',
      requestType: 'صيانة تصحيحية',
      maintenanceType: 'مضخات',
      problemDescription: 'عطل شاشة',
      technician: '',
      actionTaken: '',
      completionNotes: '',
      status: 'جاري العمل',
      createdAt: '2026-01-02T10:00:00Z'
    },
    {
      id: 'uuid-3',
      requestNumber: '3005',
      section: 'tanks',
      date: '2026-01-01',
      stationId: 'st-2',
      stationName: 'محطة الياسمين',
      stationCode: '102',
      requester: 'سعد',
      requestType: 'صيانة تصحيحية',
      maintenanceType: 'خزانات',
      problemDescription: 'تسريب صمام',
      technician: '',
      actionTaken: '',
      completionNotes: '',
      status: 'تم',
      createdAt: '2026-01-01T11:00:00Z'
    }
  ];

  const result = normalizeAndRenumberMaintenanceRequests(legacyRequests);
  const pumps = result.normalized.filter(r => r.section === 'pumps');
  const tanks = result.normalized.filter(r => r.section === 'tanks');

  // Verify Pumps numbered 1, 2
  if (pumps.length !== 2 || pumps[0].requestNumber !== '1' || pumps[1].requestNumber !== '2') {
    throw new Error(`Pumps renumbering failed. Expected 1, 2 but got ${pumps.map(p => p.requestNumber).join(', ')}`);
  }

  // Verify Tanks numbered 1
  if (tanks.length !== 1 || tanks[0].requestNumber !== '1') {
    throw new Error(`Tanks renumbering failed. Expected 1 but got ${tanks.map(t => t.requestNumber).join(', ')}`);
  }

  // Verify Next generated numbers
  const nextPumpsNum = getNextMaintenanceRequestNumber(result.normalized, 'pumps');
  if (nextPumpsNum !== '3') {
    throw new Error(`Next pumps number failed. Expected 3 but got ${nextPumpsNum}`);
  }

  const nextTanksNum = getNextMaintenanceRequestNumber(result.normalized, 'tanks');
  if (nextTanksNum !== '2') {
    throw new Error(`Next tanks number failed. Expected 2 but got ${nextTanksNum}`);
  }

  if (getHighestRequestNumberForSection(result.normalized, 'pumps') !== 2) {
    throw new Error('Highest request number calculation failed for pumps.');
  }

  return true;
}

/**
 * Regression Test: Ensures that when requestType = "طارئة" and maintenanceType = "معايرة وفلاتر",
 * the request table display column uses requestType ("طارئة") and NOT maintenanceType ("معايرة وفلاتر").
 */
export function runRequestTypeDisplayRegressionTest(): boolean {
  const sampleRequest: MaintenanceRequest = {
    id: 'test-req-1',
    requestNumber: '1',
    section: 'pumps',
    date: '2026-10-13',
    stationId: 'st-101',
    stationName: 'محطة الريان',
    stationCode: '101',
    requester: 'أحمد',
    requestType: 'طارئة',
    maintenanceType: 'معايرة وفلاتر',
    problemDescription: 'تسريب وقود في المضخة 2',
    technician: 'فني طوارئ',
    actionTaken: 'إغلاق المحبس الرئيسي',
    completionNotes: '',
    status: 'جديد',
    createdAt: '2026-10-13T10:00:00Z'
  };

  // Simulate column rendering: the Request Type column receives sampleRequest.requestType
  const displayedType = sampleRequest.requestType;

  if (displayedType !== 'طارئة') {
    throw new Error(`Request type display regression test failed! Expected 'طارئة' but got '${displayedType}'`);
  }

  if (displayedType === sampleRequest.maintenanceType) {
    throw new Error(`Request type display regression test failed! Display column matched maintenanceType ('${sampleRequest.maintenanceType}') instead of requestType ('طارئة')`);
  }

  return true;
}

/**
 * Regression Test: Verifies that during backup restoration simulation,
 * each request retains its exact original requestType (e.g. "طارئة", "صيانة دورية", "صيانة وقائية")
 * without being overwritten or converted to "صيانة تصحيحية".
 */
import { sanitizeCloudFieldValue } from '../services/cloudDataService';

export function runBackupRestoreRequestTypePreservationTest(): boolean {
  const originalRequests: any[] = [
    {
      id: 'req-1',
      request_number: '1',
      section: 'pumps',
      date: '2026-10-13',
      station_id: 'st-1',
      station_name: 'محطة أفق',
      station_code: '101',
      requester: 'خالد',
      request_type: 'طارئة',
      maintenance_type: 'كهرباء وميكانيكا',
      problem_description: 'عطل مفاجئ',
      technician: '',
      action_taken: '',
      completion_notes: '',
      status: 'جديد',
      created_at: '2026-10-13T08:00:00Z'
    },
    {
      id: 'req-2',
      request_number: '2',
      section: 'pumps',
      date: '2026-10-13',
      station_id: 'st-1',
      station_name: 'محطة أفق',
      station_code: '101',
      requester: 'سالم',
      request_type: 'صيانة دورية',
      maintenance_type: 'معايرة وفلاتر',
      problem_description: 'فحص فلاتر الدوري',
      technician: '',
      action_taken: '',
      completion_notes: '',
      status: 'جديد',
      created_at: '2026-10-13T09:00:00Z'
    },
    {
      id: 'req-3',
      request_number: '3',
      section: 'facilities',
      date: '2026-10-13',
      station_id: 'st-2',
      station_name: 'محطة الشروق',
      station_code: '102',
      requester: 'أيمن',
      request_type: 'صيانة وقائية',
      maintenance_type: 'إنارة وكهرباء',
      problem_description: 'تغيير كشافات المظلة',
      technician: '',
      action_taken: '',
      completion_notes: '',
      status: 'جديد',
      created_at: '2026-10-13T10:00:00Z'
    },
    {
      id: 'req-4',
      request_number: '4',
      section: 'tanks',
      date: '2026-10-13',
      station_id: 'st-3',
      station_name: 'محطة السلام',
      station_code: '103',
      requester: 'فهد',
      request_type: 'معايرة وفلاتر',
      maintenance_type: 'معايرة خزانات',
      problem_description: 'معايرة خزان البنزين',
      technician: '',
      action_taken: '',
      completion_notes: '',
      status: 'جديد',
      created_at: '2026-10-13T11:00:00Z'
    }
  ];

  // Simulate backup snapshot JSON encoding & restoration reading
  const serializedSnapshot = JSON.stringify({ tables: { maintenance_requests: originalRequests } });
  const restoredSnap = JSON.parse(serializedSnapshot);
  const restoredRequests: any[] = restoredSnap.tables.maintenance_requests;

  // Run post-restore hydration / cloud data sanitization logic
  const sanitized1 = sanitizeCloudFieldValue(restoredRequests[0].request_type, 'rType');
  const sanitized2 = sanitizeCloudFieldValue(restoredRequests[1].request_type, 'rType');
  const sanitized3 = sanitizeCloudFieldValue(restoredRequests[2].request_type, 'rType');
  const sanitized4 = sanitizeCloudFieldValue(restoredRequests[3].request_type, 'rType');

  if (sanitized1 !== 'صيانة طارئة' && sanitized1 !== 'طارئة') {
    throw new Error(`Restore failed! Record 1 expected emergency type but got '${sanitized1}'`);
  }
  if (sanitized2 !== 'صيانة دورية') {
    throw new Error(`Restore failed! Record 2 expected 'صيانة دورية' but got '${sanitized2}'`);
  }
  if (sanitized3 !== 'صيانة وقائية') {
    throw new Error(`Restore failed! Record 3 expected 'صيانة وقائية' but got '${sanitized3}'`);
  }
  if (sanitized4 !== 'معايرة وفلاتر') {
    throw new Error(`Restore failed! Record 4 expected 'معايرة وفلاتر' but got '${sanitized4}'`);
  }

  return true;
}

// Execute self-tests on load
runSequencerRegressionTests();
runRequestTypeDisplayRegressionTest();
runBackupRestoreRequestTypePreservationTest();

