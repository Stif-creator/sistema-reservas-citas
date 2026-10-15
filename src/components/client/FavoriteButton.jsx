import { Heart } from 'lucide-react'
import { useClientBusiness } from '../../context/client-context'

export default function FavoriteButton({ service }) {
  const { favorites, favoriteReady, favoriteBusy, toggleFavorite } = useClientBusiness()
  const selected = favorites.some(f => f.kind === 'service' && f.targetId === service.id)
  return <button type="button" className={`client-favorite ${selected ? 'selected' : ''}`} aria-pressed={selected}
    aria-label={`${selected ? 'Quitar de' : 'Agregar a'} favoritos: ${service.name}`} disabled={!favoriteReady || favoriteBusy} onClick={() => toggleFavorite(service)}>
    <Heart size={18} fill={selected ? 'currentColor' : 'none'} />{selected ? 'Guardado' : 'Favorito'}
  </button>
}
