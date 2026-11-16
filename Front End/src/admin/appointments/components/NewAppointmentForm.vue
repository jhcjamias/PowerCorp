<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { formatMoney, shopNow, toDateKey } from '@/admin/shared/format'
import { formatPhone, normalizePhone, validatePhone } from '@/admin/login-page/validators'

const props = defineProps({
  // services and upgrades that are currently shown to customers
  catalog: { type: Array, default: () => [] },
  busy: Boolean,
  error: { type: String, default: '' },
  // (fields) => Promise<boolean>
  submit: { type: Function, required: true },
})

const emit = defineEmits(['done', 'clear-error'])

const fields = reactive({
  name: '',
  phone: '',
  email: '',
  serviceId: '',
  upgradeIds: [],
  date: toDateKey(shopNow()),
  time: '',
  paymentMethod: 'Pay at shop',
  notes: '',
})
const errors = ref({})
const heading = ref(null)

const services = computed(() => props.catalog.filter((s) => s.kind !== 'upgrade'))
const upgrades = computed(() =>
  props.catalog.filter((s) => s.kind === 'upgrade' && s.serviceIds?.includes(fields.serviceId)),
)
const chosenLines = computed(() => {
  const service = services.value.find((s) => s.id === fields.serviceId)
  if (!service) return []
  return [service, ...upgrades.value.filter((u) => fields.upgradeIds.includes(u.id))]
})
const total = computed(() => chosenLines.value.reduce((sum, s) => sum + s.price, 0))
const minutes = computed(() => chosenLines.value.reduce((sum, s) => sum + s.durationMin, 0))
const today = toDateKey(shopNow())

function onServiceChange() {
  // Drop upgrades the new service doesn't offer.
  fields.upgradeIds = fields.upgradeIds.filter((id) => upgrades.value.some((u) => u.id === id))
}

function onPhoneInput(event) {
  fields.phone = formatPhone(event.target.value)
}

function validate() {
  const e = {}
  if (!fields.name.trim()) e.name = 'Enter the customer’s name.'
  const phoneProblem = validatePhone(fields.phone)
  if (phoneProblem) e.phone = phoneProblem.replace('your', 'the customer’s')
  if (fields.email.trim() && !/^\S+@\S+\.\S+$/.test(fields.email.trim())) e.email = 'Enter a valid e-mail address, or leave it empty.'
  if (!fields.serviceId) e.serviceId = 'Choose a service.'
  if (!fields.date) e.date = 'Pick a date.'
  else if (fields.date < today) e.date = 'That date has already passed.'
  if (!fields.time) e.time = 'Pick a time.'
  return e
}

async function onSubmit() {
  emit('clear-error')
  errors.value = validate()
  if (Object.keys(errors.value).length > 0) {
    await nextTick()
    document.querySelector('.new-form [aria-invalid="true"]')?.focus()
    return
  }
  const ok = await props.submit({
    date: fields.date,
    time: fields.time,
    customer: {
      name: fields.name.trim(),
      phone: normalizePhone(fields.phone),
      email: fields.email.trim(),
    },
    services: chosenLines.value,
    paymentMethod: fields.paymentMethod,
    notes: fields.notes.trim(),
  })
  if (ok) emit('done')
}

defineExpose({ focus: () => heading.value?.focus() })
</script>

<template>
  <form class="new-form" novalidate aria-labelledby="new-heading" @submit.prevent="onSubmit">
    <h2 id="new-heading" ref="heading" tabindex="-1">New appointment</h2>
    <p class="muted">For a walk-in or a phone booking. The time must fit the shop’s hours and be free.</p>

    <div class="field">
      <label for="new-name">Customer name</label>
      <input id="new-name" v-model="fields.name" type="text" maxlength="80" autocomplete="off"
        :aria-invalid="errors.name ? 'true' : undefined" :aria-describedby="errors.name ? 'new-name-error' : undefined" />
      <p v-if="errors.name" id="new-name-error" class="problem">{{ errors.name }}</p>
    </div>

    <div class="row">
      <div class="field">
        <label for="new-phone">Phone</label>
        <input id="new-phone" :value="fields.phone" type="tel" inputmode="tel" autocomplete="off" @input="onPhoneInput"
          :aria-invalid="errors.phone ? 'true' : undefined" :aria-describedby="errors.phone ? 'new-phone-error' : undefined" />
        <p v-if="errors.phone" id="new-phone-error" class="problem">{{ errors.phone }}</p>
      </div>
      <div class="field">
        <label for="new-email">E-mail (optional)</label>
        <input id="new-email" v-model="fields.email" type="email" maxlength="160" autocomplete="off"
          :aria-invalid="errors.email ? 'true' : undefined" :aria-describedby="errors.email ? 'new-email-error' : undefined" />
        <p v-if="errors.email" id="new-email-error" class="problem">{{ errors.email }}</p>
      </div>
    </div>

    <div class="field">
      <label for="new-service">Service</label>
      <select id="new-service" v-model="fields.serviceId" :aria-invalid="errors.serviceId ? 'true' : undefined"
        :aria-describedby="errors.serviceId ? 'new-service-error' : undefined" @change="onServiceChange">
        <option value="" disabled>Choose a service</option>
        <option v-for="s in services" :key="s.id" :value="s.id">
          {{ s.name }} ({{ formatMoney(s.price) }}, {{ s.durationMin }} min)
        </option>
      </select>
      <p v-if="errors.serviceId" id="new-service-error" class="problem">{{ errors.serviceId }}</p>
    </div>

    <fieldset v-if="upgrades.length > 0" class="upgrades">
      <legend>Upgradez</legend>
      <label v-for="u in upgrades" :key="u.id" class="check">
        <input v-model="fields.upgradeIds" type="checkbox" :value="u.id" />
        {{ u.name }} (+{{ formatMoney(u.price) }}, +{{ u.durationMin }} min)
      </label>
    </fieldset>
    <p v-else-if="fields.serviceId === 'workz'" class="muted">The Workz already includes every upgrade.</p>

    <div class="row">
      <div class="field">
        <label for="new-date">Date</label>
        <input id="new-date" v-model="fields.date" type="date" :min="today"
          :aria-invalid="errors.date ? 'true' : undefined" :aria-describedby="errors.date ? 'new-date-error' : undefined" />
        <p v-if="errors.date" id="new-date-error" class="problem">{{ errors.date }}</p>
      </div>
      <div class="field">
        <label for="new-time">Time</label>
        <input id="new-time" v-model="fields.time" type="time" step="900"
          :aria-invalid="errors.time ? 'true' : undefined" :aria-describedby="errors.time ? 'new-time-error' : undefined" />
        <p v-if="errors.time" id="new-time-error" class="problem">{{ errors.time }}</p>
      </div>
    </div>

    <div class="field">
      <label for="new-pay">Payment</label>
      <select id="new-pay" v-model="fields.paymentMethod">
        <option>Pay at shop</option>
        <option>Card</option>
      </select>
    </div>

    <div class="field">
      <label for="new-notes">Notes (optional)</label>
      <input id="new-notes" v-model="fields.notes" type="text" maxlength="200" autocomplete="off" />
    </div>

    <p v-if="chosenLines.length" class="total" aria-live="polite">
      Total {{ formatMoney(total) }} · {{ minutes }} minutes
    </p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="buttons">
      <button type="submit" class="primary" :disabled="busy">{{ busy ? 'Saving…' : 'Add appointment' }}</button>
      <button type="button" class="ghost" :disabled="busy" @click="emit('done')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.new-form {
  position: relative;
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

h2 {
  margin: 0;
  font-size: 20px;
}

h2:focus {
  outline: none;
}

.muted {
  margin: 0;
  color: var(--rc-muted);
}

.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
}

.field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

label,
legend {
  font-size: 13px;
  font-weight: 600;
}

input,
select {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 15px;
}

input[aria-invalid='true'],
select[aria-invalid='true'] {
  border-color: var(--rc-red);
}

input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}

.upgrades {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 10px 14px;
  border: 1.5px solid var(--rc-line);
  border-radius: 8px;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  font-weight: 400;
}

.check input {
  width: 20px;
  height: 20px;
  min-height: 0;
  padding: 0;
  accent-color: var(--rc-ink);
}

.problem {
  margin: 0;
  color: var(--rc-red-dark);
  font-size: 13px;
  font-weight: 600;
}

.total {
  margin: 0;
  font-weight: 700;
}

.error {
  margin: 0;
  padding: 10px 12px;
  border-left: 4px solid var(--rc-red);
  background: var(--rc-error-bg);
  color: var(--rc-red-dark);
  font-weight: 600;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
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

button.ghost {
  border-color: transparent;
  text-decoration: underline;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
