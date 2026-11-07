<script setup>
defineProps({
  status: { type: String, required: true },
})
</script>

<template>
  <span class="badge" :class="`badge-${status.toLowerCase()}`">{{ status }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 2px 10px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.badge-booked {
  background: var(--rc-ink);
  color: #fff;
}

.badge-completed {
  background: #fff;
  color: var(--rc-ink);
}

.badge-cancelled {
  border-color: var(--rc-red);
  background: var(--rc-error-bg);
  color: var(--rc-red-dark);
}
</style>
