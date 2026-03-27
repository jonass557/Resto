import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import { OfflineProvider } from './contexts/OfflineContext'
import { PrinterProvider } from './contexts/PrinterContext'
import { PrintAgentProvider } from './contexts/PrintAgentContext'
import { Toaster } from 'react-hot-toast'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <OfflineProvider>
            <PrinterProvider>
              <PrintAgentProvider>
                <App />
              </PrintAgentProvider>
            </PrinterProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: { borderRadius: '8px', background: '#333', color: '#fff' }
              }}
            />
          </OfflineProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
