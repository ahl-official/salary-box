import React, { useState } from 'react'
import MarkAttendance from './MarkAttendance'
import MyAttendance from './MyAttendance'
import MyProfile from './MyProfile'

const TABS = [
  { id: 'mark', label: 'Attendance', icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2"/>
      <path d="M9 9h.01M15 9h.01"/>
      {active && <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3"/>}
    </svg>
  )},
  { id: 'history', label: 'My Record', icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      {active && <rect x="7" y="14" width="3" height="3" rx="0.5" fill="currentColor"/>}
    </svg>
  )},
  { id: 'profile', label: 'Profile', icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0}/>
    </svg>
  )},
]

export default function EmployeeApp() {
  const [tab, setTab] = useState('mark')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="screen">
        {tab === 'mark' && <MarkAttendance />}
        {tab === 'history' && <MyAttendance />}
        {tab === 'profile' && <MyProfile onLogout={() => {}} />}
      </div>

      <nav className="bottom-nav">
        {TABS.map(t => (
          <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon(tab === t.id)}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
