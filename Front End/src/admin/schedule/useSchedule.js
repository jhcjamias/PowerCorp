// State and logic for the Schedule & Time Off page (the components just display it).

import { computed, onMounted, ref } from 'vue'
import { toDateKey, toMinutes } from '@/admin/shared/format'
import { listAppointments } from '@/admin/appointments/appointmentsService'
import { addTimeOff, getSchedule, removeTimeOff, saveWeeklyHours } from './scheduleService'
import { DAY_ORDER } from './mockSchedule'

const clone = (value) => JSON.parse(JSON.stringify(value))

// Booked appointments that fall inside a time-off entry (full days, or the part-day window).
export function appointmentsInTimeOff(entry, appointments) {
  return appointments.filter((a) => {
    if (a.status !== 'Booked') return false
    if (a.date < entry.date || a.date > entry.endDate) return false
    if (entry.allDay) return true
    const start = toMinutes(a.time)
    const end = start + a.services.reduce((sum, s) => sum + s.durationMin, 0)
    return start < toMinutes(entry.end) && toMinutes(entry.start) < end
  })
}

export function useSchedule() {
  const loading = ref(true)
  const loadError = ref('')

  const savedHours = ref([]) // what the server has
  const hours = ref([]) // what is on screen (may have unsaved edits)
  const timeOff = ref([])
  const appointments = ref([])

  const hoursBusy = ref(false)
  const hoursError = ref('')
  const timeOffBusy = ref(false)
  const timeOffError = ref('')
  const statusMessage = ref('')

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      const [schedule, booked] = await Promise.all([getSchedule(), listAppointments()])
      savedHours.value = clone(schedule.weeklyHours)
      hours.value = clone(schedule.weeklyHours)
      timeOff.value = schedule.timeOff
      appointments.value = booked
    } catch (error) {
      loadError.value = error?.message || 'Could not load the schedule.'
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  // ---- weekly hours
  const orderedHours = computed(() =>
    DAY_ORDER.map((day) => hours.value.find((h) => h.day === day)).filter(Boolean),
  )
  const hoursDirty = computed(
    () => JSON.stringify(hours.value) !== JSON.stringify(savedHours.value),
  )

  // Problem text per day, e.g. { 2: "Closing time must be after opening time." }
  const hoursProblems = computed(() => {
    const problems = {}
    for (const h of hours.value) {
      if (!h.open) continue
      if (!h.start || !h.end) problems[h.day] = 'Pick an opening and a closing time.'
      else if (toMinutes(h.end) <= toMinutes(h.start)) {
        problems[h.day] = 'Closing time must be after opening time.'
      }
    }
    return problems
  })

  function updateDay(day, patch) {
    hoursError.value = ''
    statusMessage.value = ''
    hours.value = hours.value.map((h) => (h.day === day ? { ...h, ...patch } : h))
  }
  function discardHours() {
    hours.value = clone(savedHours.value)
    hoursError.value = ''
  }

  async function saveHours() {
    statusMessage.value = ''
    if (Object.keys(hoursProblems.value).length > 0) {
      hoursError.value = 'Fix the highlighted days before saving.'
      return false
    }
    hoursBusy.value = true
    hoursError.value = ''
    try {
      const saved = await saveWeeklyHours(hours.value)
      savedHours.value = clone(saved)
      hours.value = clone(saved)
      statusMessage.value = 'Opening hours saved.'
      return true
    } catch (error) {
      hoursError.value = error?.message || 'Could not save the hours. Please try again.'
      return false
    } finally {
      hoursBusy.value = false
    }
  }

  // ---- time off
  const today = toDateKey(new Date())

  // Upcoming and current entries, soonest first. Past entries are hidden.
  const upcomingTimeOff = computed(() =>
    timeOff.value
      .filter((t) => t.endDate >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '')),
  )

  function timeOffProblem(entry) {
    if (!entry.date) return 'Pick a start date.'
    if (entry.allDay && !entry.endDate) return 'Pick an end date.'
    if (entry.endDate < today) return 'That date has already passed.'
    if (entry.endDate < entry.date) return 'The end date can’t be before the start date.'
    if (!entry.allDay) {
      if (!entry.start || !entry.end) return 'Pick a start and an end time.'
      if (toMinutes(entry.end) <= toMinutes(entry.start)) return 'The end time must be after the start time.'
    }
    return ''
  }

  function conflictsFor(entry) {
    if (timeOffProblem(entry)) return []
    return appointmentsInTimeOff(entry, appointments.value)
  }

  async function add(entry) {
    statusMessage.value = ''
    const clean = {
      date: entry.date,
      endDate: entry.allDay ? entry.endDate : entry.date,
      allDay: entry.allDay,
      start: entry.allDay ? '' : entry.start,
      end: entry.allDay ? '' : entry.end,
      reason: entry.reason.trim(),
    }
    const problem = timeOffProblem(clean)
    if (problem) {
      timeOffError.value = problem
      return false
    }
    timeOffBusy.value = true
    timeOffError.value = ''
    try {
      const created = await addTimeOff(clean)
      timeOff.value = [...timeOff.value, created]
      const clashes = appointmentsInTimeOff(created, appointments.value).length
      statusMessage.value =
        clashes > 0
          ? `Time off added. ${clashes} booked ${clashes === 1 ? 'appointment falls' : 'appointments fall'} in that time. Reschedule or cancel ${clashes === 1 ? 'it' : 'them'} on the Appointments page.`
          : 'Time off added.'
      return true
    } catch (error) {
      timeOffError.value = error?.message || 'Could not add the time off. Please try again.'
      return false
    } finally {
      timeOffBusy.value = false
    }
  }

  async function remove(id) {
    statusMessage.value = ''
    timeOffError.value = ''
    timeOffBusy.value = true
    try {
      await removeTimeOff(id)
      timeOff.value = timeOff.value.filter((t) => t.id !== id)
      statusMessage.value = 'Time off removed.'
    } catch (error) {
      timeOffError.value = error?.message || 'Could not remove the time off. Please try again.'
    } finally {
      timeOffBusy.value = false
    }
  }

  function clearTimeOffError() {
    timeOffError.value = ''
  }

  return {
    loading,
    loadError,
    load,
    orderedHours,
    hoursDirty,
    hoursProblems,
    hoursBusy,
    hoursError,
    updateDay,
    discardHours,
    saveHours,
    today,
    upcomingTimeOff,
    timeOffBusy,
    timeOffError,
    clearTimeOffError,
    conflictsFor,
    add,
    remove,
    statusMessage,
  }
}
