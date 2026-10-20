import { CalendarCheck, MapPin, Phone, Mail, CheckCircle2 } from 'lucide-react'
import { safeImageUrl, brandVariables } from '../lib/brand'
import { defaultAbout } from '../lib/businessAbout'

export default function SettingsPreview({ tab, name, description, logoUrl, coverUrl, primaryColor, secondaryColor, accentColor, surfaceColor, about, contactPhone, contactWhatsapp, contactEmail, addressLine, city }) {
  const content = Object.fromEntries(Object.entries(defaultAbout).map(([key, fallback]) => [key, about[key]?.trim() || fallback]))
  return <aside className="settings-preview" style={brandVariables({ primaryColor, secondaryColor, accentColor, surfaceColor })} aria-label="Vista previa del negocio">
    <h2>Vista previa</h2><p className="settings-hint">Así se presenta tu información a los clientes. Guarda los cambios para publicarlos.</p>
    <div className="settings-browser"><div className="settings-browser-bar" aria-hidden="true"><i /><i /><i /></div>
      {tab !== 'contact' && <div className="settings-cover">{safeImageUrl(coverUrl) ? <img src={coverUrl} alt="Portada del negocio" /> : <CalendarCheck size={48} strokeWidth={1} />}</div>}
      <div className="settings-preview-body">
        {tab === 'about' ? <><span className="settings-eyebrow">SOBRE NOSOTROS</span><h3>{content.title}</h3><p className="whitespace-pre-line">{content.story}</p><h4>Nuestra misión</h4><p>{content.mission}</p><h4>Nuestros valores</h4><ul>{content.values.split('\n').filter(v => v.trim()).map((value, i) => <li key={i}><CheckCircle2 size={16} />{value}</li>)}</ul></>
          : tab === 'contact' ? <><h3>Estamos para ayudarte</h3><ul className="settings-contact-preview">{[[Phone, contactPhone], [Phone, contactWhatsapp], [Mail, contactEmail], [MapPin, [addressLine, city].filter(Boolean).join(', ')]].map(([Icon, value], i) => value && <li key={i}><Icon size={18} /><span>{value}</span></li>)}</ul>{!contactPhone && !contactWhatsapp && !contactEmail && !addressLine && <p>Completa los datos de contacto para verlos aquí.</p>}</>
            : <><div className="settings-preview-brand"><span>{safeImageUrl(logoUrl) ? <img src={logoUrl} alt="Logo del negocio" /> : <CalendarCheck size={28} />}</span><h3>{name || 'Nombre de tu negocio'}</h3></div><p>{description || 'La descripción de tu negocio aparecerá aquí.'}</p><span className="settings-preview-accent">Un detalle de tu marca</span>{city && <p className="settings-location"><MapPin size={15} />{city}</p>}<div className="settings-preview-cta"><CalendarCheck size={18} />Reservar cita</div></>}
      </div>
    </div>
  </aside>
}
