import { SearchX } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'

export default function CatalogState({ children, empty = false }) {
  const { catalogLoading, catalogError } = useClientBusiness()
  if (catalogLoading) return <p className="client-loading" role="status">Cargando servicios…</p>
  if (catalogError) return <p className="public-alert" role="alert">{catalogError}</p>
  if (empty) return <div className="client-empty"><SearchX size={32} /><h2>No hay servicios para mostrar</h2><p>Prueba otra búsqueda o vuelve pronto para conocer las novedades del negocio.</p></div>
  return children
}
