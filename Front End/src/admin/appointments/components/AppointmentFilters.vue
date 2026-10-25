<script setup>
defineProps({
  filters: { type: Object, required: true },
  services: { type: Array, default: () => [] },
  hasActive: Boolean,
})

const emit = defineEmits(['update', 'reset'])
</script>

<template>
  <form class="filters" role="search" aria-label="Filter appointments" @submit.prevent>
    <div class="field grow">
      <label for="filter-search">Search</label>
      <input
        id="filter-search"
        type="search"
        autocomplete="off"
        placeholder="Customer name or phone"
        :value="filters.search"
        @input="emit('update', { search: $event.target.value })"
      />
    </div>

    <div class="field">
      <label for="filter-from">From</label>
      <input
        id="filter-from"
        type="date"
        :value="filters.from"
        :max="filters.to || undefined"
        @input="emit('update', { from: $event.target.value })"
      />
    </div>

    <div class="field">
      <label for="filter-to">To</label>
      <input
        id="filter-to"
        type="date"
        :value="filters.to"
        :min="filters.from || undefined"
        @input="emit('update', { to: $event.target.value })"
      />
    </div>

    <div class="field">
      <label for="filter-status">Status</label>
      <select
        id="filter-status"
        :value="filters.status"
        @change="emit('update', { status: $event.target.value })"
      >
        <option value="all">All statuses</option>
        <option value="Booked">Booked</option>
        <option value="Completed">Completed</option>
        <option value="Cancelled">Cancelled</option>
      </select>
    </div>

    <div class="field">
      <label for="filter-service">Service</label>
      <select
        id="filter-service"
        :value="filters.service"
        @change="emit('update', { service: $event.target.value })"
      >
        <option value="all">All services</option>
        <option v-for="service in services" :key="service.id" :value="service.id">
          {{ service.name }}
        </option>
      </select>
    </div>

    <button type="button" class="clear" :disabled="!hasActive" @click="emit('reset')">
      Clear filters
    </button>
  </form>
</template>

<style scoped>
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
  min-width: 150px;
}

.field.grow {
  flex: 1 1 220px;
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

input:focus-visible,
select:focus-visible,
.clear:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}

.clear {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  background: none;
  color: var(--rc-ink);
  font-size: 15px;
  text-decoration: underline;
  cursor: pointer;
}

.clear:disabled {
  color: #8a8a8a;
  text-decoration: none;
  cursor: default;
}
</style>
