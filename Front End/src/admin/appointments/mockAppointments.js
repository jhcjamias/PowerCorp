// Demo data so the page works before the back end does.
// It builds about two weeks of past and upcoming appointments around today's date,
// using the shop's opening hours (Sun/Mon closed) so the list always looks current.

import { addMinutes, parseDateTime, toDateKey } from '@/admin/shared/format'

export const SERVICES = [
  { id: 'haircut', name: 'Haircut', price: 45, durationMin: 45 },
  { id: 'haircut-beard', name: 'Haircut + Beard', price: 50, durationMin: 60 },
  { id: 'haircut-beard-eyebrows', name: 'Haircut, Beard, Eyebrows', price: 55, durationMin: 75 },
]

const CUSTOMERS = [
  { name: 'Marcus Johnson', phone: '2815550142' },
  { name: 'DeAndre Williams', phone: '2815550177' },
  { name: 'Chris Alvarez', phone: '8325550119' },
  { name: 'Tyler Nguyen', phone: '7135550163' },
  { name: 'Jordan Brooks', phone: '3465550128' },
  { name: 'Malik Carter', phone: '2815550190' },
  { name: 'Evan Patel', phone: '8325550105' },
]

const NOTES = ['', 'Low fade, #2 on the sides', '', 'Beard trim, keep the length', '', '', 'First visit']

// getDay(): Sun 0 ... Sat 6. Missing = closed.
const OPENING_HOUR = { 2: 11, 3: 11, 4: 10, 5: 10, 6: 8 }
const SLOT_OFFSETS_MIN = [0, 90, 195] // minutes after opening

export function buildMockAppointments(now = new Date()) {
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

      let status = parseDateTime(date, time) < now ? 'Completed' : 'Booked'
      if (n % 9 === 4) status = 'Cancelled'

      list.push({
        id: `apt-${1000 + n}`,
        date,
        time,
        customer: { ...customer },
        services: [{ ...service }],
        status,
        payment: 'Paid',
        paymentMethod: 'Card',
        receiptSent: true,
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
