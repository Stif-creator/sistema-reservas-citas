import { ArrowLeft, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useClientBusiness } from '../../context/client-context'
import { safeImageUrl } from '../../lib/brand'
import '../../pages/client-about.css'

export default function ClientProfessionals() {
  const { business, professionals, communityLoading, communityError, reloadCommunity } = useClientBusiness()

  return <div className="client-about-page client-professional-directory">
    <section className="public-container client-professional-directory-content" aria-labelledby="client-professionals-title">
      <Link className="public-button secondary client-professional-back" to="/cliente/nosotros"><ArrowLeft size={16} /> Volver a Nosotros</Link>
      <div className="client-about-section-heading">
        <span className="client-about-section-kicker">PERSONAS DETRÁS DEL SERVICIO</span>
        <h1 id="client-professionals-title">Nuestro equipo</h1>
        <p>Conoce a los profesionales de {business?.name || 'este negocio'}.</p>
      </div>

      {communityLoading ? <p role="status" className="client-professional-state">Cargando profesionales…</p>
        : communityError ? <div className="public-alert" role="alert">No pudimos cargar los profesionales. <button type="button" onClick={reloadCommunity}>Reintentar</button></div>
          : professionals.length > 0 ? <div className="client-about-team-grid" aria-label="Todos los profesionales">
            {professionals.map(professional => {
              const photo = safeImageUrl(professional.photoUrl)
              const name = professional.displayName?.trim() || 'Profesional'
              return <article className="client-about-person-card client-about-person-detail" key={professional.id}>
                {photo ? <img src={photo} alt={`Fotografía de ${name}`} loading="lazy" /> : <span className="client-about-person-avatar" aria-hidden="true"><UserRound size={24} /></span>}
                <div>
                  <h2>{name}</h2>
                  {professional.jobTitle && <p className="client-about-person-role">{professional.jobTitle}</p>}
                  {professional.bio && <p className="client-about-person-bio">{professional.bio}</p>}
                </div>
              </article>
            })}
          </div>
            : <p className="client-professional-state">No hay profesionales disponibles para mostrar.</p>}
    </section>
  </div>
}
