// Talks to the back end to sign an admin in.
//
// MOCK MODE (default while the Flask API has no login route):
//   set VITE_USE_MOCK_AUTH=false in "Front End/.env.local" to use the real API.
//
// REAL MODE assumes (change here if your back end differs):
//   POST {VITE_API_URL}/api/auth/login   body: { phone: "2815550100", password: "..." }
//   200 -> { token: "...", user: { id, name, role: "admin" } }
//   401 -> wrong phone or password
//   403 -> valid user but not an admin

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:5000').replace(/\/$/, '')
export const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH !== 'false'

// Demo login that only works in mock mode. Remove once the real API is connected.
export const MOCK_CREDENTIALS = { phone: '2815550100', password: 'rolaz-admin' }

export class AuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

const MESSAGES = {
  INVALID_CREDENTIALS: 'Phone number or password is incorrect.',
  NOT_ADMIN: "This account doesn't have admin access.",
  NETWORK: "Can't reach the server. Check your connection and try again.",
  SERVER: 'Something went wrong on our end. Please try again.',
}

function fail(code) {
  throw new AuthError(code, MESSAGES[code])
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mockLogin(phone, password) {
  await wait(700) // feels like a real request
  if (phone !== MOCK_CREDENTIALS.phone || password !== MOCK_CREDENTIALS.password) {
    fail('INVALID_CREDENTIALS')
  }
  return { token: 'mock-token', user: { id: 1, name: 'Rolaz', role: 'admin' } }
}

async function apiLogin(phone, password) {
  let response
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    })
  } catch {
    fail('NETWORK')
  }

  if (response.status === 401) fail('INVALID_CREDENTIALS')
  if (response.status === 403) fail('NOT_ADMIN')
  if (!response.ok) fail('SERVER')

  let data
  try {
    data = await response.json()
  } catch {
    fail('SERVER')
  }
  if (!data?.token || !data?.user) fail('SERVER')
  if (data.user.role !== 'admin') fail('NOT_ADMIN')
  return { token: data.token, user: data.user }
}

// phone must already be 10 digits (see normalizePhone). Resolves to { token, user }.
export function login(phone, password) {
  return USE_MOCK_AUTH ? mockLogin(phone, password) : apiLogin(phone, password)
}
