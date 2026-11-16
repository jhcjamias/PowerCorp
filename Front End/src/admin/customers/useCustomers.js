// State and logic for the Customers page.

import { computed, onMounted, ref, watch } from 'vue'
import { phoneDigits } from '@/admin/shared/format'
import { listAppointments } from '@/admin/appointments/appointmentsService'
import { buildCustomers, SORTS } from './customers'

export const PAGE_SIZE = 10

export function useCustomers() {
  const customers = ref([])
  const loading = ref(true)
  const loadError = ref('')

  const search = ref('')
  const sortKey = ref('name')
  const page = ref(1)
  const selectedId = ref(null)

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      customers.value = buildCustomers(await listAppointments())
    } catch (error) {
      loadError.value = error?.message || 'Could not load customers.'
    } finally {
      loading.value = false
    }
  }
  onMounted(load)

  const filtered = computed(() => {
    const query = search.value.trim().toLowerCase()
    const digits = phoneDigits(query)
    const list = query
      ? customers.value.filter(
          (c) => c.name.toLowerCase().includes(query) || (digits.length > 0 && c.phone.includes(digits)),
        )
      : customers.value
    return [...list].sort(SORTS[sortKey.value].compare)
  })

  const total = computed(() => filtered.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
  const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1))
  const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, total.value))

  function goToPage(next) {
    page.value = Math.min(Math.max(1, next), pageCount.value)
  }

  watch([search, sortKey], () => {
    page.value = 1
    if (selectedId.value && !filtered.value.some((c) => c.id === selectedId.value)) {
      selectedId.value = null
    }
  })

  const selected = computed(() => customers.value.find((c) => c.id === selectedId.value) ?? null)

  return {
    loading,
    loadError,
    load,
    search,
    sortKey,
    page,
    pageCount,
    pageRows,
    total,
    rangeStart,
    rangeEnd,
    goToPage,
    selected,
    selectedId,
    select: (id) => {
      selectedId.value = id
    },
    hasAny: computed(() => customers.value.length > 0),
  }
}
