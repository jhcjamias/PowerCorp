<script setup>
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/admin/login-page/useAuth'

const route = useRoute()
const router = useRouter()
const { isAuthenticated, user, signOut } = useAuth()

const navItems = [
  { label: 'Dashboard', to: { name: 'admin-dashboard' } },
  { label: 'Appointments', to: { name: 'admin-appointments' } },
  { label: 'Schedule & Time Off', to: { name: 'admin-schedule' } },
  { label: 'Services & Prices', to: { name: 'admin-services' } },
  { label: 'Customers', to: { name: 'admin-customers' } },
  { label: 'Reports', to: { name: 'admin-reports' } },
]

const pageTitle = computed(() => route.meta.title ?? '')
const initial = computed(() => (user.value?.name?.trim()?.[0] ?? 'R').toUpperCase())

// Covers both the Log out button and a session that expires mid-use.
watch(isAuthenticated, (signedIn) => {
  if (!signedIn) router.replace({ name: 'admin-login' })
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">R</span>
        <div>
          <p class="brand-name">Rolaz Cutz</p>
          <p class="brand-sub">Admin</p>
        </div>
      </div>

      <nav class="nav" aria-label="Admin">
        <RouterLink v-for="item in navItems" :key="item.label" :to="item.to" class="nav-link">
          {{ item.label }}
        </RouterLink>
      </nav>

      <button type="button" class="logout" @click="signOut">Log out</button>
    </aside>

    <div class="main">
      <header class="topbar">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <div class="user">
          <span v-if="user?.name" class="user-name">{{ user.name }}</span>
          <span class="avatar" aria-hidden="true">{{ initial }}</span>
        </div>
      </header>

      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  background: var(--rc-bg);
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 14px;
  background: var(--rc-ink);
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 20px;
  font-weight: 700;
}

.brand-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.brand-sub {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #ff8fa0;
}

.nav {
  display: grid;
  gap: 4px;
}

.nav-link {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 14px;
  border-left: 4px solid transparent;
  border-radius: 6px;
  color: #d9d9d9;
  font-size: 15px;
  text-decoration: none;
}

.nav-link:hover {
  background: #262626;
  color: #fff;
}

.nav-link.router-link-active {
  border-left-color: var(--rc-red);
  background: #262626;
  color: #fff;
  font-weight: 700;
}

.logout {
  margin-top: auto;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-top: 1px solid #333;
  border-radius: 0;
  background: none;
  color: #d9d9d9;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.logout:hover {
  color: #fff;
}

.nav-link:focus-visible,
.logout:focus-visible {
  outline: 3px solid #fff;
  outline-offset: -3px;
}

.main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 32px;
  background: var(--rc-card);
  border-bottom: 1px solid var(--rc-line);
}

.page-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
}

.user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-name {
  font-size: 15px;
  color: var(--rc-muted);
}

.avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--rc-red);
  color: #fff;
  font-weight: 700;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 28px 32px 48px;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    position: static;
    height: auto;
    gap: 14px;
    padding: 14px 16px;
  }

  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .nav-link {
    border-left: 0;
    border-bottom: 3px solid transparent;
    border-radius: 6px;
  }

  .nav-link.router-link-active {
    border-bottom-color: var(--rc-red);
  }

  .logout {
    margin-top: 0;
    border-top: 0;
    padding: 0 10px;
  }

  .topbar,
  .content {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
