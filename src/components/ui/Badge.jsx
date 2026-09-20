const TONE_CLASSES = {
  success: 'bg-green-50 text-success',
  neutral: 'bg-slate-100 text-muted',
  primary: 'bg-indigo-50 text-primary',
}

function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export default Badge
