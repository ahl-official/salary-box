import { format } from 'date-fns'

export const APP_TIMEZONE = 'Asia/Kolkata'
const IST_OFFSET = '+05:30'

/**
 * Parse API timestamps. Naive values are IST wall-clock; offset values are converted to instant.
 */
export function parseTimestamp(iso) {
  if (!iso) return null
  const s = String(iso).trim()
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(`${s}${IST_OFFSET}`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Wall-clock parts in IST for a given instant. */
export function getISTParts(date) {
  if (!date || Number.isNaN(date.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Date object whose local getters match IST wall clock (for date-fns format). */
export function toISTDate(date) {
  const p = getISTParts(date)
  if (!p) return null
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

export function nowIST() {
  return toISTDate(new Date())
}

export function todayIST() {
  const p = getISTParts(new Date())
  if (!p) return ''
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function monthIST() {
  const p = getISTParts(new Date())
  if (!p) return ''
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

export function formatLocalTime(iso, pattern = 'hh:mm a') {
  const date = toISTDate(parseTimestamp(iso))
  if (!date) return '--'
  return format(date, pattern)
}

export function formatLocalDate(iso, pattern = 'EEEE, d MMMM yyyy') {
  const date = toISTDate(parseTimestamp(iso))
  if (!date) return '--'
  return format(date, pattern)
}

export function localDateKey(iso) {
  const p = getISTParts(parseTimestamp(iso))
  if (!p) return ''
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function hoursBetween(startIso, endIso) {
  const start = parseTimestamp(startIso)
  const end = parseTimestamp(endIso)
  if (!start || !end) return null
  return (end.getTime() - start.getTime()) / 3600000
}

export function isTodayIST(date) {
  const p = getISTParts(date instanceof Date ? date : parseTimestamp(date))
  if (!p) return false
  const t = getISTParts(new Date())
  return p.year === t.year && p.month === t.month && p.day === t.day
}
