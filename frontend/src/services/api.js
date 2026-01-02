const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Helper para manejar errores de API
const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }))
    throw new Error(error.error || `HTTP error! status: ${response.status}`)
  }
  return response.json()
}

// Usuarios
export const usersAPI = {
  // Obtener todos los usuarios
  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/users`)
    return handleResponse(response)
  },

  // Obtener un usuario por ID
  getById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`)
    return handleResponse(response)
  },

  // Crear un nuevo usuario
  create: async (userData) => {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    })
    return handleResponse(response)
  },

  // Actualizar un usuario
  update: async (id, userData) => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    })
    return handleResponse(response)
  },

  // Registrar login
  login: async (id) => {
    const response = await fetch(`${API_BASE_URL}/users/${id}/login`, {
      method: 'POST',
    })
    return handleResponse(response)
  },

  // Desactivar usuario
  delete: async (id) => {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
      method: 'DELETE',
    })
    return handleResponse(response)
  },
}
