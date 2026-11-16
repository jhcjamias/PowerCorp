<script setup>
import { nextTick, ref } from 'vue'
import PaginationBar from '@/admin/shared/components/PaginationBar.vue'
import { formatDateShort, formatMoney, formatPhoneDisplay } from '@/admin/shared/format'
import CustomerDetail from './components/CustomerDetail.vue'
import { SORTS } from './customers'
import { useCustomers } from './useCustomers'

const {
  loading,
  loadError,
  load,
  search,
  sortKey,
  pageCount,
  page,
  pageRows,
  total,
  rangeStart,
  rangeEnd,
  goToPage,
  selected,
  selectedId,
  select,
  hasAny,
} = useCustomers()

const detailBox = ref(null)
async function pick(id) {
  select(id)
  await nextTick()
  detailBox.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
</script>

<template>
  <div class="page">
    <p class="intro">Everyone who has booked, with their visits and spending.</p>

    <form class="filters" role="search" aria-label="Find customers" @submit.prevent>
      <div class="field grow">
        <label for="cust-search">Search</label>
        <input id="cust-search" v-model="search" type="search" autocomplete="off" placeholder="Name or phone" />
      </div>
      <div class="field">
        <label for="cust-sort">Sort by</label>
        <select id="cust-sort" v-model="sortKey">
          <option v-for="(sort, key) in SORTS" :key="key" :value="key">{{ sort.label }}</option>
        </select>
      </div>
    </form>

    <div v-if="loadError" class="state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" @click="load">Try again</button>
    </div>

    <p v-else-if="loading" class="state" role="status">Loading customers…</p>

    <div v-else class="columns">
      <section class="list card" aria-label="Customer list">
        <template v-if="total > 0">
          <div class="table-scroll">
            <table>
              <caption class="sr-only">
                Customers
              </caption>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Phone</th>
                  <th scope="col" class="num">Visits</th>
                  <th scope="col">Last visit</th>
                  <th scope="col" class="num">Spent</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in pageRows" :key="c.id" :class="{ selected: c.id === selectedId }" @click="pick(c.id)">
                  <td class="strong">{{ c.name }}</td>
                  <td class="nowrap">{{ formatPhoneDisplay(c.phone) }}</td>
                  <td class="num">{{ c.visits }}</td>
                  <td class="nowrap">{{ c.lastVisit ? formatDateShort(c.lastVisit.date) : 'None yet' }}</td>
                  <td class="num">{{ formatMoney(c.totalSpent) }}</td>
                  <td>
                    <button
                      type="button"
                      class="view"
                      :aria-current="c.id === selectedId ? 'true' : undefined"
                      :aria-label="`View ${c.name}`"
                      @click.stop="pick(c.id)"
                    >
                      View
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <PaginationBar
            :page="page"
            :page-count="pageCount"
            :range-start="rangeStart"
            :range-end="rangeEnd"
            :total="total"
            @change="goToPage"
          />
        </template>
        <p v-else class="empty">
          {{ hasAny ? 'No customers match that search.' : 'No customers yet. They appear here after their first booking.' }}
        </p>
      </section>

      <aside ref="detailBox" class="side">
        <CustomerDetail :customer="selected" />
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
  min-width: 180px;
}

.field.grow {
  flex: 1 1 240px;
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
button:focus-visible {
  outline: 3px solid var(--rc-focus);
  outline-offset: 2px;
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

.list {
  flex: 3 1 520px;
  min-width: 0;
}

.side {
  flex: 1 1 320px;
  min-width: 0;
}

.table-scroll {
  position: relative;
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;
  font-size: 15px;
}

th {
  padding: 10px 12px;
  border-bottom: 2px solid var(--rc-ink);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}

td {
  padding: 12px;
  border-bottom: 1px solid #e4e2dc;
  vertical-align: middle;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: var(--rc-surface);
}

tbody tr.selected {
  background: #f1efea;
  box-shadow: inset 4px 0 0 var(--rc-red);
}

.num {
  text-align: right;
}

.nowrap {
  white-space: nowrap;
}

.strong {
  font-weight: 600;
}

.view {
  min-height: 36px;
  padding: 0 14px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.view[aria-current='true'] {
  background: var(--rc-ink);
  color: #fff;
}

.empty,
.state {
  padding: 24px;
  text-align: center;
}

.state {
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
