<script setup>
import {
  formatDateShort,
  formatMoney,
  formatPhoneDisplay,
  formatTime,
} from '@/admin/shared/format'
import { appointmentTotal, serviceNames } from '../utils'
import StatusBadge from './StatusBadge.vue'

defineProps({
  rows: { type: Array, required: true },
  selectedId: { type: String, default: null },
})

const emit = defineEmits(['select'])
</script>

<template>
  <div class="table-scroll">
    <table>
      <caption class="sr-only">
        Appointments
      </caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Time</th>
          <th scope="col">Customer</th>
          <th scope="col">Phone</th>
          <th scope="col">Service</th>
          <th scope="col" class="num">Total</th>
          <th scope="col">Payment</th>
          <th scope="col">Status</th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          :class="{ selected: row.id === selectedId }"
          @click="emit('select', row.id)"
        >
          <td>{{ formatDateShort(row.date) }}</td>
          <td class="nowrap">{{ formatTime(row.time) }}</td>
          <td class="strong">{{ row.customer.name }}</td>
          <td class="nowrap">{{ formatPhoneDisplay(row.customer.phone) }}</td>
          <td>{{ serviceNames(row) }}</td>
          <td class="num">{{ formatMoney(appointmentTotal(row)) }}</td>
          <td>{{ row.payment }}</td>
          <td><StatusBadge :status="row.status" /></td>
          <td>
            <button
              type="button"
              class="view"
              :aria-current="row.id === selectedId ? 'true' : undefined"
              :aria-label="`View appointment for ${row.customer.name}, ${formatDateShort(row.date)} at ${formatTime(row.time)}`"
              @click.stop="emit('select', row.id)"
            >
              View
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll {
  position: relative; /* keeps the screen-reader-only text inside the scroll area */
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 780px;
  border-collapse: collapse;
  font-size: 15px;
}

th {
  padding: 10px 12px;
  border-bottom: 2px solid var(--rc-ink);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}

td {
  padding: 12px;
  border-bottom: 1px solid #e4e2dc;
  vertical-align: middle;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: var(--rc-surface);
}

tbody tr.selected {
  background: #f1efea;
  box-shadow: inset 4px 0 0 var(--rc-red);
}

.num {
  text-align: right;
}

.nowrap {
  white-space: nowrap;
}

.strong {
  font-weight: 600;
}

.view {
  min-height: 36px;
  padding: 0 14px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.view[aria-current='true'] {
  background: var(--rc-ink);
  color: #fff;
}

.view:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}
</style>
