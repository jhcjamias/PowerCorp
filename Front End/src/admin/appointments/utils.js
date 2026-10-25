// Small helpers for an appointment object.
//
// Shape used across this folder (the real API should return the same fields):
// {
//   id, date: "2026-10-13", time: "11:00",
//   customer: { name, phone },
//   services: [{ id, name, price, durationMin }],
//   status: "Booked" | "Completed" | "Cancelled",
//   payment: "Paid", paymentMethod: "Card", receiptSent: true,
//   referencePhotos: 2, notes: ""
// }

import { addMinutes } from '@/admin/shared/format'

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
