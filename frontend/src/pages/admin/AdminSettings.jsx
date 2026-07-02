import React, { useState, useEffect } from 'react'
import { api } from '../../utils/api'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { todayIST } from '../../utils/datetime'
import HolidayManager from './HolidayManager'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card" style={{ padding: 0, marginBottom: 12 }}>
      <div className="expandable-header" style={{ padding: '14px 16px' }} onClick={() => setOpen(o => !o)}>
        <p style={{ fontWeight: 600, fontSize: 15 }}>{title}</p>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </div>
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function CompanySettings() {
  const toast = useToast()
  const [form, setForm] = useState({ company_name: '', address: '', gstin: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getCompanySettings().then(d => setForm({ company_name: d.company_name || '', address: d.address || '', gstin: d.gstin || '' })).catch(() => {})
  }, [])

  const save = async () => {
    setLoading(true)
    try {
      await api.updateCompanySettings(form)
      toast('Company settings saved', 'success')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  return (
    <div style={{ paddingTop: 16 }}>
      {[{ key: 'company_name', label: 'Company Name' }, { key: 'address', label: 'Address' }, { key: 'gstin', label: 'GSTIN' }].map(f => (
        <div className="input-group" key={f.key}>
          <label className="input-label">{f.label}</label>
          <input className="input-field" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
        </div>
      ))}
      <button className="btn btn-primary" onClick={save} disabled={loading} style={{ marginTop: 4 }}>
        {loading ? <div className="spinner" style={{ borderTopColor: '#000', borderColor: 'rgba(0,0,0,0.2)' }} /> : 'Save'}
      </button>
    </div>
  )
}

function GeofenceSettings() {
  const toast = useToast()
  const [form, setForm] = useState({ office_lat: '', office_lng: '', radius_meters: 100, wifi_ip: '', wifi_lock_enabled: 0 })
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    api.getCompanySettings().then(d => setForm({
      office_lat: d.office_lat || '',
      office_lng: d.office_lng || '',
      radius_meters: d.radius_meters || 100,
      wifi_ip: d.wifi_ip || '',
      wifi_lock_enabled: d.wifi_lock_enabled || 0
    })).catch(() => {})
  }, [])

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast('Geolocation not supported on this device', 'error')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(p => ({
          ...p,
          office_lat: pos.coords.latitude.toFixed(6),
          office_lng: pos.coords.longitude.toFixed(6),
        }))
        toast('Office location set to your current GPS position', 'success')
        setLocating(false)
      },
      () => {
        toast('Could not get your location. Allow location access and try again.', 'error')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }

  const save = async () => {
    setLoading(true)
    try {
      await api.updateCompanySettings({
        ...form,
        office_lat: parseFloat(form.office_lat),
        office_lng: parseFloat(form.office_lng),
        radius_meters: parseInt(form.radius_meters)
      })
      toast('Geofence settings saved', 'success')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Company-wide defaults. Branch-specific rules (above) override these for punch and attendance.
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={useMyLocation}
        disabled={locating}
        style={{ width: '100%', marginBottom: 16 }}
      >
        {locating ? 'Getting GPS location...' : 'Set office to my current location'}
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label">Latitude</label>
          <input className="input-field" type="number" step="any" value={form.office_lat} onChange={e => setForm(p => ({ ...p, office_lat: e.target.value }))} placeholder="19.0760" />
        </div>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label">Longitude</label>
          <input className="input-field" type="number" step="any" value={form.office_lng} onChange={e => setForm(p => ({ ...p, office_lng: e.target.value }))} placeholder="72.8777" />
        </div>
      </div>
      <div className="input-group">
        <label className="input-label">Radius (meters)</label>
        <input className="input-field" type="number" value={form.radius_meters} onChange={e => setForm(p => ({ ...p, radius_meters: e.target.value }))} />
      </div>
      <div className="divider" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 500 }}>WiFi IP Lock</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Only allow punch from office WiFi</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={!!form.wifi_lock_enabled} onChange={e => setForm(p => ({ ...p, wifi_lock_enabled: e.target.checked ? 1 : 0 }))} />
          <span className="slider" />
        </label>
      </div>
      {!!form.wifi_lock_enabled && (
        <div className="input-group">
          <label className="input-label">Office WiFi IP</label>
          <input className="input-field" value={form.wifi_ip} onChange={e => setForm(p => ({ ...p, wifi_ip: e.target.value }))} placeholder="192.168.1.1" />
        </div>
      )}
      <button className="btn btn-primary" onClick={save} disabled={loading}>
        {loading ? <div className="spinner" style={{ borderTopColor: '#000', borderColor: 'rgba(0,0,0,0.2)' }} /> : 'Save Geofence'}
      </button>
    </div>
  )
}

function WorkingHours() {
  const toast = useToast()
  const [form, setForm] = useState({ shift_start: '09:00', shift_end: '18:00', standard_shift_hours: '9', working_days: ['Mon','Tue','Wed','Thu','Fri','Sat'] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getCompanySettings().then(d => setForm({
      shift_start: d.shift_start || '09:00',
      shift_end: d.shift_end || '18:00',
      standard_shift_hours: d.standard_shift_hours || '9',
      working_days: Array.isArray(d.working_days) ? d.working_days : ['Mon','Tue','Wed','Thu','Fri','Sat']
    })).catch(() => {})
  }, [])

  const toggleDay = (day) => {
    setForm(p => ({
      ...p,
      working_days: p.working_days.includes(day)
        ? p.working_days.filter(d => d !== day)
        : [...p.working_days, day]
    }))
  }

  const save = async () => {
    setLoading(true)
    try {
      await api.updateCompanySettings({
        ...form,
        standard_shift_hours: parseFloat(form.standard_shift_hours || 9),
      })
      toast('Working hours saved', 'success')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label">Shift Start</label>
          <input className="input-field" type="time" value={form.shift_start} onChange={e => setForm(p => ({ ...p, shift_start: e.target.value }))} style={{ colorScheme: 'dark' }} />
        </div>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label">Shift End</label>
          <input className="input-field" type="time" value={form.shift_end} onChange={e => setForm(p => ({ ...p, shift_end: e.target.value }))} style={{ colorScheme: 'dark' }} />
        </div>
      </div>
      <div className="input-group">
        <label className="input-label">Working Days</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: form.working_days.includes(day) ? 'var(--accent-dim)' : 'var(--card2)',
                border: `1px solid ${form.working_days.includes(day) ? 'var(--accent)' : 'var(--border)'}`,
                color: form.working_days.includes(day) ? 'var(--accent)' : 'var(--text-secondary)'
              }}
            >{day}</button>
          ))}
        </div>
      </div>
      <div className="input-group">
        <label className="input-label">Standard Shift Hours</label>
        <input className="input-field" type="number" step="0.5" min="1" max="24" value={form.standard_shift_hours}
          onChange={e => setForm(p => ({ ...p, standard_shift_hours: e.target.value }))} />
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Overtime = hours worked above this (default 9h, Mon–Sat)</p>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={loading}>
        {loading ? <div className="spinner" style={{ borderTopColor: '#000', borderColor: 'rgba(0,0,0,0.2)' }} /> : 'Save Working Hours'}
      </button>
    </div>
  )
}

function BranchRulesManager() {
  const toast = useToast()
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const [branches, setBranches] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [forms, setForms] = useState({})
  const [loading, setLoading] = useState({})
  const [newName, setNewName] = useState('')

  const load = () => api.getSettingsBranches().then(list => {
    setBranches(list)
    const next = {}
    for (const b of list) {
      next[b.id] = {
        office_lat: b.office_lat || '',
        office_lng: b.office_lng || '',
        radius_meters: b.radius_meters || 100,
        shift_start: b.shift_start || '09:00',
        shift_end: b.shift_end || '18:00',
        standard_shift_hours: b.standard_shift_hours || '9',
        working_days: Array.isArray(b.working_days) ? b.working_days : ['Mon','Tue','Wed','Thu','Fri','Sat'],
        wifi_ip: b.wifi_ip || '',
        wifi_lock_enabled: b.wifi_lock_enabled || 0,
        late_policy_type: b.late_policy_type || (b.name?.toLowerCase() === 'salon' ? 'salon' : 'office'),
        late_grace_minutes: b.late_grace_minutes ?? (b.name?.toLowerCase() === 'salon' ? 0 : 15),
        late_monthly_allowance: b.late_monthly_allowance ?? (b.name?.toLowerCase() === 'salon' ? 0 : 6),
      }
    }
    setForms(next)
  }).catch(() => {})

  useEffect(() => { load() }, [])

  const toggleDay = (branchId, day) => {
    setForms(p => ({
      ...p,
      [branchId]: {
        ...p[branchId],
        working_days: p[branchId].working_days.includes(day)
          ? p[branchId].working_days.filter(d => d !== day)
          : [...p[branchId].working_days, day],
      },
    }))
  }

  const save = async (branchId) => {
    const form = forms[branchId]
    if (!form) return
    setLoading(p => ({ ...p, [branchId]: true }))
    try {
      await api.updateBranchRules(branchId, {
        ...form,
        office_lat: parseFloat(form.office_lat),
        office_lng: parseFloat(form.office_lng),
        radius_meters: parseInt(form.radius_meters, 10),
        standard_shift_hours: parseFloat(form.standard_shift_hours || 9),
        wifi_lock_enabled: form.wifi_lock_enabled ? 1 : 0,
        late_grace_minutes: parseInt(form.late_grace_minutes, 10),
        late_monthly_allowance: parseInt(form.late_monthly_allowance, 10),
      })
      toast('Branch rules saved', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
    setLoading(p => ({ ...p, [branchId]: false }))
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    try {
      await api.addBranch(newName.trim())
      setNewName('')
      toast('Branch added', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteBranch(id)
      toast('Branch deleted', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Each branch has its own geofence, shift hours, and working days. Employees use rules from their assigned branch.
      </p>
      {branches.map(b => {
        const form = forms[b.id]
        const open = expanded === b.id
        if (!form) return null
        return (
          <div key={b.id} className="card" style={{ marginBottom: 10, padding: 0 }}>
            <div
              className="expandable-header"
              style={{ padding: '12px 14px' }}
              onClick={() => setExpanded(open ? null : b.id)}
            >
              <div>
                <p style={{ fontWeight: 600, fontSize: 15 }}>{b.name}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {form.shift_start}–{form.shift_end} · {form.working_days?.length || 0} days/week · {form.late_policy_type === 'salon' ? 'Salon late policy' : `Office ${form.late_grace_minutes}m grace`}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round"
                style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
                <polyline points="6,9 12,15 18,9"/>
              </svg>
            </div>
            {open && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="input-label">Latitude</label>
                    <input className="input-field" type="number" step="any" value={form.office_lat}
                      onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], office_lat: e.target.value } }))} />
                  </div>
                  <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="input-label">Longitude</label>
                    <input className="input-field" type="number" step="any" value={form.office_lng}
                      onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], office_lng: e.target.value } }))} />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Geofence Radius (m)</label>
                  <input className="input-field" type="number" value={form.radius_meters}
                    onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], radius_meters: e.target.value } }))} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Shift Start</label>
                    <input className="input-field" type="time" value={form.shift_start} style={{ colorScheme: 'dark' }}
                      onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], shift_start: e.target.value } }))} />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">Shift End</label>
                    <input className="input-field" type="time" value={form.shift_end} style={{ colorScheme: 'dark' }}
                      onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], shift_end: e.target.value } }))} />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Standard Shift Hours</label>
                  <input className="input-field" type="number" step="0.5" min="1" max="24" value={form.standard_shift_hours}
                    onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], standard_shift_hours: e.target.value } }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Late Policy</label>
                  <select className="input-field" value={form.late_policy_type}
                    onChange={e => {
                      const type = e.target.value
                      setForms(p => ({
                        ...p,
                        [b.id]: {
                          ...p[b.id],
                          late_policy_type: type,
                          late_grace_minutes: type === 'salon' ? 0 : 15,
                          late_monthly_allowance: type === 'salon' ? 0 : 6,
                        },
                      }))
                    }}>
                    <option value="office">Office — 15min grace, 6 late days/month forgiven</option>
                    <option value="salon">Salon — zero tolerance, instant half-day</option>
                  </select>
                </div>
                {form.late_policy_type === 'office' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div className="input-group" style={{ flex: 1 }}>
                      <label className="input-label">Grace (minutes)</label>
                      <input className="input-field" type="number" min="0" value={form.late_grace_minutes}
                        onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], late_grace_minutes: e.target.value } }))} />
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                      <label className="input-label">Monthly allowance</label>
                      <input className="input-field" type="number" min="0" value={form.late_monthly_allowance}
                        onChange={e => setForms(p => ({ ...p, [b.id]: { ...p[b.id], late_monthly_allowance: e.target.value } }))} />
                    </div>
                  </div>
                )}
                <div className="input-group">
                  <label className="input-label">Working Days</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DAYS.map(day => (
                      <button key={day} type="button" onClick={() => toggleDay(b.id, day)}
                        style={{
                          padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: form.working_days.includes(day) ? 'var(--accent-dim)' : 'var(--card2)',
                          border: `1px solid ${form.working_days.includes(day) ? 'var(--accent)' : 'var(--border)'}`,
                          color: form.working_days.includes(day) ? 'var(--accent)' : 'var(--text-secondary)',
                        }}>{day}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => save(b.id)} disabled={loading[b.id]}>
                    {loading[b.id] ? 'Saving...' : 'Save Rules'}
                  </button>
                  <button onClick={() => handleDelete(b.id)} style={{ color: 'var(--accent-red)', padding: '0 12px' }} title="Delete branch">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="New branch name..." style={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <button onClick={handleAdd} disabled={!newName.trim()}
          style={{ padding: '0 16px', background: 'var(--accent)', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: 20, flexShrink: 0, height: 48 }}>
          +
        </button>
      </div>
    </div>
  )
}

function ListManager({ title, getItems, addItem, deleteItem }) {
  const [items, setItems] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => { getItems().then(setItems).catch(() => {}) }, [])

  const handleAdd = async () => {
    if (!input.trim()) return
    setLoading(true)
    try {
      const newItem = await addItem(input.trim())
      setItems(prev => [...prev, newItem])
      setInput('')
      toast(`${title} added`, 'success')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  const handleDelete = async (id) => {
    try {
      await deleteItem(id)
      setItems(prev => prev.filter(i => i.id !== id))
      toast('Deleted', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="input-field" value={input} onChange={e => setInput(e.target.value)} placeholder={`Add ${title.toLowerCase()}...`}
          onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1 }} />
        <button onClick={handleAdd} disabled={loading || !input.trim()}
          style={{ padding: '0 16px', background: 'var(--accent)', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: 20, flexShrink: 0, height: 48 }}>
          +
        </button>
      </div>
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14 }}>{item.name}</span>
          <button onClick={() => handleDelete(item.id)} style={{ color: 'var(--accent-red)', padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}
      {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No {title.toLowerCase()}s yet</p>}
    </div>
  )
}

function EmployeeManager() {
  const toast = useToast()
  const [employees, setEmployees] = useState([])
  const [branches, setBranches] = useState([])
  const [departments, setDepartments] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', designation: '', role: 'employee', department: '', branch: '' })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const load = () => Promise.all([
    api.getEmployees().then(setEmployees),
    api.getSettingsBranches().then(setBranches),
    api.getSettingsDepts().then(setDepartments)
  ]).catch(() => {})

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.name || !form.phone) { toast('Name and phone are required', 'error'); return }
    setLoading(true)
    try {
      const emp = await api.createEmployee({ ...form, department: form.department || null, branch: form.branch || null })
      setEmployees(prev => [...prev, emp])
      setForm({ name: '', phone: '', designation: '', role: 'employee', department: '', branch: '' })
      setShowForm(false)
      toast('Employee added', 'success')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this employee?')) return
    try {
      await api.deleteEmployee(id)
      setEmployees(prev => prev.filter(e => e.id !== id))
      toast('Employee deleted', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.phone.includes(search)
  )

  return (
    <div style={{ paddingTop: 16 }}>
      <div className="search-bar" style={{ marginBottom: 12 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <button className="btn btn-secondary" onClick={() => setShowForm(s => !s)} style={{ marginBottom: 16 }}>
        {showForm ? '✕ Cancel' : '+ Add Employee'}
      </button>

      {showForm && (
        <div className="card fade-in" style={{ marginBottom: 16 }}>
          {[
            { key: 'name', label: 'Full Name', type: 'text', placeholder: 'Employee Name' },
            { key: 'phone', label: 'Mobile Number', type: 'tel', placeholder: '10-digit number' },
            { key: 'designation', label: 'Designation', type: 'text', placeholder: 'e.g. Software Engineer' },
          ].map(f => (
            <div className="input-group" key={f.key}>
              <label className="input-label">{f.label}</label>
              <input className="input-field" type={f.type} placeholder={f.placeholder} value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="input-label">Department</label>
              <select className="input-field" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))}>
                <option value="">Select</option>
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="input-label">Branch</label>
              <select className="input-field" value={form.branch} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))}>
                <option value="">Select</option>
                {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="input-group" style={{ marginTop: 16 }}>
            <label className="input-label">Role</label>
            <select className="input-field" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={loading} style={{ marginTop: 12 }}>
            {loading ? <div className="spinner" style={{ borderTopColor: '#000', borderColor: 'rgba(0,0,0,0.2)' }} /> : 'Add Employee'}
          </button>
        </div>
      )}

      {filtered.map(emp => {
        const initials = emp.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        return (
          <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="avatar avatar-sm">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {emp.phone} · {emp.role === 'admin' ? <span style={{ color: 'var(--accent)' }}>Admin</span> : 'Employee'}
              </p>
            </div>
            <button onClick={() => handleDelete(emp.id)} style={{ color: 'var(--accent-red)', padding: 6, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/>
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function NotesManager() {
  const toast = useToast()
  const [notes, setNotes] = useState([])
  const [input, setInput] = useState('')
  const [noteDate, setNoteDate] = useState(todayIST())
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.getNotes().then(setNotes).catch(() => {}) }, [])

  const handleAdd = async () => {
    if (!input.trim()) return
    setLoading(true)
    try {
      const note = await api.createNote({ content: input, date: noteDate })
      setNotes(prev => [note, ...prev])
      setInput('')
      toast('Note posted', 'success')
    } catch (e) { toast(e.message, 'error') }
    setLoading(false)
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteNote(id)
      setNotes(prev => prev.filter(n => n.id !== id))
      toast('Note deleted', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <div className="input-group">
        <label className="input-label">Date</label>
        <input type="date" className="input-field" value={noteDate} onChange={e => setNoteDate(e.target.value)} style={{ colorScheme: 'dark' }} />
      </div>
      <div className="input-group">
        <label className="input-label">Note for Employees</label>
        <textarea className="input-field" rows={3} value={input} onChange={e => setInput(e.target.value)}
          placeholder="e.g. Office closed on Friday. Work from home today." style={{ resize: 'none', lineHeight: 1.5 }} />
      </div>
      <button className="btn btn-primary" onClick={handleAdd} disabled={loading || !input.trim()}>
        {loading ? <div className="spinner" style={{ borderTopColor: '#000', borderColor: 'rgba(0,0,0,0.2)' }} /> : 'Post Note'}
      </button>
      <div className="divider" />
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>Recent Notes</p>
      {notes.map(n => (
        <div key={n.id} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, background: 'var(--card2)', borderRadius: 8, padding: 12 }}>
            <p style={{ fontSize: 13 }}>{n.content}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{n.date}</p>
          </div>
          <button onClick={() => handleDelete(n.id)} style={{ color: 'var(--accent-red)', padding: 4, flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

export default function AdminSettings() {
  const { logout } = useAuth()
  const [showLogout, setShowLogout] = useState(false)

  return (
    <div className="screen-content fade-in">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <Section title="Company Settings" defaultOpen>
        <CompanySettings />
      </Section>

      <Section title="Branch Rules (Back Office / Salon)" defaultOpen>
        <BranchRulesManager />
      </Section>

      <Section title="Default Geofence & WiFi">
        <GeofenceSettings />
      </Section>

      <Section title="Default Working Hours">
        <WorkingHours />
      </Section>

      <Section title="Holidays (HR)">
        <HolidayManager />
      </Section>

      <Section title="Departments">
        <ListManager
          title="Department"
          getItems={api.getSettingsDepts}
          addItem={(name) => api.addDept(name)}
          deleteItem={(id) => api.deleteDept(id)}
        />
      </Section>

      <Section title="Employee Management">
        <EmployeeManager />
      </Section>

      <Section title="Daily Notes">
        <NotesManager />
      </Section>

      <div style={{ marginTop: 20 }}>
        {!showLogout ? (
          <button className="btn-ghost" onClick={() => setShowLogout(true)} style={{ width: '100%', textAlign: 'center' }}>
            Sign Out
          </button>
        ) : (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, marginBottom: 16 }}>Sign out of admin account?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowLogout(false)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={logout}>Sign Out</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
