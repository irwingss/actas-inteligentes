import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
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
