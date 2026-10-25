<script setup>
import { computed, reactive, ref } from 'vue'
import { formatDateShort, formatTime } from '@/admin/shared/format'

const props = defineProps({
  entries: { type: Array, required: true },
  today: { type: String, required: true },
  busy: Boolean,
  error: { type: String, default: '' },
  // (draft) => Promise<boolean>: true when the entry was saved
  submit: { type: Function, required: true },
  // (draft) => appointments that fall inside the draft time off
  conflictsFor: { type: Function, required: true },
})

const emit = defineEmits(['remove', 'clear-error'])

const blank = () => ({ reason: '', allDay: true, date: '', endDate: '', start: '', end: '' })
const draft = reactive(blank())
const reasonInput = ref(null)

const clashes = computed(() =>
  props.conflictsFor({ ...draft, endDate: draft.allDay ? draft.endDate : draft.date }),
)

// First few names only, so a long trip doesn't make a wall of text.
const clashNames = computed(() => {
  const names = [...new Set(clashes.value.map((a) => a.customer.name))]
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
})

function describe(entry) {
  if (!entry.allDay) {
    return `${formatDateShort(entry.date)}, ${formatTime(entry.start)} to ${formatTime(entry.end)}`
  }
  return entry.date === entry.endDate
    ? formatDateShort(entry.date)
    : `${formatDateShort(entry.date)} to ${formatDateShort(entry.endDate)}`
}

// Picking a start date fills in the end date for convenience.
function onStartDate(event) {
  emit('clear-error')
  draft.date = event.target.value
  if (!draft.endDate || draft.endDate < draft.date) draft.endDate = draft.date
}

async function onSubmit() {
  const ok = await props.submit({ ...draft })
  if (ok) {
    Object.assign(draft, blank())
    reasonInput.value?.focus()
  }
}
</script>

<template>
  <section class="card" aria-labelledby="timeoff-heading">
    <h2 id="timeoff-heading">Time off</h2>
    <p class="hint">Block days or hours when the shop is closed. Customers can’t book these times.</p>

    <form class="form" novalidate @submit.prevent="onSubmit">
      <div class="field wide">
        <label for="to-reason">Reason (optional)</label>
        <input
          id="to-reason"
          ref="reasonInput"
          v-model="draft.reason"
          type="text"
          maxlength="80"
          placeholder="Vacation, appointment…"
          autocomplete="off"
          @input="emit('clear-error')"
        />
      </div>

      <label class="check">
        <input v-model="draft.allDay" type="checkbox" @change="emit('clear-error')" />
        <span>All day</span>
      </label>

      <div class="field">
        <label for="to-date">{{ draft.allDay ? 'From' : 'Date' }}</label>
        <input id="to-date" type="date" :min="today" :value="draft.date" @input="onStartDate" />
      </div>

      <div v-if="draft.allDay" class="field">
        <label for="to-end-date">To</label>
        <input
          id="to-end-date"
          v-model="draft.endDate"
          type="date"
          :min="draft.date || today"
          @input="emit('clear-error')"
        />
      </div>
      <template v-else>
        <div class="field">
          <label for="to-start">From time</label>
          <input id="to-start" v-model="draft.start" type="time" step="900" @input="emit('clear-error')" />
        </div>
        <div class="field">
          <label for="to-end">To time</label>
          <input id="to-end" v-model="draft.end" type="time" step="900" @input="emit('clear-error')" />
        </div>
      </template>

      <p v-if="clashes.length" class="warn" role="status">
        {{ clashes.length }} booked {{ clashes.length === 1 ? 'appointment falls' : 'appointments fall' }}
        in this time ({{ clashNames }}). They won’t be cancelled
        automatically. You can move or cancel them on the Appointments page.
      </p>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button type="submit" class="primary" :disabled="busy">
        {{ busy ? 'Saving…' : 'Add time off' }}
      </button>
    </form>

    <h3>Upcoming time off</h3>
    <ul v-if="entries.length" class="list">
      <li v-for="entry in entries" :key="entry.id">
        <div>
          <p class="when">{{ describe(entry) }}</p>
          <p class="why">{{ entry.reason || 'No reason given' }}</p>
        </div>
        <button
          type="button"
          class="remove"
          :disabled="busy"
          :aria-label="`Remove time off: ${describe(entry)}${entry.reason ? ', ' + entry.reason : ''}`"
          @click="emit('remove', entry.id)"
        >
          Remove
        </button>
      </li>
    </ul>
    <p v-else class="hint">No time off planned.</p>
  </section>
</template>

<style scoped>
.card {
  padding: 20px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

h2 {
  margin: 0;
  font-size: 20px;
}

h3 {
  margin: 22px 0 8px;
  font-size: 16px;
}

.hint {
  margin: 6px 0 14px;
  color: var(--rc-muted);
  font-size: 14px;
}

.form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 14px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 10px;
  background: var(--rc-surface);
}

.field {
  display: grid;
  gap: 6px;
  flex: 1 1 140px;
}

.field.wide {
  flex: 1 1 100%;
}

label {
  font-size: 13px;
  font-weight: 600;
}

.field input {
  min-height: 44px;
  padding: 0 12px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  font-size: 15px;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 100%;
  min-height: 44px;
  font-size: 15px;
  cursor: pointer;
}

.check input {
  width: 22px;
  height: 22px;
  accent-color: var(--rc-ink);
}

.warn,
.error {
  flex: 1 1 100%;
  margin: 0;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
}

.warn {
  border-left: 4px solid var(--rc-ink);
  background: #fff;
}

.error {
  border-left: 4px solid var(--rc-red);
  background: var(--rc-error-bg);
  color: var(--rc-red-dark);
}

.list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #e4e2dc;
}

.when {
  margin: 0;
  font-weight: 600;
}

.why {
  margin: 2px 0 0;
  color: var(--rc-muted);
  font-size: 14px;
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

button.remove {
  border-color: var(--rc-red);
  color: var(--rc-red-dark);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:focus-visible,
input:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}
</style>
