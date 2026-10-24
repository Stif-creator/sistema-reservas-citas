import { useEffect, useRef } from 'react'
import { useBlocker, useLocation } from 'react-router-dom'

import { forms, values, dirty, confirmDiscard } from '../lib/unsavedForms'
import { useFeedback } from '../context/feedback-context'

export default function UnsavedForms({ children }) {
  const location = useLocation()
  const shown = useRef(false)
  const { confirm } = useFeedback()
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && [...forms.keys()].some(dirty))
  useEffect(() => { forms.clear() }, [location.pathname])
  useEffect(() => {
    if (blocker.state !== 'blocked' || shown.current) return
    shown.current = true
    confirmDiscard(document, confirm).then(accepted => { if (accepted) blocker.proceed(); else blocker.reset() }).finally(() => { shown.current = false })
  }, [blocker, confirm])
  useEffect(() => {
    function track(event) {
      const form = event.target.closest?.('.admin-shell form, .editor-dialog form, .admin-shell [data-draft]')
      if (form && !forms.has(form)) forms.set(form, { baseline: values(form) })
    }
    function submit(event) { track(event); const entry = forms.get(event.target); if (entry) entry.submitted = values(event.target) }
    function unload(event) { if ([...forms.keys()].some(dirty)) { event.preventDefault(); event.returnValue = '' } }
    document.addEventListener('focusin', track, true)
    document.addEventListener('beforeinput', track, true)
    document.addEventListener('pointerdown', track, true)
    document.addEventListener('submit', submit, true)
    window.addEventListener('beforeunload', unload)
    const timer = setInterval(() => { for (const form of forms.keys()) if (!form.isConnected) forms.delete(form) }, 1000)
    return () => { document.removeEventListener('focusin', track, true); document.removeEventListener('beforeinput', track, true); document.removeEventListener('pointerdown', track, true); document.removeEventListener('submit', submit, true); window.removeEventListener('beforeunload', unload); clearInterval(timer); forms.clear() }
  }, [])
  return children
}
