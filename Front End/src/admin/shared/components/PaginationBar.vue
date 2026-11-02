<script setup>
defineProps({
  page: { type: Number, required: true },
  pageCount: { type: Number, required: true },
  rangeStart: { type: Number, required: true },
  rangeEnd: { type: Number, required: true },
  total: { type: Number, required: true },
})

const emit = defineEmits(['change'])
</script>

<template>
  <nav class="pager" aria-label="Pagination">
    <p class="range" aria-live="polite">
      <template v-if="total === 0">No results</template>
      <template v-else>Showing {{ rangeStart }} to {{ rangeEnd }} of {{ total }}</template>
    </p>

    <div class="controls">
      <button type="button" :disabled="page <= 1" @click="emit('change', page - 1)">Previous</button>
      <span class="page">Page {{ page }} of {{ pageCount }}</span>
      <button type="button" :disabled="page >= pageCount" @click="emit('change', page + 1)">
        Next
      </button>
    </div>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
}

.range,
.page {
  margin: 0;
  font-size: 14px;
  color: var(--rc-muted);
}

.controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

button {
  min-height: 40px;
  padding: 0 16px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--rc-surface);
}

button:disabled {
  border-color: var(--rc-line);
  color: #8a8a8a;
  cursor: not-allowed;
}

button:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}
</style>
