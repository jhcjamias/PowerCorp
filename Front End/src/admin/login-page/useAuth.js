// Shared admin sign-in state (no Pinia needed). Import useAuth() anywhere.
// The session lives in sessionStorage, so closing the tab signs the admin out.

import { computed, reactive } from 'vue'
import { login } from './authService'
import { normalizePhone } from './validators'

const STORAGE_KEY = 'rolaz_admin_session'

function readSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSession(session) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage can be blocked (private mode); the in-memory session still works
  }
}

const state = reactive({ session: readSession() })

const isAuthenticated = computed(() => Boolean(state.session?.token))
const user = computed(() => state.session?.user ?? null)
const token = computed(() => state.session?.token ?? null)

// Throws an AuthError (with a friendly .message) when sign-in fails.
async function signIn(phone, password) {
  const session = await login(normalizePhone(phone), password)
  state.session = session
  writeSession(session)
}

function signOut() {
  state.session = null
  writeSession(null)
}

export function useAuth() {
  return { isAuthenticated, user, token, signIn, signOut }
}
