import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Heart,
  MapPin,
  Phone,
  Sparkles,
  Users,
  Store,
} from 'lucide-react'
import { db } from '../firebase/config'
import { Brand, usePublicBusiness } from '../components/public/PublicLayout'
import { safeImageUrl } from '../lib/brand'

export default function Home() {
  const { business, businessId, base } = usePublicBusiness()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    const request = businessId
      ? query(
          collection(db, 'services'),
          where('businessId', '==', businessId),
          where('isActive', '==', true),
          where('isPublic', '==', true)
        )
      : query(
          collection(db, 'businesses'),
          where('status', '==', 'active'),
          where('settings.publicPageEnabled', '==', true)
        )
    getDocs(request)
      .then((snap) => {
        if (active) {
          setItems(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
          setError('')
        }
      })
      .catch(() => {
        if (active) setError('No pudimos cargar el catálogo. Intenta recargar la página.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [businessId])
  const cover = safeImageUrl(business?.cover?.url)
  const phone = business?.contact?.phone?.replace(/[^+\d]/g, '')
  return (
    <>
      <header className="public-header">
        <div className="public-container header-inner">
          <Brand />
          <nav aria-label="Navegación principal">
            <a href="#inicio">Inicio</a>
            <a href="#servicios">{business ? 'Servicios' : 'Negocios'}</a>
            <a href="#nosotros">Nosotros</a>
            {business && <a href="#contacto">Contacto</a>}
          </nav>
          <div className="header-actions">
            <Link className="public-button secondary" to={`${base}/login`}>
              Iniciar sesión
            </Link>
            <Link className="public-button" to={`${base}/registro`}>
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>
      <main>
        <section className="public-hero" id="inicio">
          <div className="public-container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">BIENVENIDO A {business?.name || 'CITASPRO'}</span>
              <h1>
                Tu próximo momento,
                <br />
                <span>más cerca de ti.</span>
              </h1>
              <p>
                {business?.description ||
                  'Descubre servicios, encuentra tu negocio favorito y dedica más tiempo a lo que realmente importa.'}
              </p>
              <div className="hero-actions">
                <a className="public-button" href="#servicios">
                  {business ? 'Explorar servicios' : 'Descubrir negocios'}
                  <ArrowRight size={17} />
                </a>
                <a className="public-button secondary" href="#nosotros">
                  Conoce más
                </a>
              </div>
              <div className="hero-caption">
                <span className="mini-avatars">
                  <i>M</i>
                  <i>A</i>
                  <i>L</i>
                </span>
                <span>Un espacio pensado para tu día a día.</span>
              </div>
            </div>
            <div className="hero-visual">
              {cover ? (
                <img className="hero-cover" src={cover} alt={business.name} />
              ) : (
                <div className="hero-illustration">
                  <div className="illustration-orbit" />
                  <div className="appointment-card">
                    <span className="eyebrow">UN MOMENTO PARA TI</span>
                    <CalendarDays size={56} strokeWidth={1.3} />
                    <h3>Tu tiempo vale mucho</h3>
                    <div className="calendar-grid">
                      {Array.from({ length: 21 }, (_, i) => (
                        <span className={i === 11 ? 'chosen' : ''} key={i}>
                          {i + 1}
                        </span>
                      ))}
                    </div>
                    <div className="appointment-bottom">
                      <span className="status-dot" /> Todo comienza contigo
                    </div>
                  </div>
                  <Sparkles className="hero-sparkle" size={40} />
                </div>
              )}
              <div className="floating-note">
                <Heart size={25} />
                <span>
                  Cuida de ti.
                  <br />
                  <strong>Nosotros te acompañamos.</strong>
                </span>
              </div>
            </div>
          </div>
          <div className="public-container benefit-row">
            {[
              [Clock3, 'A tu ritmo', 'Encuentra tu próximo servicio'],
              [CalendarDays, 'Todo en un lugar', 'Consulta nuestro catálogo'],
              [Users, 'Más cerca de ti', 'Conoce tu negocio favorito'],
              [Sparkles, 'Hecho para ti', 'Una experiencia más sencilla'],
            ].map(([Icon, title, detail]) => (
              <div className="benefit" key={title}>
                <Icon size={28} />
                <div>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="public-container public-section" id="servicios">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ELIGE TU PRÓXIMO MOMENTO</span>
              <h2>{business ? 'Nuestros servicios' : 'Encuentra tu negocio'}</h2>
              <p>
                {business
                  ? 'Descubre lo que tenemos para ti.'
                  : 'Explora los negocios disponibles y conoce sus servicios.'}
              </p>
            </div>
            <span className="catalog-count">
              {items.length} {business ? 'servicios' : 'negocios'}
            </span>
          </div>
          {loading ? (
            <p role="status">Cargando catálogo…</p>
          ) : error ? (
            <p role="alert" className="public-alert">
              {error}
            </p>
          ) : !items.length ? (
            <div className="empty-catalog">
              <Store size={30} />
              <h3>
                {business
                  ? 'Estamos preparando nuestros servicios'
                  : 'Pronto encontrarás nuevos negocios aquí'}
              </h3>
              <p>
                {business
                  ? 'Vuelve pronto o contáctanos para conocer más.'
                  : '¿Tienes un negocio? Crea tu espacio y compártelo con tus clientes.'}
              </p>
              {!business && (
                <Link className="public-button" to="/crear-negocio">
                  Crear mi negocio
                </Link>
              )}
            </div>
          ) : (
            <div className="service-grid">
              {items.map((item) => {
                const url = safeImageUrl(business ? item.image?.url : item.cover?.url)
                return (
                  <article className="service-card" key={item.id}>
                    <div className="service-image">
                      {url ? (
                        <img src={url} alt="" loading="lazy" />
                      ) : (
                        <Sparkles size={45} strokeWidth={1.2} />
                      )}
                      <span className="service-icon">
                        {business ? <Heart size={20} /> : <Store size={20} />}
                      </span>
                    </div>
                    <div className="service-copy">
                      <h3>{item.name}</h3>
                      <p>
                        {item.description ||
                          (business
                            ? 'Un servicio pensado para ti.'
                            : 'Conoce sus servicios y encuentra lo que buscas.')}
                      </p>
                      {business ? (
                        <div className="service-meta">
                          <span>{item.durationMinutes} min</span>
                          <strong>
                            {item.price} {item.currencyCode}
                          </strong>
                        </div>
                      ) : (
                        <Link to={`/b/${encodeURIComponent(item.id)}`} className="text-link">
                          Ver negocio <ArrowRight size={15} />
                        </Link>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          {business && (
            <p className="booking-note">
              Las reservas en línea estarán disponibles próximamente. Por ahora, consulta nuestros
              servicios y contáctanos.
            </p>
          )}
        </section>
        <section className="about-section" id="nosotros">
          <div className="public-container about-inner">
            <div>
              <span className="eyebrow">MENOS COMPLICACIONES, MÁS TIEMPO PARA TI</span>
              <h2>
                Lo importante empieza
                <br />
                con un momento para ti.
              </h2>
            </div>
            <p>
              {business?.description ||
                'CitasPro conecta negocios y personas en un espacio sencillo. Descubre servicios y empieza a organizar tus próximos planes.'}
            </p>
          </div>
        </section>
        {business && (
          <section className="public-container public-section contact-section" id="contacto">
            <div>
              <span className="eyebrow">ESTAMOS CERCA</span>
              <h2>Hablemos de tu próxima visita</h2>
            </div>
            <div>
              {phone && (
                <a href={`tel:${phone}`}>
                  <Phone size={18} />
                  {business.contact.phone}
                </a>
              )}
              {business.contact?.email && (
                <a href={`mailto:${business.contact.email}`}>{business.contact.email}</a>
              )}
              {business.location?.addressLine && (
                <p>
                  <MapPin size={18} />
                  {business.location.addressLine} {business.location.city}
                </p>
              )}
              {!phone && !business.contact?.email && !business.location?.addressLine && (
                <p>Pronto publicaremos nuestros datos de contacto.</p>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="public-container public-footer">
        <Brand />
        <span>Tu tiempo, bien acompañado.</span>
        {!business && <Link to="/crear-negocio">¿Tienes un negocio?</Link>}
      </footer>
    </>
  )
}
