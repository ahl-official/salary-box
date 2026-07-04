import React, { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { api } from '../utils/api'
import { useToast } from '../context/ToastContext'
import { todayIST } from '../utils/datetime'

const STATUS_STYLE = {
  pending: { bg: 'rgba(255,165,0,0.15)', color: '#FFA500', label: 'Pending' },
  approved: { bg: 'rgba(0,200,150,0.15)', color: 'var(--accent)', label: 'Approved' },
  rejected: { bg: 'rgba(255,68,68,0.15)', color: 'var(--accent-red)', label: 'Rejected' },
}

function emptyDateRow() {
  return { id: crypto.randomUUID(), value: '' }
}

export default function LeaveApply() {
  const toast = useToast()
  const [leaveType, setLeaveType] = useState('single')
  const [singleDate, setSingleDate] = useState('')
  const [multiDates, setMultiDates] = useState([emptyDateRow(), emptyDateRow()])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const minDate = todayIST()

  const loadLeaves = useCallback(async () => {
    try {
      const data = await api.getMyLeaves()
      setLeaves(data)
    } catch (e) {}
    setLoading(false)
  }, [])

  useEffect(() => { loadLeaves() }, [loadLeaves])

  const addDateRow = () => {
    setMultiDates((rows) => [...rows, emptyDateRow()])
  }

  const removeDateRow = (id) => {
    setMultiDates((rows) => rows.length > 2 ? rows.filter((r) => r.id !== id) : rows)
  }

  const updateDateRow = (id, value) => {
    setMultiDates((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const dates =
      leaveType === 'single'
        ? [singleDate]
        : multiDates.map((r) => r.value).filter(Boolean)

    if (leaveType === 'single' && !singleDate) {
      toast('Select a leave date', 'error')
      return
    }
    if (leaveType === 'multiple') {
      const filled = multiDates.map((r) => r.value).filter(Boolean)
      if (filled.length < 2) {
        toast('Add at least two dates for multiple leave', 'error')
        return
      }
    }

    setSubmitting(true)
    try {
      await api.applyLeave({ leave_type: leaveType, dates, reason: reason.trim() })
      toast('Leave request submitted', 'success')
      setSingleDate('')
      setMultiDates([emptyDateRow(), emptyDateRow()])
      setReason('')
      setOpen(false)
      loadLeaves()
    } catch (err) {
      toast(err.message || 'Could not submit leave', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDates = (leave) => {
    const dates = leave.dates || []
    if (dates.length === 0) return '—'
    if (dates.length === 1) return format(parseISO(dates[0]), 'd MMM yyyy')
    if (dates.length <= 3) return dates.map((d) => format(parseISO(d), 'd MMM')).join(', ')
    return `${format(parseISO(dates[0]), 'd MMM')} – ${format(parseISO(dates[dates.length - 1]), 'd MMM yyyy')} (${dates.length} days)`
  }

  return (
    <div className="card mt-16" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? 16 : 0 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15 }}>Apply for Leave</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Single day or multiple dates · sent to HR for approval
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '8px 14px', fontSize: 13 }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Apply'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="fade-in">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['single', 'multiple'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setLeaveType(type)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: leaveType === type ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: leaveType === type ? 'rgba(0,200,150,0.1)' : 'var(--card2)',
                  color: leaveType === type ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {type === 'single' ? 'Single day' : 'Multiple days'}
              </button>
            ))}
          </div>

          {leaveType === 'single' ? (
            <div className="input-group" style={{ marginBottom: 12 }}>
              <label className="input-label">Leave date</label>
              <input
                className="input-field"
                type="date"
                min={minDate}
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                required
              />
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label className="input-label" style={{ display: 'block', marginBottom: 8 }}>Leave dates</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {multiDates.map((row, idx) => (
                  <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input-field"
                      type="date"
                      min={minDate}
                      value={row.value}
                      onChange={(e) => updateDateRow(row.id, e.target.value)}
                      style={{ flex: 1 }}
                      placeholder={`Date ${idx + 1}`}
                    />
                    {multiDates.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeDateRow(row.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-red)',
                          fontSize: 20,
                          padding: '0 8px',
                          cursor: 'pointer',
                        }}
                        aria-label="Remove date"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addDateRow}
                style={{
                  marginTop: 8,
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                + Add another date
              </button>
            </div>
          )}

          <div className="input-group" style={{ marginBottom: 16 }}>
            <label className="input-label">Reason (optional)</label>
            <textarea
              className="input-field"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. personal, medical..."
              style={{ resize: 'vertical', minHeight: 64 }}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? <div className="spinner" style={{ borderTopColor: '#000' }} /> : 'Submit leave request'}
          </button>
        </form>
      )}

      <div style={{ marginTop: open ? 20 : 16, borderTop: open ? '1px solid var(--border)' : 'none', paddingTop: open ? 16 : 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          My leave requests
        </p>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <div className="spinner" style={{ margin: '0 auto', width: 24, height: 24 }} />
          </div>
        ) : leaves.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No leave requests yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {leaves.map((leave) => {
              const st = STATUS_STYLE[leave.status] || STATUS_STYLE.pending
              return (
                <div
                  key={leave.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'var(--card2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14 }}>{formatDates(leave)}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {leave.leave_type === 'single' ? 'Single day' : `${leave.date_count} days`} · {leave.created_at?.slice(0, 10)}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: st.bg,
                        color: st.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {st.label}
                    </span>
                  </div>
                  {leave.reason && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{leave.reason}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
