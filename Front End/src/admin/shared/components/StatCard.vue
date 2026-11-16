<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' },
})
</script>

<template>
  <div class="stat">
    <p class="label">{{ label }}</p>
    <p class="value">{{ value }}</p>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.stat {
  padding: 16px 18px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

.label {
  margin: 0;
  color: var(--rc-muted);
  font-size: 14px;
  font-weight: 600;
}

.value {
  margin: 6px 0 0;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
}

.hint {
  margin: 6px 0 0;
  color: var(--rc-muted);
  font-size: 13px;
}
</style>
