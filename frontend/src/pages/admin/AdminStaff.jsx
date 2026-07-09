import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../utils/api'
import { format, getDaysInMonth, startOfMonth, getDay, isAfter, parseISO } from 'date-fns'
import { formatLocalTime, localDateKey, hoursBetween, nowIST, isTodayIST } from '../../utils/datetime'
import { isWeekOff, overtimeHours, shiftDurationHours } from '../../utils/shift'
import { useToast } from '../../context/ToastContext'
import EmployeeUpload from '../../components/EmployeeUpload'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function buildCalendar(year, month, punches, settings, lateDays = {}) {
  const days = getDaysInMonth(new Date(year, month - 1))
  const firstDay = getDay(startOfMonth(new Date(year, month - 1)))
  const dayMap = {}
  for (const p of punches) {
    const d = localDateKey(p.timestamp)
    if (!d) continue
    if (!dayMap[d]) dayMap[d] = { in: null, out: null }
    if (p.punch_type === 'in' && !dayMap[d].in) dayMap[d].in = p.timestamp
    if (p.punch_type === 'out') dayMap[d].out = p.timestamp
  }
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= days; d++) {
    const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const data = dayMap[key] || null
    const date = new Date(year, month-1, d)
    const weekOff = isWeekOff(date, settings)
    const future = isAfter(date, nowIST()) && !isTodayIST(date)
    let status = 'future'
    let ot = 0
    if (future) status = 'future'
    else if (weekOff) status = 'weekend'
    else if (data?.in) {
      status = 'present'
      if (data.in && data.out) ot = overtimeHours(hoursBetween(data.in, data.out), settings)
    }
    else if (!future && !weekOff) status = 'absent'
    cells.push({ day: d, key, status, data, isToday: isTodayIST(date), overtime: ot, late: lateDays[key] || null })
  }
  return cells
}

function EmployeeDetail({ emp, onBack }) {
  const now = nowIST()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [punches, setPunches] = useState([])
  const [settings, setSettings] = useState(null)
  const [lateSummary, setLateSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!emp?.branch) {
      api.getCompanySettings().then(setSettings).catch(() => {})
      return
    }
    api.getBranchSettings(emp.branch).then(setSettings).catch(() => {
      api.getCompanySettings().then(setSettings).catch(() => {})
    })
  }, [emp.branch])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.employeeMonth(emp.id, year, month),
      api.employeeLateSummary(emp.id, year, month),
    ]).then(([d, late]) => {
      setPunches(d)
      setLateSummary(late)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [emp.id, year, month])

  const cells = buildCalendar(year, month, punches, settings, lateSummary?.days || {})
  const present = cells.filter(c => c?.status === 'present').length
  const absent = cells.filter(c => c?.status === 'absent').length
  const shiftHrs = shiftDurationHours(settings)

  let totalHours = 0
  let totalOT = 0
  const seenDays = new Set()
  for (const p of punches) {
    const d = localDateKey(p.timestamp)
    if (!d || seenDays.has(d)) continue
    seenDays.add(d)
    const dayPunches = punches.filter(x => localDateKey(x.timestamp) === d)
    const inP = dayPunches.find(x => x.punch_type === 'in')
    const outP = dayPunches.find(x => x.punch_type === 'out')
    if (inP && outP) {
      const h = hoursBetween(inP.timestamp, outP.timestamp)
      if (h != null) {
        totalHours += h
        totalOT += overtimeHours(h, settings)
      }
    }
  }

  const selectedPunches = selected ? punches.filter(p => localDateKey(p.timestamp) === selected) : []
  const selectedIn = selectedPunches.find(p => p.punch_type === 'in')
  const selectedOut = selectedPunches.find(p => p.punch_type === 'out')
  const selectedHoursNum = selectedIn && selectedOut ? hoursBetween(selectedIn.timestamp, selectedOut.timestamp) : null
  const selectedHours = selectedHoursNum != null ? selectedHoursNum.toFixed(1) : null
  const selectedOT = selectedHoursNum != null ? overtimeHours(selectedHoursNum, settings).toFixed(1) : null

  const initials = emp.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="screen-content fade-in">
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 14, marginBottom: 20 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15,18 9,12 15,6"/></svg>
        Back to Staff
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{initials}</div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{emp.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{emp.designation || 'Employee'} · {emp.branch_name || emp.branch || '--'}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.phone}{settings?.shift_start ? ` · ${settings.shift_start}–${settings.shift_end}` : ''}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select className="input-field" value={month} onChange={e => setMonth(Number(e.target.value))} style={{ flex: 2 }}>
          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{format(new Date(2024,m-1),'MMMM')}</option>)}
        </select>
        <select className="input-field" value={year} onChange={e => setYear(Number(e.target.value))} style={{ flex: 1 }}>
          {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="summary-strip mb-16">
        <div className="summary-tile"><div className="count text-accent">{present}</div><div className="label">Present</div></div>
        <div className="summary-tile"><div className="count text-danger">{absent}</div><div className="label">Absent</div></div>
        <div className="summary-tile"><div className="count" style={{fontSize:18}}>{totalHours.toFixed(0)}h</div><div className="label">Hours</div></div>
        <div className="summary-tile"><div className="count" style={{fontSize:18,color:'#FFA500'}}>{totalOT.toFixed(1)}h</div><div className="label">OT</div></div>
      </div>

      <div className="card">
        <div className="calendar-grid">
          {DAY_LABELS.map((d,i) => <div key={i} className="cal-day-label">{d}</div>)}
          {cells.map((cell, i) => !cell
            ? <div key={`e-${i}`} className="cal-day empty"/>
            : <div key={cell.key} className={`cal-day ${cell.status} ${cell.isToday?'today':''} ${selected===cell.key?'today':''}`}
                onClick={() => cell.status==='present' ? setSelected(selected===cell.key?null:cell.key) : null}
                style={{ position: 'relative' }}>
                {cell.day}
                {cell.overtime > 0 && <span style={{ position:'absolute', bottom:2, right:2, fontSize:8, fontWeight:700, color:'#FFA500' }}>OT</span>}
              </div>
          )}
        </div>
        {loading && <div style={{textAlign:'center',padding:16}}><div className="spinner" style={{margin:'0 auto'}}/></div>}
      </div>

      {selected && (
        <div className="card mt-16 fade-in">
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{format(parseISO(selected), 'EEEE, d MMMM')}</p>
          <div className="info-row"><span className="info-label">Punch In</span><span className="info-value text-accent">{formatLocalTime(selectedIn?.timestamp)}</span></div>
          <div className="info-row"><span className="info-label">Punch Out</span><span className="info-value" style={{color:'var(--accent-red)'}}>{formatLocalTime(selectedOut?.timestamp)}</span></div>
          <div className="info-row"><span className="info-label">Hours</span><span className="info-value">{selectedHours ? `${selectedHours}h` : '--'}</span></div>
          <div className="info-row"><span className="info-label">Overtime ({shiftHrs}h shift)</span><span className="info-value" style={{color: selectedOT > 0 ? '#FFA500' : undefined}}>{selectedOT != null ? `${selectedOT}h` : '--'}</span></div>
        </div>
      )}
    </div>
  )
}

export default function AdminStaff() {
  const [employees, setEmployees] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [selected, setSelected] = useState(null)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, branchList] = await Promise.all([
        api.getEmployees(),
        api.getBranches(),
      ])
      setEmployees(data)
      setBranches(branchList)
    } catch (e) {
      toast('Failed to load staff', 'error')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  if (selected) return <EmployeeDetail emp={selected} onBack={() => setSelected(null)} />

  const branchCounts = employees.reduce((acc, emp) => {
    const key = emp.branch || emp.branch_name || 'Unassigned'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const filtered = employees.filter(e => {
    const matchesSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search) ||
      (e.department_name || '').toLowerCase().includes(search.toLowerCase())
    const empBranch = e.branch || e.branch_name || ''
    const matchesBranch = branchFilter === 'all' || empBranch.toLowerCase() === branchFilter.toLowerCase()
    return matchesSearch && matchesBranch
  })

  const branchTabs = [
    { key: 'all', label: 'All', count: employees.length },
    ...branches.map((b) => ({
      key: b.name,
      label: b.name,
      count: branchCounts[b.name] || 0,
    })),
  ]

  return (
    <div className="screen-content fade-in staff-page">
      <div className="staff-page-header">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-subtitle">{filtered.length} shown · {employees.length} total</p>
        </div>
        <button type="button" className="btn btn-primary staff-upload-btn" onClick={() => setShowUpload((v) => !v)}>
          {showUpload ? 'Hide upload' : 'Upload CSV'}
        </button>
      </div>

      {showUpload && (
        <EmployeeUpload
          branches={branches}
          onClose={() => setShowUpload(false)}
          onImported={load}
        />
      )}

      <div className="staff-toolbar">
        <div className="branch-filter-row">
          {branchTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`branch-filter-btn ${branchFilter === tab.key ? 'active' : ''}`}
              onClick={() => setBranchFilter(tab.key)}
            >
              {tab.label}
              <span className="branch-filter-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="search-bar staff-search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search by name, phone, department..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} className="search-clear-btn">×</button>}
        </div>
      </div>

      {loading ? (
        <div className="staff-loading"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No staff found</p></div>
      ) : (
        <div className="card staff-grid" style={{ padding: 0 }}>
          {filtered.map(emp => {
            const initials = emp.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            return (
              <div key={emp.id} className="list-item staff-list-item" onClick={() => setSelected(emp)}>
                <div className="avatar">{initials}</div>
                <div className="staff-list-body">
                  <p className="staff-list-name">{emp.name}</p>
                  <p className="staff-list-meta">
                    {emp.designation || '--'} · {emp.department_name || '--'}
                  </p>
                  <p className="staff-list-branch">{emp.branch_name || emp.branch || '--'}</p>
                </div>
                <svg className="staff-list-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="9,18 15,12 9,6"/></svg>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
