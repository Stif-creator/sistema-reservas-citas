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
