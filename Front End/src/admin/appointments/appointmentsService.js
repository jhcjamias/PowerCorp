// Loads and changes appointments. Uses demo data while VITE_USE_MOCK_API is not "false".
//
// REAL MODE assumes these endpoints (change here if your back end differs):
//   GET   /api/appointments            -> [appointment, ...]  (or { appointments: [...] })
//   POST  /api/appointments            body { date, time, customer: { name, phone, email },
//                                             serviceIds: ["regular", "scissor-workz"],
//                                             paymentMethod: "Pay at shop" | "Card", notes }
//                                      -> the new appointment (staff adding a walk-in or phone booking)
//   PATCH /api/appointments/:id        body { status: "Cancelled" }
//                                      body { status: "Completed" }
//                                      body { status: "No-show" }   (the full price is charged)
//                                      body { date: "2026-10-13", time: "14:30" }
//                                      -> the updated appointment
// Refunds and customer text messages for a cancellation belong on the back end.
//
// The customer site reschedules by marking the old booking "rescheduled" and creating a new one.
// The admin ignores any appointment whose status is "Rescheduled" so it is not counted as a
// cancellation. (Best: the back end changes the date and time in place and keeps one record.)

import { apiRequest, USE_MOCK_API } from '@/admin/shared/apiClient'
import { getMockAppointments } from './mockAppointments'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => JSON.parse(JSON.stringify(value))

function findMock(id) {
  const found = getMockAppointments().find((appointment) => appointment.id === id)
  if (!found) throw new Error('That appointment no longer exists.')
  return found
}

const isCurrent = (appointment) => String(appointment.status).toLowerCase() !== 'rescheduled'

export async function listAppointments() {
  if (USE_MOCK_API) {
    await wait(400)
    return clone(getMockAppointments())
  }
  const data = await apiRequest('/api/appointments')
  return (Array.isArray(data) ? data : (data?.appointments ?? [])).filter(isCurrent)
}

// fields: { date, time, customer: { name, phone, email }, services: [line, ...], paymentMethod, notes }
export async function createAppointment(fields) {
  if (USE_MOCK_API) {
    await wait(400)
    const paid = fields.paymentMethod === 'Card'
    const created = {
      id: `apt-new-${Date.now()}`,
      date: fields.date,
      time: fields.time,
      customer: { ...fields.customer },
      services: fields.services.map(({ id, name, price, durationMin }) => ({ id, name, price, durationMin })),
      status: 'Booked',
      payment: paid ? 'Paid' : 'Unpaid',
      paymentMethod: fields.paymentMethod,
      receiptSent: false,
      referencePhotos: 0,
      notes: fields.notes ?? '',
    }
    getMockAppointments().push(created)
    return clone(created)
  }
  return apiRequest('/api/appointments', {
    method: 'POST',
    body: {
      date: fields.date,
      time: fields.time,
      customer: fields.customer,
      serviceIds: fields.services.map((s) => s.id),
      paymentMethod: fields.paymentMethod,
      notes: fields.notes ?? '',
    },
  })
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

export async function noShowAppointment(id) {
  if (USE_MOCK_API) {
    await wait(400)
    const appointment = findMock(id)
    appointment.status = 'No-show'
    return clone(appointment)
  }
  return apiRequest(`/api/appointments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'No-show' },
  })
}
