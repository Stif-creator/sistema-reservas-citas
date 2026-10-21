import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Award, CalendarDays, Clock3, Compass, Eye, Heart, HeartHandshake, Mail, MapPin, Phone, ShieldCheck, Sparkles, Target } from 'lucide-react'
import { usePublicBusiness } from '../context/PublicBusinessContext'
import { useClientBusiness } from '../context/client-context'
import { defaultAbout } from '../lib/businessAbout'
import { safeImageUrl } from '../lib/brand'
import './business-info.css'
import './client-about.css'
import BusinessMap from '../components/BusinessMap'

export default function BusinessInfo({ contact = false }) {
  const publicContext = usePublicBusiness()
  const clientContext = useClientBusiness()
  const business = clientContext?.business || publicContext?.business
  const base = clientContext ? '/cliente' : publicContext?.base || ''
  const content = contact ? <Contact business={business} /> : <About business={business} base={base} clientMode={!!clientContext} professionals={clientContext?.professionals || []} />
  return clientContext ? content : <main id="contenido" tabIndex={-1}>{content}</main>
}

function About({ business, base, clientMode, professionals }) {
  if (clientMode) return <ClientAbout business={business} base={base} professionals={professionals} />
  const about = Object.fromEntries(Object.entries(defaultAbout).map(([key, fallback]) => [key, business?.about?.[key]?.trim() || fallback]))
  return <section className="public-container info-page">
    <div className="info-heading"><span className="eyebrow">NOSOTROS · {business?.name || 'CitasPro'}</span><h1>{about.title}</h1><p>Conoce lo que nos inspira y cómo queremos acompañarte.</p></div>
    <div className="info-grid"><article className="info-card"><Heart className="info-icon" size={32} /><h2>Nuestra historia</h2><p className="info-copy">{about.story}</p></article>
      <div className="info-stack"><article className="info-card info-highlight"><h2>Nuestra misión</h2><p className="info-copy">{about.mission}</p></article><article className="info-card"><h2>Nuestros valores</h2><ul className="info-values">{about.values.split('\n').filter(value => value.trim()).map((value, index) => <li key={index}>{value}</li>)}</ul></article></div></div>
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

    {professionals.length > 0 && <section className="public-container client-about-team">
      <div className="client-about-section-heading"><span className="client-about-section-kicker">PERSONAS DETRÁS DEL SERVICIO</span><h2>Nuestro equipo</h2><p>Profesionales activos de {business?.name}.</p></div>
      <div className="client-about-team-grid">{professionals.map(professional => {
        const photo = safeImageUrl(professional.photoUrl)
        const initial = professional.displayName?.trim().charAt(0).toUpperCase() || 'P'
        return <article className="client-about-person-card" key={professional.id}>
          {photo ? <img src={photo} alt={`Fotografía de ${professional.displayName}`} loading="lazy" /> : <span className="client-about-person-avatar" aria-hidden="true">{initial}</span>}
          <div><h3>{professional.displayName}</h3>{professional.jobTitle && <p className="client-about-person-role">{professional.jobTitle}</p>}{professional.bio && <p className="client-about-person-bio">{professional.bio}</p>}</div>
        </article>
      })}</div>
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

function Contact({ business }) {
  const [prepared, setPrepared] = useState(null)
  const email = business?.contact?.email?.trim()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') ? email : ''
  const whatsapp = business?.contact?.whatsapp?.replace(/\D/g, '')
  const phone = business?.contact?.phone?.replace(/[^+\d]/g, '')
  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const subject = String(data.get('subject')).trim()
    const body = `Nombre: ${String(data.get('name')).trim()}\nCorreo: ${String(data.get('email')).trim()}\nTeléfono: ${String(data.get('phone')).trim() || 'No indicado'}\n\n${String(data.get('message')).trim()}`
    setPrepared({ email: validEmail ? `mailto:${validEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '',
      whatsapp: whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`${subject}\n\n${body}`)}` : '' })
  }
  return <section className="public-container info-page">
    <div className="info-heading"><span className="eyebrow">CONTACTO</span><h1>Hablemos de tu próxima visita</h1><p>¿Tienes alguna consulta? Cuéntanos cómo podemos ayudarte.</p></div>
    {!business ? <div className="info-card"><p>Selecciona un negocio para contactar directamente con su equipo.</p><Link className="public-button" to="/#servicios">Ver negocios</Link></div> : <div className="info-grid">
      <aside className="info-card info-contact-details"><h2>{business.name}</h2><p>Estos son nuestros canales de contacto.</p>
        {phone && <a href={`tel:${phone}`}><Phone size={20} />{business.contact.phone}</a>}
        {validEmail && <a href={`mailto:${validEmail}`}><Mail size={20} />{validEmail}</a>}
        {business.location?.addressLine && <p><MapPin size={20} />{business.location.addressLine} {business.location.city}</p>}
        {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Abrir WhatsApp <ArrowRight size={16} /></a>}
        <BusinessMap business={business} />
      </aside>
      <form className="info-card info-form" onSubmit={submit} onChange={() => setPrepared(null)}>
        <h2>Escríbenos</h2>
        <label>Nombre completo<input name="name" autoComplete="name" required maxLength={120} /></label>
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Teléfono (opcional)<input name="phone" type="tel" autoComplete="tel" maxLength={30} /></label>
        <label>Asunto<input name="subject" required maxLength={120} /></label>
        <label>Mensaje<textarea name="message" rows={5} required maxLength={2000} /></label>
        <p className="info-help">Prepara tu mensaje y completa el envío en tu aplicación de correo o WhatsApp. Este formulario no guarda mensajes en la plataforma.</p>
        {!validEmail && !whatsapp && <p role="status">El negocio todavía no ha configurado un correo o WhatsApp para recibir mensajes.</p>}
        <button className="public-button" disabled={!validEmail && !whatsapp}>Preparar mensaje <ArrowRight size={18} /></button>
        {prepared && <div className="info-prepared" role="status"><p>Mensaje preparado. Elige dónde enviarlo:</p><div className="info-channels">{prepared.email && <a className="public-button secondary" href={prepared.email}>Abrir correo</a>}{prepared.whatsapp && <a className="public-button secondary" href={prepared.whatsapp} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}</div></div>}
      </form>
    </div>}
  </section>
}
