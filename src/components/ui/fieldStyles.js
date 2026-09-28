export function fieldControlClasses(hasError) {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 ${
    hasError ? 'border-error focus:border-error' : 'border-border focus:border-primary'
  }`
}

