// Small helpers for an appointment object.
//
// Shape used across this folder (the real API should return the same fields):
// {
//   id, date: "2026-10-13", time: "11:00",
//   customer: { name, phone, email },
//   services: [{ id, name, price, durationMin }],   // the service plus any Upgradez, as booked
//   status: "Booked" | "Completed" | "No-show" | "Cancelled",
//   payment: "Paid" | "Unpaid", paymentMethod: "Pay at shop" | "Card", receiptSent: true,
//   referencePhotos: 2, notes: ""
// }

import { addMinutes, parseDateTime, shopNow } from '@/admin/shared/format'

export const STATUSES = ['Booked', 'Completed', 'No-show', 'Cancelled']

// The shop's policy: cancel or reschedule at least 2 hours before the appointment.
export const POLICY_HOURS = 2

// Completed visits and no-shows are charged the full price, so both count as revenue.
export function isBillable(appointment) {
  return appointment.status === 'Completed' || appointment.status === 'No-show'
}

// True when the appointment starts in less than POLICY_HOURS (or has already started).
export function insidePolicyWindow(appointment, now = shopNow()) {
  const start = parseDateTime(appointment.date, appointment.time).getTime()
  return start - now.getTime() < POLICY_HOURS * 3600 * 1000
}

export function appointmentMinutes(appointment) {
  return appointment.services.reduce((sum, service) => sum + service.durationMin, 0)
}

export function appointmentTotal(appointment) {
  return appointment.services.reduce((sum, service) => sum + service.price, 0)
}

export function appointmentEnd(appointment) {
  return addMinutes(appointment.time, appointmentMinutes(appointment))
}

export function serviceNames(appointment) {
  return appointment.services.map((service) => service.name).join(' + ')
}
