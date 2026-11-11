// Loads and changes the shop's services and prices.
// Uses demo data while VITE_USE_MOCK_API is not "false".
//
// REAL MODE assumes these endpoints (change here if your back end differs):
//   GET   /api/services        -> [service, ...]   (or { services: [...] })
//   POST  /api/services        body { kind, name, price, durationMin, serviceIds?, active } -> the new item
//   PATCH /api/services/:id    body: any of { name, price, durationMin, serviceIds, active } -> the updated item
//
// service: { id: "regular", kind: "service", name: "The OG", price: 45, durationMin: 35, active: true }
// upgrade: { id: "scissor-workz", kind: "upgrade", name: "Scissor Workz", price: 5, durationMin: 5,
//            serviceIds: ["regular", "kids"], active: true }
// An upgrade (the customer site calls them "Upgradez") is added on top of a service. serviceIds lists
// the services it can be added to. The Workz already includes every upgrade, so it is not listed.
// Services are hidden (active: false) instead of deleted, so old appointments keep their service.
// An appointment keeps a copy of the name, price and duration it was booked with.
// Changing a price here must NOT change appointments that already exist.

import { apiRequest, USE_MOCK_API } from '@/admin/shared/apiClient'
import { getMockServices } from './mockServices'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => JSON.parse(JSON.stringify(value))

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export async function listServices() {
  if (USE_MOCK_API) {
    await wait(400)
    return clone(getMockServices())
  }
  const data = await apiRequest('/api/services')
  return Array.isArray(data) ? data : (data?.services ?? [])
}

export async function createService(fields) {
  if (USE_MOCK_API) {
    await wait(400)
    const list = getMockServices()
    let id = slug(fields.name) || `service-${list.length + 1}`
    while (list.some((s) => s.id === id)) id += '-2'
    const created = { id, ...fields }
    list.push(created)
    return clone(created)
  }
  return apiRequest('/api/services', { method: 'POST', body: fields })
}

export async function updateService(id, patch) {
  if (USE_MOCK_API) {
    await wait(400)
    const found = getMockServices().find((s) => s.id === id)
    if (!found) throw new Error('That service no longer exists.')
    Object.assign(found, patch)
    return clone(found)
  }
  return apiRequest(`/api/services/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch })
}
