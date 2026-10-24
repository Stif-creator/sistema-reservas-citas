import UnsavedForms from './components/UnsavedForms'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import App from './App.jsx'
import { FeedbackProvider } from './components/ui/FeedbackProvider'

const router = createBrowserRouter([{ path: '*', element: <AuthProvider><FeedbackProvider><UnsavedForms><App /></UnsavedForms></FeedbackProvider></AuthProvider> }])
createRoot(document.getElementById('root')).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>,
)
