<script setup>
import TimeOffPanel from './components/TimeOffPanel.vue'
import WeeklyHours from './components/WeeklyHours.vue'
import { useSchedule } from './useSchedule'

const {
  loading,
  loadError,
  load,
  orderedHours,
  hoursDirty,
  hoursProblems,
  hoursBusy,
  hoursError,
  updateDay,
  discardHours,
  saveHours,
  today,
  upcomingTimeOff,
  timeOffBusy,
  timeOffError,
  clearTimeOffError,
  conflictsFor,
  add,
  remove,
  statusMessage,
} = useSchedule()
</script>

<template>
  <div class="page">
    <p class="intro">Set when the shop is open and block off time when it isn’t.</p>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>
    <p v-if="statusMessage" class="notice" aria-hidden="true">{{ statusMessage }}</p>

    <div v-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" @click="load">Try again</button>
    </div>

    <p v-else-if="loading" class="state" role="status">Loading schedule…</p>

    <div v-else class="columns">
      <div class="col">
        <WeeklyHours
          :days="orderedHours"
          :problems="hoursProblems"
          :dirty="hoursDirty"
          :busy="hoursBusy"
          :error="hoursError"
          @update="updateDay"
          @save="saveHours"
          @discard="discardHours"
        />
      </div>
      <div class="col">
        <TimeOffPanel
          :entries="upcomingTimeOff"
          :today="today"
          :busy="timeOffBusy"
          :error="timeOffError"
          :submit="add"
          :conflicts-for="conflictsFor"
          @remove="remove"
          @clear-error="clearTimeOffError"
        />
      </div>
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

.col {
  flex: 1 1 440px;
  min-width: 0;
}

.state {
  padding: 24px;
  text-align: center;
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
