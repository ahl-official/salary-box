import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { api } from '../../utils/api'
import { distanceFromOffice, isMockGeolocation, isWithinGeofence } from '../../utils/geo'
import { formatLocalTime, hoursBetween, nowIST, todayIST } from '../../utils/datetime'
import { overtimeHours, shiftDurationHours } from '../../utils/shift'
import { latePolicyLabel, lateStatusLabel } from '../../utils/late'
import { format } from 'date-fns'

const DEFAULT_OFFICE = { lat: 19.06996, lng: 72.83748 }

function applyPosition(pos, setLocation, setLocError, setLocLoading) {
  if (isMockGeolocation(pos)) {
    setLocation(null)
    setLocError('Mock/fake GPS detected. Disable mock location apps to punch in.')
    setLocLoading(false)
    return null
  }
  const loc = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    isMock: false,
  }
  setLocation(loc)
  setLocError(null)
  setLocLoading(false)
  return loc
}

export default function MarkAttendance() {
  const { user } = useAuth()
  const toast = useToast()
  const [location, setLocation] = useState(null)
  const [locError, setLocError] = useState(null)
  const [locLoading, setLocLoading] = useState(true)
  const [todayStatus, setTodayStatus] = useState(null)
  const [punching, setPunching] = useState(false)
  const [todayNote, setTodayNote] = useState(null)
  const [settings, setSettings] = useState(null)
  const [now, setNow] = useState(() => nowIST())
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const userMarkerRef = useRef(null)
  const officeMarkerRef = useRef(null)
  const accuracyCircleRef = useRef(null)
  const radiusCircleRef = useRef(null)
  const watchIdRef = useRef(null)
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname)

  const loadTodayStatus = useCallback(async () => {
    try {
      const data = await api.todayStatus()
      setTodayStatus(data)
    } catch (e) {}
  }, [])

  const loadNote = useCallback(async () => {
    try {
      const note = await api.getTodayNote()
      setTodayNote(note)
    } catch (e) {}
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.getMyBranchSettings()
      setSettings(s)
    } catch (e) {}
  }, [])

  useEffect(() => {
    loadTodayStatus()
    loadNote()
    loadSettings()
  }, [loadTodayStatus, loadNote, loadSettings])

  useEffect(() => {
    const timer = setInterval(() => setNow(nowIST()), 1000)
    return () => clearInterval(timer)
  }, [])

  const updateMapLayers = useCallback((loc) => {
    const map = mapInstanceRef.current
    const L = window.L
    if (!map || !L || !loc) return

    const userLatLng = [loc.lat, loc.lng]
    map.setView(userLatLng, Math.max(map.getZoom(), 16))

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userLatLng)
    }

    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove()
    }
    if (loc.accuracy && loc.accuracy > 0) {
      accuracyCircleRef.current = L.circle(userLatLng, {
        radius: loc.accuracy,
        color: '#4DA3FF',
        fillColor: '#4DA3FF',
        fillOpacity: 0.12,
        weight: 1,
      }).addTo(map)
    }
  }, [])

  const startLocationWatch = useCallback(() => {
    setLocLoading(true)
    setLocError(null)
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported')
      setLocLoading(false)
      return
    }
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = applyPosition(pos, setLocation, setLocError, setLocLoading)
        if (loc) updateMapLayers(loc)
      },
      (err) => {
        setLocError(
          err.code === 1
            ? 'Location permission denied. Allow location access in browser settings.'
            : 'Could not get location. Move outdoors or refresh and try again.'
        )
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }, [updateMapLayers])

  const getLocation = useCallback(() => {
    setLocLoading(true)
    setLocError(null)
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported')
      setLocLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = applyPosition(pos, setLocation, setLocError, setLocLoading)
        if (loc) updateMapLayers(loc)
      },
      (err) => {
        setLocError(
          err.code === 1
            ? 'Location permission denied. Allow location access in browser settings.'
            : 'Could not get location. Move outdoors or refresh and try again.'
        )
        setLocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }, [updateMapLayers])

  const useOfficeLocation = useCallback(() => {
    if (!settings) return
    const loc = {
      lat: Number(settings.office_lat),
      lng: Number(settings.office_lng),
      accuracy: 1,
      isMock: false,
      isTestLocation: true,
    }
    setLocation(loc)
    setLocError(null)
    setLocLoading(false)
    updateMapLayers(loc)
    toast('Using office location for local testing', 'info')
  }, [settings, toast, updateMapLayers])

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const loadLeaflet = () => {
      if (window.L) return Promise.resolve(window.L)
      return new Promise((resolve) => {
        const script = document.createElement('script')
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = () => resolve(window.L)
        document.head.appendChild(script)
      })
    }

    let cancelled = false

    loadLeaflet().then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return

      const center = [DEFAULT_OFFICE.lat, DEFAULT_OFFICE.lng]
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: true,
        touchZoom: true,
      }).setView(center, 15)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const userIcon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#00C896;border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,200,150,0.25),0 2px 8px rgba(0,0,0,0.4)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })

      const officeIcon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:3px;background:#FFB020;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })

      userMarkerRef.current = L.marker(center, { icon: userIcon }).addTo(map)
      officeMarkerRef.current = L.marker(center, { icon: officeIcon }).addTo(map)
      mapInstanceRef.current = map

      startLocationWatch()
    })

    return () => {
      cancelled = true
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        userMarkerRef.current = null
        officeMarkerRef.current = null
        accuracyCircleRef.current = null
        radiusCircleRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!settings || !mapInstanceRef.current) return
    const L = window.L
    if (!L) return

    const officeLatLng = [Number(settings.office_lat), Number(settings.office_lng)]
    if (officeMarkerRef.current) {
      officeMarkerRef.current.setLatLng(officeLatLng)
    }

    if (radiusCircleRef.current) {
      radiusCircleRef.current.remove()
    }
    radiusCircleRef.current = L.circle(officeLatLng, {
      radius: Number(settings.radius_meters) || 100,
      color: '#00C896',
      fillColor: '#00C896',
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: '4 4',
    }).addTo(mapInstanceRef.current)

    if (!location) {
      mapInstanceRef.current.setView(officeLatLng, 16)
    }
  }, [settings, location])

  useEffect(() => {
    if (location) updateMapLayers(location)
  }, [location, updateMapLayers])

  const handlePunch = async () => {
    if (!location) {
      toast('Location not available. Refresh and try again.', 'error')
      return
    }
    if (location.isMock) {
      toast('Mock/fake GPS detected. Punch rejected.', 'error', 6000)
      return
    }
    if (settings && !isWithinGeofence(location.lat, location.lng, settings)) {
      const distance = Math.round(distanceFromOffice(location.lat, location.lng, settings))
      const radius = Number(settings.radius_meters) || 100
      toast(`Outside office radius. You are ${distance}m away (allowed: ${radius}m).`, 'error', 6000)
      return
    }
    setPunching(true)
    try {
      const punchType = todayStatus?.punched_in ? 'out' : 'in'
      const res = await api.punch({
        punch_type: punchType,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        is_mock: location.isMock === true,
      })
      toast(`Punched ${punchType === 'in' ? 'in' : 'out'} successfully!`, 'success')
      if (res?.late?.message) {
        toast(res.late.message, res.late.half_day_deduction ? 'error' : 'info', 8000)
      }
      await loadTodayStatus()
    } catch (err) {
      toast(err.message, 'error', 6000)
    } finally {
      setPunching(false)
    }
  }

  const punchedIn = todayStatus?.punched_in
  const punchInTime = todayStatus?.punch_in?.timestamp
  const punchOutTime = todayStatus?.punch_out?.timestamp

  const hoursWorkedNum = punchInTime && punchOutTime ? hoursBetween(punchInTime, punchOutTime) : null
  const hoursWorked = hoursWorkedNum != null ? hoursWorkedNum.toFixed(1) : null
  const overtime = hoursWorkedNum != null ? overtimeHours(hoursWorkedNum, settings) : 0
  const shiftHrs = shiftDurationHours(settings)

  const radius = settings ? Number(settings.radius_meters) || 100 : 100
  const distance = location && settings
    ? distanceFromOffice(location.lat, location.lng, settings)
    : null
  const withinGeofence = location && settings
    ? isWithinGeofence(location.lat, location.lng, settings)
    : false
  const canPunch = location && !location.isMock && withinGeofence

  return (
    <div className="screen-content fade-in">
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
          {format(now, 'EEEE, d MMMM yyyy')} · {format(now, 'hh:mm:ss a')} IST
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginTop: 4 }}>
          {settings?.company_name || 'Company'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
          {user?.name}
          {settings?.branch_name && (
            <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 600 }}>· {settings.branch_name}</span>
          )}
        </p>
        {settings && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{latePolicyLabel(settings)}</p>
        )}
      </div>

      <div className="map-wrapper mb-16">
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
        {locLoading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10,10,10,0.7)', borderRadius: 'var(--radius)', zIndex: 1000
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Getting GPS location...</p>
            </div>
          </div>
        )}
        {locError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(10,10,10,0.9)', borderRadius: 'var(--radius)', zIndex: 1000, padding: 16
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 8 }}>{locError}</p>
            {isLocalhost && settings && (
              <button
                onClick={useOfficeLocation}
                style={{
                  marginTop: 12,
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: 'var(--accent-dim)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                Use Office Location (dev only)
              </button>
            )}
          </div>
        )}
        <button
          onClick={getLocation}
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 1000,
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>

      {location && settings && !locLoading && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          borderRadius: 10,
          background: withinGeofence ? 'rgba(0,200,150,0.08)' : 'rgba(255,68,68,0.08)',
          border: `1px solid ${withinGeofence ? 'rgba(0,200,150,0.25)' : 'rgba(255,68,68,0.25)'}`,
        }}>
          <p style={{
            fontSize: 13,
            fontWeight: 600,
            color: withinGeofence ? 'var(--accent)' : 'var(--accent-red)',
          }}>
            {withinGeofence
              ? `✓ Within office zone (${Math.round(distance)}m / ${radius}m)`
              : `✕ Outside office zone — ${Math.round(distance)}m away (max ${radius}m)`}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            You: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            {location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : ''}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Office: {Number(settings.office_lat).toFixed(5)}, {Number(settings.office_lng).toFixed(5)}
          </p>
        </div>
      )}

      {(punchInTime || punchOutTime) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{
            flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, textAlign: 'center'
          }}>
            <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Punch In</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{formatLocalTime(punchInTime)}</p>
          </div>
          <div style={{
            flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, textAlign: 'center'
          }}>
            <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Punch Out</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: punchOutTime ? 'var(--accent-red)' : 'var(--text-muted)' }}>
              {formatLocalTime(punchOutTime)}
            </p>
          </div>
          {hoursWorked && (
            <div style={{
              flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, textAlign: 'center'
            }}>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hours</p>
              <p style={{ fontSize: 16, fontWeight: 700 }}>{hoursWorked}h</p>
            </div>
          )}
          {overtime > 0 && (
            <div style={{
              flex: 1, background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.25)', borderRadius: 10, padding: 12, textAlign: 'center'
            }}>
              <p style={{ fontSize: 10, color: '#FFA500', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Overtime</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#FFA500' }}>{overtime.toFixed(1)}h</p>
            </div>
          )}
        </div>
      )}

      {todayStatus?.late?.is_late && (
        <div className="card mb-16" style={{
          padding: 12,
          borderColor: todayStatus.late.half_day_deduction ? 'var(--accent-red)' : '#FFA500',
          background: todayStatus.late.half_day_deduction ? 'rgba(255,68,68,0.08)' : 'rgba(255,165,0,0.08)',
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: todayStatus.late.half_day_deduction ? 'var(--accent-red)' : '#FFA500' }}>
            {lateStatusLabel(todayStatus.late)}
          </p>
          {todayStatus.late.message && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{todayStatus.late.message}</p>
          )}
        </div>
      )}

      {!punchOutTime && (
        <button
          className={`btn ${punchedIn ? 'btn-danger' : 'btn-primary'}`}
          onClick={handlePunch}
          disabled={punching || locLoading || !canPunch}
          style={{ marginBottom: 16, height: 60, fontSize: 17, borderRadius: 14, letterSpacing: 0.3, opacity: canPunch ? 1 : 0.5 }}
        >
          {punching ? (
            <div className="spinner" style={{ borderTopColor: punchedIn ? '#fff' : '#000', borderColor: punchedIn ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }} />
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {punchedIn
                  ? <><rect x="3" y="3" width="18" height="18" rx="2"/></>
                  : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>
                }
              </svg>
              {punchedIn ? 'Punch Out' : 'Punch In'}
            </>
          )}
        </button>
      )}

      {punchOutTime && (
        <div style={{
          background: 'rgba(0,200,150,0.08)', border: '1px solid rgba(0,200,150,0.2)',
          borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16
        }}>
          <p style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 15 }}>✓ Attendance marked for today</p>
          {hoursWorked && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{hoursWorked}h worked ({shiftHrs}h shift)</p>}
          {overtime > 0 && <p style={{ color: '#FFA500', fontSize: 13, marginTop: 4, fontWeight: 600 }}>+{overtime.toFixed(1)}h overtime</p>}
        </div>
      )}

      {todayNote && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 14, marginBottom: 8
        }}>
          <p style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
            📌 Today's Note
          </p>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{todayNote.content}</p>
        </div>
      )}
    </div>
  )
}
