import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Award, CalendarDays, Clock3, Compass, Eye, Heart, HeartHandshake, Mail, MapPin, MessageCircle, Phone, Send, ShieldCheck, Sparkles, Target, UserRound } from 'lucide-react'
import { usePublicBusiness } from '../context/PublicBusinessContext'
import { useClientBusiness } from '../context/client-context'
import { safeImageUrl } from '../lib/brand'
import './business-info.css'
import './client-about.css'
import BusinessMap from '../components/BusinessMap'

export default function BusinessInfo({ contact = false }) {
  const publicContext = usePublicBusiness()
  const clientContext = useClientBusiness()
  const business = clientContext?.business || publicContext?.business
  const base = clientContext ? '/cliente' : publicContext?.base || ''
  const content = contact ? <Contact business={business} base={base} /> : <About business={business} base={base} clientMode={!!clientContext} professionals={clientContext?.professionals || []} />
  return clientContext ? content : <main id="contenido" tabIndex={-1}>{content}</main>
}

function About({ business, base, clientMode, professionals }) {
  if (clientMode) return <ClientAbout business={business} base={base} professionals={professionals} />
  const about = business?.about || {}
  const title = about.title?.trim() || 'Nosotros'
  const story = about.story?.trim()
  const mission = about.mission?.trim()
  const vision = about.vision?.trim()
  const values = String(about.values || '').split('\n').map(value => value.trim()).filter(Boolean)
  const description = business?.description?.trim()
  return <section className="public-container info-page">
    <div className="info-heading"><span className="eyebrow">NOSOTROS · {business?.name || 'Negocio'}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {(story || mission || vision || values.length > 0) ? <div className="info-grid">{story && <article className="info-card"><Heart className="info-icon" size={32} /><h2>Nuestra historia</h2><p className="info-copy">{story}</p></article>}
      <div className="info-stack">{mission && <article className="info-card info-highlight"><h2>Nuestra misión</h2><p className="info-copy">{mission}</p></article>}{vision && <article className="info-card"><h2>Nuestra visión</h2><p className="info-copy">{vision}</p></article>}{values.length > 0 && <article className="info-card"><h2>Nuestros valores</h2><ul className="info-values">{values.map((value, index) => <li key={index}>{value}</li>)}</ul></article>}</div></div> : <p className="info-copy">Este negocio aún no ha publicado información adicional.</p>}
    <div className="info-invitation"><div><h2>Tu próxima experiencia empieza con una conversación</h2><p>Cuéntanos qué necesitas. Estamos para orientarte.</p></div><Link className="public-button" to={`${base}/contacto`}>Contáctanos <ArrowRight size={18} /></Link></div>
  </section>
}

const valueIcons = [HeartHandshake, ShieldCheck, Clock3, Award, Sparkles]
const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function ClientAbout({ business, base, professionals }) {
  const about = business?.about || {}
  const title = about.title?.trim() || 'Nosotros'
  const description = business?.description?.trim()
  const story = about.story?.trim()
  const mission = about.mission?.trim()
  const vision = about.vision?.trim()
  const values = (about.values || '').split('\n').map(value => value.trim()).filter(Boolean)
  const cover = safeImageUrl(business?.cover?.url)
  const location = business?.location || {}
  const address = [location.addressLine, location.city, location.stateRegion, location.countryCode].filter(value => typeof value === 'string' && value.trim()).join(', ')
  const phone = business?.contact?.phone?.trim()
  const phoneHref = phone && /^[+\d][\d\s()-]{6,24}$/.test(phone) ? phone.replace(/[^\d+]/g, '') : ''
  const email = business?.contact?.email?.trim()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') ? email : ''
  const validCoordinates = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    && Math.abs(location.latitude) <= 85 && Math.abs(location.longitude) <= 180
  const mapUrl = validCoordinates
    ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}`
    : address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : ''
  const hours = weekDays.map((day, index) => ({
    day,
    ranges: (Array.isArray(business?.weeklyHours?.[String(index + 1)]) ? business.weeklyHours[String(index + 1)] : [])
      .filter(slot => slot && typeof slot.start === 'string' && typeof slot.end === 'string')
      .map(slot => `${slot.start}–${slot.end}`),
  })).filter(day => day.ranges.length)

  return <div className="client-about-page">
    <section className="client-about-hero">
      <div className="public-container client-about-hero-inner">
        <div className="client-about-hero-copy">
          <span className="client-about-kicker">NOSOTROS · {business?.name || 'CitasPro'}</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
          <div className="client-about-actions">
            <Link className="public-button" to={`${base}/servicios`}>Conoce nuestros servicios <ArrowRight size={17} /></Link>
            <Link className="public-button secondary" to={`${base}/contacto`}><Phone size={16} />Contáctanos</Link>
          </div>
        </div>
        <div className={`client-about-hero-image${cover ? ' has-image' : ''}`}>
          {cover ? <img src={cover} alt={`Imagen de ${business?.name || 'el negocio'}`} /> : <div className="client-about-art" aria-hidden="true"><span><Sparkles size={32} /></span><i /><i /><i /></div>}
          <div className="client-about-image-caption"><span className="client-about-icon"><Heart size={18} /></span><span>Un espacio para conocernos</span></div>
        </div>
      </div>
    </section>

    {story && <section className="public-container client-about-story">
      <div className={`client-about-story-image${cover ? ' has-image' : ''}`}>
        {cover ? <img src={cover} alt={`Espacio de ${business?.name || 'el negocio'}`} loading="lazy" /> : <div className="client-about-story-art" aria-hidden="true"><Compass size={48} /><span>{business?.name}</span></div>}
      </div>
      <article className="client-about-story-copy">
        <span className="client-about-section-kicker">CONÓCENOS</span>
        <h2>Nuestra historia</h2>
        <p>{story}</p>
      </article>
    </section>}

    {(mission || vision) && <section className="public-container client-about-purpose" aria-label="Nuestro propósito">
      {mission && <article className="client-about-mission">
        <span className="client-about-purpose-icon"><Target size={23} /></span>
        <div><span className="client-about-section-kicker">LO QUE NOS GUÍA</span><h2>Nuestra misión</h2><p>{mission}</p></div>
      </article>}
      {vision && <article className="client-about-vision">
        <span className="client-about-purpose-icon"><Eye size={23} aria-hidden="true" /></span>
        <div><span className="client-about-section-kicker">HACIA DÓNDE VAMOS</span><h2>Nuestra visión</h2><p>{vision}</p></div>
      </article>}
    </section>}
      {values.length > 0 && <section className="public-container client-about-values" aria-labelledby="client-about-values-title">
        <div className="client-about-section-heading"><span className="client-about-section-kicker">NUESTROS PRINCIPIOS</span><h2 id="client-about-values-title">Nuestros valores</h2></div>
        <div className="client-about-value-grid">{values.map((value, index) => {
          const Icon = valueIcons[index % valueIcons.length]
          return <article className="client-about-value-card" key={`${value}-${index}`}><span><Icon size={20} /></span><h3>{value}</h3></article>
        })}</div>
      </section>}

    {professionals.length > 0 && <section className="public-container client-about-team" aria-labelledby="client-about-team-title">
      <div className="client-about-section-heading"><span className="client-about-section-kicker">PERSONAS DETRÁS DEL SERVICIO</span><h2 id="client-about-team-title">Nuestro equipo</h2><p>Profesionales activos de {business?.name}.</p></div>
      <div className="client-about-team-grid">{professionals.slice(0, 3).map(professional => {
        const photo = safeImageUrl(professional.photoUrl)
        const initial = professional.displayName?.trim().charAt(0).toUpperCase() || 'P'
        return <article className="client-about-person-card" key={professional.id}>
          {photo ? <img src={photo} alt={`Fotografía de ${professional.displayName}`} loading="lazy" /> : <span className="client-about-person-avatar" aria-hidden="true">{initial}</span>}
          <div><h3>{professional.displayName}</h3>{professional.jobTitle && <p className="client-about-person-role">{professional.jobTitle}</p>}{professional.bio && <p className="client-about-person-bio">{professional.bio}</p>}</div>
        </article>
      })}</div>
      {professionals.length > 3 && <Link className="public-button secondary client-about-team-more" to={`${base}/profesionales`} aria-label="Ver todos los profesionales">Ver todos <ArrowRight size={16} /></Link>}
    </section>}

    {(address || mapUrl || phoneHref || validEmail || hours.length > 0) && <section className="public-container client-about-contact" aria-labelledby="client-about-contact-title">
      <div className="client-about-section-heading"><span className="client-about-section-kicker">ESTAMOS PARA AYUDARTE</span><h2 id="client-about-contact-title">Información de contacto</h2></div>
      <div className="client-about-contact-grid">
        {(address || mapUrl) && <article className="client-about-contact-card"><span><MapPin size={19} /></span><div><h3>Ubicación</h3>{address && <p>{address}</p>}{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer">Cómo llegar <ArrowRight size={15} /></a>}</div></article>}
        {hours.length > 0 && <article className="client-about-contact-card"><span><Clock3 size={19} /></span><div><h3>Horario de atención</h3><ul>{hours.map(item => <li key={item.day}><strong>{item.day}</strong><span>{item.ranges.join(', ')}</span></li>)}</ul></div></article>}
        {(phoneHref || validEmail) && <article className="client-about-contact-card"><span><Phone size={19} /></span><div><h3>Contáctanos</h3>{phoneHref && <a href={`tel:${phoneHref}`}><Phone size={15} />{phone}</a>}{validEmail && <a href={`mailto:${validEmail}`}><Mail size={15} />{validEmail}</a>}</div></article>}
      </div>
      <Link className="public-button client-about-contact-button" to={`${base}/contacto`}>Enviar un mensaje <ArrowRight size={16} /></Link>
    </section>}

    <section className="public-container client-about-cta">
      <span className="client-about-cta-icon" aria-hidden="true"><CalendarDays size={30} /></span>
      <div><h2>Tu próxima experiencia empieza con una conversación</h2><p>Cuéntanos qué necesitas. Estamos para orientarte.</p></div>
      <Link className="public-button" to={`${base}/contacto`}>Contáctanos <ArrowRight size={17} /></Link>
    </section>
  </div>
}

function Contact({ business, base }) {
  const [prepared, setPrepared] = useState(null)
  const [messageLength, setMessageLength] = useState(0)
  const email = business?.contact?.email?.trim()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') ? email : ''
  const whatsappNumber = business?.contact?.whatsapp?.replace(/\D/g, '')
  const whatsapp = whatsappNumber && /^\d{8,15}$/.test(whatsappNumber) ? whatsappNumber : ''
  const phone = business?.contact?.phone?.trim()
  const phoneHref = phone && /^[+\d][\d\s()-]{6,24}$/.test(phone) ? phone.replace(/[^\d+]/g, '') : ''
  const location = business?.location || {}
  const address = [location.addressLine, location.city, location.stateRegion, location.countryCode]
    .filter(value => typeof value === 'string' && value.trim()).join(', ')
  const validCoordinates = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
    && Math.abs(location.latitude) <= 85 && Math.abs(location.longitude) <= 180
  const hours = weekDays.map((day, index) => ({
    day,
    ranges: (Array.isArray(business?.weeklyHours?.[String(index + 1)]) ? business.weeklyHours[String(index + 1)] : [])
      .filter(slot => slot && typeof slot.start === 'string' && typeof slot.end === 'string')
      .map(slot => `${slot.start}–${slot.end}`),
  })).filter(day => day.ranges.length)
  const cover = safeImageUrl(business?.cover?.url)
  const canPrepare = Boolean(validEmail || (whatsapp && whatsapp.length >= 8))
  const reservationUrl = business ? `${base}/reservar` : '/#servicios'
  const details = [
    phoneHref && { title: 'Teléfono', Icon: Phone, value: phone, href: `tel:${phoneHref}`, note: 'Llámanos para más información.' },
    validEmail && { title: 'Correo electrónico', Icon: Mail, value: validEmail, href: `mailto:${validEmail}`, note: 'Te responderemos lo antes posible.' },
    (address || validCoordinates) && { title: 'Ubicación', Icon: MapPin, value: address || 'Ubicación configurada', href: validCoordinates ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}` : '', note: validCoordinates ? 'Consulta cómo llegar.' : '' },
    hours.length > 0 && { title: 'Horarios de atención', Icon: Clock3, hours },
  ].filter(Boolean)
  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const subject = String(data.get('subject')).trim()
    const body = `Nombre: ${String(data.get('name')).trim()}\nCorreo: ${String(data.get('email')).trim()}\nTeléfono: ${String(data.get('phone')).trim() || 'No indicado'}\n\n${String(data.get('message')).trim()}`
    setPrepared({ email: validEmail ? `mailto:${validEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '',
      whatsapp: whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`${subject}\n\n${body}`)}` : '' })
  }
  return <div className="contact-page">
    <section className="contact-hero">
      <div className="public-container contact-hero-inner">
        <div className="contact-hero-copy">
          <span className="contact-kicker">CONTACTO</span>
          <h1>Hablemos de tu próxima visita</h1>
          <p>Estamos aquí para responder tus consultas y ayudarte a reservar tu cita. Escríbenos o llámanos.</p>
          <div className="contact-hero-actions">
            <Link className="public-button" to={reservationUrl}><CalendarDays size={17} />Reservar una cita</Link>
            <button className="public-button secondary" type="button" onClick={() => document.getElementById('contact-form')?.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            })}><MessageCircle size={17} />Envíanos un mensaje</button>
          </div>
        </div>
        <div className={`contact-hero-visual${cover ? ' has-image' : ''}`}>
          {cover ? <img src={cover} alt={`Portada de ${business?.name || 'el negocio'}`} /> : <div className="contact-hero-art" aria-hidden="true"><span><MessageCircle size={34} /></span><i /><i /><i /></div>}
          {business?.name && <span className="contact-hero-caption">{business.name}</span>}
        </div>
      </div>
    </section>

    <div className="public-container contact-content">
      {!business && <div className="contact-empty"><h2>Elige un negocio para contactarlo</h2><p>Consulta los negocios disponibles y encuentra el servicio que buscas.</p><Link className="public-button" to="/#servicios">Ver negocios <ArrowRight size={16} /></Link></div>}
      {business && <>
        {details.length > 0 && <section className="contact-details-grid" aria-label="Información del negocio">
          {details.map(({ title, Icon, value, href, note, hours: dailyHours }) => <article className="contact-detail-card" key={title}>
            <span className="contact-detail-icon"><Icon size={21} aria-hidden="true" /></span>
            <div className="contact-detail-content"><h2>{title}</h2>
              {dailyHours ? <ul className="contact-hours">{dailyHours.map(item => <li key={item.day}><strong>{item.day}</strong><span>{item.ranges.join(', ')}</span></li>)}</ul>
                : <>{href ? <a href={href} target={href.startsWith('https:') ? '_blank' : undefined} rel={href.startsWith('https:') ? 'noreferrer' : undefined}>{value}</a> : <p>{value}</p>}{note && <p className="contact-detail-note">{note}</p>}</>}
            </div>
          </article>)}
        </section>}

        <section className={`contact-workspace${validCoordinates ? '' : ' without-map'}`}>
          <form id="contact-form" className="contact-form-card" onSubmit={submit} onChange={() => setPrepared(null)}>
            <div className="contact-card-heading"><span className="contact-detail-icon"><UserRound size={21} aria-hidden="true" /></span><div><h2>Envíanos un mensaje</h2><p>Cuéntanos cómo podemos ayudarte.</p></div></div>
            <div className="contact-form-grid">
              <label>Nombre completo <span aria-hidden="true">*</span><input name="name" autoComplete="name" placeholder="Tu nombre" required maxLength={120} /></label>
              <label>Correo electrónico <span aria-hidden="true">*</span><input name="email" type="email" autoComplete="email" placeholder="tu@email.com" required maxLength={254} /></label>
              <label>Teléfono (opcional)<input name="phone" type="tel" autoComplete="tel" placeholder="Tu número de teléfono" maxLength={30} /></label>
              <label>Asunto <span aria-hidden="true">*</span><input name="subject" placeholder="¿En qué podemos ayudarte?" required maxLength={120} /></label>
              <label className="contact-message-field">Mensaje <span aria-hidden="true">*</span><textarea name="message" rows={5} placeholder="Escribe tu mensaje aquí…" required maxLength={2000} onChange={event => setMessageLength(event.target.value.length)} /><span className="contact-character-count" aria-live="polite">{messageLength}/2000</span></label>
            </div>
            <p className="contact-form-note"><MessageCircle size={16} /><span>El mensaje se abrirá en tu aplicación de correo o WhatsApp. No se guarda en la plataforma.{whatsapp && <> <a className="contact-direct-whatsapp" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a></>}</span></p>
            {!canPrepare && <p className="contact-form-warning" role="status">Este negocio aún no configuró un correo o WhatsApp para recibir mensajes.</p>}
            <button className="public-button contact-submit" disabled={!canPrepare}><Send size={16} />Preparar mensaje</button>
            {prepared && <div className="info-prepared contact-prepared" role="status"><p>Mensaje preparado. Elige dónde quieres abrirlo:</p><div className="info-channels">{prepared.email && <a className="public-button secondary" href={prepared.email}><Mail size={16} />Abrir correo</a>}{prepared.whatsapp && <a className="public-button secondary" href={prepared.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={16} />Abrir WhatsApp</a>}</div></div>}
          </form>
          <section className="contact-map-card" aria-labelledby="contact-map-title">
            <div className="contact-card-heading"><span className="contact-detail-icon"><MapPin size={21} aria-hidden="true" /></span><div><h2 id="contact-map-title">Encuéntranos</h2><p>{address || 'La dirección todavía no está configurada.'}</p></div></div>
            {validCoordinates ? <BusinessMap business={business} compact /> : <div className="contact-map-empty"><MapPin size={25} /><p>{address ? 'El negocio no ha configurado coordenadas para mostrar un mapa.' : 'No hay una ubicación configurada para mostrar.'}</p></div>}
            {validCoordinates && <p className="contact-map-attribution">Mapa © OpenStreetMap contributors</p>}
          </section>
        </section>

        <section className="contact-cta">
          <span className="contact-cta-icon"><CalendarDays size={25} aria-hidden="true" /></span>
          <div><h2>Tu próxima visita comienza aquí</h2><p>Reserva tu cita cuando te venga mejor.</p></div>
          <Link className="public-button" to={reservationUrl}>Reservar ahora <ArrowRight size={17} /></Link>
        </section>
      </>}
    </div>
  </div>
}
