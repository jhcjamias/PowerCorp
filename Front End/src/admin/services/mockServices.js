// Demo list of services and upgrades. It starts from the same catalog the demo
// appointments use (which matches the customer site), so names and prices agree everywhere.

import { SERVICES, UPGRADES } from '@/admin/appointments/mockAppointments'

let store = null

export function getMockServices() {
  if (!store) store = [...SERVICES, ...UPGRADES].map((item) => ({ ...item, active: true }))
  return store
}
