export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dphi = ((lat2 - lat1) * Math.PI) / 180
  const dlambda = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function distanceFromOffice(lat, lng, settings) {
  if (!settings?.office_lat || !settings?.office_lng) return null
  return haversine(
    lat,
    lng,
    Number(settings.office_lat),
    Number(settings.office_lng)
  )
}

export function isWithinGeofence(lat, lng, settings) {
  const distance = distanceFromOffice(lat, lng, settings)
  if (distance === null) return false
  const radius = Number(settings.radius_meters) || 100
  return distance <= radius
}

export function isMockGeolocation(position) {
  return position?.mocked === true
}
