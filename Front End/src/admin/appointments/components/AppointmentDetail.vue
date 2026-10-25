<script setup>
import { nextTick, ref, watch } from 'vue'
import {
  formatDateLong,
  formatMoney,
  formatPhoneDisplay,
  formatTime,
  toDateKey,
} from '@/admin/shared/format'
import { appointmentEnd, appointmentMinutes, appointmentTotal } from '../utils'
import StatusBadge from './StatusBadge.vue'

const props = defineProps({
  appointment: { type: Object, default: null },
  busy: Boolean,
  error: { type: String, default: '' },
})

const emit = defineEmits(['reschedule', 'cancel', 'complete', 'clear-error'])

// 'view' | 'reschedule' | 'cancel' | 'complete'
const mode = ref('view')
const newDate = ref('')
const newTime = ref('')
const today = toDateKey(new Date())

const heading = ref(null)
const dateInput = ref(null)

function setMode(next) {
  emit('clear-error')
  mode.value = next
  if (next === 'reschedule' && props.appointment) {
    newDate.value = props.appointment.date
    newTime.value = props.appointment.time
    nextTick(() => dateInput.value?.focus())
  }
}

function backToView() {
  setMode('view')
  nextTick(() => heading.value?.focus())
}

// A different appointment was picked: start fresh.
watch(
  () => props.appointment?.id,
  () => {
    mode.value = 'view'
  },
)

// An action finished without an error: go back to the details.
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now && !props.error) backToView()
  },
)
</script>

<template>
  <section class="detail" aria-labelledby="detail-heading">
    <template v-if="appointment">
      <header class="head">
        <h2 id="detail-heading" ref="heading" tabindex="-1">Appointment details</h2>
        <StatusBadge :status="appointment.status" />
      </header>

      <dl class="facts">
        <div>
          <dt>Customer</dt>
          <dd>{{ appointment.customer.name }}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{{ formatPhoneDisplay(appointment.customer.phone) }}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            {{ formatDateLong(appointment.date) }}<br />
            {{ formatTime(appointment.time) }} to {{ formatTime(appointmentEnd(appointment)) }}
            ({{ appointmentMinutes(appointment) }} min)
          </dd>
        </div>
      </dl>

      <table class="services">
        <caption class="sr-only">
          Services booked
        </caption>
        <tbody>
          <tr v-for="service in appointment.services" :key="service.id">
            <td>{{ service.name }}</td>
            <td class="num">{{ formatMoney(service.price) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td class="num">{{ formatMoney(appointmentTotal(appointment)) }}</td>
          </tr>
        </tfoot>
      </table>

      <p class="line">
        <strong>Payment:</strong> {{ appointment.payment }} ({{ appointment.paymentMethod }})
      </p>
      <p class="line">
        <strong>Receipt:</strong> {{ appointment.receiptSent ? 'Sent to customer' : 'Not sent' }}
      </p>

      <div class="photos">
        <h3>Reference photos</h3>
        <ul v-if="appointment.referencePhotos > 0">
          <li v-for="n in appointment.referencePhotos" :key="n">
            <span class="sr-only">Reference photo {{ n }}</span>
            <span aria-hidden="true">Photo {{ n }}</span>
          </li>
        </ul>
        <p v-else class="muted">The customer did not attach any photos.</p>
      </div>

      <p v-if="appointment.notes" class="line"><strong>Notes:</strong> {{ appointment.notes }}</p>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <!-- Actions: only for appointments that are still booked -->
      <div v-if="appointment.status === 'Booked'" class="actions">
        <div v-if="mode === 'view'" class="buttons">
          <button type="button" class="primary" @click="setMode('complete')">Completed</button>
          <button type="button" @click="setMode('reschedule')">Reschedule</button>
          <button type="button" class="danger" @click="setMode('cancel')">
            Cancel appointment
          </button>
        </div>

        <form v-else-if="mode === 'reschedule'" class="panel" novalidate @submit.prevent="emit('reschedule', { date: newDate, time: newTime })">
          <h3>Pick a new time</h3>
          <div class="field">
            <label for="new-date">New date</label>
            <input id="new-date" ref="dateInput" v-model="newDate" type="date" :min="today" required />
          </div>
          <div class="field">
            <label for="new-time">New time</label>
            <input id="new-time" v-model="newTime" type="time" step="900" required />
          </div>
          <div class="buttons">
            <button type="submit" class="primary" :disabled="busy">
              {{ busy ? 'Saving…' : 'Save new time' }}
            </button>
            <button type="button" class="ghost" :disabled="busy" @click="backToView">Keep current time</button>
          </div>
        </form>

        <div v-else-if="mode === 'complete'" class="panel" role="group" aria-labelledby="complete-heading">
          <h3 id="complete-heading">Mark this appointment as completed?</h3>
          <p class="muted">
            {{ appointment.customer.name }}'s appointment will move to Completed and can no longer be
            rescheduled or cancelled.
          </p>
          <div class="buttons">
            <button type="button" class="primary" :disabled="busy" @click="emit('complete')">
              {{ busy ? 'Saving…' : 'Yes, mark completed' }}
            </button>
            <button type="button" class="ghost" :disabled="busy" @click="backToView">Not yet</button>
          </div>
        </div>

        <div v-else class="panel" role="group" aria-labelledby="cancel-heading">
          <h3 id="cancel-heading">Cancel this appointment?</h3>
          <p class="muted">
            {{ appointment.customer.name }}'s appointment on {{ formatDateLong(appointment.date) }}
            at {{ formatTime(appointment.time) }} will be marked as cancelled.
          </p>
          <div class="buttons">
            <button type="button" class="danger solid" :disabled="busy" @click="emit('cancel')">
              {{ busy ? 'Cancelling…' : 'Yes, cancel it' }}
            </button>
            <button type="button" class="ghost" :disabled="busy" @click="backToView">No, keep it</button>
          </div>
        </div>
      </div>
      <p v-else class="muted">
        {{ appointment.status === 'Cancelled' ? 'This appointment was cancelled.' : 'This appointment is finished.' }}
      </p>
    </template>

    <template v-else>
      <h2 id="detail-heading">Appointment details</h2>
      <p class="muted">Select an appointment from the list to see its details.</p>
    </template>
  </section>
</template>

<style scoped>
.detail {
  position: relative;
  padding: 20px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

h2 {
  margin: 0;
  font-size: 20px;
}

h2:focus {
  outline: none;
}

h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.facts {
  display: grid;
  gap: 12px;
  margin: 16px 0;
}

.facts dt {
  font-size: 13px;
  color: var(--rc-muted);
}

.facts dd {
  margin: 2px 0 0;
  font-weight: 600;
}

.services {
  width: 100%;
  margin-bottom: 14px;
  border-collapse: collapse;
  font-size: 15px;
}

.services td,
.services th {
  padding: 8px 0;
  border-bottom: 1px solid #e4e2dc;
  text-align: left;
}

.services tfoot th,
.services tfoot td {
  border-bottom: 0;
  border-top: 2px solid var(--rc-ink);
  font-weight: 700;
}

.num {
  text-align: right !important;
}

.line {
  margin: 6px 0;
  font-size: 15px;
}

.muted {
  margin: 8px 0 0;
  color: var(--rc-muted);
  font-size: 14px;
}

.photos {
  margin-top: 16px;
}

.photos ul {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.photos li {
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  border: 1.5px dashed var(--rc-line);
  border-radius: 8px;
  background: var(--rc-surface);
  color: var(--rc-muted);
  font-size: 12px;
}

.error {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-left: 4px solid var(--rc-red);
  background: var(--rc-error-bg);
  color: var(--rc-red-dark);
  font-size: 14px;
  font-weight: 600;
}

.actions {
  margin-top: 18px;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 10px;
  background: var(--rc-surface);
}

.field {
  display: grid;
  gap: 6px;
}

label {
  font-size: 13px;
  font-weight: 600;
}

input {
  min-height: 44px;
  padding: 0 12px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  font-size: 15px;
}

button {
  min-height: 44px;
  padding: 0 18px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

button.primary {
  background: var(--rc-ink);
  color: #fff;
}

button.danger {
  border-color: var(--rc-red);
  color: var(--rc-red-dark);
}

button.danger.solid {
  background: var(--rc-red);
  color: #fff;
}

button.ghost {
  border-color: var(--rc-line);
}

button:disabled {
  opacity: 0.6;
  cursor: wait;
}

button:focus-visible,
input:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}
</style>
