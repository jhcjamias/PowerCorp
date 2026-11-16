// Small helpers for the admin forms. Phone numbers are treated as US 10-digit numbers.

export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

// Returns just the 10 digits (drops a leading US country code "1" and anything extra).
export function normalizePhone(value) {
  let digits = digitsOnly(value)
  if (digits.length >= 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

// Formats as the user types: 281 -> (281, 2815550 -> (281) 555-0, full -> (281) 555-0100
export function formatPhone(value) {
  const d = normalizePhone(value)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// Each validator returns an error message, or '' when the value is fine.
export function validatePhone(value) {
  const d = normalizePhone(value)
  if (d.length === 0) return 'Enter your phone number.'
  if (d.length < 10) return 'Enter a 10-digit phone number.'
  return ''
}

export function validatePassword(value) {
  if (!value) return 'Enter your password.'
  return ''
}

export const MIN_PASSWORD_LENGTH = 8

// New passwords must be at least 8 characters.
export function validateNewPassword(value) {
  if (!value) return 'Enter a new password.'
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  return ''
}

export function validatePin(value) {
  return /^\d{6}$/.test(String(value ?? '').trim()) ? '' : 'Enter your 6-digit PIN.'
}

// Login uses a username (or the email address if the username was forgotten).
export function validateUsername(value) {
  return String(value ?? '').trim() ? '' : 'Enter your username.'
}

export function validateEmail(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Enter your email address.'
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? '' : 'Enter a valid email address.'
}
