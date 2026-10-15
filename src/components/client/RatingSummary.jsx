import { Star } from 'lucide-react'

export default function RatingSummary({ reviews = [], professional = false }) {
  const ratings = reviews.map(r => professional ? r.professionalRating : r.rating).filter(n => Number.isInteger(n) && n >= 1 && n <= 5)
  return <span className="client-rating"><Star size={16} fill={ratings.length ? 'currentColor' : 'none'} aria-hidden="true" />{ratings.length
    ? <><strong>{(ratings.reduce((a, b) => a + b, 0) / ratings.length).toLocaleString('es', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}/5</strong><span>({ratings.length} {ratings.length === 1 ? 'opinión' : 'opiniones'})</span></>
    : <span>Sin calificaciones aún</span>}</span>
}
