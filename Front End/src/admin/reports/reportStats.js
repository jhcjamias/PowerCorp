// Report numbers, worked out from the appointment list for a date range.
// Revenue only counts appointments marked Completed.

import { formatDateShort, parseDateTime, toDateKey } from '@/admin/shared/format'
import { appointmentTotal } from '@/admin/appointments/utils'

export const PRESETS = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom dates' },
]

export const MAX_RANGE_DAYS = 120

const addDays = (date, n) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function presetRange(id, now = new Date()) {
  const to = toDateKey(now)
  if (id === '7') return { from: toDateKey(addDays(now, -6)), to }
  if (id === '30') return { from: toDateKey(addDays(now, -29)), to }
  return { from: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to }
}

export function daysBetween(from, to) {
  const ms = parseDateTime(to).getTime() - parseDateTime(from).getTime()
  return Math.round(ms / 86400000) + 1
}

export function rangeProblem(from, to) {
  if (!from || !to) return 'Pick both a start and an end date.'
  if (to < from) return 'The end date can’t be before the start date.'
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return `Pick a range of ${MAX_RANGE_DAYS} days or less.`
  return ''
}

const mondayOf = (dateKey) => {
  const d = parseDateTime(dateKey)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toDateKey(d)
}

export function reportFor(appointments, from, to) {
  const inRange = appointments.filter((a) => a.date >= from && a.date <= to)
  const completed = inRange.filter((a) => a.status === 'Completed')
  const cancelled = inRange.filter((a) => a.status === 'Cancelled')
  const revenue = completed.reduce((sum, a) => sum + appointmentTotal(a), 0)

  // Bars: one per day, or one per week when the range is longer than a month.
  const weekly = daysBetween(from, to) > 31
  const buckets = new Map()
  for (let d = parseDateTime(from); toDateKey(d) <= to; d = addDays(d, 1)) {
    const key = toDateKey(d)
    const bucket = weekly ? mondayOf(key) : key
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { key: bucket, label: weekly ? `Week of ${formatDateShort(bucket)}` : formatDateShort(bucket), value: 0, visits: 0 })
    }
  }
  for (const a of completed) {
    const bucket = buckets.get(weekly ? mondayOf(a.date) : a.date)
    if (bucket) {
      bucket.value += appointmentTotal(a)
      bucket.visits += 1
    }
  }

  // Revenue per service (each service line on a completed appointment).
  const byService = new Map()
  for (const a of completed) {
    for (const s of a.services) {
      const row = byService.get(s.id) ?? { id: s.id, name: s.name, count: 0, revenue: 0 }
      row.count += 1
      row.revenue += s.price
      byService.set(s.id, row)
    }
  }
  const services = [...byService.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((row) => ({ ...row, share: revenue > 0 ? row.revenue / revenue : 0 }))

  return {
    inRange,
    weekly,
    revenue,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    cancelRate: inRange.length > 0 ? cancelled.length / inRange.length : 0,
    average: completed.length > 0 ? revenue / completed.length : 0,
    bars: [...buckets.values()],
    services,
  }
}
