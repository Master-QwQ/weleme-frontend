export const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export interface ApiOptions {
  signal?: AbortSignal
}

export const api = {
  get: async (endpoint: string, options?: ApiOptions) => {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        signal: options?.signal
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `API Error: ${response.status}`)
      }
      return response.json()
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to server')
      }
      throw error
    }
  },

  post: async (endpoint: string, data: any, options?: ApiOptions) => {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: options?.signal
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `API Error: ${response.status}`)
      }
      return response.json()
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to server')
      }
      throw error
    }
  },

  put: async (endpoint: string, data: any, options?: ApiOptions) => {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: options?.signal
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `API Error: ${response.status}`)
      }
      return response.json()
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to server')
      }
      throw error
    }
  },

  upload: async (endpoint: string, formData: FormData, options?: ApiOptions) => {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        body: formData,
        signal: options?.signal
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `API Error: ${response.status}`)
      }
      return response.json()
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to server')
      }
      throw error
    }
  },

  // Chat history APIs
  getPublicMessages: async (since?: number) => {
    const params = new URLSearchParams()
    if (since) {
      params.append('since', since.toString())
    }
    return api.get(`/api/chat/public?${params.toString()}`)
  },

  getTeamMessages: async (teamId: string, since?: number) => {
    const params = new URLSearchParams({ team_id: teamId })
    if (since) {
      params.append('since', since.toString())
    }
    return api.get(`/api/chat/team?${params.toString()}`)
  },
}
