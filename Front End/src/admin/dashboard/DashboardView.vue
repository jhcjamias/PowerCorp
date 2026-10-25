<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '@/admin/login-page/useAuth'
import { listAppointments } from '@/admin/appointments/appointmentsService'
import StatusBadge from '@/admin/appointments/components/StatusBadge.vue'
import { serviceNames } from '@/admin/appointments/utils'
import { getSchedule } from '@/admin/schedule/scheduleService'
import StatCard from '@/admin/shared/components/StatCard.vue'
import { formatDateShort, formatMoney, formatTime } from '@/admin/shared/format'
import { dashboardStats } from './dashboardStats'

const { user } = useAuth()

const loading = ref(true)
const loadError = ref('')
const appointments = ref([])
const schedule = ref(null)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [booked, hours] = await Promise.all([listAppointments(), getSchedule()])
    appointments.value = booked
    schedule.value = hours
  } catch (error) {
    loadError.value = error?.message || 'Could not load the dashboard.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const stats = computed(() => dashboardStats(appointments.value))

const greeting = computed(() => {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `Good ${part}${user.value?.name ? `, ${user.value.name}` : ''}`
})

// What the shop is doing today: closed for time off, normal hours, or closed all day.
const todayNote = computed(() => {
  if (!schedule.value) return ''
  const today = stats.value.today
  const off = schedule.value.timeOff.find((t) => t.date <= today && t.endDate >= today)
  if (off?.allDay) return `Closed today${off.reason ? ` (${off.reason})` : ''}.`
  const day = schedule.value.weeklyHours.find((h) => h.day === new Date().getDay())
  if (!day?.open) return 'The shop is closed today.'
  const partOff = off ? ` Blocked ${formatTime(off.start)} to ${formatTime(off.end)}${off.reason ? ` (${off.reason})` : ''}.` : ''
  return `Open ${formatTime(day.start)} to ${formatTime(day.end)}.${partOff}`
})

const nextTimeOff = computed(() => {
  if (!schedule.value) return null
  const today = stats.value.today
  return (
    [...schedule.value.timeOff]
      .filter((t) => t.endDate >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  )
})
</script>

<template>
  <div class="page">
    <h2 class="greeting">{{ greeting }}</h2>

    <div v-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" @click="load">Try again</button>
    </div>

    <p v-else-if="loading" class="state" role="status">Loading your day…</p>

    <template v-else>
      <section class="stats" aria-label="Summary">
        <StatCard
          label="Booked today"
          :value="stats.bookedToday"
          :hint="stats.nextUp ? `Next: ${stats.nextUp.customer.name}, ${formatDateShort(stats.nextUp.date)} at ${formatTime(stats.nextUp.time)}` : 'Nothing coming up'"
        />
        <StatCard label="Booked this week" :value="stats.bookedThisWeek" hint="Next 7 days" />
        <StatCard label="Revenue, last 7 days" :value="formatMoney(stats.revenueLast7)" hint="Completed appointments" />
        <StatCard label="Cancellations, last 30 days" :value="stats.cancelledLast30" />
      </section>

      <div class="columns">
        <section class="card main" aria-labelledby="today-heading">
          <h3 id="today-heading">Today’s schedule</h3>
          <p v-if="todayNote" class="note">{{ todayNote }}</p>

          <ul v-if="stats.todayList.length" class="today">
            <li v-for="a in stats.todayList" :key="a.id">
              <p class="time">{{ formatTime(a.time) }}</p>
              <div class="info">
                <p class="who">{{ a.customer.name }}</p>
                <p class="what">{{ serviceNames(a) }}</p>
              </div>
              <StatusBadge :status="a.status" />
            </li>
          </ul>
          <p v-else class="muted">No appointments today.</p>

          <RouterLink class="link" :to="{ name: 'admin-appointments' }">All appointments</RouterLink>
        </section>

        <aside class="card side" aria-labelledby="next-heading">
          <h3 id="next-heading">Time off</h3>
          <p v-if="nextTimeOff" class="note">
            Next: {{ formatDateShort(nextTimeOff.date) }}<template v-if="nextTimeOff.endDate !== nextTimeOff.date"> to {{ formatDateShort(nextTimeOff.endDate) }}</template>
            <template v-if="nextTimeOff.reason"> ({{ nextTimeOff.reason }})</template>
          </p>
          <p v-else class="muted">No time off planned.</p>
          <RouterLink class="link" :to="{ name: 'admin-schedule' }">Schedule & Time Off</RouterLink>
        </aside>
      </div>
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

.greeting {
  margin: 0;
  font-size: 22px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}

.columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}

.card {
  padding: 20px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

.main {
  flex: 3 1 420px;
  min-width: 0;
}

.side {
  flex: 1 1 280px;
  min-width: 0;
}

h3 {
  margin: 0;
  font-size: 18px;
}

.note {
  margin: 8px 0 0;
  font-size: 15px;
}

.muted {
  margin: 12px 0 0;
  color: var(--rc-muted);
}

.today {
  display: grid;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.today li {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #e4e2dc;
}

.time {
  margin: 0;
  font-weight: 700;
}

.who {
  margin: 0;
  font-weight: 600;
}

.what {
  margin: 2px 0 0;
  color: var(--rc-muted);
  font-size: 14px;
}

.link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-top: 16px;
  padding: 0 18px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  color: var(--rc-ink);
  font-weight: 600;
  text-decoration: none;
}

.link:hover {
  background: var(--rc-surface);
}

.link:focus-visible,
.state button:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
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
