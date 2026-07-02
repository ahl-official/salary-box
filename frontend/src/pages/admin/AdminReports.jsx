import React, { useState, useEffect } from 'react'
import { api } from '../../utils/api'
import { useToast } from '../../context/ToastContext'
import { formatLocalTime, monthIST } from '../../utils/datetime'

const REPORT_TYPES = [
  { id: 'attendance_summary', label: 'Attendance Summary Report', category: 'Attendance' },
  { id: 'detailed_attendance', label: 'Detailed Attendance Report', category: 'Attendance' },
  { id: 'daily_attendance', label: 'Daily Attendance Report', category: 'Attendance' },
  { id: 'company_roster', label: 'Company Roster Report', category: 'Attendance' },
  { id: 'late_arrival', label: 'Late Arrival Report', category: 'Attendance' },
  { id: 'leave_report', label: 'Leave Report', category: 'Attendance' },
  { id: 'overtime_report', label: 'Overtime Report', category: 'Attendance' },
  { id: 'notes_report', label: 'Notes Report', category: 'Notes' },
]

function ReportGenerator({ onGenerated }) {
  const toast = useToast()
  const [type, setType] = useState(REPORT_TYPES[0].id)
  const [month, setMonth] = useState(monthIST())
  const [branch, setBranch] = useState('All')
  const [department, setDepartment] = useState('All')
  const [branches, setBranches] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getSettingsBranches().then(d => setBranches([{ id: 0, name: 'All' }, ...d])).catch(() => {})
    api.getSettingsDepts().then(d => setDepartments([{ id: 0, name: 'All' }, ...d])).catch(() => {})
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const data = await api.generateReport({ type, month, branch, department })
      toast('Report generated successfully!', 'success')
      onGenerated()
    } catch (e) {
      toast(e.message || 'Failed to generate report', 'error')
    }
    setLoading(false)
  }

  const byCategory = REPORT_TYPES.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  return (
    <div>
      <div className="input-group">
        <label className="input-label">Report Type</label>
        {Object.entries(byCategory).map(([cat, types]) => (
          <div key={cat} style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>{cat}</p>
            {types.map(t => (
              <div
                key={t.id}
                onClick={() => setType(t.id)}
                style={{
                  padding: '12px 14px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                  background: type === t.id ? 'var(--accent-dim)' : 'var(--card2)',
                  border: `1px solid ${type === t.id ? 'var(--accent)' : 'var(--border)'}`,
                  color: type === t.id ? 'var(--accent)' : 'var(--text)',
                  fontSize: 14, fontWeight: type === t.id ? 600 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}
              >
                {t.label}
                {type === t.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="input-label">Month</label>
          <input type="month" className="input-field" value={month} onChange={e => setMonth(e.target.value)} style={{ colorScheme: 'dark' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="input-label">Branch</label>
          <select className="input-field" value={branch} onChange={e => setBranch(e.target.value)}>
            {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </div>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="input-label">Department</label>
          <select className="input-field" value={department} onChange={e => setDepartment(e.target.value)}>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
        {loading ? <div className="spinner" style={{ borderTopColor: '#000', borderColor: 'rgba(0,0,0,0.2)' }} /> : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Generate XLS
          </>
        )}
      </button>
    </div>
  )
}

function DownloadsList() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getReports()
      setReports(data)
    } catch (e) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    try {
      await api.deleteReport(id)
      setReports(prev => prev.filter(r => r.id !== id))
      toast('Report deleted', 'success')
    } catch (e) {
      toast('Failed to delete', 'error')
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>

  if (reports.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">📊</div>
      <p>No reports generated yet</p>
    </div>
  )

  return (
    <div>
      {reports.map(r => (
        <div key={r.id} className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {r.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {r.month} · {r.branch || 'All'} · {r.department || 'All'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {r.generated_at ? formatLocalTime(r.generated_at, 'dd MMM yyyy, hh:mm a') : '--'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = `/api/reports/download/${r.id}`
                  a.download = r.name + '.xlsx'
                  const token = localStorage.getItem('token')
                  fetch(a.href, { headers: { Authorization: `Bearer ${token}` } })
                    .then(res => res.blob())
                    .then(blob => {
                      const url = URL.createObjectURL(blob)
                      a.href = url
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                    })
                    .catch(() => toast('Download failed', 'error'))
                }}
                style={{ padding: '8px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--accent)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button
                onClick={() => handleDelete(r.id)}
                style={{ padding: '8px', background: 'var(--accent-red-dim)', border: '1px solid var(--accent-red)', borderRadius: 6, color: 'var(--accent-red)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState('reports')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="screen-content fade-in">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex', background: 'var(--card)', borderRadius: 10,
        border: '1px solid var(--border)', padding: 4, marginBottom: 20
      }}>
        {['reports', 'downloads'].map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              flex: 1, padding: '10px', borderRadius: 7, fontSize: 14, fontWeight: 600,
              background: activeTab === t ? 'var(--accent)' : 'transparent',
              color: activeTab === t ? '#000' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'reports' && (
        <ReportGenerator onGenerated={() => { setRefreshKey(k => k+1); setActiveTab('downloads') }} />
      )}
      {activeTab === 'downloads' && (
        <DownloadsList key={refreshKey} />
      )}
    </div>
  )
}
