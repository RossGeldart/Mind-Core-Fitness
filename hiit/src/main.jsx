import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { TierProvider } from './contexts/TierContext'
import { HiitProvider } from './contexts/HiitContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <TierProvider>
          <HiitProvider>
            <App />
          </HiitProvider>
        </TierProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
