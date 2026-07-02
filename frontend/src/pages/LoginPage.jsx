import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const toast = useToast()

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (!phone || phone.length < 10) {
      toast('Enter a valid mobile number', 'error')
      return
    }
    setLoading(true)
    try {
      await login(phone.trim())
    } catch (err) {
      toast(err.message || 'Number not registered', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      paddingTop: 'calc(env(safe-area-inset-top) + 32px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)',
    }}>
      {/* Logo mark */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 18,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
        boxShadow: '0 0 40px rgba(0,200,150,0.25)'
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8, color: 'var(--text)' }}>
        Attendance
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 40, textAlign: 'center' }}>
        Sign in with your registered mobile number
      </p>

      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="input-group">
          <label className="input-label">Mobile Number</label>
          <input
            className="input-field"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter 10-digit number"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoFocus
            style={{ fontSize: 18, letterSpacing: 1, textAlign: 'center' }}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleLogin}
          disabled={loading || phone.length < 10}
          style={{ marginTop: 8, height: 56, fontSize: 16, borderRadius: 14 }}
        >
          {loading ? (
            <div className="spinner" style={{ borderTopColor: '#000', borderColor: 'rgba(0,0,0,0.3)' }} />
          ) : 'Sign In'}
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 'auto', paddingTop: 40, textAlign: 'center' }}>
        Admin: 9000000000 · Back Office: 9111111111 · Salon: 9222222222
      </p>
    </div>
  )
}
