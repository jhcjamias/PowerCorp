<script setup>
import { computed, ref } from 'vue'
import { formatMoney } from '@/admin/shared/format'

const props = defineProps({
  // [{ key, label, value, visits }]
  bars: { type: Array, required: true },
  title: { type: String, required: true },
})

const hovered = ref(null)
const showTable = ref(false)

// Round the top of the scale up to a tidy number so the grid labels read cleanly.
const top = computed(() => {
  const max = Math.max(0, ...props.bars.map((b) => b.value))
  if (max === 0) return 100
  const step = max <= 200 ? 50 : max <= 1000 ? 100 : 500
  return Math.ceil(max / step) * step
})

const grid = computed(() => [top.value, top.value / 2, 0])
const total = computed(() => props.bars.reduce((sum, b) => sum + b.value, 0))

const summary = computed(
  () => `${props.title}. ${props.bars.length} bars, ${formatMoney(total.value)} in total. Use "Show as table" for each value.`,
)
</script>

<template>
  <figure class="chart">
    <figcaption>
      <span class="title">{{ title }}</span>
      <button type="button" class="toggle" :aria-pressed="showTable" @click="showTable = !showTable">
        {{ showTable ? 'Show chart' : 'Show as table' }}
      </button>
    </figcaption>

    <div v-if="!showTable" class="plot" role="img" :aria-label="summary">
      <div class="grid" aria-hidden="true">
        <div v-for="g in grid" :key="g" class="line">
          <span class="tick">{{ formatMoney(g) }}</span>
        </div>
      </div>

      <div class="bars" aria-hidden="true">
        <div
          v-for="(bar, i) in bars"
          :key="bar.key"
          class="slot"
          @mouseenter="hovered = i"
          @mouseleave="hovered = null"
        >
          <div class="bar" :class="{ zero: bar.value === 0 }" :style="{ height: `${(bar.value / top) * 100}%` }" />
          <div v-if="hovered === i" class="tip">
            <strong>{{ bar.label }}</strong>
            <span>{{ formatMoney(bar.value) }} from {{ bar.visits }} {{ bar.visits === 1 ? 'visit' : 'visits' }}</span>
          </div>
        </div>
      </div>

      <div class="axis" aria-hidden="true">
        <span>{{ bars[0]?.label }}</span>
        <span>{{ bars[bars.length - 1]?.label }}</span>
      </div>
    </div>

    <div v-else class="table-scroll">
      <table>
        <caption class="sr-only">
          {{ title }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ title.includes('week') ? 'Week' : 'Day' }}</th>
            <th scope="col" class="num">Visits</th>
            <th scope="col" class="num">Revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="bar in bars" :key="bar.key">
            <td>{{ bar.label }}</td>
            <td class="num">{{ bar.visits }}</td>
            <td class="num">{{ formatMoney(bar.value) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </figure>
</template>

<style scoped>
.chart {
  position: relative;
  margin: 0;
}

figcaption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.title {
  font-size: 18px;
  font-weight: 700;
}

.toggle {
  min-height: 40px;
  padding: 0 14px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.toggle:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}

.plot {
  position: relative;
  height: 240px;
  margin: 0 0 40px 64px;
}

.grid {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.line {
  position: relative;
  height: 0;
  border-top: 1px solid #e4e2dc;
}

.tick {
  position: absolute;
  right: calc(100% + 10px);
  top: -9px;
  color: var(--rc-muted);
  font-size: 12px;
  white-space: nowrap;
}

.bars {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: stretch;
  gap: 2px;
}

.slot {
  position: relative;
  display: flex;
  flex: 1 1 0;
  align-items: flex-end;
  min-width: 0;
}

.slot:hover {
  background: rgba(17, 17, 17, 0.05);
}

.bar {
  width: 100%;
  max-width: 28px;
  margin: 0 auto;
  border-radius: 4px 4px 0 0;
  background: var(--rc-red);
}

.bar.zero {
  background: transparent;
}

.tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  z-index: 2;
  display: grid;
  gap: 2px;
  min-width: 150px;
  padding: 8px 10px;
  transform: translateX(-50%);
  border-radius: 8px;
  background: var(--rc-ink);
  color: #fff;
  font-size: 13px;
  pointer-events: none;
}

.slot:first-child .tip {
  left: 0;
  transform: none;
}

.slot:last-child .tip {
  right: 0;
  left: auto;
  transform: none;
}

.axis {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  left: 0;
  display: flex;
  justify-content: space-between;
  color: var(--rc-muted);
  font-size: 13px;
}

.table-scroll {
  position: relative;
  max-height: 320px;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}

th {
  position: sticky;
  top: 0;
  padding: 8px 12px;
  border-bottom: 2px solid var(--rc-ink);
  background: var(--rc-card);
  font-size: 13px;
  text-align: left;
}

td {
  padding: 8px 12px;
  border-bottom: 1px solid #e4e2dc;
}

.num {
  text-align: right;
}
</style>
