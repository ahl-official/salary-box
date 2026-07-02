import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../utils/api'
import { useToast } from '../../context/ToastContext'
import { format, parseISO } from 'date-fns'
import { monthIST } from '../../utils/datetime'

function EmployeePicker({ employees, selectedIds, onChange }) {
  const toggle = (id) => {
    const sid = Number(id)
    if (selectedIds.includes(sid)) {
      onChange(selectedIds.filter(x => x !== sid))
    } else {
      onChange([...selectedIds, sid])
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8, marginTop: 8 }}>
      {employees.map(emp => {
        const selected = selectedIds.includes(Number(emp.id))
        const initials = emp.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        return (
          <button
            key={emp.id}
            type="button"
            onClick={() => toggle(emp.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
              background: selected ? 'var(--accent-dim)' : 'var(--card2)',
              border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <div className="avatar avatar-sm" style={{ width: 36, height: 36, fontSize: 12 }}>{initials}</div>
            <span style={{
              fontSize: 9, fontWeight: 600, textAlign: 'center', lineHeight: 1.2,
              color: selected ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
              {emp.name.split(' ')[0]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function HolidayManager() {
  const toast = useToast()
  const [month, setMonth] = useState(monthIST())
  const [holidays, setHolidays] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', scope: 'all', emp_ids: [] })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, emps] = await Promise.all([
        api.getHolidays(month),
        api.getEmployees(),
      ])
      setHolidays(h)
      setEmployees(emps)
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }, [month])

  useEffect(() => { load() }, [load])

  const createHoliday = async () => {
    if (!form.name.trim() || !form.date) {
      toast('Name and date are required', 'error')
      return
    }
    if (form.scope === 'selected' && form.emp_ids.length === 0) {
      toast('Tap employee profiles to assign this holiday', 'error')
      return
    }
    setSaving(true)
    try {
      await api.createHoliday({
        name: form.name.trim(),
        date: form.date,
        scope: form.scope,
        emp_ids: form.scope === 'selected' ? form.emp_ids : [],
      })
      toast('Holiday created', 'success')
      setForm({ name: '', date: '', scope: 'all', emp_ids: [] })
      load()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const saveAssignees = async (holiday) => {
    if (holiday.scope === 'selected' && (!holiday._draftIds || holiday._draftIds.length === 0)) {
      toast('Select at least one employee', 'error')
      return
    }
    setSaving(true)
    try {
      await api.updateHoliday(holiday.id, {
        scope: holiday.scope,
        emp_ids: holiday.scope === 'selected' ? (holiday._draftIds || holiday.emp_ids) : [],
      })
      toast('Holiday updated', 'success')
      setExpanded(null)
      load()
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const removeHoliday = async (id) => {
    if (!confirm('Delete this holiday?')) return
    try {
      await api.deleteHoliday(id)
      toast('Holiday deleted', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  const openEdit = (h) => {
    setExpanded(h.id)
    setHolidays(prev => prev.map(x => x.id === h.id
      ? { ...x, scope: x.scope || 'all', _draftIds: [...(x.emp_ids || [])] }
      : x))
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        HR sets holidays for the month. Choose <strong>All staff</strong> or tap individual profiles (e.g. Eid for selected people only).
      </p>

      <div className="input-group">
        <label className="input-label">Month</label>
        <input type="month" className="input-field" value={month} onChange={e => setMonth(e.target.value)} style={{ colorScheme: 'dark' }} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Add holiday</p>
        <div className="input-group">
          <label className="input-label">Holiday name</label>
          <input className="input-field" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Eid, Republic Day" />
        </div>
        <div className="input-group">
          <label className="input-label">Date</label>
          <input type="date" className="input-field" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
        </div>
        <div className="input-group">
          <label className="input-label">Applies to</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ id: 'all', label: 'All staff' }, { id: 'selected', label: 'Selected people' }].map(opt => (
              <button key={opt.id} type="button" onClick={() => setForm(p => ({ ...p, scope: opt.id, emp_ids: opt.id === 'all' ? [] : p.emp_ids }))}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: form.scope === opt.id ? 'var(--accent-dim)' : 'var(--card2)',
                  border: `1px solid ${form.scope === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  color: form.scope === opt.id ? 'var(--accent)' : 'var(--text-secondary)',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {form.scope === 'selected' && (
          <div className="input-group">
            <label className="input-label">Tap profiles to include</label>
            <EmployeePicker employees={employees} selectedIds={form.emp_ids} onChange={ids => setForm(p => ({ ...p, emp_ids: ids }))} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{form.emp_ids.length} selected</p>
          </div>
        )}
        <button className="btn btn-primary" onClick={createHoliday} disabled={saving}>
          {saving ? 'Saving...' : 'Add Holiday'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : holidays.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>No holidays this month</p>
      ) : (
        holidays.map(h => {
          const open = expanded === h.id
          const draftIds = h._draftIds ?? h.emp_ids ?? []
          return (
            <div key={h.id} className="card" style={{ marginBottom: 8, padding: 0 }}>
              <div className="expandable-header" style={{ padding: '12px 14px' }} onClick={() => open ? setExpanded(null) : openEdit(h)}>
                <div>
                  <p style={{ fontWeight: 600 }}>{h.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {format(parseISO(h.date), 'EEE, d MMM yyyy')} · {h.scope === 'all' ? 'All staff' : `${(h.emp_ids || []).length} people`}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
                  <polyline points="6,9 12,15 18,9"/>
                </svg>
              </div>
              {open && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 8 }}>
                    {[{ id: 'all', label: 'All staff' }, { id: 'selected', label: 'Selected' }].map(opt => (
                      <button key={opt.id} type="button"
                        onClick={() => setHolidays(prev => prev.map(x => x.id === h.id ? { ...x, scope: opt.id } : x))}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: h.scope === opt.id ? 'var(--accent-dim)' : 'var(--card2)',
                          border: `1px solid ${h.scope === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                          color: h.scope === opt.id ? 'var(--accent)' : 'var(--text-secondary)',
                        }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {h.scope === 'selected' && (
                    <>
                      <label className="input-label">Assigned employees</label>
                      <EmployeePicker
                        employees={employees}
                        selectedIds={draftIds}
                        onChange={ids => setHolidays(prev => prev.map(x => x.id === h.id ? { ...x, _draftIds: ids } : x))}
                      />
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={() => saveAssignees({ ...h, _draftIds: draftIds })}>
                      Save
                    </button>
                    <button onClick={() => removeHoliday(h.id)} style={{ color: 'var(--accent-red)', padding: '0 12px' }} title="Delete">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
