<script setup>
import { nextTick, ref } from 'vue'
import { formatMoney } from '@/admin/shared/format'
import ServiceForm from './components/ServiceForm.vue'
import { useServices } from './useServices'

const {
  loading,
  loadError,
  load,
  sorted,
  serviceChoices,
  items,
  busy,
  actionError,
  statusMessage,
  save,
  setActive,
  clearActionError,
} = useServices()

const editing = ref(null) // the service being edited, or null (= adding)
const formBox = ref(null)

async function edit(service) {
  clearActionError()
  editing.value = service
  await nextTick()
  formBox.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function stopEditing() {
  editing.value = null
}
</script>

<template>
  <div class="page">
    <p class="intro">
      The services, upgrades and prices customers can book. These are the same choices the
      customer site shows. Hide one to stop new bookings for it without losing past appointments.
    </p>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>
    <p v-if="statusMessage" class="notice" aria-hidden="true">{{ statusMessage }}</p>

    <div v-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" @click="load">Try again</button>
    </div>

    <p v-else-if="loading" class="state" role="status">Loading services…</p>

    <div v-else class="columns">
      <section class="list card" aria-label="Service list">
        <div class="table-scroll">
          <table>
            <caption class="sr-only">
              Services and prices
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col" class="num">Price</th>
                <th scope="col" class="num">Time</th>
                <th scope="col">Shown to customers</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sorted" :key="s.id" :class="{ hidden: !s.active, editing: editing?.id === s.id }">
                <td class="strong">{{ s.name }}</td>
                <td>
                  {{ s.kind === 'upgrade' ? 'Upgrade' : 'Service' }}
                  <small v-if="s.kind === 'upgrade'" class="works">
                    for {{ (s.serviceIds ?? []).map((id) => items.find((x) => x.id === id)?.name ?? id).join(', ') || 'no service yet' }}
                  </small>
                </td>
                <td class="num">{{ formatMoney(s.price) }}</td>
                <td class="num">{{ s.durationMin }} min</td>
                <td>
                  <span class="pill" :class="s.active ? 'on' : 'off'">{{ s.active ? 'Yes' : 'Hidden' }}</span>
                </td>
                <td class="actions">
                  <button type="button" :aria-label="`Edit ${s.name} (${s.kind === 'upgrade' ? 'upgrade' : 'service'})`" @click="edit(s)">Edit</button>
                  <button
                    type="button"
                    :disabled="busy"
                    :aria-label="`${s.active ? 'Hide' : 'Show'} ${s.name} (${s.kind === 'upgrade' ? 'upgrade' : 'service'})`"
                    @click="setActive(s, !s.active)"
                  >
                    {{ s.active ? 'Hide' : 'Show' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="items.length === 0" class="empty">No services yet. Add the first one.</p>
      </section>

      <aside ref="formBox" class="side">
        <ServiceForm
          :service="editing"
          :others="items"
          :choices="serviceChoices"
          :busy="busy"
          :error="actionError"
          :submit="save"
          @done="stopEditing"
          @clear-error="clearActionError"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
}

.intro {
  margin: 0;
  color: var(--rc-muted);
}

.notice {
  margin: 0;
  padding: 10px 14px;
  border-left: 4px solid var(--rc-ink);
  background: #fff;
  font-weight: 600;
}

.columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}

.list {
  flex: 3 1 480px;
  min-width: 0;
}

.side {
  flex: 1 1 320px;
  min-width: 0;
}

.card {
  position: relative;
  padding: 16px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

.table-scroll {
  position: relative;
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 640px;
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

tr.hidden td:not(.actions) {
  color: var(--rc-muted);
}

tr.editing {
  background: #f1efea;
  box-shadow: inset 4px 0 0 var(--rc-red);
}

.num {
  text-align: right;
  white-space: nowrap;
}

.works {
  display: block;
  color: var(--rc-muted);
  font-size: 12px;
}

.strong {
  font-weight: 600;
}

.pill {
  display: inline-block;
  padding: 2px 10px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}

.pill.on {
  background: var(--rc-ink);
  color: #fff;
}

.pill.off {
  background: #fff;
  color: var(--rc-muted);
  border-color: var(--rc-line);
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.actions button {
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

.actions button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.empty {
  margin: 14px 0 0;
  text-align: center;
  color: var(--rc-muted);
}

.state {
  padding: 24px;
  text-align: center;
  background: #fff;
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

.state button {
  min-height: 44px;
  padding: 0 18px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

button:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}
</style>
