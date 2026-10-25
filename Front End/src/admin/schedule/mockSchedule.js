// Demo schedule so the page works before the back end does.
// Opening hours match the shop's current days (Sun/Mon closed).

import { toDateKey } from '@/admin/shared/format'

// day: Sun 0 ... Sat 6 (same as Date.getDay())
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Shown Monday first, the way a shop owner reads a week.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function buildMockSchedule(now = new Date()) {
  const inDays = (n) => {
    const d = new Date(now)
    d.setDate(d.getDate() + n)
    return toDateKey(d)
  }

  return {
    weeklyHours: [
      { day: 0, open: false, start: '10:00', end: '17:00' },
      { day: 1, open: false, start: '10:00', end: '17:00' },
      { day: 2, open: true, start: '11:00', end: '19:00' },
      { day: 3, open: true, start: '11:00', end: '19:00' },
      { day: 4, open: true, start: '10:00', end: '19:00' },
      { day: 5, open: true, start: '10:00', end: '19:00' },
      { day: 6, open: true, start: '08:00', end: '16:00' },
    ],
    timeOff: [
      { id: 't-1', date: inDays(9), endDate: inDays(9), allDay: true, start: '', end: '', reason: 'Dentist' },
      { id: 't-2', date: inDays(20), endDate: inDays(24), allDay: true, start: '', end: '', reason: 'Family trip' },
      { id: 't-3', date: inDays(12), endDate: inDays(12), allDay: false, start: '13:00', end: '15:00', reason: 'Supplier meeting' },
    ],
  }
}

let store = null
export function getMockSchedule() {
  if (!store) store = buildMockSchedule()
  return store
}
