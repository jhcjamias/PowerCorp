<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { listAppointments } from '@/admin/appointments/appointmentsService'
import StatCard from '@/admin/shared/components/StatCard.vue'
import { formatDateShort, formatMoney } from '@/admin/shared/format'
import RevenueChart from './components/RevenueChart.vue'
import { appointmentsToCsv, downloadCsv } from './csv'
import { PRESETS, presetRange, rangeProblem, reportFor } from './reportStats'

const loading = ref(true)
const loadError = ref('')
const appointments = ref([])

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    appointments.value = await listAppointments()
  } catch (error) {
    loadError.value = error?.message || 'Could not load the report.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const preset = ref('30')
const range = reactive(presetRange('30'))

function onPreset() {
  if (preset.value !== 'custom') Object.assign(range, presetRange(preset.value))
}

const problem = computed(() => rangeProblem(range.from, range.to))
const report = computed(() => (problem.value ? null : reportFor(appointments.value, range.from, range.to)))

const percent = (n) => `${Math.round(n * 100)}%`
const rangeText = computed(() => `${formatDateShort(range.from)} to ${formatDateShort(range.to)}`)

const exportMessage = ref('')
function exportCsv() {
  if (!report.value) return
  downloadCsv(`rolaz-cutz-appointments-${range.from}-to-${range.to}.csv`, appointmentsToCsv(report.value.inRange))
  exportMessage.value = `Downloaded ${report.value.inRange.length} appointments.`
}
</script>

<template>
  <div class="page">
    <p class="intro">How the shop is doing. Revenue counts appointments marked Completed.</p>

    <form class="filters" aria-label="Report dates" @submit.prevent>
      <div class="field">
        <label for="rep-preset">Show</label>
        <select id="rep-preset" v-model="preset" @change="onPreset">
          <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </div>
      <template v-if="preset === 'custom'">
        <div class="field">
          <label for="rep-from">From</label>
          <input id="rep-from" v-model="range.from" type="date" :max="range.to || undefined" />
        </div>
        <div class="field">
          <label for="rep-to">To</label>
          <input id="rep-to" v-model="range.to" type="date" :min="range.from || undefined" />
        </div>
      </template>
      <p v-else class="range-text">{{ rangeText }}</p>
      <button type="button" class="export" :disabled="!report || report.inRange.length === 0" @click="exportCsv">
        Download CSV
      </button>
    </form>

    <p class="sr-only" role="status" aria-live="polite">{{ exportMessage }}</p>
    <p v-if="problem" class="error" role="alert">{{ problem }}</p>

    <div v-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" @click="load">Try again</button>
    </div>

    <p v-else-if="loading" class="state" role="status">Loading report…</p>

    <template v-else-if="report">
      <section class="stats" aria-label="Summary">
        <StatCard label="Revenue" :value="formatMoney(report.revenue)" hint="Completed appointments" />
        <StatCard label="Completed visits" :value="report.completedCount" />
        <StatCard label="Average per visit" :value="formatMoney(report.average)" />
        <StatCard
          label="Cancelled"
          :value="report.cancelledCount"
          :hint="`${percent(report.cancelRate)} of appointments in this range`"
        />
      </section>

      <section class="card" aria-label="Revenue chart">
        <RevenueChart :bars="report.bars" :title="report.weekly ? 'Revenue by week' : 'Revenue by day'" />
      </section>

      <section class="card" aria-labelledby="svc-heading">
        <h3 id="svc-heading">Revenue by service</h3>
        <div v-if="report.services.length" class="table-scroll">
          <table>
            <caption class="sr-only">
              Revenue by service
            </caption>
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col" class="num">Times done</th>
                <th scope="col" class="num">Revenue</th>
                <th scope="col" class="share-col">Share</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in report.services" :key="s.id">
                <td class="strong">{{ s.name }}</td>
                <td class="num">{{ s.count }}</td>
                <td class="num">{{ formatMoney(s.revenue) }}</td>
                <td class="share-col">
                  <div class="share">
                    <div class="share-bar" aria-hidden="true"><span :style="{ width: percent(s.share) }" /></div>
                    <span>{{ percent(s.share) }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted">No completed appointments in this range.</p>
      </section>
    </template>
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

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
  padding: 16px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

.field {
  display: grid;
  gap: 6px;
  min-width: 160px;
}

label {
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

.range-text {
  margin: 0;
  padding-bottom: 10px;
  color: var(--rc-muted);
}

.export {
  min-height: 44px;
  margin-left: auto;
  padding: 0 18px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: var(--rc-ink);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}

.error {
  margin: 0;
  padding: 10px 12px;
  border-left: 4px solid var(--rc-red);
  background: var(--rc-error-bg);
  color: var(--rc-red-dark);
  font-weight: 600;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}

.card {
  padding: 20px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

h3 {
  margin: 0 0 12px;
  font-size: 18px;
}

.table-scroll {
  position: relative;
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 460px;
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
}

.num {
  text-align: right;
}

.strong {
  font-weight: 600;
}

.share-col {
  width: 34%;
}

.share {
  display: flex;
  align-items: center;
  gap: 10px;
}

.share-bar {
  flex: 1 1 auto;
  height: 10px;
  border-radius: 4px;
  background: #ece9e2;
}

.share-bar span {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--rc-red);
}

.muted {
  margin: 0;
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
</style>
