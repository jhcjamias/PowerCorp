// Turns the appointments in a report into a CSV file the owner can open in Excel.

import { appointmentTotal, serviceNames } from '@/admin/appointments/utils'

// A cell that starts with = + - or @ can run as a formula in Excel, so it gets a leading '.
function cell(value) {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function appointmentsToCsv(appointments) {
  const header = ['Date', 'Time', 'Customer', 'Phone', 'Services', 'Total', 'Payment', 'Status']
  const rows = [...appointments]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .map((a) => [
      a.date,
      a.time,
      a.customer.name,
      a.customer.phone,
      serviceNames(a),
      appointmentTotal(a).toFixed(2),
      a.payment,
      a.status,
    ])
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
}

export function downloadCsv(filename, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
