const BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api')

function getToken() {
  return localStorage.getItem('token')
}

async function request(method, path, body) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  }).catch(() => {
    throw new Error('Cannot reach server. Check your internet connection and try again.')
  })

  if (res.status === 204) return null

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = data.detail || data.message || `Error ${res.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }

  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),

  // Auth
  login: (phone) => request('POST', '/auth/login', { phone }),
  me: () => request('GET', '/auth/me'),

  // Employees
  getEmployees: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request('GET', `/employees/${q ? '?' + q : ''}`)
  },
  getEmployee: (id) => request('GET', `/employees/${id}`),
  createEmployee: (data) => request('POST', '/employees/', data),
  updateEmployee: (id, data) => request('PUT', `/employees/${id}`, data),
  deleteEmployee: (id) => request('DELETE', `/employees/${id}`),
  getBranches: () => request('GET', '/employees/branches/all'),
  getDepartments: () => request('GET', '/employees/departments/all'),

  // Attendance
  punch: (data) => request('POST', '/attendance/punch', data),
  todayStatus: () => request('GET', '/attendance/today'),
  myMonth: (year, month) => request('GET', `/attendance/my/month?year=${year}&month=${month}`),
  myLateSummary: (year, month) => request('GET', `/attendance/my/late-summary?year=${year}&month=${month}`),
  employeeLateSummary: (empId, year, month) =>
    request('GET', `/attendance/employee/${empId}/late-summary?year=${year}&month=${month}`),
  attendanceByDate: (date, params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request('GET', `/attendance/date/${date}${q ? '?' + q : ''}`)
  },
  employeeMonth: (empId, year, month) =>
    request('GET', `/attendance/employee/${empId}/month?year=${year}&month=${month}`),

  // Settings
  getCompanySettings: () => request('GET', '/settings/company'),
  updateCompanySettings: (data) => request('PUT', '/settings/company', data),
  getMyBranchSettings: () => request('GET', '/settings/branch/me'),
  getBranchSettings: (name) => request('GET', `/settings/branch/${encodeURIComponent(name)}`),
  getSettingsBranches: () => request('GET', '/settings/branches'),
  addBranch: (name) => request('POST', '/settings/branches', { name }),
  updateBranchRules: (id, data) => request('PUT', `/settings/branches/${id}`, data),
  deleteBranch: (id) => request('DELETE', `/settings/branches/${id}`),
  getSettingsDepts: () => request('GET', '/settings/departments'),
  addDept: (name) => request('POST', '/settings/departments', { name }),
  deleteDept: (id) => request('DELETE', `/settings/departments/${id}`),

  // Notes
  getTodayNote: () => request('GET', '/notes/today'),
  getNotes: () => request('GET', '/notes/'),
  createNote: (data) => request('POST', '/notes/', data),
  deleteNote: (id) => request('DELETE', `/notes/${id}`),

  getHolidays: (month) => request('GET', month ? `/holidays/?month=${encodeURIComponent(month)}` : '/holidays/'),
  getMyHolidays: (year, month) => request('GET', `/holidays/my-month?year=${year}&month=${month}`),
  createHoliday: (data) => request('POST', '/holidays/', data),
  updateHoliday: (id, data) => request('PUT', `/holidays/${id}`, data),
  deleteHoliday: (id) => request('DELETE', `/holidays/${id}`),

  getMyLeaves: () => request('GET', '/leaves/my'),
  applyLeave: (data) => request('POST', '/leaves/', data),

  // Reports
  getReports: () => request('GET', '/reports/'),
  generateReport: (data) => request('POST', '/reports/generate', data),
  downloadReport: (id) => {
    const token = getToken()
    window.open(`${BASE}/reports/download/${id}?token=${token}`, '_blank')
  },
  deleteReport: (id) => request('DELETE', `/reports/${id}`),
}
