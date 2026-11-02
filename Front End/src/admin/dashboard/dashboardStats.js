// Numbers for the dashboard, worked out from the appointment list.
// Revenue only counts appointments marked Completed.

import { toDateKey, parseDateTime } from '@/admin/shared/format'
import { appointmentTotal } from '@/admin/appointments/utils'

const addDays = (date, n) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

const startTime = (a) => parseDateTime(a.date, a.time).getTime()

export function dashboardStats(appointments, now = new Date()) {
  const today = toDateKey(now)
  const weekEnd = toDateKey(addDays(now, 6))
  const weekAgo = toDateKey(addDays(now, -6))
  const monthAgo = toDateKey(addDays(now, -29))

  const todayList = appointments
    .filter((a) => a.date === today && a.status !== 'Cancelled')
    .sort((a, b) => a.time.localeCompare(b.time))

  const upcoming = appointments
    .filter((a) => a.status === 'Booked' && startTime(a) >= now.getTime())
    .sort((a, b) => startTime(a) - startTime(b))

  return {
    today,
    todayList,
    bookedToday: todayList.filter((a) => a.status === 'Booked').length,
    nextUp: upcoming[0] ?? null,
    bookedThisWeek: appointments.filter(
      (a) => a.status === 'Booked' && a.date >= today && a.date <= weekEnd,
    ).length,
    revenueLast7: appointments
      .filter((a) => a.status === 'Completed' && a.date >= weekAgo && a.date <= today)
      .reduce((sum, a) => sum + appointmentTotal(a), 0),
    cancelledLast30: appointments.filter(
      (a) => a.status === 'Cancelled' && a.date >= monthAgo && a.date <= today,
    ).length,
  }
}
