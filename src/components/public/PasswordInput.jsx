import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="password-control">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
