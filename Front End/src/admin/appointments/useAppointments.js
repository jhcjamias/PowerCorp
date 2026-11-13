// All the state and logic for the Appointments page (the components just display it).

import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { formatTime, parseDateTime, shopNow, toMinutes } from '@/admin/shared/format'
import { getSchedule } from '@/admin/schedule/scheduleService'
import { listServices } from '@/admin/services/servicesService'
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  listAppointments,
  noShowAppointment,
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
    const nameMatch =
      appointment.customer.name.toLowerCase().includes(query) ||
      String(appointment.customer.email ?? '').toLowerCase().includes(query)
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

// Why a time can't be booked: outside the shop's hours, or inside a time-off block. '' = fine.
function closedReason(schedule, date, time, minutes) {
  if (!schedule) return ''
  const start = toMinutes(time)
  const end = start + minutes
  const day = schedule.weeklyHours.find((h) => h.day === parseDateTime(date).getDay())
  if (!day?.open) return 'The shop is closed that day.'
  if (start < toMinutes(day.start) || end > toMinutes(day.end)) {
    return `The shop is open ${formatTime(day.start)} to ${formatTime(day.end)} that day, and this appointment would run outside those hours.`
  }
  const off = schedule.timeOff.find((t) => {
    if (date < t.date || date > t.endDate) return false
    if (t.allDay) return true
    return start < toMinutes(t.end) && toMinutes(t.start) < end
  })
  if (off) return `That time is blocked off${off.reason ? ` (${off.reason})` : ''}.`
  return ''
}

export function useAppointments() {
  const items = ref([])
  const catalog = ref([]) // services and upgrades the owner currently shows to customers
  const schedule = ref(null)
  const loading = ref(true)
  const loadError = ref('')

  // The Customers page links here with ?search=<phone> to show one customer's appointments.
  const route = useRoute()
  const initialSearch = typeof route.query.search === 'string' ? route.query.search : ''

  const filters = reactive({ ...DEFAULT_FILTERS, search: initialSearch })
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
      // Only needed by the New appointment form; the list still works if these fail.
      try {
        const [all, hours] = await Promise.all([listServices(), getSchedule()])
        catalog.value = all.filter((s) => s.active)
        schedule.value = hours
      } catch {
        catalog.value = []
      }
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

  function noShow(id) {
    actionError.value = ''
    statusMessage.value = ''
    return run(async () => {
      replace(await noShowAppointment(id))
      statusMessage.value = 'Appointment marked as a no-show. The full price is charged.'
    })
  }

  // Staff adding a walk-in or phone booking. fields: see createAppointment().
  // Returns true when saved; otherwise sets createError.
  const createError = ref('')
  async function create(fields) {
    createError.value = ''
    statusMessage.value = ''
    const minutes = fields.services.reduce((sum, s) => sum + s.durationMin, 0)
    if (parseDateTime(fields.date, fields.time).getTime() < shopNow().getTime()) {
      createError.value = 'That time has already passed.'
      return false
    }
    const closed = closedReason(schedule.value, fields.date, fields.time, minutes)
    if (closed) {
      createError.value = closed
      return false
    }
    const clash = findConflict(items.value, null, fields.date, fields.time, minutes)
    if (clash) {
      createError.value = `That overlaps ${clash.customer.name}'s appointment at ${formatTime(clash.time)}.`
      return false
    }
    actionBusy.value = true
    try {
      const created = await createAppointment(fields)
      items.value = [...items.value, created]
      resetFilters()
      selectedId.value = created.id
      statusMessage.value = `Appointment added for ${created.customer.name}.`
      return true
    } catch (error) {
      createError.value = error?.message || 'Could not add the appointment. Please try again.'
      return false
    } finally {
      actionBusy.value = false
    }
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
    if (parseDateTime(date, time).getTime() < shopNow().getTime()) {
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
    noShow,
    reschedule,
    catalog,
    create,
    createError,
  }
}
