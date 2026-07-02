import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../utils/api'
import { format, parseISO } from 'date-fns'
import { formatLocalTime, todayIST } from '../../utils/datetime'
import { useToast } from '../../context/ToastContext'

export default function AdminAttendance() {
  const today = todayIST()
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [deptFilter, setDeptFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [departments, setDepartments] = useState([])
  const [branches, setBranches] = useState([])
  const toast = useToast()

  useEffect(() => {
    api.getDepartments().then(setDepartments).catch(() => {})
    api.getBranches().then(setBranches).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (deptFilter) params.department = deptFilter
      if (branchFilter) params.branch = branchFilter
      const data = await api.attendanceByDate(date, params)
      setRows(data)
    } catch (e) {
      toast('Failed to load attendance', 'error')
    }
    setLoading(false)
  }, [date, deptFilter, branchFilter])

  useEffect(() => { load() }, [load])

  const present = rows.filter(r => r.status === 'Present').length
  const absent = rows.filter(r => r.status === 'Absent').length
  const notOut = rows.filter(r => r.status === 'Not Punched Out').length
  const weekOff = rows.filter(r => r.status === 'Week Off').length
  const totalOT = rows.reduce((sum, r) => sum + (r.overtime_hours || 0), 0)

  const formatTime = (iso) => formatLocalTime(iso)

  return (
    <div className="screen-content fade-in">
      <div className="page-header">
        <h1 className="page-title">Attendance</h1>
        <p className="page-subtitle">{format(parseISO(date), 'EEEE, d MMMM yyyy')}</p>
      </div>

      {/* Date picker */}
      <input
        type="date"
        className="input-field mb-16"
        value={date}
        max={today}
        onChange={e => setDate(e.target.value)}
        style={{ colorScheme: 'dark' }}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select className="input-field" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">All Depts</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select className="input-field" value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ flex: 1 }}>
          <option value="">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="summary-strip mb-16">
        <div className="summary-tile">
          <div className="count text-accent">{present}</div>
          <div className="label">Present</div>
        </div>
        <div className="summary-tile">
          <div className="count text-danger">{absent}</div>
          <div className="label">Absent</div>
        </div>
        <div className="summary-tile">
          <div className="count" style={{ color: '#FFA500' }}>{notOut}</div>
          <div className="label">Active</div>
        </div>
        <div className="summary-tile">
          <div className="count">{rows.length}</div>
          <div className="label">Total</div>
        </div>
        {weekOff > 0 && (
          <div className="summary-tile">
            <div className="count" style={{ color: 'var(--text-muted)' }}>{weekOff}</div>
            <div className="label">Week Off</div>
          </div>
        )}
        {totalOT > 0 && (
          <div className="summary-tile">
            <div className="count" style={{ color: '#FFA500' }}>{totalOT.toFixed(1)}</div>
            <div className="label">OT Hrs</div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><p>No data for this date</p></div>
      ) : (
        <div>
          {rows.map(row => {
            const initials = row.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const statusColor = row.status === 'Present' ? 'var(--accent)' : row.status === 'Absent' ? 'var(--accent-red)' : row.status === 'Holiday' ? '#6FA8FF' : row.status === 'Week Off' ? 'var(--text-muted)' : '#FFA500'
            return (
              <div key={row.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div className="avatar avatar-sm">{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{row.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.designation || '--'} · {row.department_name || '--'}</p>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: statusColor,
                    background: `${statusColor}22`, padding: '3px 8px', borderRadius: 4
                  }}>{row.status}</span>
                </div>

                {(row.punch_in || row.punch_out) && (
                  <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>IN</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{formatTime(row.punch_in)}</p>
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>OUT</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-red)' }}>{formatTime(row.punch_out)}</p>
                    </div>
                    {row.hours_worked != null && (
                      <>
                        <div style={{ width: 1, background: 'var(--border)' }} />
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>HRS</p>
                          <p style={{ fontSize: 13, fontWeight: 600 }}>{row.hours_worked}h</p>
                        </div>
                      </>
                    )}
                    {row.overtime_hours > 0 && (
                      <>
                        <div style={{ width: 1, background: 'var(--border)' }} />
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <p style={{ fontSize: 10, color: '#FFA500', marginBottom: 2 }}>OT</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#FFA500' }}>{row.overtime_hours}h</p>
                        </div>
                      </>
                    )}
                    {row.is_late && (
                      <>
                        <div style={{ width: 1, background: 'var(--border)' }} />
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <p style={{ fontSize: 10, color: row.half_day_deduction ? 'var(--accent-red)' : '#FFA500', marginBottom: 2 }}>LATE</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: row.half_day_deduction ? 'var(--accent-red)' : '#FFA500' }}>
                            {row.late_minutes}m{row.half_day_deduction ? ' ½' : row.late_forgiven ? '*' : ''}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
