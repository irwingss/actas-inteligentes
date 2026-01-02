import React, { createContext, useContext, useState, useEffect } from 'react'
import { usersAPI } from '../services/api'

const UserContext = createContext(null)

export const useUser = () => {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser debe ser usado dentro de un UserProvider')
  }
  return context
}

export const UserProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Cargar usuario del localStorage al iniciar
  useEffect(() => {
    const loadUser = async () => {
      try {
        const savedUserId = localStorage.getItem('currentUserId')
        if (savedUserId) {
          const user = await usersAPI.getById(savedUserId)
          setCurrentUser(user)
        }
      } catch (error) {
        console.error('Error al cargar usuario:', error)
        localStorage.removeItem('currentUserId')
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  const selectUser = async (user) => {
    try {
      // Registrar login
      await usersAPI.login(user.id)
      
      // Guardar en localStorage
      localStorage.setItem('currentUserId', user.id)
      
      // Actualizar estado
      setCurrentUser(user)
    } catch (error) {
      console.error('Error al seleccionar usuario:', error)
      throw error
    }
  }

  const logout = () => {
    localStorage.removeItem('currentUserId')
    setCurrentUser(null)
  }

  const value = {
    currentUser,
    setCurrentUser,
    selectUser,
    logout,
    loading,
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
