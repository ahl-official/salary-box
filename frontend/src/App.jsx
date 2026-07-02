import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import LoginPage from './pages/LoginPage'
import EmployeeApp from './pages/employee/EmployeeApp'
import AdminApp from './pages/admin/AdminApp'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <span>Loading...</span>
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (user.role === 'admin') return <AdminApp />

  return <EmployeeApp />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  )
}
