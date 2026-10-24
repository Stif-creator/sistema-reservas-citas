import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { FeedbackContext } from '../../context/feedback-context'
import './feedback.css'

const icons = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info }

export function FeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [toasts, setToasts] = useState([])
  const resolveDialog = useRef(null)
  const dialogElement = useRef(null)

  useEffect(() => {
    const element = dialogElement.current
    if (dialog && element && !element.open) element.showModal()
    return () => { if (element?.open) element.close() }
  }, [dialog])

  const confirm = useCallback(options => new Promise(resolve => {
    if (resolveDialog.current) { resolve(false); return }
    resolveDialog.current = resolve
    setDialog({ title: 'Confirma la acción', description: '', confirmLabel: 'Confirmar', ...options })
  }), [])

  const finishDialog = useCallback(result => {
    const resolve = resolveDialog.current
    resolveDialog.current = null
    setDialog(null)
    resolve?.(result)
  }, [])

  const notify = useCallback(({ title, message = '', type = 'info', duration = 5000 }) => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    setToasts(current => [...current.slice(-3), { id, title, message, type }])
    if (duration > 0) window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), duration)
    return id
  }, [])

  const dismissToast = id => setToasts(current => current.filter(item => item.id !== id))

  return <FeedbackContext.Provider value={{ confirm, notify }}>
    {children}
    <div className="feedback-toasts" aria-label="Notificaciones" aria-live="polite" aria-relevant="additions text">{toasts.map(toast => {
      const Icon = icons[toast.type] || Info
      return <section key={toast.id} className={`feedback-toast feedback-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
        <Icon size={20} aria-hidden="true" /><div className="feedback-toast-copy"><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div>
        <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Cerrar notificación"><X size={18} /></button>
      </section>
    })}</div>
    {dialog && <dialog ref={dialogElement} className="feedback-dialog" role="alertdialog" aria-labelledby="feedback-dialog-title" aria-describedby="feedback-dialog-description" onCancel={event => { event.preventDefault(); finishDialog(false) }}>
        <div className="feedback-dialog-icon"><AlertTriangle size={24} aria-hidden="true" /></div>
        <h2 id="feedback-dialog-title">{dialog.title}</h2><p id="feedback-dialog-description">{dialog.description}</p>
        <div className="feedback-dialog-actions"><button type="button" className="feedback-cancel" onClick={() => finishDialog(false)}>Cancelar</button><button type="button" className="feedback-confirm" autoFocus onClick={() => finishDialog(true)}>{dialog.confirmLabel}</button></div>
    </dialog>}
  </FeedbackContext.Provider>
}

