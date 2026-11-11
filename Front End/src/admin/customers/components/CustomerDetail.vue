<script setup>
import { formatDateLong, formatDateShort, formatMoney, formatPhoneDisplay, formatTime } from '@/admin/shared/format'
import { appointmentTotal, serviceNames } from '@/admin/appointments/utils'
import StatusBadge from '@/admin/appointments/components/StatusBadge.vue'

defineProps({
  customer: { type: Object, default: null },
})
</script>

<template>
  <section class="detail" aria-labelledby="customer-heading">
    <template v-if="customer">
      <h2 id="customer-heading">{{ customer.name }}</h2>
      <p class="phone">{{ formatPhoneDisplay(customer.phone) }}</p>
      <p v-if="customer.email" class="phone">
        <a :href="`mailto:${customer.email}`">{{ customer.email }}</a>
      </p>

      <dl class="stats">
        <div>
          <dt>Visits</dt>
          <dd>{{ customer.visits }}</dd>
        </div>
        <div>
          <dt>Total spent</dt>
          <dd>{{ formatMoney(customer.totalSpent) }}</dd>
        </div>
        <div v-if="customer.noShows > 0">
          <dt>No-shows</dt>
          <dd>{{ customer.noShows }}</dd>
        </div>
        <div>
          <dt>Last visit</dt>
          <dd>{{ customer.lastVisit ? formatDateShort(customer.lastVisit.date) : 'None yet' }}</dd>
        </div>
        <div>
          <dt>Next appointment</dt>
          <dd>
            {{ customer.nextVisit ? `${formatDateShort(customer.nextVisit.date)}, ${formatTime(customer.nextVisit.time)}` : 'None booked' }}
          </dd>
        </div>
      </dl>

      <h3>History</h3>
      <ul class="history">
        <li v-for="a in customer.history" :key="a.id">
          <div class="top">
            <span class="when">{{ formatDateLong(a.date) }}, {{ formatTime(a.time) }}</span>
            <StatusBadge :status="a.status" />
          </div>
          <p class="what">{{ serviceNames(a) }} · {{ formatMoney(appointmentTotal(a)) }}</p>
          <p v-if="a.notes" class="note">{{ a.notes }}</p>
        </li>
      </ul>

      <RouterLink class="link" :to="{ name: 'admin-appointments', query: { search: customer.phone } }">
        See in Appointments
      </RouterLink>
    </template>

    <template v-else>
      <h2 id="customer-heading">Customer details</h2>
      <p class="muted">Select a customer to see their visits.</p>
    </template>
  </section>
</template>

<style scoped>
.detail {
  position: relative;
  padding: 20px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
}

h2 {
  margin: 0;
  font-size: 20px;
}

h3 {
  margin: 20px 0 8px;
  font-size: 15px;
}

.phone {
  margin: 4px 0 0;
  color: var(--rc-muted);
}

.muted {
  margin: 8px 0 0;
  color: var(--rc-muted);
  font-size: 14px;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 16px 0 0;
}

.stats dt {
  font-size: 13px;
  color: var(--rc-muted);
}

.stats dd {
  margin: 2px 0 0;
  font-weight: 700;
}

.history {
  display: grid;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
  list-style: none;
}

.history li {
  padding: 10px 0;
  border-bottom: 1px solid #e4e2dc;
}

.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.when {
  font-weight: 600;
  font-size: 15px;
}

.what,
.note {
  margin: 4px 0 0;
  font-size: 14px;
}

.note {
  color: var(--rc-muted);
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

.link:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
}
</style>
