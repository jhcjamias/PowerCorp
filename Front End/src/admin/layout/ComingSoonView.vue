<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <section class="soon">
    <h2>{{ route.meta.title }}</h2>
    <p>This page is coming soon.</p>
  </section>
</template>

<style scoped>
.soon {
  padding: 32px;
  background: var(--rc-card);
  border: 1px dashed var(--rc-line);
  border-radius: var(--rc-radius);
}

h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

p {
  margin: 0;
  color: var(--rc-muted);
}
</style>
