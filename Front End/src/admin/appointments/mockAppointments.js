// Demo data so the page works before the back end does.
// It builds about two weeks of past and upcoming appointments around today's date,
// using the shop's opening hours (Sun/Mon closed) so the list always looks current.
// Services, prices and times are the same ones the customer site offers.

import { addMinutes, parseDateTime, shopNow, toDateKey } from '@/admin/shared/format'

// Same ids, names, prices (dollars) and minutes as the customer booking site.
export const SERVICES = [
  { id: 'workz', name: 'The Workz', price: 60, durationMin: 50, kind: 'service' },
  { id: 'regular', name: 'The OG', price: 45, durationMin: 35, kind: 'service' },
  { id: 'kids', name: 'Kids Cutz 12 & under', price: 40, durationMin: 30, kind: 'service' },
  { id: 'beard', name: 'Lineworkz', price: 35, durationMin: 30, kind: 'service' },
]

// Upgradez: extra details added to a service. serviceIds = the services each one can be added to.
// (The Workz already includes every upgrade, so it is not listed.)
export const UPGRADES = [
  { id: 'scissor-workz', name: 'Scissor Workz', price: 5, durationMin: 5, kind: 'upgrade', serviceIds: ['regular', 'kids'] },
  { id: 'eyebrow-detail', name: 'Eyebrow Detail', price: 5, durationMin: 5, kind: 'upgrade', serviceIds: ['regular', 'kids'] },
  { id: 'lineworkz', name: 'Lineworkz', price: 5, durationMin: 5, kind: 'upgrade', serviceIds: ['regular'] },
]

const CUSTOMERS = [
  { name: 'Marcus Johnson', phone: '2815550142', email: 'marcus.j@example.com' },
  { name: 'DeAndre Williams', phone: '2815550177', email: 'deandre.w@example.com' },
  { name: 'Chris Alvarez', phone: '8325550119', email: 'chris.alvarez@example.com' },
  { name: 'Tyler Nguyen', phone: '7135550163', email: 'tyler.n@example.com' },
  { name: 'Jordan Brooks', phone: '3465550128', email: 'jordan.b@example.com' },
  { name: 'Malik Carter', phone: '2815550190', email: 'malik.c@example.com' },
  { name: 'Evan Patel', phone: '8325550105', email: 'evan.p@example.com' },
]

const NOTES = ['', 'Low fade, #2 on the sides', '', 'Beard trim, keep the length', '', '', 'First visit']

// getDay(): Sun 0 ... Sat 6. Missing = closed. These are the real opening hours.
const OPENING_HOUR = { 2: 11, 3: 11, 4: 10, 5: 9, 6: 9 }
const SLOT_OFFSETS_MIN = [0, 90, 195] // minutes after opening

export function buildMockAppointments(now = shopNow()) {
  const list = []
  let n = 0

  for (let offset = -14; offset <= 14; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const opening = OPENING_HOUR[day.getDay()]
    if (opening === undefined) continue

    for (const delta of SLOT_OFFSETS_MIN) {
      const date = toDateKey(day)
      const time = addMinutes('00:00', opening * 60 + delta)
      const customer = CUSTOMERS[(n * 3 + 1) % CUSTOMERS.length]
      const service = SERVICES[(n * 5 + 2) % SERVICES.length]

      // Every third The OG or Kids Cutz booking adds an upgrade.
      const lines = [{ ...service }]
      const allowed = UPGRADES.filter((u) => u.serviceIds.includes(service.id))
      if (n % 3 === 0 && allowed.length > 0) {
        const { id, name, price, durationMin } = allowed[n % allowed.length]
        lines.push({ id, name, price, durationMin })
      }

      const past = parseDateTime(date, time) < now
      let status = past ? 'Completed' : 'Booked'
      if (past && n % 11 === 6) status = 'No-show'
      if (n % 9 === 4) status = 'Cancelled'

      const paymentMethod = n % 2 === 0 ? 'Pay at shop' : 'Card'
      const paid = status === 'Completed' || (status === 'Booked' && paymentMethod === 'Card')

      list.push({
        id: `apt-${1000 + n}`,
        date,
        time,
        customer: { ...customer },
        services: lines,
        status,
        payment: paid ? 'Paid' : 'Unpaid',
        paymentMethod,
        receiptSent: paid,
        referencePhotos: n % 3 === 0 ? 2 : 0,
        notes: NOTES[n % NOTES.length],
      })
      n++
    }
  }
  return list
}

// Kept in memory so cancel/reschedule stick until the page is reloaded.
let store = null

export function getMockAppointments() {
  store ??= buildMockAppointments()
  return store
}
