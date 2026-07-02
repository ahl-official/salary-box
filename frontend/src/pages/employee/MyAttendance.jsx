import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../utils/api'
import { format, getDaysInMonth, startOfMonth, getDay, parseISO, isAfter } from 'date-fns'
import { formatLocalTime, localDateKey, hoursBetween, nowIST, isTodayIST } from '../../utils/datetime'
import { isWeekOff, overtimeHours, shiftDurationHours } from '../../utils/shift'
import { latePolicyLabel, lateStatusLabel } from '../../utils/late'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function buildCalendarData(year, month, punches, settings, lateDays = {}, holidayDays = {}) {
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
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayData = dayMap[key] || null
    const date = new Date(year, month - 1, d)
    const weekOff = isWeekOff(date, settings)
    const future = isAfter(date, nowIST()) && !isTodayIST(date)

    const late = lateDays[key] || null
    const holiday = holidayDays[key] || null

    let status = 'future'
    let ot = 0
    if (future) status = 'future'
    else if (holiday) status = 'holiday'
    else if (weekOff) status = 'weekend'
    else if (dayData?.in) {
      status = 'present'
      if (dayData.in && dayData.out) {
        const h = hoursBetween(dayData.in, dayData.out)
        ot = overtimeHours(h, settings)
      }
    }
    else if (!future && !weekOff) status = 'absent'

    cells.push({ day: d, key, status, data: dayData, isToday: isTodayIST(date), overtime: ot, late, holiday })
  }
  return cells
}

function sumDayHours(punches, settings) {
  let totalHours = 0
  let totalOT = 0
  const seenDays = new Set()
  for (const p of punches) {
    const d = localDateKey(p.timestamp)
    if (!d || seenDays.has(d)) continue
    seenDays.add(d)
    const dayGroup = punches.filter(x => localDateKey(x.timestamp) === d)
    const inP = dayGroup.find(x => x.punch_type === 'in')
    const outP = dayGroup.find(x => x.punch_type === 'out')
    if (inP && outP) {
      const h = hoursBetween(inP.timestamp, outP.timestamp)
      if (h != null) {
        totalHours += h
        totalOT += overtimeHours(h, settings)
      }
    }
  }
  return { totalHours, totalOT }
}

export default function MyAttendance() {
  const now = nowIST()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [punches, setPunches] = useState([])
  const [settings, setSettings] = useState(null)
  const [lateSummary, setLateSummary] = useState(null)
  const [holidayDays, setHolidayDays] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    api.getMyBranchSettings().then(setSettings).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, late, hol] = await Promise.all([
        api.myMonth(year, month),
        api.myLateSummary(year, month),
        api.getMyHolidays(year, month),
      ])
      setPunches(data)
      setLateSummary(late)
      setHolidayDays(hol?.days || {})
    } catch (e) {}
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const cells = buildCalendarData(year, month, punches, settings, lateSummary?.days || {}, holidayDays)
  const { totalHours, totalOT } = sumDayHours(punches, settings)
  const shiftHrs = shiftDurationHours(settings)

  const present = cells.filter(c => c?.status === 'present').length
  const absent = cells.filter(c => c?.status === 'absent').length
  const weekOff = cells.filter(c => c?.status === 'weekend').length
  const holidays = cells.filter(c => c?.status === 'holiday').length

  const monthOptions = []
  for (let m = 1; m <= 12; m++) {
    monthOptions.push({ value: m, label: format(new Date(2024, m - 1), 'MMMM') })
  }
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  const formatTime = (iso) => formatLocalTime(iso)

  const selectedCell = selected ? cells.find(c => c?.key === selected) : null
  const selectedPunches = selected ? punches.filter(p => localDateKey(p.timestamp) === selected) : []
  const selectedIn = selectedPunches.find(p => p.punch_type === 'in')
  const selectedOut = selectedPunches.find(p => p.punch_type === 'out')
  const selectedHoursNum = selectedIn && selectedOut ? hoursBetween(selectedIn.timestamp, selectedOut.timestamp) : null
  const selectedHours = selectedHoursNum != null ? selectedHoursNum.toFixed(1) : null
  const selectedOT = selectedHoursNum != null ? overtimeHours(selectedHoursNum, settings).toFixed(1) : null

  return (
    <div className="screen-content fade-in">
      <div className="page-header">
        <h1 className="page-title">My Record</h1>
        <p className="page-subtitle">
          {settings?.branch_name || 'Your branch'} · {shiftHrs}h shift
          {settings?.working_days?.length ? ` · ${settings.working_days.join(', ')}` : ''}
        </p>
        {settings && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{latePolicyLabel(settings)}</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select className="input-field" value={month} onChange={e => setMonth(Number(e.target.value))} style={{ flex: 2 }}>
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="input-field" value={year} onChange={e => setYear(Number(e.target.value))} style={{ flex: 1 }}>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

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
          <div className="count" style={{ color: 'var(--text-secondary)' }}>{weekOff}</div>
          <div className="label">Week Off</div>
        </div>
        {holidays > 0 && (
          <div className="summary-tile">
            <div className="count" style={{ color: '#6FA8FF' }}>{holidays}</div>
            <div className="label">Holiday</div>
          </div>
        )}
        <div className="summary-tile">
          <div className="count" style={{ fontSize: 18 }}>{totalHours.toFixed(0)}h</div>
          <div className="label">Total Hrs</div>
        </div>
        <div className="summary-tile">
          <div className="count" style={{ fontSize: 18, color: '#FFA500' }}>{totalOT.toFixed(1)}h</div>
          <div className="label">Overtime</div>
        </div>
        {lateSummary && (
          <>
            <div className="summary-tile">
              <div className="count" style={{ color: '#FFA500' }}>{lateSummary.late_days_count}</div>
              <div className="label">Late Days</div>
            </div>
            <div className="summary-tile">
              <div className="count text-danger">{lateSummary.half_day_deductions}</div>
              <div className="label">Half-Day</div>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="calendar-grid">
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="cal-day-label">{d}</div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} className="cal-day empty" />
            return (
              <div
                key={cell.key}
                className={`cal-day ${cell.status} ${cell.isToday ? 'today' : ''} ${selected === cell.key ? 'today' : ''}`}
                onClick={() => cell.status === 'present' ? setSelected(selected === cell.key ? null : cell.key) : null}
                style={{ position: 'relative' }}
              >
                {cell.day}
                {cell.overtime > 0 && (
                  <span style={{
                    position: 'absolute', bottom: 2, right: 2, fontSize: 8, fontWeight: 700, color: '#FFA500'
                  }}>OT</span>
                )}
                {cell.late?.is_late && (
                  <span style={{
                    position: 'absolute', bottom: 2, left: 2, fontSize: 8, fontWeight: 700,
                    color: cell.late.half_day_deduction ? '#FF4444' : '#FFA500'
                  }}>{cell.late.half_day_deduction ? '½' : 'L'}</span>
                )}
              </div>
            )
          })}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingLeft: 4, flexWrap: 'wrap' }}>
        {[
          { color: 'var(--accent)', label: 'Present' },
          { color: 'var(--accent-red)', label: 'Absent' },
          { color: 'var(--text-muted)', label: 'Week Off' },
          { color: '#6FA8FF', label: 'Holiday' },
          { color: '#FFA500', label: 'OT day' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, opacity: 0.7 }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {selected && selectedCell && (
        <div className="card mt-16 fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontWeight: 700, fontSize: 15 }}>
              {format(parseISO(selected), 'EEEE, d MMMM')}
            </p>
            <span className="tag tag-present">Present</span>
          </div>
          <div className="info-row">
            <span className="info-label">Punch In</span>
            <span className="info-value text-accent">{formatTime(selectedIn?.timestamp)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Punch Out</span>
            <span className="info-value" style={{ color: 'var(--accent-red)' }}>{formatTime(selectedOut?.timestamp)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Hours Worked</span>
            <span className="info-value">{selectedHours ? `${selectedHours} hrs` : '--'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Overtime ({shiftHrs}h shift)</span>
            <span className="info-value" style={{ color: selectedOT > 0 ? '#FFA500' : 'var(--text-secondary)' }}>
              {selectedOT != null ? `${selectedOT} hrs` : '--'}
            </span>
          </div>
          {selectedCell?.late?.is_late && (
            <div className="info-row">
              <span className="info-label">Late Arrival</span>
              <span className="info-value" style={{ color: selectedCell.late.half_day_deduction ? 'var(--accent-red)' : '#FFA500' }}>
                {lateStatusLabel(selectedCell.late)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
