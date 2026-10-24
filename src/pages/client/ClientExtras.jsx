import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, CalendarDays, Check, Clock3, Heart, ListChecks, Search, Sparkles,
  Trash2, UserRound, Users, Wallet,
} from 'lucide-react'
import DataList from '../../components/ui/DataList'
import { useClientBusiness } from '../../context/client-context'
import { bookingBounds, dateError } from '../../lib/clientBooking'
import { bookingRequest, bookingEnabled } from '../../lib/bookingApi'
import { formatPrice } from '../../lib/clientPresentation'
import { safeImageUrl } from '../../lib/brand'
import { addDays } from '../../lib/calendarDates'
import '../../components/booking/booking.css'
import './client-extras.css'

const serviceSearch = service => `${service.name} ${service.description || ''}`
const professionalSearch = professional => `${professional.displayName} ${professional.jobTitle || ''} ${professional.bio || ''}`

export default function ClientExtras() {
  const {
    business, services, categories, professionals, catalogLoading, catalogError,
    favorites, waiting, favoriteReady, favoriteError, favoriteBusy, toggleFavorite,
    reloadFavorites, communityLoading, communityError, reloadCommunity,
  } = useClientBusiness()
  const [waitingBusy, setWaitingBusy] = useState(false)
  const [waitingError, setWaitingError] = useState('')
  const [waitingMessage, setWaitingMessage] = useState('')
  const favoriteServices = favorites.filter(item => item.kind === 'service')
  const favoriteProfessionals = favorites.filter(item => item.kind === 'professional')
  const loadError = favoriteError || communityError || catalogError

  async function submitWait(values) {
    setWaitingBusy(true)
    setWaitingError('')
    setWaitingMessage('')
    try {
      await bookingRequest({ action: 'wait', businessId: business.id, ...values })
      setWaitingMessage('Tu interés quedó registrado. Esto no confirma ni reserva una cita.')
      reloadFavorites()
      return true
    } catch (error) {
      setWaitingError(error.message || 'No pudimos registrar tu interés. Inténtalo de nuevo.')
      return false
    } finally {
      setWaitingBusy(false)
    }
  }

  async function removeWait(item) {
    setWaitingBusy(true)
    setWaitingError('')
    setWaitingMessage('')
    try {
      await bookingRequest({ action: 'unwait', businessId: business.id, serviceId: item.serviceId, professionalId: item.professionalId, date: item.date })
      setWaitingMessage('Se retiró tu solicitud de la lista de espera.')
      reloadFavorites()
    } catch (error) {
      setWaitingError(error.message || 'No pudimos retirar tu solicitud. Inténtalo de nuevo.')
    } finally {
      setWaitingBusy(false)
    }
  }

  return <section className="public-container client-section client-extras-page">
    <header className="client-extras-hero">
      <div>
        <span className="client-overline">TU CUENTA</span>
        <h1>Favoritos y lista de espera</h1>
        <p>Guarda tus servicios y profesionales preferidos y registra tu interés cuando no haya disponibilidad.</p>
      </div>
      <span className="client-extras-hero-art" aria-hidden="true"><Heart size={30} /></span>
    </header>

    {loadError && <div className="client-extras-alert" role="alert">
      <p>No pudimos cargar tus preferencias o el catálogo. {loadError}</p>
      <button type="button" onClick={() => { reloadFavorites(); reloadCommunity() }}>Reintentar</button>
    </div>}
    {!favoriteReady && !favoriteError && <p className="client-extras-loading" role="status">Cargando tus preferencias…</p>}

    <section className="client-extras-stats" aria-label="Resumen de favoritos y lista de espera">
      <SummaryCard icon={Heart} title="Servicios favoritos" value={favoriteServices.length} detail="Servicios guardados" />
      <SummaryCard icon={UserRound} title="Profesionales favoritos" value={favoriteProfessionals.length} detail="Profesionales guardados" />
      <SummaryCard icon={CalendarDays} title="Solicitudes en espera" value={waiting.length} detail="Intereses registrados" />
    </section>

    <section className="client-extras-panel">
      <SectionHeading kicker="GUARDADOS PARA TI" title="Mis favoritos" description="Tus servicios y profesionales preferidos." />
      <div className="client-extras-favorite-columns">
        <div className="client-extras-subsection">
          <h3>Mis servicios favoritos <span>({favoriteServices.length})</span></h3>
          <DataList label="Servicios favoritos" items={favoriteServices} searchText={favoriteSearchText}>
            {rows => rows.length ? <div className="client-extras-card-list">{rows.map(favorite => {
              const service = services.find(item => item.id === favorite.targetId)
              return <ServiceFavoriteCard key={favorite.id || favorite.targetId} favorite={favorite} service={service}
                category={categories.find(item => item.id === service?.categoryId)?.name}
                currency={service?.currencyCode || business?.settings?.currencyCode}
                busy={favoriteBusy} onRemove={() => toggleFavorite(service || { id: favorite.targetId }, 'service')} />
            })}</div> : <EmptyState icon={Heart} title="Aún no tienes servicios favoritos" text="Guarda un servicio desde aquí o desde el catálogo." />}
          </DataList>
        </div>
        <div className="client-extras-subsection">
          <h3>Mis profesionales favoritos <span>({favoriteProfessionals.length})</span></h3>
          <DataList label="Profesionales favoritos" items={favoriteProfessionals} searchText={favoriteSearchText}>
            {rows => rows.length ? <div className="client-extras-professional-list">{rows.map(favorite => {
              const professional = professionals.find(item => item.id === favorite.targetId)
              return <ProfessionalFavoriteCard key={favorite.id || favorite.targetId} favorite={favorite} professional={professional}
                busy={favoriteBusy} onRemove={() => toggleFavorite(professional || { id: favorite.targetId }, 'professional')} />
            })}</div> : <EmptyState icon={Users} title="Aún no tienes profesionales favoritos" text="Guarda profesionales disponibles para encontrarlos fácilmente." />}
          </DataList>
        </div>
      </div>
    </section>

    <section className="client-extras-panel">
      <SectionHeading kicker="DESCUBRE EL CATÁLOGO" title="Elegir favoritos" description="Explora los servicios y profesionales disponibles en este negocio." />
      {catalogLoading && <p className="client-extras-loading" role="status">Cargando servicios y profesionales…</p>}
      {communityLoading && !communityError && <p className="client-extras-loading" role="status">Cargando profesionales…</p>}
      <div className="client-extras-discover-columns">
        <div className="client-extras-subsection">
          <h3>Servicios <span>({services.length})</span></h3>
          <DataList label="Servicios" items={services} searchText={serviceSearch}>
            {rows => rows.length ? <div className="client-extras-discover-grid">{rows.map(service => <DiscoverServiceCard key={service.id} service={service}
              category={categories.find(item => item.id === service.categoryId)?.name}
              selected={favoriteServices.some(item => item.targetId === service.id)} disabled={favoriteBusy || !favoriteReady}
              onToggle={() => toggleFavorite(service, 'service')} />)}</div>
              : <EmptyState icon={Search} title="No hay servicios para mostrar" text="Prueba con otra búsqueda o vuelve a consultar más tarde." />}
          </DataList>
        </div>
        <div className="client-extras-subsection">
          <h3>Profesionales <span>({professionals.length})</span></h3>
          <DataList label="Profesionales" items={professionals} searchText={professionalSearch}>
            {rows => rows.length ? <div className="client-extras-discover-grid">{rows.map(professional => <DiscoverProfessionalCard key={professional.id}
              professional={professional} selected={favoriteProfessionals.some(item => item.targetId === professional.id)}
              disabled={favoriteBusy || !favoriteReady} onToggle={() => toggleFavorite(professional, 'professional')} />)}</div>
              : <EmptyState icon={Users} title="No hay profesionales disponibles" text="Cuando el negocio tenga profesionales activos, aparecerán aquí." />}
          </DataList>
        </div>
      </div>
    </section>

    <section className="client-extras-panel client-extras-waiting">
      <SectionHeading kicker="CUANDO NO ENCUENTRAS HORARIO" title="Lista de espera" description="Registra tu interés para una fecha. Esto no confirma ni reserva una cita." />
      <div className="client-extras-waiting-columns">
        <WaitForm services={services} professionals={professionals} settings={business?.settings || {}}
          disabled={waitingBusy || catalogLoading || !!communityError} busy={waitingBusy}
          error={waitingError} success={waitingMessage} onSubmit={submitWait} />
        <div className="client-extras-subsection client-extras-requests">
          <h3>Mis solicitudes en espera <span>({waiting.length})</span></h3>
          {waiting.length ? <DataList label="Solicitudes en espera" items={waiting} searchText={item => `${item.serviceName} ${item.professionalName} ${item.date}`}>
            {rows => <div className="client-extras-request-list">{rows.map(item => <WaitCard key={item.id} item={item} busy={waitingBusy} onRemove={() => removeWait(item)} />)}</div>}
          </DataList> : <EmptyState icon={ListChecks} title="Aún no tienes solicitudes en espera" text="Registra una fecha de interés si no encuentras disponibilidad." />}
        </div>
      </div>
    </section>
  </section>
}

function SummaryCard({ icon: Icon, title, value, detail }) {
  return <article className="client-extras-summary">
    <span><Icon size={20} aria-hidden="true" /></span>
    <div><h2>{title}</h2><strong>{value}</strong><small>{detail}</small></div>
    <ArrowRight size={17} aria-hidden="true" />
  </article>
}

function SectionHeading({ kicker, title, description }) {
  return <header className="client-extras-heading">
    <span>{kicker}</span><h2>{title}</h2>{description && <p>{description}</p>}
  </header>
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="client-extras-empty"><span><Icon size={21} aria-hidden="true" /></span><h4>{title}</h4><p>{text}</p></div>
}

function FavoriteAction({ selected, disabled, name, onClick }) {
  return <button type="button" className={`client-extras-heart${selected ? ' selected' : ''}`}
    aria-label={`${selected ? 'Quitar de' : 'Agregar a'} favoritos: ${name}`} aria-pressed={selected} disabled={disabled} onClick={onClick}>
    <Heart size={17} fill={selected ? 'currentColor' : 'none'} />
  </button>
}

function ServiceFavoriteCard({ favorite, service, category, currency, busy, onRemove }) {
  if (!service) return <article className="client-extras-service-card client-extras-stale">
    <div className="client-extras-service-copy"><span className="client-extras-badge">Ya no disponible</span><h4>{favorite.name || 'Servicio'}</h4><p>Este servicio ya no está en el catálogo público. Puedes quitarlo de tus favoritos.</p>
      <button type="button" className="client-extras-remove" disabled={busy} onClick={onRemove}><Trash2 size={15} />Quitar</button></div>
  </article>
  const image = safeImageUrl(service.image?.url)
  return <article className="client-extras-service-card">
    <Link className="client-extras-service-image" to={`/cliente/servicios/${encodeURIComponent(service.id)}`} aria-label={`Ver detalle de ${service.name}`}>
      {image ? <img src={image} alt="" loading="lazy" /> : <Sparkles size={26} aria-hidden="true" />}
      {category && <span>{category}</span>}
    </Link>
    <div className="client-extras-service-copy">
      <FavoriteAction selected disabled={busy} name={service.name} onClick={onRemove} />
      <h4><Link to={`/cliente/servicios/${encodeURIComponent(service.id)}`}>{service.name}</Link></h4>
      {service.description && <p>{service.description}</p>}
      <div className="client-extras-service-meta"><span><Clock3 size={14} />{service.durationMinutes} min</span><strong><Wallet size={14} />{formatPrice(service.price, currency)}</strong></div>
      <div className="client-extras-actions">
        {bookingEnabled && <Link className="public-button" to={`/cliente/reservar?servicio=${encodeURIComponent(service.id)}`}><CalendarDays size={15} />Reservar</Link>}
        <Link className="public-button secondary" to={`/cliente/servicios/${encodeURIComponent(service.id)}`}>Ver detalle</Link>
      </div>
    </div>
  </article>
}

function ProfessionalFavoriteCard({ favorite, professional, busy, onRemove }) {
  const name = professional?.displayName || favorite.name || 'Profesional'
  const photo = safeImageUrl(professional?.photoUrl)
  return <article className="client-extras-professional-card">
    {photo ? <img src={photo} alt={`Fotografía de ${name}`} loading="lazy" /> : <span className="client-extras-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || <UserRound size={20} />}</span>}
    <div><h4>{name}</h4>{professional?.jobTitle && <p>{professional.jobTitle}</p>}{!professional && <small>Perfil no disponible actualmente</small>}</div>
    <button type="button" className="client-extras-heart selected" aria-label={`Quitar de favoritos: ${name}`} disabled={busy} onClick={onRemove}><Heart size={17} fill="currentColor" /></button>
  </article>
}

function DiscoverServiceCard({ service, category, selected, disabled, onToggle }) {
  const image = safeImageUrl(service.image?.url)
  return <article className="client-extras-discover-card">
    {image ? <img src={image} alt="" loading="lazy" /> : <span className="client-extras-discover-icon"><Sparkles size={18} aria-hidden="true" /></span>}
    <div><h4>{service.name}</h4>{category && <p>{category}</p>}</div>
    <FavoriteAction selected={selected} disabled={disabled} name={service.name} onClick={onToggle} />
  </article>
}

function DiscoverProfessionalCard({ professional, selected, disabled, onToggle }) {
  const name = professional.displayName || 'Profesional'
  const photo = safeImageUrl(professional.photoUrl)
  return <article className="client-extras-discover-card">
    {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="client-extras-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || <UserRound size={18} />}</span>}
    <div><h4>{name}</h4>{professional.jobTitle && <p>{professional.jobTitle}</p>}</div>
    <FavoriteAction selected={selected} disabled={disabled} name={name} onClick={onToggle} />
  </article>
}

function WaitForm({ services, professionals, settings, disabled, busy, error, success, onSubmit }) {
  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [date, setDate] = useState('')
  const [dateIssue, setDateIssue] = useState('')
  const { today, maxDate } = bookingBounds(settings)
  const minDate = addDays(today, 1)
  const availableProfessionals = professionals.filter(professional => professional.serviceIds?.includes(serviceId))

  async function submit(event) {
    event.preventDefault()
    const issue = dateError(date, minDate, maxDate)
    setDateIssue(issue)
    if (issue || !serviceId) return
    if (await onSubmit({ serviceId, professionalId: professionalId === 'none' ? null : professionalId, date })) {
      setServiceId('')
      setProfessionalId('')
      setDate('')
    }
  }

  return <form className="client-extras-wait-form" onSubmit={submit}>
    <div className="client-extras-subsection-heading"><span className="client-extras-form-icon"><CalendarDays size={19} /></span><div><h3>Registrar interés</h3><p>Indica una fecha que te interesaría; no reserva una cita.</p></div></div>
    <label>Servicio<select required value={serviceId} onChange={event => { setServiceId(event.target.value); setProfessionalId('') }} disabled={disabled || !services.length}>
      <option value="">Seleccionar servicio</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
    </select></label>
    <label>Profesional<select required value={professionalId} onChange={event => setProfessionalId(event.target.value)} disabled={disabled || !serviceId || !availableProfessionals.length}>
      <option value="">Seleccionar profesional</option><option value="none">Sin preferencia</option>{availableProfessionals.map(professional => <option key={professional.id} value={professional.id}>{professional.displayName}</option>)}
    </select></label>
    {serviceId && !availableProfessionals.length && <p className="client-extras-field-help">No hay profesionales activos asociados a este servicio.</p>}
    <label>Fecha de interés<input type="date" required min={minDate} max={maxDate} value={date} disabled={disabled} aria-describedby="client-extras-date-help" onChange={event => { setDate(event.target.value); setDateIssue('') }} /></label>
    <p className={`client-extras-field-help${dateIssue ? ' error' : ''}`} id="client-extras-date-help" role={dateIssue ? 'alert' : undefined}>
      {dateIssue || `Elige una fecha futura hasta el ${maxDate.split('-').reverse().join('/')}.`}
    </p>
    {error && <p className="client-extras-inline-error" role="alert">{error}</p>}
    {success && <p className="client-extras-inline-success" role="status"><Check size={15} />{success}</p>}
    <button type="submit" className="public-button" disabled={disabled || busy || !services.length || !professionals.length}>
      <CalendarDays size={16} />{busy ? 'Registrando…' : 'Registrar interés'}
    </button>
  </form>
}

function WaitCard({ item, busy, onRemove }) {
  const createdAt = Number.isFinite(Number(item.createdAt)) ? new Date(Number(item.createdAt)) : null
  const createdDate = createdAt && !Number.isNaN(createdAt.getTime())
    ? new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(createdAt)
    : ''
  return <article className="client-extras-request-card">
    <span className="client-extras-request-icon"><CalendarDays size={18} /></span>
    <div className="client-extras-request-copy">
      <h4>{item.serviceName}</h4><p>{item.professionalName} · {item.date}</p>
      {createdDate && <small>Registrada el {createdDate}</small>}
    </div>
    <button type="button" className="client-extras-remove" disabled={busy} onClick={onRemove}><Trash2 size={15} />Retirar</button>
  </article>
}

function favoriteSearchText(item) {
  return `${item.name || ''} ${item.kind || ''} ${item.displayName || ''} ${item.jobTitle || ''}`
}
