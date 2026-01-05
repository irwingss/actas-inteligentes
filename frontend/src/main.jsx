import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import App from './App.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import AdminPanel from './pages/AdminPanel.jsx'
import ConfigurationPage from './pages/ConfigurationPage.jsx'
import AnexosAdminPage from './pages/AnexosAdminPage.jsx'
import UnidadesFiscalizablesAdminPage from './pages/UnidadesFiscalizablesAdminPage.jsx'
import SupervisorTeamAdminPage from './pages/SupervisorTeamAdminPage.jsx'
import RequerimientosAdminPage from './pages/RequerimientosAdminPage.jsx'
import './index.css'

// Componente para manejar deep links en Electron
function DeepLinkHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    // Solo en Electron
    if (!window.actas?.isElectron) return;
    
    // Verificar deep link pendiente al cargar
    const checkPendingDeepLink = async () => {
      try {
        const pendingLink = await window.actas.getPendingDeepLink?.();
        if (pendingLink) {
          handleDeepLink(pendingLink);
        }
      } catch (err) {
        console.error('[DeepLinkHandler] Error checking pending deep link:', err);
      }
    };
    
    // Manejar deep link
    const handleDeepLink = (url) => {
      console.log('[DeepLinkHandler] Processing:', url);
      try {
        // Formato: actas-inteligentes://reset-password#access_token=xxx
        const urlObj = new URL(url);
        const path = urlObj.hostname || urlObj.pathname.replace(/^\/\//, '');
        const hash = urlObj.hash || '';
        
        console.log('[DeepLinkHandler] Path:', path, 'Hash:', hash);
        
        // Navegar a la ruta correspondiente con el hash
        if (path === 'reset-password') {
          // Navegar a reset-password, el hash con tokens se pasará como state
          navigate('/reset-password', { state: { tokenHash: hash } });
          // También actualizar el hash del location para que ResetPassword lo procese
          window.location.hash = `#/reset-password${hash}`;
        }
      } catch (err) {
        console.error('[DeepLinkHandler] Error processing deep link:', err);
      }
    };
    
    checkPendingDeepLink();
    
    // Escuchar deep links en tiempo real
    window.actas.onDeepLink?.((data) => {
      console.log('[DeepLinkHandler] Deep link received:', data);
      if (data.fullUrl) {
        handleDeepLink(data.fullUrl);
      }
    });
    
    return () => {
      window.actas.removeDeepLinkListener?.();
    };
  }, [navigate]);
  
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <DeepLinkHandler />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin>
              <AdminPanel />
            </ProtectedRoute>
          } />
          <Route path="/configuration" element={
            <ProtectedRoute requireSuperAdmin>
              <ConfigurationPage />
            </ProtectedRoute>
          } />
          <Route path="/anexos-admin" element={
            <ProtectedRoute requireSuperAdmin>
              <AnexosAdminPage />
            </ProtectedRoute>
          } />
          <Route path="/uf-admin" element={
            <ProtectedRoute requireSuperAdmin>
              <UnidadesFiscalizablesAdminPage />
            </ProtectedRoute>
          } />
          <Route path="/supervisor-team-admin" element={
            <ProtectedRoute requireSuperAdmin>
              <SupervisorTeamAdminPage />
            </ProtectedRoute>
          } />
          <Route path="/requerimientos-admin" element={
            <ProtectedRoute requireSuperAdmin>
              <RequerimientosAdminPage />
            </ProtectedRoute>
          } />
          <Route path="/*" element={
            <ProtectedRoute>
              <App />
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
