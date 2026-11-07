// Loads and changes the shop's weekly hours and time off.
// Uses demo data while VITE_USE_MOCK_API is not "false".
//
// REAL MODE assumes these endpoints (change here if your back end differs):
//   GET    /api/schedule              -> { weeklyHours: [...], timeOff: [...] }
//   PUT    /api/schedule/hours        body { weeklyHours: [...] }   -> { weeklyHours: [...] }
//   POST   /api/schedule/time-off     body { date, endDate, allDay, start, end, reason } -> the new entry
//   DELETE /api/schedule/time-off/:id -> 204
//
// weeklyHours item: { day: 0-6 (Sunday = 0), open: true|false, start: "11:00", end: "19:00" }
// timeOff item:     { id, date: "2026-11-03", endDate: "2026-11-05", allDay: true,
//                     start: "" (or "13:00"), end: "" (or "15:00"), reason: "Dentist" }
// A part-day entry (allDay: false) covers a single date, so date === endDate.
// Customers must not be able to book inside time off or outside open hours: the back end
// enforces that when it works out available slots.

import { apiRequest, USE_MOCK_API } from '@/admin/shared/apiClient'
import { getMockSchedule } from './mockSchedule'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => JSON.parse(JSON.stringify(value))

export async function getSchedule() {
  if (USE_MOCK_API) {
    await wait(400)
    return clone(getMockSchedule())
  }
  return apiRequest('/api/schedule')
}

export async function saveWeeklyHours(weeklyHours) {
  if (USE_MOCK_API) {
    await wait(400)
    getMockSchedule().weeklyHours = clone(weeklyHours)
    return clone(weeklyHours)
  }
  const data = await apiRequest('/api/schedule/hours', { method: 'PUT', body: { weeklyHours } })
  return data?.weeklyHours ?? weeklyHours
}

export async function addTimeOff(entry) {
  if (USE_MOCK_API) {
    await wait(400)
    const created = { ...entry, id: `t-${Date.now()}` }
    getMockSchedule().timeOff.push(created)
    return clone(created)
  }
  return apiRequest('/api/schedule/time-off', { method: 'POST', body: entry })
}

export async function removeTimeOff(id) {
  if (USE_MOCK_API) {
    await wait(300)
    const schedule = getMockSchedule()
    schedule.timeOff = schedule.timeOff.filter((item) => item.id !== id)
    return
  }
  await apiRequest(`/api/schedule/time-off/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
