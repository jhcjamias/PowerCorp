// One place for talking to the Flask back end from the admin pages.
//
// MOCK MODE (default until the real endpoints exist):
//   set VITE_USE_MOCK_API=false in "Front End/.env.local" to call the real API.
//
// Every request sends the signed-in admin's token as "Authorization: Bearer <token>".

import { useAuth } from '@/admin/login-page/useAuth'

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:5000').replace(/\/$/, '')
export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest(path, { method = 'GET', body } = {}) {
  const { token, signOut } = useAuth()

  let response
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
      },
    }
    if (body !== undefined) options.body = JSON.stringify(body)
    response = await fetch(`${API_URL}${path}`, options)
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }

  if (response.status === 401) {
    signOut() // the layout sends the admin back to the login page
    throw new ApiError(401, 'Your session has expired. Please log in again.')
  }
  if (response.status === 403) throw new ApiError(403, "You don't have permission to do that.")
  if (!response.ok) {
    throw new ApiError(response.status, 'Something went wrong on our end. Please try again.')
  }
  if (response.status === 204) return null

  try {
    return await response.json()
  } catch {
    throw new ApiError(response.status, 'Unexpected response from the server.')
  }
}
