import { useEffect, useState } from 'react'
import { and, collection, doc, onSnapshot, or, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/auth-context'
import { availableSlots } from '../lib/availability'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Field from '../components/ui/Field'
import { fieldControlClasses } from '../components/ui/fieldStyles'
import Alert from '../components/ui/Alert'
import useProfessionalProfile from '../hooks/useProfessionalProfile'

export default function Availability() {
  const { membership, currentUser } = useAuth()
  const own = useProfessionalProfile(membership.businessId, currentUser.uid, membership.role === 'professional')
  if (own.loading) return <p>Cargando perfil profesional…</p>
  if (own.error) return <Alert tone="error">{own.error}</Alert>
  return <AvailabilityView key={`${membership.businessId}-${membership.role}-${currentUser.uid}-${own.profile?.id}`} membership={membership} ownId={own.profile?.id} />
}

function AvailabilityView({ membership, ownId }) {
  const businessId = membership.businessId
  const isAdmin = membership.role === 'admin'
  const [data, setData] = useState({})
  const [errors, setErrors] = useState({})
  const [professionalId, setProfessionalId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const sources = {
      business: doc(db, 'businesses', businessId),
      professionals: isAdmin ? query(collection(db, 'professionals'), where('businessId', '==', businessId)) : doc(db, 'professionals', ownId),
      services: query(collection(db, 'services'), where('businessId', '==', businessId)),
      blocks: query(collection(db, 'scheduleBlocks'), isAdmin ? where('businessId', '==', businessId) :
        and(where('businessId', '==', businessId), or(where('allProfessionals', '==', true), where('professionalId', '==', ownId)))),
      reservations: query(collection(db, 'reservations'), isAdmin ? where('businessId', '==', businessId) :
        and(where('businessId', '==', businessId), where('professionalUserId', '==', membership.userId))),
    }
    const stops = Object.entries(sources).map(([key, source]) => onSnapshot(source, (snapshot) => {
      const value = snapshot.docs ? snapshot.docs.map((item) => ({ ...item.data(), id: item.id })) :
        snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null
      setData((previous) => ({ ...previous, [key]: key === 'professionals' && !isAdmin ? (value ? [value] : []) : value }))
      setErrors((previous) => ({ ...previous, [key]: '' }))
    }, () => setErrors((previous) => ({ ...previous, [key]: 'No se pudo cargar la disponibilidad. Recarga la página.' }))))
    return () => stops.forEach((stop) => stop())
  }, [businessId, isAdmin, ownId, membership.userId])
  const error = Object.values(errors).find(Boolean)
  const loaded = ['business', 'professionals', 'services', 'blocks', 'reservations'].every((key) => key in data)
  const professionals = (data.professionals || []).filter((item) => item.isActive)
  const professional = professionals.find((item) => item.id === (isAdmin ? professionalId : ownId))
  const services = (data.services || []).filter((item) => item.isActive && professional?.serviceIds?.includes(item.id))
  const service = services.find((item) => item.id === serviceId)
  const slots = loaded && !error && professional && service && date ? availableSlots({ business: data.business, professional, service, date, blocks: data.blocks, reservations: data.reservations, now }) : []
  return <div className="space-y-6">
    <PageHeader title="Disponibilidad" description="Consulta las franjas libres de reservas y bloqueos." />
    {error && <Alert tone="error">{error}</Alert>}
    {!loaded && !error && <p>Cargando disponibilidad…</p>}
    {loaded && !error && <Card title="Consultar horarios">
      <p className="mb-4 text-sm text-muted">Zona horaria: {data.business?.settings?.timezone || 'America/La_Paz'}. Se respetan los horarios del negocio y del profesional, la duración del servicio y sus márgenes.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {isAdmin && <Field label="Profesional" htmlFor="availability-professional">
          <select id="availability-professional" value={professionalId} className={fieldControlClasses(false)}
            onChange={(e) => { setProfessionalId(e.target.value); setServiceId('') }}>
            <option value="">Selecciona un profesional</option>
            {professionals.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </select>
        </Field>}
        <Field label="Servicio" htmlFor="availability-service">
          <select id="availability-service" value={serviceId} disabled={!professional} className={fieldControlClasses(false)} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">Selecciona un servicio</option>
            {services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha" htmlFor="availability-date">
          <input id="availability-date" type="date" value={date} className={fieldControlClasses(false)} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {professional && services.length === 0 && <p className="mt-4 text-sm">Este profesional no tiene servicios activos asignados.</p>}
      <div className="mt-6" aria-live="polite">
        {professional && service && date && (slots.length ? <>
          <h3 className="mb-3 font-semibold">Horarios disponibles</h3>
          <ul aria-label="Horarios disponibles" className="flex flex-wrap gap-2">
            {slots.map((slot) => <li key={slot.start} className="rounded-lg border border-border px-4 py-2">{slot.label}</li>)}
          </ul>
        </> : <p>No hay horarios disponibles para esta selección. Revisa los horarios de atención, la vigencia y los bloqueos.</p>)}
      </div>
    </Card>}
  </div>
}
