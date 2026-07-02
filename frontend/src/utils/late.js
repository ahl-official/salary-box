export function latePolicyLabel(settings) {
  const type = settings?.late_policy_type || 'office'
  if (type === 'salon') {
    return 'Salon: zero tolerance — any lateness = half-day'
  }
  const grace = settings?.late_grace_minutes ?? 15
  const allowance = settings?.late_monthly_allowance ?? 6
  return `Office: ${grace}min grace · ${allowance} late days/month forgiven`
}

export function lateStatusColor(late) {
  if (!late?.is_late) return null
  if (late.half_day_deduction) return '#FF4444'
  if (late.forgiven) return '#FFA500'
  return '#FFA500'
}

export function lateStatusLabel(late) {
  if (!late?.is_late) return null
  if (late.half_day_deduction) return `Late ${late.late_minutes}m · Half-day`
  if (late.forgiven) return `Late ${late.late_minutes}m · Forgiven (${late.late_day_number})`
  return `Late ${late.late_minutes}m`
}
