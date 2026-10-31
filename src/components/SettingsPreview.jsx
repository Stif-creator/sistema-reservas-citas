import { CalendarCheck, MapPin, Phone, Mail, CheckCircle2, Clock3, Image as ImageIcon, Palette, Eye, BookOpen, Target, TrendingUp } from 'lucide-react'
import { safeImageUrl, brandVariables } from '../lib/brand'

const palette = [
  ['Primario', 'primaryColor'], ['Secundario', 'secondaryColor'],
  ['Acento', 'accentColor'], ['Superficie', 'surfaceColor'],
]

export default function SettingsPreview({ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, accentColor, surfaceColor, about = {}, contactPhone, contactWhatsapp, contactEmail, addressLine, city, stateRegion, countryCode, weeklyHours = {}, timeZone, published = false }) {
  const variables = brandVariables({ primaryColor, secondaryColor, accentColor, surfaceColor })
  const validCover = safeImageUrl(coverUrl)
  const validLogo = safeImageUrl(logoUrl)
  const values = (about.values || '').split('\n').map(value => value.trim()).filter(Boolean)
  const days = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miercoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sabado'], ['7', 'Domingo']]
  const isOpen = (slots) => Array.isArray(slots) && slots.length > 0
  const contactRows = [[Phone, contactPhone], [Phone, contactWhatsapp], [Mail, contactEmail]]
    .filter(([, value]) => value?.trim())
  const fullAddress = [addressLine, city, stateRegion, countryCode].filter(Boolean).join(', ')
  const tabTitle = {
    general: 'Vista previa de la página pública', appearance: 'Identidad visual', images: 'Imágenes del negocio',
    about: 'Vista previa de Nosotros', contact: 'Contacto y ubicación', hours: 'Horario semanal',
  }[tab] || 'Vista previa de la página pública'

  return <aside className={`settings-preview settings-preview-${tab}`} style={variables} aria-label={tabTitle}>
    <div className="settings-preview-heading">
      <span className="settings-preview-icon"><Eye size={20} /></span>
      <div><h2>{tabTitle}</h2><p className="settings-hint">Los cambios se reflejan aquí antes de guardarlos.</p></div>
      <span className={`settings-published ${published ? 'is-published' : 'is-unpublished'}`}><i />{published ? 'Publicado' : 'No publicado'}</span>
    </div>

    {tab === 'appearance' ? <>
      <div className="settings-brand-card">
        {validCover ? <img className="settings-cover" src={validCover} alt="Portada del negocio" /> : <div className="settings-cover settings-cover-empty"><ImageIcon /></div>}
        <div className="settings-preview-body">
          <div className="settings-preview-brand"><span>{validLogo ? <img src={validLogo} alt="Logo del negocio" /> : <CalendarCheck size={26} />}</span><h3>{name}</h3></div>
          <p>{description}</p>{city && <p className="settings-location"><MapPin size={15} />{city}</p>}
          <span className="settings-preview-cta"><CalendarCheck size={17} />Reservar cita</span>
        </div>
      </div>
      <div className="settings-palette"><h3><Palette size={18} />Paleta aplicada en la página</h3><div>{palette.map(([label, key]) => <span key={key}><i style={{ backgroundColor: ({ primaryColor, secondaryColor, accentColor, surfaceColor })[key] }} />{label}<small>{({ primaryColor, secondaryColor, accentColor, surfaceColor })[key]}</small></span>)}</div></div>
    </> : tab === 'images' ? <div className="settings-brand-card">
      {validCover ? <img className="settings-cover" src={validCover} alt="Vista previa de portada" /> : <div className="settings-cover settings-cover-empty"><ImageIcon /></div>}
      <div className="settings-preview-body"><div className="settings-preview-brand"><span>{validLogo ? <img src={validLogo} alt="Vista previa del logo" /> : <CalendarCheck size={26} />}</span><h3>{name}</h3></div><p>{description}</p></div>
    </div> : tab === 'about' ? <div className="settings-about-card">
      {validCover && <div className="settings-about-cover" style={{ backgroundImage: `linear-gradient(0deg, #11182799, #11182708), url("${validCover}")` }} />}
      <div className="settings-about-content"><span className="settings-eyebrow">SOBRE NOSOTROS</span>
        {about.title && <h3>{about.title}</h3>}{about.story && <section><h4><BookOpen size={17} />Nuestra historia</h4><p className="whitespace-pre-line">{about.story}</p></section>}
        {about.mission && <section><h4><Target size={17} />Nuestra misión</h4><p className="whitespace-pre-line">{about.mission}</p></section>}
        {about.vision && <section><h4><TrendingUp size={17} />Nuestra visión</h4><p className="whitespace-pre-line">{about.vision}</p></section>}
        {values.length > 0 && <section><h4><CheckCircle2 size={17} />Nuestros valores</h4><ul>{values.map((value, index) => <li key={`${value}-${index}`}><CheckCircle2 size={15} />{value}</li>)}</ul></section>}
      </div>
    </div> : tab === 'contact' ? <div className="settings-contact-layout">
      <section className="settings-preview-section"><h3><Phone size={18} />Información de contacto</h3>{contactRows.map(([Icon, value], index) => <p key={index}><Icon size={17} />{value}</p>)}{!contactRows.length && <p className="settings-preview-empty">Agrega los datos de contacto para previsualizarlos.</p>}</section>
      <section className="settings-preview-section"><h3><MapPin size={18} />Ubicación</h3>{fullAddress ? <p>{fullAddress}</p> : <p className="settings-preview-empty">Agrega una dirección para previsualizarla.</p>}</section>
    </div> : tab === 'hours' ? <div className="settings-weekly-summary">
      <div className="settings-timezone"><Clock3 size={17} />Zona horaria <strong>{timeZone || 'No configurada'}</strong></div>
      {days.map(([key, label]) => <div className="settings-day-summary" key={key}><strong>{label}</strong>{isOpen(weeklyHours[key]) ? <span>{weeklyHours[key].map((slot, index) => <small key={index}>{slot.start || '—'}–{slot.end || '—'}</small>)}</span> : <em>Cerrado</em>}</div>)}
    </div> : <div className="settings-brand-card">
      {validCover ? <img className="settings-cover" src={validCover} alt="Portada del negocio" /> : <div className="settings-cover settings-cover-empty"><CalendarCheck size={42} /></div>}
      <div className="settings-preview-body"><div className="settings-preview-brand"><span>{validLogo ? <img src={validLogo} alt="Logo del negocio" /> : <CalendarCheck size={26} />}</span><h3>{name}</h3></div>
        {description && <p>{description}</p>}{city && <p className="settings-location"><MapPin size={15} />{city}</p>}<span className="settings-preview-cta"><CalendarCheck size={17} />Reservar cita</span>
      </div>
    </div>}
  </aside>
}
