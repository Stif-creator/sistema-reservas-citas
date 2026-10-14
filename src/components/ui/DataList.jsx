import { useContext, useState } from 'react'
import { ListSearchContext } from '../../context/list-search-context'
import './data-list.css'

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const defaultText = item => Object.values(item).filter(value => ['string', 'number'].includes(typeof value)).join(' ')

export default function DataList({ items = [], label, searchText = defaultText, children, search = true, resetKey = '' }) {
  const [term, setTerm] = useState('')
  const [size, setSize] = useState(10)
  const [position, setPosition] = useState({ page: 1, key: '' })
  const pageSearch = useContext(ListSearchContext)
  const key = `${resetKey}:${pageSearch}:${term}:${size}`
  const words = normalize(`${pageSearch} ${term}`).trim().split(/\s+/).filter(Boolean)
  const filtered = items.filter(item => words.every(word => normalize(searchText(item)).includes(word)))
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const page = Math.min(position.key === key ? position.page : 1, pages)
  const start = (page - 1) * size
  return <section className="data-list" aria-label={label}>
    <div className="data-list-toolbar">
      {search && <label>Buscar {label.toLowerCase()}<input type="search" value={term} onChange={event => setTerm(event.target.value)} placeholder="Escribe para filtrar…" /></label>}
      <label>Registros por página<select value={size} onChange={event => setSize(Number(event.target.value))}>{[10, 25, 50].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {filtered.length ? children(filtered.slice(start, start + size)) : <p role="status">No hay resultados para esta selección.</p>}
    <div className="data-list-footer">
      <span role="status">{filtered.length ? start + 1 : 0}–{Math.min(start + size, filtered.length)} de {filtered.length} registros</span>
      <nav aria-label={`Paginación de ${label.toLowerCase()}`}>
        <button type="button" disabled={page === 1} onClick={() => setPosition({ key, page: page - 1 })}>Anterior</button>
        <span>Página {page} de {pages}</span>
        <button type="button" disabled={page === pages} onClick={() => setPosition({ key, page: page + 1 })}>Siguiente</button>
      </nav>
    </div>
  </section>
}
