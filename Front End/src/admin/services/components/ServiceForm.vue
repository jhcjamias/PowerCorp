<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { validateService } from '../useServices'

const props = defineProps({
  // the service being edited, or null to add a new one
  service: { type: Object, default: null },
  others: { type: Array, default: () => [] },
  busy: Boolean,
  error: { type: String, default: '' },
  // (id|null, fields) => Promise<boolean>
  submit: { type: Function, required: true },
})

const emit = defineEmits(['done', 'clear-error'])

const fields = reactive({ name: '', price: '', durationMin: '' })
const errors = ref({})
const nameInput = ref(null)
const heading = ref(null)

function fill() {
  fields.name = props.service?.name ?? ''
  fields.price = props.service ? String(props.service.price) : ''
  fields.durationMin = props.service ? String(props.service.durationMin) : ''
  errors.value = {}
}
fill()

watch(
  () => props.service?.id,
  async () => {
    fill()
    await nextTick()
    nameInput.value?.focus()
  },
)

const title = computed(() => (props.service ? `Edit ${props.service.name}` : 'Add a service'))
const othersForCheck = computed(() => props.others.filter((s) => s.id !== props.service?.id))

async function onSubmit() {
  emit('clear-error')
  errors.value = validateService(fields, othersForCheck.value)
  if (Object.keys(errors.value).length > 0) {
    await nextTick()
    document.querySelector('.service-form [aria-invalid="true"]')?.focus()
    return
  }
  const ok = await props.submit(props.service?.id ?? null, { ...fields })
  if (ok) {
    fill()
    emit('done')
  }
}
</script>

<template>
  <form class="service-form card" novalidate aria-labelledby="service-form-heading" @submit.prevent="onSubmit">
    <h2 id="service-form-heading" ref="heading">{{ title }}</h2>

    <div class="field">
      <label for="svc-name">Name</label>
      <input
        id="svc-name"
        ref="nameInput"
        v-model="fields.name"
        type="text"
        maxlength="60"
        autocomplete="off"
        :aria-invalid="errors.name ? 'true' : undefined"
        :aria-describedby="errors.name ? 'svc-name-error' : undefined"
      />
      <p v-if="errors.name" id="svc-name-error" class="problem">{{ errors.name }}</p>
    </div>

    <div class="row">
      <div class="field">
        <label for="svc-price">Price ($)</label>
        <input
          id="svc-price"
          v-model="fields.price"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :aria-invalid="errors.price ? 'true' : undefined"
          :aria-describedby="errors.price ? 'svc-price-error' : undefined"
        />
        <p v-if="errors.price" id="svc-price-error" class="problem">{{ errors.price }}</p>
      </div>

      <div class="field">
        <label for="svc-duration">Time (minutes)</label>
        <input
          id="svc-duration"
          v-model="fields.durationMin"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :aria-invalid="errors.durationMin ? 'true' : undefined"
          :aria-describedby="errors.durationMin ? 'svc-duration-error' : undefined"
        />
        <p v-if="errors.durationMin" id="svc-duration-error" class="problem">{{ errors.durationMin }}</p>
      </div>
    </div>

    <p v-if="service" class="hint">
      Changing the price or time doesn’t change appointments that are already booked.
    </p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="buttons">
      <button type="submit" class="primary" :disabled="busy">
        {{ busy ? 'Saving…' : service ? 'Save changes' : 'Add service' }}
      </button>
      <button v-if="service" type="button" class="ghost" :disabled="busy" @click="emit('done')">
        Cancel
      </button>
    </div>
  </form>
</template>

<style scoped>
.card {
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

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
  align-content: start;
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

input[aria-invalid='true'] {
  border-color: var(--rc-red);
}

.problem {
  margin: 0;
  color: var(--rc-red-dark);
  font-size: 14px;
  font-weight: 600;
}

.hint {
  margin: 0;
  color: var(--rc-muted);
  font-size: 14px;
}

.error {
  margin: 0;
  padding: 10px 12px;
  border-left: 4px solid var(--rc-red);
  background: var(--rc-error-bg);
  color: var(--rc-red-dark);
  font-size: 14px;
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

@media (max-width: 420px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
