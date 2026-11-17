// Talks to the back end to sign an admin in.
//
// MOCK MODE (default while the Flask API has no login route):
//   set VITE_USE_MOCK_AUTH=false in "Front End/.env.local" to use the real API.
//
// REAL MODE assumes (change here if your back end differs):
//   POST {VITE_API_URL}/api/auth/login   body: { identifier: "username (or email)", password: "..." }
//   200 -> { token: "...", user: { id, name, role: "admin" } }
//   401 -> wrong login name or password
//   403 -> valid user but not an admin
//
// FORGOT PASSWORD (username + the admin's private 6-digit PIN, no email or text message):
//   POST {VITE_API_URL}/api/auth/reset-password  body: { username, pin, newPassword } -> 204
//   The back end saves the new password hash in the Staff table.
//   400/429 -> the response's "message" is shown (wrong PIN, weak password, locked after too many tries)
//   404/405 -> the back end does not have this route yet

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:5000').replace(/\/$/, '')
// A production build ("npm run build") never allows the demo login, whatever the env file says.
export const USE_MOCK_AUTH = !import.meta.env.PROD && import.meta.env.VITE_USE_MOCK_AUTH !== 'false'

// Demo login that only works in mock mode. Remove once the real API is connected.
export const MOCK_CREDENTIALS = { username: 'rolaz', email: 'rolazcutz@gmail.com', password: 'rolaz-admin' }
// In mock mode the demo username or the demo email works as the login name.
const isMockName = (identifier) =>
  [MOCK_CREDENTIALS.username, MOCK_CREDENTIALS.email].includes(String(identifier).trim().toLowerCase())

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
  RESET_UNAVAILABLE: 'Password reset is not available on the server yet.',
  NETWORK: "Can't reach the server. Check your connection and try again.",
  SERVER: 'Something went wrong on our end. Please try again.',
}

function fail(code) {
  throw new AuthError(code, MESSAGES[code])
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The demo password can be reset while the page stays open (it goes back on reload).
let mockPassword = MOCK_CREDENTIALS.password

async function mockLogin(identifier, password) {
  await wait(700) // feels like a real request
  if (!isMockName(identifier) || password !== mockPassword) {
    fail('INVALID_CREDENTIALS')
  }
  return { token: 'mock-token', user: { id: 1, name: 'Rolaz', role: 'admin' } }
}

async function apiLogin(identifier, password) {
  let response
  try {
    response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
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

// Ends the session on the server: POST /api/auth/logout with the bearer token -> 204.
// Never throws: the admin is signed out in the browser whatever the server says.
export async function logout(token) {
  if (USE_MOCK_AUTH || !token) return
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true, // still sent if the page navigates away
    })
  } catch {
    // offline or server down: the token simply expires on its own
  }
}

// identifier is the username, or the email address. Resolves to { token, user }.
export function login(identifier, password) {
  const name = String(identifier ?? '').trim()
  return USE_MOCK_AUTH ? mockLogin(name, password) : apiLogin(name, password)
}

// ---- Forgot password -------------------------------------------------------------------
export const MOCK_RESET_PIN = '123456' // the demo PIN

// Checks the PIN and saves the new password.
export async function resetPassword(username, pin, newPassword) {
  if (USE_MOCK_AUTH) {
    await wait(700)
    if (String(username).trim().toLowerCase() !== MOCK_CREDENTIALS.username || pin !== MOCK_RESET_PIN) {
      throw new AuthError('REJECTED', 'Username or PIN is incorrect.')
    }
    mockPassword = newPassword
    return
  }

  let response
  try {
    response = await fetch(`${API_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: String(username ?? '').trim(), pin, newPassword }),
    })
  } catch {
    fail('NETWORK')
  }
  if (response.ok) return
  if (response.status === 404 || response.status === 405) fail('RESET_UNAVAILABLE')
  if (response.status === 400 || response.status === 429) {
    const data = await response.json().catch(() => null)
    throw new AuthError('REJECTED', data?.message || 'That did not work. Please try again.')
  }
  fail('SERVER')
}
