import { confirmDiscard } from '../../lib/unsavedForms'
import { useEffect, useRef } from 'react'
import { useFeedback } from '../../context/feedback-context'
import { X } from 'lucide-react'

export default function EditorDialog({ title, onClose, busy = false, children }) {
  const ref = useRef(null)
  const closing = useRef(false)
  const { confirm } = useFeedback()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  const close = async () => { if (busy || closing.current) return; closing.current = true; try { if (await confirmDiscard(ref.current, confirm)) onClose() } finally { closing.current = false } }
  return <dialog ref={ref} className="editor-dialog" aria-label={title} onCancel={e => { e.preventDefault(); close() }}>
    <header className="editor-dialog-header"><div><span className="text-xs font-semibold uppercase tracking-widest text-primary">CitasPro</span><h2 className="text-xl font-semibold mt-1">{title}</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-slate-100"><X size={22} /></button></header>
    <div className="editor-dialog-content">{children}</div>
  </dialog>
}
