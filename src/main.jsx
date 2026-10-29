import UnsavedForms from './components/UnsavedForms'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import App from './App.jsx'
import { FeedbackProvider } from './components/ui/FeedbackProvider'
import RouteErrorFallback from './components/RouteErrorFallback'

const chunkReloadKey = `citaspro:chunk-reload:${window.location.pathname}`
window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  try {
    const lastReload = Number(sessionStorage.getItem(chunkReloadKey) || 0)
    if (Date.now() - lastReload < 20000) return
    sessionStorage.setItem(chunkReloadKey, String(Date.now()))
    const freshUrl = new URL(window.location.href)
    freshUrl.searchParams.set('_fresh', String(Date.now()))
    window.location.replace(freshUrl)
  } catch {
    // If browser storage is blocked, the route recovery screen still offers a manual retry.
  }
})

const router = createBrowserRouter([{ path: '*', element: <AuthProvider><FeedbackProvider><UnsavedForms><App /></UnsavedForms></FeedbackProvider></AuthProvider>, errorElement: <RouteErrorFallback /> }])
createRoot(document.getElementById('root')).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
)
