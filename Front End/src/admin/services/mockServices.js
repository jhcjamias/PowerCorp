// Demo service list. It starts from the same services the demo appointments use,
// so names and prices match everywhere in the admin.

import { SERVICES } from '@/admin/appointments/mockAppointments'

let store = null

export function getMockServices() {
  if (!store) store = SERVICES.map((service) => ({ ...service, active: true }))
  return store
}
