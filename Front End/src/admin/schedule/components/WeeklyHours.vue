<script setup>
import { DAY_NAMES } from '../mockSchedule'

defineProps({
  days: { type: Array, required: true },
  problems: { type: Object, default: () => ({}) },
  dirty: Boolean,
  busy: Boolean,
  error: { type: String, default: '' },
})

const emit = defineEmits(['update', 'save', 'discard'])
</script>

<template>
  <section class="card" aria-labelledby="hours-heading">
    <h2 id="hours-heading">Weekly hours</h2>
    <p class="hint">These are the hours customers can book. Switch a day off to close it.</p>

    <form novalidate @submit.prevent="emit('save')">
      <ul class="days">
        <li v-for="d in days" :key="d.day" class="day" :class="{ closed: !d.open }">
          <label class="open">
            <input
              type="checkbox"
              :checked="d.open"
              @change="emit('update', d.day, { open: $event.target.checked })"
            />
            <span class="name">{{ DAY_NAMES[d.day] }}</span>
          </label>

          <div v-if="d.open" class="times">
            <label class="sr-only" :for="`start-${d.day}`">{{ DAY_NAMES[d.day] }} opens</label>
            <input
              :id="`start-${d.day}`"
              type="time"
              step="900"
              :value="d.start"
              :aria-invalid="problems[d.day] ? 'true' : undefined"
              :aria-describedby="problems[d.day] ? `problem-${d.day}` : undefined"
              @input="emit('update', d.day, { start: $event.target.value })"
            />
            <span aria-hidden="true">to</span>
            <label class="sr-only" :for="`end-${d.day}`">{{ DAY_NAMES[d.day] }} closes</label>
            <input
              :id="`end-${d.day}`"
              type="time"
              step="900"
              :value="d.end"
              :aria-invalid="problems[d.day] ? 'true' : undefined"
              :aria-describedby="problems[d.day] ? `problem-${d.day}` : undefined"
              @input="emit('update', d.day, { end: $event.target.value })"
            />
          </div>
          <p v-else class="closed-text">Closed</p>

          <p v-if="problems[d.day]" :id="`problem-${d.day}`" class="problem">{{ problems[d.day] }}</p>
        </li>
      </ul>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="submit" class="primary" :disabled="busy || !dirty">
          {{ busy ? 'Saving…' : 'Save hours' }}
        </button>
        <button type="button" class="ghost" :disabled="busy || !dirty" @click="emit('discard')">
          Discard changes
        </button>
        <span v-if="dirty" class="dirty">You have unsaved changes.</span>
      </div>
    </form>
  </section>
</template>

<style scoped>
.card {
  position: relative;
  padding: 20px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

h2 {
  margin: 0;
  font-size: 20px;
}

.hint {
  margin: 6px 0 14px;
  color: var(--rc-muted);
  font-size: 14px;
}

.days {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.day {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 0;
  border-bottom: 1px solid #e4e2dc;
}

.open {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 128px;
  min-height: 44px;
  cursor: pointer;
}

.open input {
  width: 22px;
  height: 22px;
  accent-color: var(--rc-ink);
}

.name {
  font-weight: 600;
}

.times {
  display: flex;
  align-items: center;
  gap: 10px;
}

.times input {
  min-height: 44px;
  padding: 0 10px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  font-size: 15px;
}

.times input[aria-invalid='true'] {
  border-color: var(--rc-red);
}

.closed-text {
  margin: 0;
  color: var(--rc-muted);
}

.problem {
  flex: 1 1 100%;
  margin: 0 0 0 140px;
  color: var(--rc-red-dark);
  font-size: 14px;
  font-weight: 600;
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.dirty {
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

button.ghost {
  border-color: var(--rc-line);
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

@media (max-width: 520px) {
  .open {
    flex-basis: 100%;
    min-height: 40px;
  }

  .problem {
    margin-left: 0;
  }
}
</style>
