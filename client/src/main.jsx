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

// ── Tablet virtual keyboard: Visual Viewport API ─────────────────────────
// 1. Track visual viewport height → CSS variable --vvh.
//    Pages that use height:var(--vvh) shrink when the keyboard appears,
//    making their content internally scrollable above the keyboard.
// 2. On each focus, scroll the input above the keyboard if needed.
const _updateVVH = () => {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--vvh', h + 'px');
};
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', _updateVVH);
  window.visualViewport.addEventListener('scroll', _updateVVH);
}
window.addEventListener('resize', _updateVVH);
_updateVVH();

document.addEventListener('focusin', (e) => {
  const tag = e.target?.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
  setTimeout(() => {
    const vv = window.visualViewport;
    if (vv) {
      const rect = e.target.getBoundingClientRect();
      const vvBottom = vv.offsetTop + vv.height;
      if (rect.bottom > vvBottom - 16) {
        window.scrollBy({ top: rect.bottom - vvBottom + 80, behavior: 'smooth' });
      }
    } else {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 400);
});
// ─────────────────────────────────────────────────────────────────────────

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
