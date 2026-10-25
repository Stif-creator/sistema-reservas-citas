export function getServiceProfessionals(service, professionals = []) {
  if (!service) return []
  const assignedIds = new Set((Array.isArray(service.professionalIds) ? service.professionalIds : [service.professionalIds])
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean))

  return professionals.filter(professional =>
    assignedIds.has(professional.id)
    || assignedIds.has(professional.userId)
    || (Array.isArray(professional.serviceIds) && professional.serviceIds.includes(service.id)))
}
