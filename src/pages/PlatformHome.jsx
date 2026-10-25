import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { ArrowRight, CalendarCheck2, CalendarDays, Clock3, Compass, Search, ShieldCheck, Store, UsersRound } from 'lucide-react'
import { db } from '../firebase/config'
import { safeImageUrl } from '../lib/brand'
import usePageMetadata from '../hooks/usePageMetadata'
import './platform-site.css'

export default function PlatformHome() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  usePageMetadata('Inicio | CitasPro', 'Explora negocios, descubre sus servicios y organiza tus próximas citas con CitasPro.')

  useEffect(() => {
    let active = true
    getDocs(query(collection(db, 'businesses'), where('status', '==', 'active'), where('settings.publicPageEnabled', '==', true), limit(3)))
      .then(snapshot => { if (active) { setBusinesses(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))); setLoading(false) } })
      .catch(() => { if (active) { setError('No pudimos cargar los negocios publicados.'); setLoading(false) } })
    return () => { active = false }
  }, [])

  function submitSearch(event) {
    event.preventDefault()
    const term = search.trim()
    navigate(term ? `/negocios?q=${encodeURIComponent(term)}` : '/negocios')
  }

  return <main className="platform-page" id="contenido" tabIndex={-1}>
    <section className="platform-hero">
      <div className="platform-container platform-hero-grid">
        <div className="platform-hero-copy">
          <span className="platform-eyebrow"><span />BIENVENIDO A CITASPRO</span>
          <h1>Encuentra y reserva servicios <span>cerca de ti.</span></h1>
          <p>Explora negocios, descubre sus servicios y organiza tus próximas citas de forma sencilla.</p>
          <form className="platform-search" role="search" onSubmit={submitSearch}>
            <Search size={19} aria-hidden="true" />
            <label className="sr-only" htmlFor="platform-home-search">Buscar negocios</label>
            <input id="platform-home-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar negocios o servicios…" />
            <button type="submit">Buscar</button>
          </form>
          <div className="platform-hero-actions">
            <Link className="platform-button" to="/negocios">Explorar negocios <ArrowRight size={17} /></Link>
            <a className="platform-button secondary" href="#como-funciona">Cómo funciona</a>
          </div>
        </div>
        <div className="platform-hero-art" aria-label="Ilustración de una reserva organizada">
          <div className="platform-orbit orbit-one" /><div className="platform-orbit orbit-two" />
          <div className="platform-calendar-card"><span className="platform-calendar-icon"><CalendarCheck2 size={28} /></span><small>ORGANIZA TU TIEMPO</small><strong>Tu próxima cita está más cerca.</strong><div className="platform-calendar-grid">{Array.from({ length: 14 }, (_, index) => <i className={index === 9 ? 'selected' : ''} key={index}>{index + 1}</i>)}</div><span className="platform-calendar-confirm"><span /> Reserva lista para consultar</span></div>
          <div className="platform-float-card float-top"><Clock3 size={19} /><span><strong>Tu horario</strong><small>Elige el que te convenga</small></span></div>
          <div className="platform-float-card float-bottom"><Store size={19} /><span><strong>Negocios locales</strong><small>Descubre opciones cerca</small></span></div>
        </div>
      </div>
    </section>

    <section className="platform-benefits" aria-label="Beneficios de CitasPro"><div className="platform-container platform-benefit-grid">
      {[[Compass, 'Explora negocios', 'Encuentra opciones para lo que necesitas.'], [CalendarDays, 'Consulta servicios', 'Revisa la información disponible antes de reservar.'], [Clock3, 'Encuentra horarios', 'Consulta la disponibilidad de cada negocio.'], [ShieldCheck, 'Gestiona tus citas', 'Revisa tus reservas desde tu cuenta.']].map(([Icon, title, copy]) => <article className="platform-benefit" key={title}><span><Icon size={23} /></span><div><h2>{title}</h2><p>{copy}</p></div></article>)}
    </div></section>

    <section className="platform-container platform-section" id="como-funciona">
      <div className="platform-section-heading"><span className="platform-eyebrow">SENCILLO Y CLARO</span><h2>Cómo funciona</h2><p>Desde encontrar un servicio hasta revisar el estado de tu cita.</p></div>
      <div className="platform-steps">{[[Search, 'Encuentra un negocio', 'Explora negocios publicados y consulta sus servicios.'], [CalendarDays, 'Elige servicio y horario', 'Revisa las opciones de atención disponibles.'], [UsersRound, 'Solicita o confirma tu cita', 'Cada negocio gestiona las reservas según sus propias reglas.']].map(([Icon, title, copy], index) => <article className="platform-step" key={title}><span className="platform-step-number">0{index + 1}</span><span className="platform-step-icon"><Icon size={22} /></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="platform-container platform-section platform-discovery">
      <div className="platform-section-heading"><span className="platform-eyebrow">EMPIEZA A EXPLORAR</span><h2>Negocios disponibles</h2><p>Conoce algunos de los negocios que tienen su página pública activa.</p></div>
      {loading ? <p role="status" className="platform-state">Cargando negocios…</p> : error ? <p role="alert" className="platform-state">{error}</p> : businesses.length ? <div className="platform-business-grid">{businesses.map(business => <PlatformBusinessCard key={business.id} business={business} />)}</div> : <p className="platform-state">Todavía no hay negocios publicados.</p>}
      <div className="platform-centered-action"><Link className="platform-button secondary" to="/negocios">Ver todos los negocios <ArrowRight size={17} /></Link></div>
    </section>
  </main>
}

export function PlatformBusinessCard({ business }) {
  const cover = safeImageUrl(business.cover?.url)
  const logo = safeImageUrl(business.logo?.url)
  const activity = [business.category, business.activity, business.businessType].find(value => typeof value === 'string' && value.trim())
  const location = [business.location?.city, business.location?.countryCode].filter(value => typeof value === 'string' && value.trim()).join(', ')
  return <article className="platform-business-card"><Link className="platform-business-cover" to={`/b/${encodeURIComponent(business.id)}`} tabIndex={-1} aria-hidden="true">{cover ? <img src={cover} alt="" loading="lazy" /> : <span><Store size={34} /></span>}</Link><div className="platform-business-body"><div className="platform-business-brand">{logo ? <img src={logo} alt="" loading="lazy" /> : <span aria-hidden="true">{business.name?.trim().charAt(0).toUpperCase() || 'N'}</span>}<div>{activity && <span className="platform-category">{activity}</span>}<h3>{business.name || 'Negocio'}</h3></div></div>{location && <p className="platform-business-location"><Compass size={15} />{location}</p>}<p className="platform-business-description">{business.description?.trim() || 'Consulta los servicios disponibles en la página de este negocio.'}</p><Link className="platform-business-link" to={`/b/${encodeURIComponent(business.id)}`}>Ver negocio <ArrowRight size={16} /></Link></div></article>
}
