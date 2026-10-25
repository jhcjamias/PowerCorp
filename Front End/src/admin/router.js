import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/admin/login-page/useAuth'

const ComingSoon = () => import('@/admin/layout/ComingSoonView.vue')

const routes = [
  // The customer site will own "/" later; for now it just opens the admin area.
  { path: '/', redirect: '/admin' },

  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/admin/login-page/AdminLoginView.vue'),
    meta: { title: 'Log in' },
  },

  {
    path: '/admin',
    component: () => import('@/admin/layout/AdminLayout.vue'),
    redirect: { name: 'admin-dashboard' },
    children: [
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('@/admin/views/AdminHomePlaceholder.vue'),
        meta: { title: 'Dashboard' },
      },
      {
        path: 'appointments',
        name: 'admin-appointments',
        component: () => import('@/admin/appointments/AppointmentsView.vue'),
        meta: { title: 'Appointments' },
      },
      { path: 'schedule', name: 'admin-schedule', component: ComingSoon, meta: { title: 'Schedule & Time Off' } },
      { path: 'services', name: 'admin-services', component: ComingSoon, meta: { title: 'Services & Prices' } },
      { path: 'customers', name: 'admin-customers', component: ComingSoon, meta: { title: 'Customers' } },
      { path: 'reports', name: 'admin-reports', component: ComingSoon, meta: { title: 'Reports' } },
    ],
  },

  { path: '/:pathMatch(.*)*', redirect: '/admin' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Everything except the login page needs a signed-in admin.
router.beforeEach((to) => {
  const { isAuthenticated } = useAuth()

  if (to.name === 'admin-login') {
    return isAuthenticated.value ? { name: 'admin-dashboard' } : true
  }
  if (!isAuthenticated.value) {
    const query = to.fullPath === '/admin/dashboard' ? {} : { redirect: to.fullPath }
    return { name: 'admin-login', query }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta.title
  document.title = title ? `${title} · Rolaz Cutz Admin` : 'Rolaz Cutz Admin'
})

export default router
