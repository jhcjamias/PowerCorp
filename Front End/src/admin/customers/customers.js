// Customers are worked out from the appointment list (grouped by phone number),
// so the page needs no extra endpoint. If the back end later gets a real customers
// table (with notes, e-mail, etc.), only this file and useCustomers.js need to change.

import { parseDateTime, phoneDigits } from '@/admin/shared/format'
import { appointmentTotal } from '@/admin/appointments/utils'

const startTime = (a) => parseDateTime(a.date, a.time).getTime()

export function buildCustomers(appointments, now = Date.now()) {
  const byPhone = new Map()
  for (const appointment of appointments) {
    const key = phoneDigits(appointment.customer.phone)
    if (!byPhone.has(key)) byPhone.set(key, [])
    byPhone.get(key).push(appointment)
  }

  return [...byPhone].map(([phone, list]) => {
    const history = [...list].sort((a, b) => startTime(b) - startTime(a)) // newest first
    const completed = history.filter((a) => a.status === 'Completed')
    const upcoming = history
      .filter((a) => a.status === 'Booked' && startTime(a) >= now)
      .sort((a, b) => startTime(a) - startTime(b))

    return {
      id: phone,
      name: history[0].customer.name, // the most recent name used
      phone,
      visits: completed.length,
      cancelled: history.filter((a) => a.status === 'Cancelled').length,
      totalSpent: completed.reduce((sum, a) => sum + appointmentTotal(a), 0),
      lastVisit: completed[0] ?? null,
      nextVisit: upcoming[0] ?? null,
      history,
    }
  })
}

export const SORTS = {
  name: { label: 'Name (A to Z)', compare: (a, b) => a.name.localeCompare(b.name) },
  recent: {
    label: 'Most recent visit',
    compare: (a, b) => (b.lastVisit?.date ?? '').localeCompare(a.lastVisit?.date ?? '') || a.name.localeCompare(b.name),
  },
  visits: { label: 'Most visits', compare: (a, b) => b.visits - a.visits || a.name.localeCompare(b.name) },
  spent: { label: 'Highest spend', compare: (a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name) },
}
