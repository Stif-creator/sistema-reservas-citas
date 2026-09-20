import { AlertCircle, CheckCircle2 } from 'lucide-react'

const TONE_CLASSES = {
  error: 'bg-red-50 text-error border-red-100',
  success: 'bg-green-50 text-success border-green-100',
}

const TONE_ICONS = {
  error: AlertCircle,
  success: CheckCircle2,
}

function Alert({ tone = 'error', children }) {
  const Icon = TONE_ICONS[tone]
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}>
      <Icon size={16} className="shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export default Alert
