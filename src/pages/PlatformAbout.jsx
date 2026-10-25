import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck2, HeartHandshake, ShieldCheck, Sparkles, Target, UsersRound, Eye, Clock3, Accessibility, Compass, RefreshCw, Store } from 'lucide-react'
import usePageMetadata from '../hooks/usePageMetadata'
import './platform-site.css'

const values = [
  [ShieldCheck, 'Confianza', 'Información clara para tomar decisiones con tranquilidad.'],
  [Accessibility, 'Accesibilidad', 'Una experiencia sencilla para diferentes personas y negocios.'],
  [Compass, 'Organización', 'Herramientas para ordenar servicios, horarios y reservas.'],
  [Clock3, 'Respeto por el tiempo', 'Facilitamos la consulta y gestión de citas.'],
  [HeartHandshake, 'Claridad', 'Cada negocio define cómo atiende y confirma sus reservas.'],
  [RefreshCw, 'Mejora continua', 'Trabajamos para que gestionar una cita sea cada vez más simple.'],
]

export default function PlatformAbout() {
  usePageMetadata('Nosotros | CitasPro', 'Conoce CitasPro, una plataforma que conecta personas con negocios y ayuda a organizar reservas.')
  return <main id="contenido" className="platform-page platform-about" tabIndex={-1}>
    <section className="platform-container platform-about-hero"><div><span className="platform-eyebrow">SOBRE CITASPRO</span><h1>Tu tiempo,<br /><span>nuestra prioridad.</span></h1><p>CitasPro facilita la conexión entre personas y negocios, ayudando a encontrar servicios y organizar reservas en un solo lugar.</p><Link className="platform-button" to="/negocios">Explorar negocios <ArrowRight size={17} /></Link></div><div className="platform-about-visual" aria-label="Herramientas para organizar citas"><span className="about-visual-glow" /><div className="about-visual-card"><span className="platform-calendar-icon"><CalendarCheck2 size={30} /></span><small>UNA PLATAFORMA PARA</small><strong>personas y negocios</strong><div className="about-visual-row"><span><UsersRound size={18} /> Personas</span><span><Store size={18} /> Negocios</span></div><div className="about-visual-line"><i /><i /><i /></div></div><span className="about-floating-icon about-icon-one"><Target size={22} /></span><span className="about-floating-icon about-icon-two"><Sparkles size={22} /></span></div></section>
    <section className="platform-container platform-about-intro"><div className="platform-about-section-title"><span className="platform-eyebrow">QUÉ ES CITASPRO</span><h2>Un solo lugar para descubrir y organizar servicios</h2></div><p>CitasPro es una plataforma de gestión y reservas adaptable a distintos tipos de negocios. Las personas pueden explorar páginas públicas, conocer servicios y consultar sus citas; los negocios pueden administrar su catálogo, equipo, disponibilidad y reservas según las herramientas disponibles en la plataforma.</p></section>
    <section className="platform-container platform-purpose-grid"><article className="platform-purpose-card purpose-mission"><span><Target size={24} /></span><div><span className="platform-eyebrow">NUESTRA MISIÓN</span><h2>Hacer más fácil organizar tus citas</h2><p>Facilitar el acceso a servicios y la gestión de citas mediante una experiencia clara, sencilla y accesible.</p></div></article><article className="platform-purpose-card purpose-vision"><span><Eye size={24} /></span><div><span className="platform-eyebrow">NUESTRA VISIÓN</span><h2>Conectar personas y negocios</h2><p>Ofrecer una plataforma adaptable que conecte personas con negocios de diferentes sectores.</p></div></article></section>
    <section className="platform-container platform-section platform-values-section"><div className="platform-section-heading"><span className="platform-eyebrow">NUESTROS PRINCIPIOS</span><h2>Valores que guían la experiencia</h2><p>Una plataforma clara, útil y respetuosa para quienes reservan y quienes ofrecen servicios.</p></div><div className="platform-values-grid">{values.map(([Icon, title, description]) => <article className="platform-value-card" key={title}><span><Icon size={20} /></span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="platform-container platform-audience-grid"><article><span><UsersRound size={22} /></span><h2>Para clientes</h2><p>Explora negocios, consulta servicios y gestiona tus reservas desde tu cuenta.</p><Link to="/negocios">Buscar negocios <ArrowRight size={15} /></Link></article><article><span><Store size={22} /></span><h2>Para negocios</h2><p>Administra servicios, profesionales, disponibilidad y citas desde el panel.</p><Link to="/crear-negocio">Conocer CitasPro <ArrowRight size={15} /></Link></article></section>
    <section className="platform-container platform-bottom-cta"><div><span className="platform-eyebrow">EMPIEZA CUANDO QUIERAS</span><h2>Encuentra el servicio que buscas</h2><p>Explora los negocios que publican sus servicios en CitasPro.</p></div><Link className="platform-button" to="/negocios">Explorar negocios <ArrowRight size={17} /></Link></section>
  </main>
}

