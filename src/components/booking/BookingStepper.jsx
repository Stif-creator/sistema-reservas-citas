import { Check } from 'lucide-react'

export default function BookingStepper({ step }) {
  return <ol className="booking-stepper" aria-label="Pasos de la reserva">
    {['Servicio', 'Profesional', 'Fecha y hora', 'Confirmación'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step >= index ? 'reached' : ''}>
      <span aria-hidden="true">{index < step ? <Check size={14} /> : index + 1}</span><strong>{label}</strong>
    </li>)}
  </ol>
}
