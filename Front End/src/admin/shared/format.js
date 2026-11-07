// Display helpers shared by the admin pages.
// Dates are "YYYY-MM-DD" strings and times are 24-hour "HH:MM" strings (local time).

const pad = (n) => String(n).padStart(2, '0')

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDateTime(date, time = '00:00') {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes)
}

export function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function addMinutes(time, minutes) {
  const total = toMinutes(time) + minutes
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`
}

// "Tue, Oct 13"
export function formatDateShort(date) {
  return parseDateTime(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// "Tuesday, October 13, 2026"
export function formatDateLong(date) {
  return parseDateTime(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// "11:00 AM"
export function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return `${hours % 12 || 12}:${pad(minutes)} ${hours >= 12 ? 'PM' : 'AM'}`
}

// "$45" or "$45.50"
export function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}

export function phoneDigits(value) {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits
}

// "(281) 555-0142"; anything that isn't a 10-digit number is shown as-is.
export function formatPhoneDisplay(value) {
  const digits = phoneDigits(value)
  if (digits.length !== 10) return String(value ?? '')
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
