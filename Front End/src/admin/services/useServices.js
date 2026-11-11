// State and logic for the Services & Prices page.

import { computed, onMounted, ref } from 'vue'
import { createService, listServices, updateService } from './servicesService'

export const MAX_PRICE = 1000

export function validateService(fields, others) {
  const name = fields.name.trim()
  const errors = {}
  if (!name) errors.name = 'Enter a service name.'
  else if (others.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'There is already a service with that name.'
  }

  const price = Number(fields.price)
  if (String(fields.price).trim() === '' || Number.isNaN(price)) errors.price = 'Enter a price.'
  else if (price < 0 || price > MAX_PRICE) errors.price = `Price must be between $0 and $${MAX_PRICE}.`

  const minutes = Number(fields.durationMin)
  if (String(fields.durationMin).trim() === '' || Number.isNaN(minutes)) {
    errors.durationMin = 'Enter how long it takes in minutes.'
  } else if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
    errors.durationMin = 'Duration must be a whole number from 5 to 480 minutes.'
  }
  return errors
}

export function useServices() {
  const items = ref([])
  const loading = ref(true)
  const loadError = ref('')

  const busy = ref(false)
  const actionError = ref('')
  const statusMessage = ref('')

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      items.value = await listServices()
    } catch (error) {
      loadError.value = error?.message || 'Could not load services.'
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  // Active services first, then hidden ones; each group A to Z.
  const sorted = computed(() =>
    [...items.value].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name),
    ),
  )

  async function run(task, success) {
    busy.value = true
    actionError.value = ''
    statusMessage.value = ''
    try {
      await task()
      statusMessage.value = success
      return true
    } catch (error) {
      actionError.value = error?.message || 'Something went wrong. Please try again.'
      return false
    } finally {
      busy.value = false
    }
  }

  // fields: { name, price, durationMin }. Returns true when saved.
  function save(id, fields) {
    const clean = {
      name: fields.name.trim(),
      price: Number(fields.price),
      durationMin: Number(fields.durationMin),
    }
    if (id) {
      return run(async () => {
        const updated = await updateService(id, clean)
        items.value = items.value.map((s) => (s.id === id ? updated : s))
      }, `${clean.name} updated.`)
    }
    return run(async () => {
      const created = await createService({ ...clean, active: true })
      items.value = [...items.value, created]
    }, `${clean.name} added.`)
  }

  function setActive(service, active) {
    return run(async () => {
      const updated = await updateService(service.id, { active })
      items.value = items.value.map((s) => (s.id === service.id ? updated : s))
    }, active ? `${service.name} is now shown to customers.` : `${service.name} is now hidden from customers.`)
  }

  function clearActionError() {
    actionError.value = ''
  }

  return {
    loading,
    loadError,
    load,
    sorted,
    items,
    busy,
    actionError,
    statusMessage,
    save,
    setActive,
    clearActionError,
  }
}
