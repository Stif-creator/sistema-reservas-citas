function Card({ title, description, actions, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-6 shadow-card ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export default Card
