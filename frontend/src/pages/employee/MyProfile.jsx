import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function MyProfile() {
  const { user, logout } = useAuth()
  const [showConfirm, setShowConfirm] = useState(false)

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U'

  return (
    <div className="screen-content fade-in">
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
      </div>

      {/* Avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--accent-dim)', border: '2px solid var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 800, color: 'var(--accent)', letterSpacing: -2,
          marginBottom: 12
        }}>
          {initials}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{user?.name}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{user?.designation || 'Employee'}</p>
      </div>

      <div className="card">
        {[
          { label: 'Mobile', value: user?.phone },
          { label: 'Designation', value: user?.designation || '--' },
          { label: 'Department', value: user?.department_name || '--' },
          { label: 'Branch', value: user?.branch_name || '--' },
          { label: 'Role', value: user?.role === 'admin' ? 'Administrator' : 'Employee' },
        ].map(row => (
          <div key={row.label} className="info-row">
            <span className="info-label">{row.label}</span>
            <span className="info-value">{row.value}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40 }}>
        {!showConfirm ? (
          <button
            className="btn-ghost"
            onClick={() => setShowConfirm(true)}
            style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
          >
            Sign Out
          </button>
        ) : (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, marginBottom: 16 }}>Are you sure you want to sign out?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={logout}>Sign Out</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
