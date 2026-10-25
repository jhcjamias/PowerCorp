// Loads and changes appointments. Uses demo data while VITE_USE_MOCK_API is not "false".
//
// REAL MODE assumes these endpoints (change here if your back end differs):
//   GET   /api/appointments            -> [appointment, ...]  (or { appointments: [...] })
//   PATCH /api/appointments/:id        body { status: "Cancelled" }
//                                      body { status: "Completed" }
//                                      body { date: "2026-10-13", time: "14:30" }
//                                      -> the updated appointment
// Refunds and customer text messages for a cancellation belong on the back end.

import { apiRequest, USE_MOCK_API } from '@/admin/shared/apiClient'
import { getMockAppointments } from './mockAppointments'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => JSON.parse(JSON.stringify(value))

function findMock(id) {
  const found = getMockAppointments().find((appointment) => appointment.id === id)
  if (!found) throw new Error('That appointment no longer exists.')
  return found
}

export async function listAppointments() {
  if (USE_MOCK_API) {
    await wait(400)
    return clone(getMockAppointments())
  }
  const data = await apiRequest('/api/appointments')
  return Array.isArray(data) ? data : (data?.appointments ?? [])
}

export async function cancelAppointment(id) {
  if (USE_MOCK_API) {
    await wait(400)
    const appointment = findMock(id)
    appointment.status = 'Cancelled'
    return clone(appointment)
  }
  return apiRequest(`/api/appointments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'Cancelled' },
  })
}

export async function rescheduleAppointment(id, { date, time }) {
  if (USE_MOCK_API) {
    await wait(400)
    const appointment = findMock(id)
    appointment.date = date
    appointment.time = time
    return clone(appointment)
  }
  return apiRequest(`/api/appointments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { date, time },
  })
}

export async function completeAppointment(id) {
  if (USE_MOCK_API) {
    await wait(400)
    const appointment = findMock(id)
    appointment.status = 'Completed'
    return clone(appointment)
  }
  return apiRequest(`/api/appointments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'Completed' },
  })
}
