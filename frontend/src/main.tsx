import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './styles/globals.css'
import './stores/themeStore' // Initialize theme on load

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <App />
            </BrowserRouter>
            <Toaster position="top-right" richColors closeButton />
        </ErrorBoundary>
    </React.StrictMode>,
)