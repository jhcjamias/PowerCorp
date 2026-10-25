<script setup>
import { nextTick, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/admin/login-page/useAuth'
import { MOCK_CREDENTIALS, USE_MOCK_AUTH } from '@/admin/login-page/authService'
import { formatPhone, validatePassword, validatePhone } from '@/admin/login-page/validators'

const { signIn } = useAuth()
const route = useRoute()
const router = useRouter()

const form = reactive({ phone: '', password: '' })
const errors = reactive({ phone: '', password: '' })
const formError = ref('')
const notice = ref('')
const submitting = ref(false)
const showPassword = ref(false)

const phoneInput = ref(null)
const passwordInput = ref(null)

function onPhoneInput(event) {
  form.phone = formatPhone(event.target.value)
  errors.phone = ''
  formError.value = ''
}

function onPasswordInput() {
  errors.password = ''
  formError.value = ''
}

function onForgotPassword() {
  formError.value = ''
  notice.value = 'Password reset is coming soon. For now, contact your site administrator.'
}

// Go back to the page the admin was trying to open, otherwise the dashboard.
function afterLoginTarget() {
  const wanted = route.query.redirect
  return typeof wanted === 'string' && wanted.startsWith('/admin/') ? wanted : { name: 'admin-dashboard' }
}

async function onSubmit() {
  if (submitting.value) return
  formError.value = ''
  notice.value = ''

  errors.phone = validatePhone(form.phone)
  errors.password = validatePassword(form.password)
  if (errors.phone || errors.password) {
    await nextTick()
    ;(errors.phone ? phoneInput : passwordInput).value?.focus()
    return
  }

  submitting.value = true
  try {
    await signIn(form.phone, form.password)
    await router.push(afterLoginTarget())
  } catch (error) {
    formError.value = error?.message || 'Something went wrong. Please try again.'
    form.password = ''
    await nextTick()
    passwordInput.value?.focus()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <header class="brand">
        <span class="brand-mark" aria-hidden="true">R</span>
        <div>
          <p class="brand-eyebrow">Admin</p>
          <h1 id="login-title" class="brand-name">Rolaz Cutz</h1>
        </div>
      </header>

      <p v-if="formError" class="alert" role="alert">{{ formError }}</p>
      <p v-else-if="notice" class="notice" role="status">{{ notice }}</p>

      <form class="login-form" novalidate @submit.prevent="onSubmit">
        <div class="field">
          <label for="phone">Phone number</label>
          <input
            id="phone"
            ref="phoneInput"
            :value="form.phone"
            type="tel"
            inputmode="tel"
            autocomplete="username"
            placeholder="(281) 555-0100"
            :aria-invalid="errors.phone ? 'true' : 'false'"
            :aria-describedby="errors.phone ? 'phone-error' : undefined"
            @input="onPhoneInput"
          />
          <p v-if="errors.phone" id="phone-error" class="field-error">{{ errors.phone }}</p>
        </div>

        <div class="field">
          <label for="password">Password</label>
          <div class="password-wrap">
            <input
              id="password"
              ref="passwordInput"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              :aria-invalid="errors.password ? 'true' : 'false'"
              :aria-describedby="errors.password ? 'password-error' : undefined"
              @input="onPasswordInput"
            />
            <button
              type="button"
              class="toggle"
              :aria-pressed="showPassword"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <p v-if="errors.password" id="password-error" class="field-error">{{ errors.password }}</p>
        </div>

        <button type="submit" class="submit" :disabled="submitting">
          {{ submitting ? 'Logging in…' : 'Log in' }}
        </button>

        <button type="button" class="link" @click="onForgotPassword">Forgot password?</button>
      </form>

      <p class="footnote">Admin access only.</p>

      <p v-if="USE_MOCK_AUTH" class="demo">
        Demo mode: {{ formatPhone(MOCK_CREDENTIALS.phone) }} / {{ MOCK_CREDENTIALS.password }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: var(--rc-bg);
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 32px;
  background: var(--rc-card);
  border: 1px solid var(--rc-line);
  border-radius: var(--rc-radius);
  box-shadow: 0 1px 2px rgba(17, 17, 17, 0.06);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: var(--rc-ink);
  color: #fff;
  font-size: 26px;
  font-weight: 700;
}

.brand-eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rc-red);
}

.brand-name {
  margin: 0;
  font-size: 26px;
  line-height: 1.2;
  color: var(--rc-ink);
}

.alert,
.notice {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 15px;
}

.alert {
  background: var(--rc-error-bg);
  border: 1px solid var(--rc-red);
  color: var(--rc-red-dark);
}

.notice {
  background: #f4f3ef;
  border: 1px solid var(--rc-line);
  color: var(--rc-ink);
}

.login-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 6px;
}

label {
  font-size: 14px;
  font-weight: 600;
  color: var(--rc-ink);
}

input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1.5px solid var(--rc-ink);
  border-radius: 8px;
  background: #fff;
  color: var(--rc-ink);
  font-size: 16px;
}

input::placeholder {
  color: #767676;
}

input[aria-invalid='true'] {
  border-color: var(--rc-red);
}

input:focus-visible,
button:focus-visible {
  outline: 3px solid rgba(200, 16, 46, 0.45);
  outline-offset: 2px;
}

.password-wrap {
  position: relative;
}

.password-wrap input {
  padding-right: 76px;
}

.toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  min-width: 60px;
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--rc-ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.toggle:hover {
  background: #f1f0ec;
}

.field-error {
  margin: 0;
  font-size: 14px;
  color: var(--rc-red-dark);
}

.submit {
  min-height: 48px;
  border: 0;
  border-radius: 8px;
  background: var(--rc-red);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.submit:hover:not(:disabled) {
  background: var(--rc-red-dark);
}

.submit:disabled {
  opacity: 0.7;
  cursor: progress;
}

.link {
  justify-self: start;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--rc-ink);
  font-size: 15px;
  text-decoration: underline;
  cursor: pointer;
}

.footnote {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--rc-muted);
}

.demo {
  margin: 16px 0 0;
  padding-top: 14px;
  border-top: 1px dashed var(--rc-line);
  font-size: 13px;
  color: var(--rc-muted);
}

@media (max-width: 480px) {
  .login-card {
    padding: 24px 20px;
  }
}
</style>
