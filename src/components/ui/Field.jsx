export function fieldControlClasses(hasError) {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 ${
    hasError ? 'border-error focus:border-error' : 'border-border focus:border-primary'
  }`
}

function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-sm text-error">{error}</p>
      ) : (
        hint && <p className="mt-1 text-sm text-muted">{hint}</p>
      )}
    </div>
  )
}

export default Field
