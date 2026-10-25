// All the state and logic for the Appointments page (the components just display it).

import { computed, onMounted, reactive, ref, watch } from 'vue'
import { formatTime, parseDateTime, toMinutes } from '@/admin/shared/format'
import {
  cancelAppointment,
  completeAppointment,
  listAppointments,
  rescheduleAppointment,
} from './appointmentsService'
import { appointmentMinutes } from './utils'

export const PAGE_SIZE = 8

const DEFAULT_FILTERS = { search: '', from: '', to: '', status: 'all', service: 'all' }

const startTime = (appointment) => parseDateTime(appointment.date, appointment.time).getTime()
const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '')

function matchesFilters(appointment, filters) {
  if (filters.status !== 'all' && appointment.status !== filters.status) return false
  if (filters.service !== 'all' && !appointment.services.some((s) => s.id === filters.service)) {
    return false
  }
  if (filters.from && appointment.date < filters.from) return false
  if (filters.to && appointment.date > filters.to) return false

  const query = filters.search.trim().toLowerCase()
  if (query) {
    const queryDigits = digitsOnly(query)
    const nameMatch = appointment.customer.name.toLowerCase().includes(query)
    const phoneMatch =
      queryDigits.length > 0 && digitsOnly(appointment.customer.phone).includes(queryDigits)
    if (!nameMatch && !phoneMatch) return false
  }
  return true
}

// Another booked appointment (the shop has one barber) that overlaps the new time.
function findConflict(items, id, date, time, minutes) {
  const start = toMinutes(time)
  const end = start + minutes
  return items.find((other) => {
    if (other.id === id || other.status !== 'Booked' || other.date !== date) return false
    const otherStart = toMinutes(other.time)
    return start < otherStart + appointmentMinutes(other) && otherStart < end
  })
}

export function useAppointments() {
  const items = ref([])
  const loading = ref(true)
  const loadError = ref('')

  const filters = reactive({ ...DEFAULT_FILTERS })
  const page = ref(1)
  const selectedId = ref(null)

  const actionBusy = ref(false)
  const actionError = ref('')
  const statusMessage = ref('')

  // ---- loading
  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      items.value = await listAppointments()
      selectedId.value = sorted.value[0]?.id ?? null // the next appointment
    } catch (error) {
      loadError.value = error?.message || 'Could not load appointments.'
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  // ---- filtering, ordering, paging
  const filtered = computed(() => items.value.filter((a) => matchesFilters(a, filters)))

  // Upcoming appointments first (soonest at the top), then past ones (most recent first).
  const sorted = computed(() => {
    const now = Date.now()
    const upcoming = filtered.value.filter((a) => startTime(a) >= now)
    const past = filtered.value.filter((a) => startTime(a) < now)
    upcoming.sort((a, b) => startTime(a) - startTime(b))
    past.sort((a, b) => startTime(b) - startTime(a))
    return [...upcoming, ...past]
  })

  const total = computed(() => sorted.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  const pageRows = computed(() => {
    const from = (page.value - 1) * PAGE_SIZE
    return sorted.value.slice(from, from + PAGE_SIZE)
  })
  const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1))
  const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, total.value))

  const hasActiveFilters = computed(() =>
    Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== DEFAULT_FILTERS[key]),
  )

  // Services to offer in the filter, taken from the appointments themselves.
  const serviceOptions = computed(() => {
    const byId = new Map()
    for (const appointment of items.value) {
      for (const service of appointment.services) byId.set(service.id, service.name)
    }
    return [...byId].map(([id, name]) => ({ id, name }))
  })

  function updateFilters(patch) {
    Object.assign(filters, patch)
  }
  function resetFilters() {
    Object.assign(filters, DEFAULT_FILTERS)
  }
  function goToPage(next) {
    page.value = Math.min(Math.max(1, next), pageCount.value)
  }

  watch(filters, () => {
    page.value = 1
  })
  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })
  // Drop the selection if changing a filter hides the selected appointment.
  // (Cancelling or rescheduling does not count: the admin keeps seeing the result.)
  watch(filters, () => {
    if (selectedId.value && !filtered.value.some((a) => a.id === selectedId.value)) {
      selectedId.value = null
    }
  })

  // ---- selection
  const selected = computed(() => items.value.find((a) => a.id === selectedId.value) ?? null)
  function select(id) {
    selectedId.value = id
    actionError.value = ''
    statusMessage.value = ''
  }

  // ---- changing an appointment
  function replace(updated) {
    items.value = items.value.map((a) => (a.id === updated.id ? updated : a))
  }

  async function run(task) {
    actionBusy.value = true
    try {
      await task()
      return true
    } catch (error) {
      actionError.value = error?.message || 'Something went wrong. Please try again.'
      return false
    } finally {
      actionBusy.value = false
    }
  }

  function clearActionError() {
    actionError.value = ''
  }

  function cancel(id) {
    actionError.value = ''
    statusMessage.value = ''
    return run(async () => {
      replace(await cancelAppointment(id))
      statusMessage.value = 'Appointment cancelled.'
    })
  }

  function complete(id) {
    actionError.value = ''
    statusMessage.value = ''
    return run(async () => {
      replace(await completeAppointment(id))
      statusMessage.value = 'Appointment marked as completed.'
    })
  }

  function reschedule(id, { date, time }) {
    actionError.value = ''
    statusMessage.value = ''

    const current = items.value.find((a) => a.id === id)
    if (!current) return Promise.resolve(false)

    if (!date || !time) {
      actionError.value = 'Pick a date and a time.'
      return Promise.resolve(false)
    }
    if (parseDateTime(date, time).getTime() < Date.now()) {
      actionError.value = 'That time has already passed.'
      return Promise.resolve(false)
    }
    const clash = findConflict(items.value, id, date, time, appointmentMinutes(current))
    if (clash) {
      actionError.value = `That overlaps ${clash.customer.name}'s appointment at ${formatTime(clash.time)}.`
      return Promise.resolve(false)
    }

    return run(async () => {
      replace(await rescheduleAppointment(id, { date, time }))
      statusMessage.value = 'Appointment rescheduled.'
    })
  }

  return {
    loading,
    loadError,
    load,
    filters,
    hasActiveFilters,
    serviceOptions,
    updateFilters,
    resetFilters,
    page,
    pageCount,
    pageRows,
    total,
    rangeStart,
    rangeEnd,
    goToPage,
    selected,
    selectedId,
    select,
    actionBusy,
    actionError,
    statusMessage,
    clearActionError,
    cancel,
    complete,
    reschedule,
  }
}
