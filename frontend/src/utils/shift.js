export const DEFAULT_WORKING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const JS_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function parseWorkingDays(settings) {
  if (!settings) return DEFAULT_WORKING_DAYS
  const raw = settings.working_days
  if (Array.isArray(raw)) return raw.length ? raw : DEFAULT_WORKING_DAYS
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_WORKING_DAYS
    } catch {
      return DEFAULT_WORKING_DAYS
    }
  }
  return DEFAULT_WORKING_DAYS
}

export function shiftDurationHours(settings) {
  if (!settings) return 9
  if (settings.standard_shift_hours != null && settings.standard_shift_hours !== '') {
    const explicit = Number(settings.standard_shift_hours)
    if (!Number.isNaN(explicit)) return explicit
  }
  const [sh, sm] = String(settings.shift_start || '09:00').split(':').map(Number)
  const [eh, em] = String(settings.shift_end || '18:00').split(':').map(Number)
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60)
}

export function isWorkingDay(date, settings) {
  const name = JS_DAY_NAMES[date.getDay()]
  return parseWorkingDays(settings).includes(name)
}

export function isWeekOff(date, settings) {
  return !isWorkingDay(date, settings)
}

export function overtimeHours(hoursWorked, settings) {
  if (hoursWorked == null || Number.isNaN(hoursWorked)) return 0
  const standard = shiftDurationHours(settings)
  return Math.max(0, Math.round((hoursWorked - standard) * 100) / 100)
}

export function regularHours(hoursWorked, settings) {
  if (hoursWorked == null || Number.isNaN(hoursWorked)) return 0
  const standard = shiftDurationHours(settings)
  return Math.round(Math.min(hoursWorked, standard) * 100) / 100
}
