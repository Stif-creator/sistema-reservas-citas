import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Mail, MapPin, Phone, ArrowRight } from 'lucide-react'
import { usePublicBusiness } from '../context/PublicBusinessContext'
import { useClientBusiness } from '../context/client-context'
import { defaultAbout } from '../lib/businessAbout'
import './business-info.css'

export default function BusinessInfo({ contact = false }) {
  const publicContext = usePublicBusiness()
  const clientContext = useClientBusiness()
  const business = clientContext?.business || publicContext?.business
  const base = clientContext ? '/cliente' : publicContext?.base || ''
  const content = contact ? <Contact business={business} /> : <About business={business} base={base} />
  return clientContext ? content : <main id="contenido" tabIndex={-1}>{content}</main>
}

function About({ business, base }) {
  const about = Object.fromEntries(Object.entries(defaultAbout).map(([key, fallback]) => [key, business?.about?.[key]?.trim() || fallback]))
  return <section className="public-container info-page">
    <div className="info-heading"><span className="eyebrow">NOSOTROS · {business?.name || 'CitasPro'}</span><h1>{about.title}</h1><p>Conoce lo que nos inspira y cómo queremos acompañarte.</p></div>
    <div className="info-grid"><article className="info-card"><Heart className="info-icon" size={32} /><h2>Nuestra historia</h2><p className="info-copy">{about.story}</p></article>
      <div className="info-stack"><article className="info-card info-highlight"><h2>Nuestra misión</h2><p className="info-copy">{about.mission}</p></article><article className="info-card"><h2>Nuestros valores</h2><ul className="info-values">{about.values.split('\n').filter(value => value.trim()).map((value, index) => <li key={index}>{value}</li>)}</ul></article></div></div>
    <div className="info-invitation"><div><h2>Tu próxima experiencia empieza con una conversación</h2><p>Cuéntanos qué necesitas. Estamos para orientarte.</p></div><Link className="public-button" to={`${base}/contacto`}>Contáctanos <ArrowRight size={18} /></Link></div>
  </section>
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
        <p>Para reservar una cita, utiliza la opción de reservas de tu cuenta.</p>
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
