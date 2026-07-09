/**
 * Action handlers — one function per sheets.py method.
 * Business rules (geofence, late policy, JWT) stay in FastAPI.
 */

// ─── Employees ───────────────────────────────────────────────────────────────

function employeesAll(args) {
  var search = (args.search || '').toLowerCase();
  var department = (args.department || '').toLowerCase();
  var branch = (args.branch || '').toLowerCase();
  return getRecords_(TAB.EMPLOYEES)
    .filter(function (r) {
      if (search && r.name.toLowerCase().indexOf(search) < 0 && String(r.phone).indexOf(search) < 0) return false;
      if (department && String(r.department).toLowerCase() !== department) return false;
      if (branch && String(r.branch).toLowerCase() !== branch) return false;
      return true;
    })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
}

function employeesGetById(args) {
  return getRecords_(TAB.EMPLOYEES).find(function (r) { return String(r.id) === String(args.emp_id); }) || null;
}

function employeesGetByPhone(args) {
  return getRecords_(TAB.EMPLOYEES).find(function (r) { return String(r.phone) === String(args.phone); }) || null;
}

function employeesCreate(args) {
  if (employeesGetByPhone({ phone: args.phone })) {
    throw new Error('Phone already registered');
  }
  var id = nextId_(TAB.EMPLOYEES);
  var row = {
    id: id,
    name: args.name,
    phone: args.phone,
    role: args.role || 'employee',
    department: args.department || 'General',
    branch: args.branch || 'Back Office',
    designation: args.designation || 'Employee',
    created_at: nowIso_(),
  };
  appendRow_(TAB.EMPLOYEES, rowToArray_(TAB.EMPLOYEES, row));
  return row;
}

function employeesUpdate(args) {
  var idx = findRowIndex_(TAB.EMPLOYEES, 'id', args.emp_id);
  if (!idx) return null;
  var current = employeesGetById({ emp_id: args.emp_id });
  var fields = args.fields || {};
  Object.keys(fields).forEach(function (k) { current[k] = fields[k]; });
  updateRow_(TAB.EMPLOYEES, idx, rowToArray_(TAB.EMPLOYEES, current));
  return current;
}

function employeesDelete(args) {
  var idx = findRowIndex_(TAB.EMPLOYEES, 'id', args.emp_id);
  if (!idx) return false;
  deleteRow_(TAB.EMPLOYEES, idx);
  return true;
}

// ─── Attendance ──────────────────────────────────────────────────────────────

function attendanceAdd(args) {
  var id = nextId_(TAB.ATTENDANCE);
  var row = {
    id: id,
    emp_id: args.emp_id,
    emp_name: args.emp_name,
    punch_type: args.punch_type,
    timestamp: args.timestamp,
    lat: args.lat,
    lng: args.lng,
    status: args.status || 'approved',
    distance_from_office: args.distance,
  };
  appendRow_(TAB.ATTENDANCE, rowToArray_(TAB.ATTENDANCE, row));
  return row;
}

function attendanceForEmployeeToday(args) {
  var today = args.today || todayIso_();
  return getRecords_(TAB.ATTENDANCE).filter(function (r) {
    return String(r.emp_id) === String(args.emp_id) && String(r.timestamp).slice(0, 10) === today;
  });
}

function attendanceForEmployeeMonth(args) {
  var prefix = args.year + '-' + String(args.month).padStart(2, '0');
  return getRecords_(TAB.ATTENDANCE).filter(function (r) {
    return String(r.emp_id) === String(args.emp_id) && String(r.timestamp).indexOf(prefix) === 0;
  });
}

function attendanceForDate(args) {
  return getRecords_(TAB.ATTENDANCE).filter(function (r) {
    return String(r.timestamp).slice(0, 10) === args.date_str;
  });
}

function attendanceForEmployeeDate(args) {
  return getRecords_(TAB.ATTENDANCE).filter(function (r) {
    return String(r.emp_id) === String(args.emp_id) && String(r.timestamp).slice(0, 10) === args.date_str;
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────

function settingsGetAll() {
  var out = {};
  getRecords_(TAB.SETTINGS).forEach(function (r) { out[r.key] = r.value; });
  return out;
}

function settingsSet(args) {
  var idx = findRowIndex_(TAB.SETTINGS, 'key', args.key);
  if (idx) {
    updateCell_(TAB.SETTINGS, idx, 2, args.value);
  } else {
    appendRow_(TAB.SETTINGS, [args.key, args.value]);
  }
  return true;
}

function settingsUpdateMany(args) {
  var updates = args.updates || {};
  Object.keys(updates).forEach(function (key) {
    settingsSet({ key: key, value: updates[key] });
  });
  return true;
}

// ─── Branches ────────────────────────────────────────────────────────────────

function branchesAll() {
  return getRecords_(TAB.BRANCHES);
}

function branchesGetById(args) {
  return getRecords_(TAB.BRANCHES).find(function (r) { return String(r.id) === String(args.branch_id); }) || null;
}

function branchesGetByName(args) {
  var name = (args.name || '').toLowerCase();
  return getRecords_(TAB.BRANCHES).find(function (r) { return String(r.name).toLowerCase() === name; }) || null;
}

function branchesCreate(args) {
  var id = nextId_(TAB.BRANCHES);
  var global = settingsGetAll();
  var row = {
    id: id,
    name: args.name,
    office_lat: global.office_lat || '19.06996',
    office_lng: global.office_lng || '72.83748',
    radius_meters: global.radius_meters || '100',
    shift_start: global.shift_start || '09:00',
    shift_end: global.shift_end || '18:00',
    standard_shift_hours: global.standard_shift_hours || '9',
    working_days: global.working_days || '["Mon","Tue","Wed","Thu","Fri","Sat"]',
    wifi_ip: global.wifi_ip || '',
    wifi_lock_enabled: global.wifi_lock_enabled || '0',
    late_policy_type: global.late_policy_type || 'forgive_first_n',
    late_grace_minutes: global.late_grace_minutes || '15',
    late_monthly_allowance: global.late_monthly_allowance || '3',
  };
  appendRow_(TAB.BRANCHES, rowToArray_(TAB.BRANCHES, row));
  return row;
}

function branchesUpdate(args) {
  var idx = findRowIndex_(TAB.BRANCHES, 'id', args.branch_id);
  if (!idx) return null;
  var current = branchesGetById({ branch_id: args.branch_id });
  var fields = args.fields || {};
  Object.keys(fields).forEach(function (k) { current[k] = fields[k]; });
  updateRow_(TAB.BRANCHES, idx, rowToArray_(TAB.BRANCHES, current));
  return current;
}

function branchesDelete(args) {
  var idx = findRowIndex_(TAB.BRANCHES, 'id', args.branch_id);
  if (!idx) return false;
  deleteRow_(TAB.BRANCHES, idx);
  return true;
}

// ─── Departments ─────────────────────────────────────────────────────────────

function departmentsAll() {
  return getRecords_(TAB.DEPARTMENTS);
}

function departmentsCreate(args) {
  var id = nextId_(TAB.DEPARTMENTS);
  var row = { id: id, name: args.name };
  appendRow_(TAB.DEPARTMENTS, rowToArray_(TAB.DEPARTMENTS, row));
  return row;
}

function departmentsDelete(args) {
  var idx = findRowIndex_(TAB.DEPARTMENTS, 'id', args.dept_id);
  if (!idx) return false;
  deleteRow_(TAB.DEPARTMENTS, idx);
  return true;
}

// ─── Notes ───────────────────────────────────────────────────────────────────

function notesAll(args) {
  var limit = args.limit || 50;
  return getRecords_(TAB.NOTES)
    .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
    .slice(0, limit);
}

function notesForDate(args) {
  var matches = getRecords_(TAB.NOTES).filter(function (r) { return String(r.date) === args.date_str; });
  return matches.length ? matches[matches.length - 1] : null;
}

function notesCreate(args) {
  var id = nextId_(TAB.NOTES);
  var row = {
    id: id,
    content: args.content,
    posted_by: args.posted_by,
    date: args.note_date,
    created_at: nowIso_(),
  };
  appendRow_(TAB.NOTES, rowToArray_(TAB.NOTES, row));
  return row;
}

function notesDelete(args) {
  var idx = findRowIndex_(TAB.NOTES, 'id', args.note_id);
  if (!idx) return false;
  deleteRow_(TAB.NOTES, idx);
  return true;
}

// ─── Holidays ────────────────────────────────────────────────────────────────

function parseEmpIds_(raw) {
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function serializeHoliday_(r) {
  return {
    id: r.id,
    name: r.name,
    month: r.month,
    date: r.date,
    scope: r.scope,
    emp_ids: parseEmpIds_(r.emp_ids),
    created_at: r.created_at,
    created_by: r.created_by,
  };
}

function holidaysAll(args) {
  var month = args.month || '';
  return getRecords_(TAB.HOLIDAYS)
    .filter(function (r) { return !month || String(r.month) === month; })
    .map(serializeHoliday_);
}

function holidaysGetById(args) {
  var r = getRecords_(TAB.HOLIDAYS).find(function (x) { return String(x.id) === String(args.holiday_id); });
  return r ? serializeHoliday_(r) : null;
}

function holidaysForEmployeeMonth(args) {
  var prefix = args.year + '-' + String(args.month).padStart(2, '0');
  var out = {};
  getRecords_(TAB.HOLIDAYS).forEach(function (r) {
    if (String(r.date).indexOf(prefix) !== 0) return;
    if (r.scope === 'all' || parseEmpIds_(r.emp_ids).indexOf(Number(args.emp_id)) >= 0) {
      out[String(r.date)] = { name: r.name, holiday_id: r.id };
    }
  });
  return out;
}

function holidaysCreate(args) {
  var id = nextId_(TAB.HOLIDAYS);
  var row = {
    id: id,
    name: args.name,
    month: String(args.date_str).slice(0, 7),
    date: args.date_str,
    scope: args.scope || 'all',
    emp_ids: JSON.stringify(args.emp_ids || []),
    created_at: nowIso_(),
    created_by: args.created_by || '',
  };
  appendRow_(TAB.HOLIDAYS, rowToArray_(TAB.HOLIDAYS, row));
  return serializeHoliday_(row);
}

function holidaysUpdate(args) {
  var idx = findRowIndex_(TAB.HOLIDAYS, 'id', args.holiday_id);
  if (!idx) return null;
  var current = holidaysGetById({ holiday_id: args.holiday_id });
  var fields = args.fields || {};
  if (fields.emp_ids) fields.emp_ids = JSON.stringify(fields.emp_ids);
  Object.keys(fields).forEach(function (k) { current[k] = fields[k]; });
  if (fields.date) current.month = String(fields.date).slice(0, 7);
  var raw = Object.assign({}, current, { emp_ids: JSON.stringify(current.emp_ids || []) });
  updateRow_(TAB.HOLIDAYS, idx, rowToArray_(TAB.HOLIDAYS, raw));
  return current;
}

function holidaysDelete(args) {
  var idx = findRowIndex_(TAB.HOLIDAYS, 'id', args.holiday_id);
  if (!idx) return false;
  deleteRow_(TAB.HOLIDAYS, idx);
  return true;
}

// ─── Leaves ──────────────────────────────────────────────────────────────────

function serializeLeave_(r) {
  var dates = [];
  try { dates = JSON.parse(r.dates || '[]'); } catch (e) {}
  return {
    id: r.id,
    emp_id: r.emp_id,
    emp_name: r.emp_name,
    branch: r.branch,
    leave_type: r.leave_type,
    dates: dates,
    date_count: dates.length,
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
  };
}

function leavesForEmployee(args) {
  return getRecords_(TAB.LEAVES)
    .filter(function (r) { return String(r.emp_id) === String(args.emp_id); })
    .map(serializeLeave_)
    .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
}

function leavesHasOverlap(args) {
  var newDates = args.dates || [];
  return leavesForEmployee({ emp_id: args.emp_id }).some(function (leave) {
    if (leave.status === 'rejected') return false;
    return leave.dates.some(function (d) { return newDates.indexOf(d) >= 0; });
  });
}

function leavesCreate(args) {
  var id = nextId_(TAB.LEAVES);
  var row = {
    id: id,
    emp_id: args.emp_id,
    emp_name: args.emp_name,
    branch: args.branch,
    leave_type: args.leave_type,
    dates: JSON.stringify(args.dates || []),
    reason: args.reason || '',
    status: 'pending',
    created_at: nowIso_(),
  };
  appendRow_(TAB.LEAVES, rowToArray_(TAB.LEAVES, row));
  return serializeLeave_(row);
}

// ─── Reports (metadata only — .xlsx files stay on Vercel / Drive later) ─────

function reportsAll() {
  return getRecords_(TAB.REPORTS).sort(function (a, b) {
    return String(b.generated_at).localeCompare(String(a.generated_at));
  });
}

function reportsGetById(args) {
  return getRecords_(TAB.REPORTS).find(function (r) { return String(r.id) === String(args.report_id); }) || null;
}

function reportsCreate(args) {
  var id = nextId_(TAB.REPORTS);
  var row = {
    id: id,
    name: args.name,
    type: args.type,
    month: args.month,
    branch: args.branch || '',
    department: args.department || '',
    generated_at: nowIso_(),
    file_path: args.file_path || '',
  };
  appendRow_(TAB.REPORTS, rowToArray_(TAB.REPORTS, row));
  return row;
}

function reportsDelete(args) {
  var idx = findRowIndex_(TAB.REPORTS, 'id', args.report_id);
  if (!idx) return false;
  deleteRow_(TAB.REPORTS, idx);
  return true;
}
