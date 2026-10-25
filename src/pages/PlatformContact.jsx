import { Link } from 'react-router-dom'
import { ArrowRight, Building2, CircleHelp, Store } from 'lucide-react'
import usePageMetadata from '../hooks/usePageMetadata'
import './platform-site.css'

export default function PlatformContact() {
  usePageMetadata('Contacto | CitasPro', 'Encuentra orientación sobre CitasPro y cómo contactar a los negocios publicados.')
  return <main id="contenido" className="platform-page platform-contact-page" tabIndex={-1}>
    <section className="platform-container platform-contact-hero"><span className="platform-eyebrow">CONTACTO</span><h1>¿Necesitas ayuda?<br /><span>Estamos aquí para orientarte.</span></h1><p>Encuentra información sobre CitasPro o contacta con el negocio relacionado con tu consulta.</p></section>
    <section className="platform-container platform-contact-grid">
      <article className="platform-contact-card"><span className="platform-contact-icon"><CircleHelp size={23} /></span><span className="platform-eyebrow">SOPORTE DE CITASPRO</span><h2>Ayuda sobre la plataforma</h2><p>En este momento CitasPro no tiene un canal institucional de soporte publicado. No enviaremos tu consulta a un formulario que no procese mensajes.</p><p>Si tienes una duda sobre cómo usar CitasPro, revisa la información de la plataforma.</p><Link className="platform-text-link" to="/nosotros">Conocer CitasPro <ArrowRight size={16} /></Link></article>
      <article className="platform-contact-card platform-business-contact-card"><span className="platform-contact-icon"><Building2 size={23} /></span><span className="platform-eyebrow">CONTACTO CON NEGOCIOS</span><h2>¿Tu consulta es sobre una cita o servicio?</h2><p>Cada negocio administra sus propios datos de contacto y horarios. Abre su página pública para ver los canales disponibles.</p><Link className="platform-button" to="/negocios"><Store size={17} />Explorar negocios <ArrowRight size={16} /></Link></article>
    </section>
    <section className="platform-container platform-contact-note"><p>Los datos de contacto que aparecen en la página de un negocio son configurados por ese negocio. CitasPro no los sustituye ni los modifica.</p></section>
  </main>
}
