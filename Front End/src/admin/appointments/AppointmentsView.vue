<script setup>
import { nextTick, ref } from 'vue'
import PaginationBar from '@/admin/shared/components/PaginationBar.vue'
import AppointmentDetail from './components/AppointmentDetail.vue'
import AppointmentFilters from './components/AppointmentFilters.vue'
import AppointmentsTable from './components/AppointmentsTable.vue'
import { useAppointments } from './useAppointments'

const {
  loading,
  loadError,
  load,
  filters,
  hasActiveFilters,
  serviceOptions,
  updateFilters,
  resetFilters,
  page,
  pageCount,
  pageRows,
  total,
  rangeStart,
  rangeEnd,
  goToPage,
  selected,
  selectedId,
  select,
  actionBusy,
  actionError,
  statusMessage,
  clearActionError,
  cancel,
  complete,
  reschedule,
} = useAppointments()

// When the list and the details are stacked (narrow screens), bring the details into view.
const detailBox = ref(null)
async function pick(id) {
  select(id)
  await nextTick()
  detailBox.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
</script>

<template>
  <div class="page">
    <p class="intro">Find, review and change customer bookings.</p>

    <AppointmentFilters
      :filters="filters"
      :services="serviceOptions"
      :has-active="hasActiveFilters"
      @update="updateFilters"
      @reset="resetFilters"
    />

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>
    <p v-if="statusMessage" class="notice" aria-hidden="true">{{ statusMessage }}</p>

    <div v-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" @click="load">Try again</button>
    </div>

    <p v-else-if="loading" class="state" role="status">Loading appointments…</p>

    <div v-else class="columns">
      <section class="list card" aria-label="Appointment list">
        <template v-if="total > 0">
          <AppointmentsTable :rows="pageRows" :selected-id="selectedId" @select="pick" />
          <PaginationBar
            :page="page"
            :page-count="pageCount"
            :range-start="rangeStart"
            :range-end="rangeEnd"
            :total="total"
            @change="goToPage"
          />
        </template>
        <div v-else class="empty">
          <p>No appointments match these filters.</p>
          <button v-if="hasActiveFilters" type="button" @click="resetFilters">Clear filters</button>
        </div>
      </section>

      <aside ref="detailBox" class="side">
        <AppointmentDetail
          :appointment="selected"
          :busy="actionBusy"
          :error="actionError"
          @clear-error="clearActionError"
          @cancel="cancel(selected.id)"
          @complete="complete(selected.id)"
          @reschedule="reschedule(selected.id, $event)"
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

.card {
  padding: 16px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

.list,
.side {
  flex: 1 1 100%;
  min-width: 0;
}

/* Side by side only when there is room for the whole table. */
@media (min-width: 1560px) {
  .list {
    flex: 1 1 0;
  }

  .side {
    flex: 0 0 360px;
  }
}

.state,
.empty {
  padding: 24px;
  text-align: center;
}

.state {
  background: #fff;
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

button {
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
