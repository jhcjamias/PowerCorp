<script setup>
import { nextTick, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/admin/login-page/useAuth'
import logoUrl from '@/assets/rolaz-logo.png'
import { MOCK_CREDENTIALS, MOCK_RESET_PIN, resetPassword, USE_MOCK_AUTH } from '@/admin/login-page/authService'
import { validateEmail, validateNewPassword, validatePassword, validatePin, validateUsername } from '@/admin/login-page/validators'

const { signIn } = useAuth()
const route = useRoute()
const router = useRouter()

const form = reactive({ identifier: '', password: '' })
const errors = reactive({ identifier: '', password: '' })
const formError = ref('')
const notice = ref('')
const submitting = ref(false)
const showPassword = ref(false)

// Log in with the username; or with the email address if the username was forgotten.
const useEmail = ref(false)

function toggleEmailLogin() {
  useEmail.value = !useEmail.value
  form.identifier = ''
  errors.identifier = ''
  formError.value = ''
}

const identifierInput = ref(null)
const passwordInput = ref(null)

function onIdentifierInput(event) {
  form.identifier = event.target.value
  errors.identifier = ''
  formError.value = ''
}

function onPasswordInput() {
  errors.password = ''
  formError.value = ''
}

// "Forgot password": the admin types their username, their private 6-digit PIN and a new password.
const mode = ref('login') // 'login' | 'forgot'
const reset = reactive({ username: '', pin: '', next: '', confirm: '' })
const resetErrors = reactive({ username: '', pin: '', next: '', confirm: '' })

function onForgotPassword() {
  formError.value = ''
  notice.value = ''
  reset.username = useEmail.value ? '' : form.identifier.trim()
  mode.value = 'forgot'
}

function backToLogin() {
  formError.value = ''
  Object.assign(reset, { username: '', pin: '', next: '', confirm: '' })
  Object.assign(resetErrors, { username: '', pin: '', next: '', confirm: '' })
  mode.value = 'login'
}

async function onResetSubmit() {
  if (submitting.value) return
  formError.value = ''
  notice.value = ''
  resetErrors.username = validateUsername(reset.username)
  resetErrors.pin = validatePin(reset.pin)
  resetErrors.next = validateNewPassword(reset.next)
  resetErrors.confirm = reset.next !== reset.confirm ? 'The two passwords do not match.' : ''
  if (resetErrors.username || resetErrors.pin || resetErrors.next || resetErrors.confirm) return

  submitting.value = true
  try {
    await resetPassword(reset.username.trim(), reset.pin.trim(), reset.next)
    backToLogin()
    form.password = ''
    notice.value = 'Password changed. Log in with your new password.'
  } catch (error) {
    formError.value = error?.message || 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
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

  errors.identifier = useEmail.value ? validateEmail(form.identifier) : validateUsername(form.identifier)
  errors.password = validatePassword(form.password)
  if (errors.identifier || errors.password) {
    await nextTick()
    ;(errors.identifier ? identifierInput : passwordInput).value?.focus()
    return
  }

  submitting.value = true
  try {
    await signIn(form.identifier, form.password)
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
        <img class="brand-mark" :src="logoUrl" alt="" width="76" height="76" />
        <div>
          <p class="brand-eyebrow">Admin</p>
          <h1 id="login-title" class="brand-name">Rolaz Cutz</h1>
        </div>
      </header>

      <p v-if="formError" class="alert" role="alert">{{ formError }}</p>
      <p v-else-if="notice" class="notice" role="status">{{ notice }}</p>

      <form v-if="mode === 'login'" class="login-form" novalidate @submit.prevent="onSubmit">
        <div class="field">
          <label for="phone">{{ useEmail ? 'Email address' : 'Username' }}</label>
          <input
            id="phone"
            ref="identifierInput"
            :value="form.identifier"
            :type="useEmail ? 'email' : 'text'"
            :autocomplete="useEmail ? 'email' : 'username'"
            autocapitalize="none"
            spellcheck="false"
            :placeholder="useEmail ? 'you@example.com' : 'Your username'"
            :aria-invalid="errors.identifier ? 'true' : 'false'"
            :aria-describedby="errors.identifier ? 'identifier-error' : undefined"
            @input="onIdentifierInput"
          />
          <p v-if="errors.identifier" id="identifier-error" class="field-error">{{ errors.identifier }}</p>
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
        <button type="button" class="link" @click="toggleEmailLogin">
          {{ useEmail ? 'Sign in with my username instead' : 'Forgot your username? Sign in with email' }}
        </button>
      </form>

      <form v-else class="login-form" novalidate @submit.prevent="onResetSubmit">
        <h2 class="reset-title">Forgot password</h2>
        <p class="reset-help">Enter your username and your private 6-digit PIN, then choose a new password. Don't have a PIN? Ask the shop owner to set one for you.</p>

        <div class="field">
          <label for="reset-username">Username</label>
          <input
            id="reset-username"
            v-model="reset.username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            :aria-invalid="resetErrors.username ? 'true' : 'false'"
            @input="resetErrors.username = ''"
          />
          <p v-if="resetErrors.username" class="field-error">{{ resetErrors.username }}</p>
        </div>

        <div class="field">
          <label for="reset-pin">6-digit PIN</label>
          <input
            id="reset-pin"
            v-model="reset.pin"
            :type="showPassword ? 'text' : 'password'"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            :aria-invalid="resetErrors.pin ? 'true' : 'false'"
            @input="resetErrors.pin = ''"
          />
          <p v-if="resetErrors.pin" class="field-error">{{ resetErrors.pin }}</p>
        </div>

        <div class="field">
          <label for="reset-new">New password</label>
          <input
            id="reset-new"
            v-model="reset.next"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            :aria-invalid="resetErrors.next ? 'true' : 'false'"
            @input="resetErrors.next = ''"
          />
          <p v-if="resetErrors.next" class="field-error">{{ resetErrors.next }}</p>
        </div>

        <div class="field">
          <label for="reset-confirm">Confirm new password</label>
          <input
            id="reset-confirm"
            v-model="reset.confirm"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            :aria-invalid="resetErrors.confirm ? 'true' : 'false'"
            @input="resetErrors.confirm = ''"
          />
          <p v-if="resetErrors.confirm" class="field-error">{{ resetErrors.confirm }}</p>
        </div>

        <label class="show-all"><input v-model="showPassword" type="checkbox" /> Show PIN and passwords</label>

        <button type="submit" class="submit" :disabled="submitting">
          {{ submitting ? 'Saving…' : 'Save new password' }}
        </button>
        <button type="button" class="link" @click="backToLogin">Back to log in</button>
      </form>

      <p class="footnote">Admin access only.</p>

      <p v-if="USE_MOCK_AUTH" class="demo">
        Demo mode: {{ MOCK_CREDENTIALS.username }} / {{ MOCK_CREDENTIALS.password }}
        (forgot password: PIN {{ MOCK_RESET_PIN }})
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
  width: 76px;
  height: 76px;
  object-fit: contain;
}

.brand-eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rc-red);
}

/* Same bold headline style as the customer site. */
.brand-name {
  margin: 0;
  font-family: var(--rc-heading);
  font-size: 30px;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
  background: var(--rc-red-dark);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.submit:hover:not(:disabled) {
  background: #8f001d;
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

.reset-title {
  margin: 0;
  font-size: 20px;
}

.reset-help {
  margin: 0;
  color: var(--rc-muted);
  font-size: 15px;
}

.show-all {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}

.show-all input {
  width: auto;
  min-height: 0;
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
