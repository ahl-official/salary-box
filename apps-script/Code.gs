/**
 * Salary Box — Apps Script data layer
 *
 * Deploy: Extensions → Apps Script (bound to spreadsheet) → Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Set Script property APPS_SCRIPT_SECRET (Project settings → Script properties)
 * Same value goes in Vercel as APPS_SCRIPT_SECRET.
 *
 * Request format (POST JSON):
 *   { "secret": "...", "action": "employees.get_by_phone", "args": { "phone": "9111111111" } }
 *
 * Response:
 *   { "ok": true, "data": ... }  or  { "ok": false, "error": "..." }
 */

var TAB = {
  EMPLOYEES: 'employees',
  ATTENDANCE: 'attendance',
  SETTINGS: 'settings',
  BRANCHES: 'branches',
  DEPARTMENTS: 'departments',
  NOTES: 'notes',
  HOLIDAYS: 'holidays',
  LEAVES: 'leave_requests',
  REPORTS: 'reports',
};

var HEADERS = {
  employees: ['id', 'name', 'phone', 'role', 'department', 'branch', 'designation', 'created_at'],
  attendance: ['id', 'emp_id', 'emp_name', 'punch_type', 'timestamp', 'lat', 'lng', 'status', 'distance_from_office'],
  settings: ['key', 'value'],
  branches: ['id', 'name', 'office_lat', 'office_lng', 'radius_meters', 'shift_start', 'shift_end',
    'standard_shift_hours', 'working_days', 'wifi_ip', 'wifi_lock_enabled',
    'late_policy_type', 'late_grace_minutes', 'late_monthly_allowance'],
  departments: ['id', 'name'],
  notes: ['id', 'content', 'posted_by', 'date', 'created_at'],
  holidays: ['id', 'name', 'month', 'date', 'scope', 'emp_ids', 'created_at', 'created_by'],
  leave_requests: ['id', 'emp_id', 'emp_name', 'branch', 'leave_type', 'dates', 'reason', 'status', 'created_at'],
  reports: ['id', 'name', 'type', 'month', 'branch', 'department', 'generated_at', 'file_path'],
};

/** FastAPI action → Apps Script handler. See MAPPING.md for full route table. */
var ACTIONS = {
  'health': handleHealth,

  'employees.all': employeesAll,
  'employees.get_by_id': employeesGetById,
  'employees.get_by_phone': employeesGetByPhone,
  'employees.create': employeesCreate,
  'employees.bulk_create': employeesBulkCreate,
  'employees.update': employeesUpdate,
  'employees.delete': employeesDelete,

  'attendance.add': attendanceAdd,
  'attendance.for_employee_today': attendanceForEmployeeToday,
  'attendance.for_employee_month': attendanceForEmployeeMonth,
  'attendance.for_date': attendanceForDate,
  'attendance.for_employee_date': attendanceForEmployeeDate,

  'settings.get_all': settingsGetAll,
  'settings.set': settingsSet,
  'settings.update_many': settingsUpdateMany,

  'branches.all': branchesAll,
  'branches.get_by_id': branchesGetById,
  'branches.get_by_name': branchesGetByName,
  'branches.create': branchesCreate,
  'branches.update': branchesUpdate,
  'branches.delete': branchesDelete,

  'departments.all': departmentsAll,
  'departments.create': departmentsCreate,
  'departments.delete': departmentsDelete,

  'notes.all': notesAll,
  'notes.for_date': notesForDate,
  'notes.create': notesCreate,
  'notes.delete': notesDelete,

  'holidays.all': holidaysAll,
  'holidays.get_by_id': holidaysGetById,
  'holidays.for_employee_month': holidaysForEmployeeMonth,
  'holidays.create': holidaysCreate,
  'holidays.update': holidaysUpdate,
  'holidays.delete': holidaysDelete,

  'leaves.for_employee': leavesForEmployee,
  'leaves.has_overlap': leavesHasOverlap,
  'leaves.create': leavesCreate,

  'reports.all': reportsAll,
  'reports.get_by_id': reportsGetById,
  'reports.create': reportsCreate,
  'reports.delete': reportsDelete,
};

function doGet(e) {
  var p = e.parameter || {};
  if (p.action) {
    try {
      if (!verifySecret_(p.secret)) {
        return jsonResponse({ ok: false, error: 'Unauthorized' });
      }
      var args = {};
      if (p.args) {
        try { args = JSON.parse(p.args); } catch (err) { args = {}; }
      }
      if (!ACTIONS[p.action]) {
        return jsonResponse({ ok: false, error: 'Unknown action: ' + p.action });
      }
      var data = ACTIONS[p.action](args);
      return jsonResponse({ ok: true, data: data });
    } catch (err) {
      return jsonResponse({ ok: false, error: String(err.message || err) });
    }
  }
  return jsonResponse({ ok: true, data: handleHealth({}) });
}

function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      if (e.postData.type === 'application/json') {
        body = JSON.parse(e.postData.contents);
      } else {
        body = JSON.parse(e.parameter.payload || e.postData.contents);
      }
    } else if (e.parameter && e.parameter.payload) {
      body = JSON.parse(e.parameter.payload);
    }
    if (!verifySecret_(body.secret)) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }
    var action = body.action;
    var args = body.args || {};
    if (!action || !ACTIONS[action]) {
      return jsonResponse({ ok: false, error: 'Unknown action: ' + action }, 400);
    }
    var data = ACTIONS[action](args);
    return jsonResponse({ ok: true, data: data });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err.message || err) }, 500);
  }
}

function handleHealth() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    type: 'apps_script',
    spreadsheet_id: ss.getId(),
    spreadsheet_title: ss.getName(),
    tabs: ss.getSheets().map(function (s) { return s.getName(); }),
    timezone: ss.getSpreadsheetTimeZone(),
  };
}

function verifySecret_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET');
  if (!expected) {
    throw new Error('Set APPS_SCRIPT_SECRET in Script properties');
  }
  return provided === expected;
}

function jsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
