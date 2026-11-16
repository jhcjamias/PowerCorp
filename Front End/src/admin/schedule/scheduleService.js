// Loads and changes the shop's weekly hours and time off.
// Uses demo data while VITE_USE_MOCK_API is not "false".
//
// REAL MODE talks to the routes that exist in Back End/crud.py:
//   GET    /api/public/business               -> { schedule: { "0": [openMin, closeMin] | null, ... } }
//   GET    /api/staff/:id/time-off            -> [{ slot_id, day_off_date, start_time, end_date, end_time }]
//   POST   /api/staff/:id/time-off            body { slot_start: "YYYY-MM-DD HH:MM:SS", slot_end }
//   PUT    /api/staff/:id/weekly-hours        body { day_of_week, is_open, start_time, end_time } (one day per call)
//   DELETE /api/staff/:id/time-off/:slotId    -> 204 (404 if it does not exist)
//
// weeklyHours item: { day: 0-6 (Sunday = 0), open: true|false, start: "11:00", end: "19:00" }
// timeOff item:     { id, date: "2026-11-03", endDate: "2026-11-05", allDay: true,
//                     start: "" (or "13:00"), end: "" (or "15:00"), reason: "Dentist" }
// A part-day entry (allDay: false) covers a single date, so date === endDate.
// The back end stores no reason for time off, so reasons are remembered in this browser only.

import { apiRequest, USE_MOCK_API } from '@/admin/shared/apiClient'
import { useAuth } from '@/admin/login-page/useAuth'
import { getMockSchedule } from './mockSchedule'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => JSON.parse(JSON.stringify(value))

const ALL_DAY_START = '00:00:00'
const ALL_DAY_END = '23:59:59'

// The barber whose chair customers book. Set VITE_BARBER_STAFF_ID in .env.local when it
// differs from the admin who is logged in; otherwise the logged-in admin's id is used.
function staffId() {
  const fromEnv = import.meta.env.VITE_BARBER_STAFF_ID
  if (fromEnv) return fromEnv
  const { user } = useAuth()
  return user.value?.id
}

const pad = (n) => String(n).padStart(2, '0')
const minutesToHHMM = (minute) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
const hhmm = (time) => String(time).slice(0, 5)

// Reasons are not stored by the back end, so keep them for this browser session.
const reasons = new Map()

function timeOffFromRow(row) {
  const allDay = row.start_time === ALL_DAY_START && row.end_time === ALL_DAY_END
  return {
    id: row.slot_id,
    date: row.day_off_date,
    endDate: row.end_date,
    allDay,
    start: allDay ? '' : hhmm(row.start_time),
    end: allDay ? '' : hhmm(row.end_time),
    reason: reasons.get(row.slot_id) ?? '',
  }
}

async function loadTimeOff() {
  const rows = await apiRequest(`/api/staff/${staffId()}/time-off`)
  return rows.map(timeOffFromRow)
}

export async function getSchedule() {
  if (USE_MOCK_API) {
    await wait(400)
    return clone(getMockSchedule())
  }
  const [business, timeOff] = await Promise.all([apiRequest('/api/public/business'), loadTimeOff()])
  const weeklyHours = Array.from({ length: 7 }, (_, day) => {
    const window = business.schedule?.[String(day)]
    return window
      ? { day, open: true, start: minutesToHHMM(window[0]), end: minutesToHHMM(window[1]) }
      : { day, open: false, start: '10:00', end: '17:00' }
  })
  return { weeklyHours, timeOff }
}

export async function saveWeeklyHours(weeklyHours) {
  if (USE_MOCK_API) {
    await wait(400)
    getMockSchedule().weeklyHours = clone(weeklyHours)
    return clone(weeklyHours)
  }
  for (const item of weeklyHours) {
    await apiRequest(`/api/staff/${staffId()}/weekly-hours`, {
      method: 'PUT',
      body: {
        day_of_week: item.day,
        is_open: item.open,
        start_time: `${item.start}:00`,
        end_time: `${item.end}:00`,
      },
    })
  }
  return weeklyHours
}

export async function addTimeOff(entry) {
  if (USE_MOCK_API) {
    await wait(400)
    const created = { ...entry, id: `t-${Date.now()}` }
    getMockSchedule().timeOff.push(created)
    return clone(created)
  }
  const startTime = entry.allDay ? ALL_DAY_START : `${entry.start}:00`
  const endTime = entry.allDay ? ALL_DAY_END : `${entry.end}:00`
  const before = new Set((await loadTimeOff()).map((item) => item.id))
  await apiRequest(`/api/staff/${staffId()}/time-off`, {
    method: 'POST',
    body: { slot_start: `${entry.date} ${startTime}`, slot_end: `${entry.endDate} ${endTime}` },
  })
  // The back end does not return the new row, so find the entry that was not there before.
  const after = await loadTimeOff()
  const created = after.filter((item) => !before.has(item.id)).pop()
  if (!created) return { ...entry, id: `t-${Date.now()}` }
  if (entry.reason) reasons.set(created.id, entry.reason)
  return { ...created, reason: entry.reason ?? '' }
}

export async function removeTimeOff(id) {
  if (USE_MOCK_API) {
    await wait(300)
    const schedule = getMockSchedule()
    schedule.timeOff = schedule.timeOff.filter((item) => item.id !== id)
    return
  }
  await apiRequest(`/api/staff/${staffId()}/time-off/${encodeURIComponent(id)}`, { method: 'DELETE' })
  reasons.delete(id)
}
