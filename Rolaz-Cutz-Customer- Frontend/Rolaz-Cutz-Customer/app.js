'use strict';

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (!/^\d{10}$/.test(national)) throw new Error('Enter a valid 10-digit U.S. phone number.');
  return `+1${national}`;
}

function normalizeOptionalEmail(value) {
  const email = String(value ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address or leave it blank.');
  return email;
}

// Replace this adapter with an HTTP implementation that preserves its Promise contract.
// All data lives only in memory. No card fields, network requests, or browser storage.
const MockCustomerApi = (() => {
  const services = [
    { id: 'workz', name: 'The Workz', description: 'The full service: The OG with Scissor Workz, Eyebrow Detail, and Lineworkz included.', priceCents: 6000, duration: 50 },
    { id: 'regular', name: 'The OG', description: 'A custom service tailored to your style and finished with a clean lineup.', priceCents: 4500, duration: 35 },
    { id: 'kids', name: 'Kids Cutz', description: 'A fresh finish for clients 12 and under.', priceCents: 4000, duration: 30 },
    { id: 'beard', name: 'Lineworkz', description: 'Detailed beard shaping with crisp, defined edges.', priceCents: 3500, duration: 30 }
  ];
  const upgrades = [
    { id: 'scissor-workz', name: 'Scissor Workz', description: 'Added scissor detailing for shape, texture, and a natural finish.', priceCents: 500, duration: 5, serviceIds: ['regular', 'kids'] },
    { id: 'eyebrow-detail', name: 'Eyebrow Detail', description: 'A clean eyebrow finish for a sharper overall look.', priceCents: 500, duration: 5, serviceIds: ['regular', 'kids', 'beard'] },
    { id: 'lineworkz', name: 'Lineworkz', description: 'Add detailed beard shaping and a crisp line-up.', priceCents: 500, duration: 5, serviceIds: ['regular'] }
  ];
  const business = {
    name: 'Rolaz Cutz Barbershop', address: '20260 Katy Freeway Suite #116, Katy, TX 77449',
    phone: '+1 832-874-8680', email: 'rolazcutz@gmail.com', timezone: 'America/Chicago',
    // Opening / closing times in local shop minutes; 0 = Sunday.
    schedule: { 0: null, 1: null, 2: [660, 1140], 3: [660, 1140], 4: [600, 1170], 5: [540, 1185], 6: [540, 900] },
    hours: [['Monday', 'Closed'], ['Tuesday', '11:00 AM – 7:00 PM'], ['Wednesday', '11:00 AM – 7:00 PM'], ['Thursday', '10:00 AM – 7:30 PM'], ['Friday', '9:00 AM – 7:45 PM'], ['Saturday', '9:00 AM – 3:00 PM'], ['Sunday', 'Closed']]
  };
  let profile = { name: '', email: 'you@example.com', phone: '' };
  let appointments = [{ id: 'DEMO-1001', serviceId: 'regular', serviceName: 'The OG', upgradeIds: [], upgradeNames: [], priceCents: 4500, duration: 35, date: '2026-10-23', time: 660, status: 'completed', paymentMethod: 'shop', customer: { ...profile }, ownerPhone: null, sample: true }];
  let session = null;
  let pendingVerification = null;
  let lastCodeRequestAt = 0;
  const registeredCustomers = new Map();
  let sequence = 2000;
  const copy = value => JSON.parse(JSON.stringify(value));
  const result = value => new Promise(resolve => setTimeout(() => resolve(copy(value)), 90));
  const parseDate = date => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(year, month - 1, day, 12);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
  };
  const requireDate = date => {
    const parsed = parseDate(date);
    if (!parsed) throw new Error('Please choose a valid appointment date.');
    return parsed;
  };
  const normalizeCustomer = customer => {
    if (!customer?.name?.trim() || !customer.phone?.trim()) throw new Error('Please complete your name and phone number.');
    return { name: customer.name.trim(), email: normalizeOptionalEmail(customer.email), phone: normalizePhone(customer.phone) };
  };
  const quoteFor = ({ serviceId, upgradeIds = [] }) => {
    const service = services.find(item => item.id === serviceId);
    if (!service) throw new Error('Please choose a service.');
    if (!Array.isArray(upgradeIds)) throw new Error('Please choose valid Upgradez.');
    const uniqueIds = [...new Set(upgradeIds)];
    if (uniqueIds.length !== upgradeIds.length) throw new Error('Each upgrade can be selected only once.');
    const selectedUpgrades = uniqueIds.map(id => upgrades.find(item => item.id === id));
    if (selectedUpgrades.some(item => !item)) throw new Error('One or more selected Upgradez are unavailable.');
    if (selectedUpgrades.some(item => !item.serviceIds.includes(service.id))) throw new Error('That upgrade is not available with this service.');
    return {
      service,
      upgrades: selectedUpgrades,
      upgradeIds: selectedUpgrades.map(item => item.id),
      priceCents: service.priceCents + selectedUpgrades.reduce((total, item) => total + item.priceCents, 0),
      duration: service.duration + selectedUpgrades.reduce((total, item) => total + item.duration, 0)
    };
  };
  const slotsFor = ({ date, serviceId, upgradeIds = [], replacesId }) => {
    const quote = quoteFor({ serviceId, upgradeIds });
    const hours = business.schedule[requireDate(date).getDay()];
    if (!hours) return [];
    const slots = [];
    for (let minute = hours[0]; minute + quote.duration <= hours[1]; minute += 15) {
      const demoBusy = [[hours[0] + 60, hours[0] + 105], [hours[0] + 180, hours[0] + 225]];
      const booked = appointments.filter(item => item.date === date && item.status === 'confirmed' && item.id !== replacesId).map(item => [item.time, item.time + (item.duration ?? quoteFor(item).duration)]);
      const unavailable = [...demoBusy, ...booked].some(([start, end]) => minute < end && minute + quote.duration > start);
      slots.push({ time: minute, available: !unavailable });
    }
    return slots;
  };
  return {
    getServices: () => result(services),
    getUpgrades: () => result(upgrades),
    getBusiness: () => result(business),
    getProfile: () => result(profile),
    updateProfile: async customer => {
      profile = normalizeCustomer(customer);
      if (session?.customer?.phone === profile.phone) {
        registeredCustomers.set(profile.phone, { ...profile });
        session = { ...session, customer: { ...profile } };
      }
      return result(profile);
    },
    getAvailability: async request => result({ date: request.date, timezone: business.timezone, slots: slotsFor(request) }),
    listAppointments: () => result(session ? appointments.filter(item => item.ownerPhone === session.customer.phone) : appointments.filter(item => !item.ownerPhone)),
    createAppointment: async request => {
      const quote = quoteFor(request);
      const date = requireDate(request.date);
      const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: business.timezone }).format(new Date());
      if (!Number.isFinite(date.getTime()) || request.date <= currentDate) throw new Error('Please choose a future appointment date.');
      if (!['demo-card', 'shop'].includes(request.paymentMethod)) throw new Error('Please choose a demo payment option.');
      if (request.policyAccepted !== true) throw new Error('Please accept the Appointment & Payment Policy.');
      const previous = request.replacesId ? appointments.find(item => item.id === request.replacesId && item.status === 'confirmed') : null;
      if (request.replacesId && !previous) throw new Error('That demo appointment can no longer be rescheduled.');
      if (!slotsFor(request).some(slot => slot.time === request.time && slot.available)) throw new Error('That demo time is unavailable. Please choose another time.');
      const customer = normalizeCustomer(request.customer);
      profile = customer;
      const appointment = previous ?? { id: `DEMO-${++sequence}` };
      Object.assign(appointment, {
        serviceId: quote.service.id,
        serviceName: quote.service.name,
        upgradeIds: quote.upgradeIds,
        upgradeNames: quote.upgrades.map(item => item.name),
        priceCents: quote.priceCents,
        duration: quote.duration,
        date: request.date,
        time: request.time,
        customer,
        paymentMethod: request.paymentMethod,
        ownerPhone: previous?.ownerPhone ?? session?.customer?.phone ?? null,
        policyAccepted: true,
        policyVersion: '2026-11-11',
        status: 'confirmed',
        sample: false
      });
      if (!previous) appointments.unshift(appointment);
      return result(appointment);
    },
    createStripeCheckout: async request => {
    const payload = mapAppointmentRequest(request);
    payload.payment = 'Stripe';
    payload.paymentMethod = 'stripe';
    const response = await customerRequest('/api/customer/stripe/checkout', { method: 'POST', body: payload });
    if (!response?.checkoutUrl || !/^https:\/\/checkout\.stripe\.com\//.test(response.checkoutUrl)) {
      throw new CustomerApiError('The payment service returned an invalid checkout link.');
    }
    return response;
  },
  cancelAppointment: async ({ id }) => {
      const appointment = appointments.find(item => item.id === id && item.status === 'confirmed');
      if (!appointment) throw new Error('This appointment cannot be canceled.');
      appointment.status = 'canceled';
      return result(appointment);
    },
    getReviews: () => result({
      status: 'unavailable', rating: null, totalCount: 0, reviews: [],
      googleUrl: 'https://www.google.com/search?q=Rolaz+Cutz+Barbershop+Katy+reviews',
      attribution: 'Google',
      message: 'Live Google reviews will appear here when the backend connection is ready.'
    }),
    getInstagramPosts: () => result({
      status: 'unavailable', posts: [], profileUrl: 'https://www.instagram.com/rolaz_cutz/',
      message: 'Live Instagram posts will appear here when the backend connection is ready.'
    }),
    requestVerificationCode: async request => {
      const phone = normalizePhone(request?.phone);
      const intent = request?.intent === 'login' ? 'login' : 'register';
      const name = String(request?.name ?? '').trim();
      const email = normalizeOptionalEmail(request?.email);
      if (intent === 'register' && !name) throw new Error('Enter your full name to create an account.');
      const remaining = Math.ceil((lastCodeRequestAt + 30000 - Date.now()) / 1000);
      if (remaining > 0) throw new Error(`Please wait ${remaining} seconds before requesting another code.`);
      lastCodeRequestAt = Date.now();
      pendingVerification = { phone, intent, name, email, expiresAt: Date.now() + 600000 };
      return result({ status: 'demo', phone, expiresInSeconds: 600, resendAfterSeconds: 30, demoCode: '246810' });
    },
    verifyCode: async request => {
      const phone = normalizePhone(request?.phone);
      const code = String(request?.code ?? '').trim();
      if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit verification code.');
      if (!pendingVerification || pendingVerification.phone !== phone || pendingVerification.intent !== request?.intent) throw new Error('Request a new verification code and try again.');
      if (Date.now() > pendingVerification.expiresAt) { pendingVerification = null; throw new Error('That verification code expired. Request a new code.'); }
      if (code !== '246810') throw new Error('That verification code is incorrect. Please try again.');
      const details = pendingVerification;
      pendingVerification = null;
      let customer = registeredCustomers.get(phone);
      if (details.intent === 'register') {
        customer = { name: details.name, email: details.email, phone };
        registeredCustomers.set(phone, customer);
      } else if (!customer) {
        customer = { name: profile.phone === phone && profile.name ? profile.name : 'Rolaz Client', email: profile.phone === phone ? profile.email : '', phone };
      }
      profile = { ...customer };
      session = { authenticated: true, customer: { ...customer } };
      return result(session);
    },
    getSession: () => result(session),
    logout: async () => { session = null; return result(null); }
  };
})();
window.MockCustomerApi = MockCustomerApi;

const CUSTOMER_SESSION_KEY = 'rolaz_customer_session';
const GOOGLE_REVIEWS_URL = 'https://www.google.com/search?q=Rolaz+Cutz+Barbershop+Katy+reviews';
const INSTAGRAM_PROFILE_URL = 'https://www.instagram.com/rolaz_cutz/';
let customerUnauthorizedHandler = () => {};

function setCustomerUnauthorizedHandler(handler) {
  customerUnauthorizedHandler = typeof handler === 'function' ? handler : () => {};
}

function clearPrivateCustomerState(target) {
  target.session = null;
  target.profile = { name: '', email: '', phone: '' };
  target.verification = null;
  target.confirmation = null;
  return target;
}

async function completeBooking(api, request, { refreshProfile = false } = {}) {
  const appointment = await api.createAppointment(request);
  let refreshedProfile = null;
  if (refreshProfile) {
    try { refreshedProfile = await api.getProfile(); }
    catch (error) { if (error?.status !== 401) throw error; }
  }
  return { appointment, profile: refreshedProfile };
}

async function withDisabledControl(control, action) {
  control.disabled = true;
  try { return await action(); }
  finally { control.disabled = false; }
}

function startupErrorView(error) {
  const message = String(error?.message || 'The shop could not load right now. Please try again.').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return `<div class="shell startup-error" role="alert"><span class="section-code">CONNECTION ERROR</span><h1>WE COULDN'T<br>LOAD THE SHOP.</h1><p>${message}</p><button class="button" type="button" data-retry-startup>Try again</button></div>`;
}

async function runCustomerStartup({ load, loading, ready, failed }) {
  loading();
  try {
    const data = await load();
    await ready(data);
    return true;
  } catch (error) {
    failed(error);
    return false;
  }
}

async function loadInitialCustomerData(api) {
  const sessionPromise = api.getSession().catch(error => { if (error?.status === 401) return null; throw error; });
  const profilePromise = api.getProfile().catch(error => { if (error?.status === 401) return { name: '', email: '', phone: '' }; throw error; });
  const [services, upgrades, business, profile, session] = await Promise.all([api.getServices(), api.getUpgrades(), api.getBusiness(), profilePromise, sessionPromise]);
  return { services, upgrades, business, profile: session?.customer ?? profile, session };
}

const GOOD_TO_KNOW = Object.freeze([
  Object.freeze(['Do you accept walk-ins?', 'No, Rolaz Cutz is appointment-only. All clients must book an appointment in advance to secure their spot.']),
  Object.freeze(["What happens if I'm running late?", "If you're running late, please call as soon as possible so we can try to make arrangements. Arriving more than 5 minutes late may result in your appointment being canceled and the full service fee being charged. We reserve the right to refuse service for late arrivals."]),
  Object.freeze(['What is your cancellation or rescheduling policy?', 'We ask that you cancel or reschedule your appointment at least 2 hours before your scheduled time. If something comes up, please call to let us know so we can discuss your options.']),
  Object.freeze(['What happens if I miss my appointment?', "No-call, no-show appointments will be charged the full price of the scheduled service. Please contact us ahead of time if you're unable to make it."]),
  Object.freeze(['Do you accept cash?', 'Absolutely. Cash is still accepted as a payment method.']),
  Object.freeze(['Can I bring a reference photo?', "Absolutely. Whether it's a specific fade, style, or something completely different, reference photos help communicate the look you're going for."]),
  Object.freeze(['Where are you located?', 'Rolaz Cutz is located inside Phenix Salon Suites at 20260 Katy Freeway, Suite 116, Katy, TX 77449.'])
]);

function goodToKnowView() {
  return `<section id="good-to-know" class="faq-section"><div class="faq-intro"><span class="section-code">05 / THE DETAILS</span><h2>GOOD TO KNOW</h2><p>Everything you need to know before getting in the chair.</p></div><div class="faq-list">${GOOD_TO_KNOW.map(([question, answer]) => `<details><summary>${question}<span aria-hidden="true"></span></summary><p>${answer}</p></details>`).join('')}</div></section>`;
}

function normalizeReviewsPayload(payload) {
  const base = { status: 'unavailable', rating: null, totalCount: 0, reviews: [], googleUrl: GOOGLE_REVIEWS_URL, attribution: 'Google', message: 'Live Google reviews are temporarily unavailable.' };
  if (!payload || typeof payload !== 'object' || payload.status === 'unavailable') return { ...base, ...(payload?.message ? { message: String(payload.message) } : {}), ...(typeof payload?.googleUrl === 'string' ? { googleUrl: payload.googleUrl } : {}) };
  if (!Array.isArray(payload.reviews)) return base;
  const validRating = value => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 5;
  const reviews = payload.reviews.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.authorName === 'string' && validRating(item.rating)).map(item => ({
    id: item.id,
    authorName: item.authorName,
    rating: Math.max(0, Math.min(5, Number(item.rating))),
    text: typeof item.text === 'string' ? item.text : '',
    relativeTime: typeof item.relativeTime === 'string' ? item.relativeTime : '',
    authorPhotoUrl: typeof item.authorPhotoUrl === 'string' ? item.authorPhotoUrl : ''
  }));
  return {
    status: reviews.length ? 'success' : 'empty',
    rating: validRating(payload.rating) ? Number(payload.rating) : null,
    totalCount: Number.isInteger(Number(payload.totalCount)) && Number(payload.totalCount) >= 0 ? Number(payload.totalCount) : reviews.length,
    reviews,
    googleUrl: typeof payload.googleUrl === 'string' && payload.googleUrl ? payload.googleUrl : GOOGLE_REVIEWS_URL,
    attribution: typeof payload.attribution === 'string' && payload.attribution ? payload.attribution : 'Google',
    message: reviews.length ? '' : 'No Google reviews were returned.'
  };
}

function normalizeInstagramPayload(payload) {
  const base = { status: 'unavailable', posts: [], profileUrl: INSTAGRAM_PROFILE_URL, message: 'Live Instagram posts are temporarily unavailable.' };
  if (!payload || typeof payload !== 'object' || payload.status === 'unavailable') return { ...base, ...(payload?.message ? { message: String(payload.message) } : {}), ...(typeof payload?.profileUrl === 'string' ? { profileUrl: payload.profileUrl } : {}) };
  if (!Array.isArray(payload.posts)) return base;
  const posts = payload.posts.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.permalink === 'string' && (typeof item.mediaUrl === 'string' || typeof item.thumbnailUrl === 'string')).map(item => ({
    id: item.id,
    mediaType: typeof item.mediaType === 'string' ? item.mediaType : 'IMAGE',
    mediaUrl: typeof item.mediaUrl === 'string' ? item.mediaUrl : '',
    thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : '',
    permalink: item.permalink,
    caption: typeof item.caption === 'string' ? item.caption : '',
    timestamp: typeof item.timestamp === 'string' ? item.timestamp : ''
  }));
  return {
    status: posts.length ? 'success' : 'empty',
    posts,
    profileUrl: typeof payload.profileUrl === 'string' && payload.profileUrl ? payload.profileUrl : INSTAGRAM_PROFILE_URL,
    message: posts.length ? '' : 'No Instagram posts were returned.'
  };
}

function createLatestOnlyLoader(normalize) {
  let requestId = 0;
  let current = { status: 'idle', requestId: 0 };
  return {
    getState: () => current,
    load: async fetcher => {
      const activeId = ++requestId;
      current = { ...current, status: 'loading', requestId: activeId, message: '' };
      try {
        const payload = await fetcher();
        if (activeId !== requestId) return current;
        current = { ...normalize(payload), requestId: activeId };
      } catch (error) {
        if (activeId !== requestId) return current;
        current = { status: 'error', requestId: activeId, message: 'Live content is temporarily unavailable. Please try again.', errorStatus: error?.status ?? 0 };
      }
      return current;
    },
    invalidate: () => { requestId += 1; }
  };
}

const suppliedCustomerConfig = window.ROLAZ_CUSTOMER_CONFIG ?? {};
const CUSTOMER_CONFIG = Object.freeze({
  mode: suppliedCustomerConfig.mode === 'http' ? 'http' : 'mock',
  apiBaseUrl: String(suppliedCustomerConfig.apiBaseUrl ?? '').replace(/\/$/, '')
});

class CustomerApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'CustomerApiError';
    this.status = status;
    this.details = details;
  }
}

function minutesToTime(minutes) {
  if (!Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 1439) throw new Error('Choose a valid appointment time.');
  return `${String(Math.floor(Number(minutes) / 60)).padStart(2, '0')}:${String(Number(minutes) % 60).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  if (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 1439) return Number(value);
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('The booking service returned an invalid appointment time.');
  return Number(match[1]) * 60 + Number(match[2]);
}

function mapAppointmentRequest(request) {
  if (!request?.service?.id || !request.service.name) throw new Error('Please choose a service.');
  if (request.policyAccepted !== true) throw new Error('Please accept the Appointment & Payment Policy.');
  const customer = {
    name: String(request.customer?.name ?? '').trim(),
    email: normalizeOptionalEmail(request.customer?.email),
    phone: normalizePhone(request.customer?.phone)
  };
  if (!customer.name) throw new Error('Please complete your name and phone number.');
  const snapshots = [request.service, ...(request.upgrades ?? [])].map(item => ({
    id: String(item.id), name: String(item.name), price: Number(item.priceCents) / 100, durationMin: Number(item.duration)
  }));
  if (snapshots.some(item => !Number.isFinite(item.price) || !Number.isFinite(item.durationMin))) throw new Error('The selected service total is invalid.');
  return {
    date: request.date,
    time: minutesToTime(request.time),
    customer,
    services: snapshots,
    status: 'Booked',
    payment: 'Pay at Shop',
    paymentMethod: 'shop',
    receiptSent: false,
    referencePhotos: 0,
    notes: String(request.notes ?? ''),
    policyAccepted: true,
    policyVersion: '2026-11-11'
  };
}

function normalizeAppointment(appointment) {
  if (!appointment || typeof appointment !== 'object') throw new Error('The booking service returned an invalid appointment.');
  const snapshots = Array.isArray(appointment.services) ? appointment.services : [];
  const [service, ...upgrades] = snapshots;
  const statusMap = { Booked: 'confirmed', Completed: 'completed', Cancelled: 'canceled' };
  return {
    ...appointment,
    serviceId: appointment.serviceId ?? service?.id,
    serviceName: appointment.serviceName ?? service?.name,
    upgradeIds: appointment.upgradeIds ?? upgrades.map(item => item.id),
    upgradeNames: appointment.upgradeNames ?? upgrades.map(item => item.name),
    priceCents: appointment.priceCents ?? Math.round(snapshots.reduce((total, item) => total + Number(item.price ?? 0), 0) * 100),
    duration: appointment.duration ?? snapshots.reduce((total, item) => total + Number(item.durationMin ?? 0), 0),
    time: timeToMinutes(appointment.time),
    status: statusMap[appointment.status] ?? String(appointment.status ?? '').toLowerCase(),
    paymentMethod: appointment.paymentMethod ?? 'shop'
  };
}

function runtimeCopy(mode = CUSTOMER_CONFIG.mode) {
  return mode === 'http' ? {
    confirmButton: 'Confirm appointment',
    confirmationCode: 'BOOKING CONFIRMATION',
    confirmationHeading: 'APPOINTMENT CONFIRMED.',
    confirmationIntro: 'Your appointment is booked. Save these details and call the shop if your plans change.',
    paymentTitle: 'Pay at the Shop',
    paymentDetail: 'Pay in person after your service. Zelle and Cash Welcome.',
    availabilityLabel: 'LIVE AVAILABILITY',
    finePrint: 'Final availability and appointment details come directly from the booking system.'
  } : {
    confirmButton: 'Confirm demo appointment',
    confirmationCode: 'DEMO CONFIRMATION',
    confirmationHeading: 'DEMO APPOINTMENT CONFIRMED.',
    confirmationIntro: 'This is how a confirmed appointment will be presented. No real appointment was booked and no payment was collected.',
    paymentTitle: 'Pay at the Shop',
    paymentDetail: 'Pay in person after your service. Zelle and Cash Welcome.',
    availabilityLabel: 'DEMO AVAILABILITY',
    finePrint: 'Approval prototype. Availability is simulated. No real appointment or payment will be made.'
  };
}

async function customerRequest(path, options = {}) {
  const url = `${CUSTOMER_CONFIG.apiBaseUrl}${path}`;
  const headers = { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.headers ?? {}) };
  let response;
  try {
    response = await fetch(url, { credentials: 'include', ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  } catch (error) {
    throw new CustomerApiError('Unable to reach the booking service. Please check your connection and try again.', 0, { cause: error?.message ?? 'network error' });
  }
  if (response.status === 401) {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    customerUnauthorizedHandler();
  }
  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch (error) {
      throw new CustomerApiError('The booking service returned an invalid response. Please try again.', response.status, { cause: error.message });
    }
  }
  if (!response.ok) {
    const message = payload?.message ?? payload?.error?.message ?? payload?.error ?? `The booking service returned an error (${response.status}).`;
    throw new CustomerApiError(String(message), response.status, payload);
  }
  return payload;
}

const HttpCustomerApi = {
  getServices: () => customerRequest('/api/public/services'),
  getUpgrades: () => customerRequest('/api/public/upgrades'),
  getBusiness: () => customerRequest('/api/public/business'),
  getProfile: () => customerRequest('/api/customer/profile'),
  updateProfile: customer => customerRequest('/api/customer/profile', { method: 'PATCH', body: customer }),
  getAvailability: request => customerRequest(`/api/public/availability?${new URLSearchParams({ date: request.date, serviceId: request.serviceId, upgradeIds: (request.upgradeIds ?? []).join(','), ...(request.replacesId ? { replacesId: request.replacesId } : {}) })}`),
  listAppointments: async () => {
    const response = await customerRequest('/api/customer/appointments');
    const appointments = Array.isArray(response) ? response : response?.appointments;
    if (!Array.isArray(appointments)) throw new CustomerApiError('The booking service returned an invalid appointment list.');
    return appointments.map(normalizeAppointment);
  },
  createAppointment: async request => {
    const payload = mapAppointmentRequest(request);
    const path = request.replacesId ? `/api/customer/appointments/${encodeURIComponent(request.replacesId)}` : '/api/customer/appointments';
    const response = await customerRequest(path, { method: request.replacesId ? 'PATCH' : 'POST', body: payload });
    return normalizeAppointment(response);
  },
  createStripeCheckout: async request => {
    const payload = mapAppointmentRequest(request);
    payload.payment = 'Stripe';
    payload.paymentMethod = 'stripe';
    const response = await customerRequest('/api/customer/stripe/checkout', { method: 'POST', body: payload });
    if (!response?.checkoutUrl || !/^https:\/\/checkout\.stripe\.com\//.test(response.checkoutUrl)) {
      throw new CustomerApiError('The payment service returned an invalid checkout link.');
    }
    return response;
  },
  cancelAppointment: async ({ id }) => normalizeAppointment(await customerRequest(`/api/customer/appointments/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'Cancelled' } })),
  getReviews: () => customerRequest('/api/public/reviews'),
  getInstagramPosts: () => customerRequest('/api/public/instagram'),
  requestVerificationCode: request => customerRequest('/api/customer/auth/send-code', { method: 'POST', body: request }),
  verifyCode: async request => {
    const session = await customerRequest('/api/customer/auth/verify-code', { method: 'POST', body: request });
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(CUSTOMER_SESSION_KEY, 'active');
    return session;
  },
  getSession: () => customerRequest('/api/customer/session'),
  logout: async () => {
    const response = await customerRequest('/api/customer/auth/logout', { method: 'POST' });
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    return response;
  }
};

const CustomerApi = CUSTOMER_CONFIG.mode === 'http' ? HttpCustomerApi : MockCustomerApi;
const RolazCustomerCore = Object.freeze({ CUSTOMER_CONFIG, CUSTOMER_SESSION_KEY, GOOD_TO_KNOW, goodToKnowView, normalizePhone, normalizeOptionalEmail, minutesToTime, timeToMinutes, mapAppointmentRequest, normalizeAppointment, runtimeCopy, normalizeReviewsPayload, normalizeInstagramPayload, createLatestOnlyLoader, clearPrivateCustomerState, setCustomerUnauthorizedHandler, completeBooking, withDisabledControl, startupErrorView, runCustomerStartup, loadInitialCustomerData, CustomerApiError, customerRequest, MockCustomerApi, HttpCustomerApi, CustomerApi });
window.RolazCustomerCore = RolazCustomerCore;

const state = { services: [], upgrades: [], business: null, profile: null, session: null, verification: null, serviceId: null, upgradeIds: [], date: null, time: null, replacesId: null, confirmation: null, renderId: 0 };
const reviewsLoader = createLatestOnlyLoader(normalizeReviewsPayload);
const instagramLoader = createLatestOnlyLoader(normalizeInstagramPayload);
const main = document.querySelector('#main');
setCustomerUnauthorizedHandler(() => {
  const hadSession = Boolean(state.session);
  clearPrivateCustomerState(state);
  if (hadSession) Promise.resolve().then(async () => {
    if (['#account', '#profile', '#verify'].includes(location.hash)) await render();
    announce('Your session expired. Sign in again to continue.');
  });
});
function applyRuntimeChrome() {
  if (CUSTOMER_CONFIG.mode !== 'http') return;
  const bar = document.querySelector('.prototype-bar');
  if (bar) bar.innerHTML = '<span class="status-dot"></span><strong>LIVE BOOKING</strong><span>Appointments and availability connect to the shop booking system.</span>';
  const footerStatus = document.querySelector('.site-footer > p');
  if (footerStatus) footerStatus.innerHTML = 'Customer booking experience<br>Appointments are confirmed by the shop system.';
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', 'Book an appointment with Rolaz Cutz Barbershop.');
}
applyRuntimeChrome();
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = priceCents => usd.format(priceCents / 100);
const selectedService = () => state.services.find(item => item.id === state.serviceId);
const selectedUpgrades = () => state.upgrades.filter(item => state.upgradeIds.includes(item.id));
const compatibleUpgradeIds = (serviceId, upgradeIds = []) => upgradeIds.filter(id => state.upgrades.some(item => item.id === id && item.serviceIds.includes(serviceId)));
const selectionQuote = () => {
  const service = selectedService();
  const upgrades = selectedUpgrades();
  return service ? {
    service,
    upgrades,
    priceCents: service.priceCents + upgrades.reduce((total, item) => total + item.priceCents, 0),
    duration: service.duration + upgrades.reduce((total, item) => total + item.duration, 0)
  } : null;
};
const appointmentDetails = appointment => {
  const catalogService = state.services.find(item => item.id === appointment.serviceId);
  const service = {
    id: appointment.serviceId,
    name: appointment.serviceName ?? catalogService?.name ?? 'Selected service',
    priceCents: catalogService?.priceCents ?? appointment.priceCents ?? 0,
    duration: catalogService?.duration ?? appointment.duration ?? 0
  };
  const upgradeIds = appointment.upgradeIds ?? [];
  const upgradeNames = appointment.upgradeNames ?? [];
  const upgrades = Array.from({ length: Math.max(upgradeIds.length, upgradeNames.length) }, (_, index) => {
    const catalogUpgrade = state.upgrades.find(item => item.id === upgradeIds[index]);
    return {
      id: upgradeIds[index] ?? `snapshot-${index}`,
      name: upgradeNames[index] ?? catalogUpgrade?.name ?? 'Upgrade',
      priceCents: catalogUpgrade?.priceCents ?? 0,
      duration: catalogUpgrade?.duration ?? 0
    };
  });
  return {
    service,
    upgrades,
    priceCents: appointment.priceCents ?? service.priceCents + upgrades.reduce((total, item) => total + item.priceCents, 0),
    duration: appointment.duration ?? service.duration + upgrades.reduce((total, item) => total + item.duration, 0)
  };
};
const dateObject = date => new Date(`${date}T12:00:00`);
const dateLabel = date => dateObject(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = date => dateObject(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeLabel = minute => `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${minute < 720 ? 'AM' : 'PM'}`;
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const directionsUrl = 'https://www.google.com/maps/place/Rolaz+Cutz+Barbershop/@29.7872971,-95.7257288,17z/data=!4m15!1m8!3m7!1s0x8640db716ee7603d:0xb41102f43cb5b554!2sRolaz+Cutz+Barbershop!8m2!3d29.7872971!4d-95.7231539!10e1!16s%2Fg%2F11y8j34g7k!3m5!1s0x8640db716ee7603d:0xb41102f43cb5b554!8m2!3d29.7872971!4d-95.7231539!16s%2Fg%2F11y8j34g7k?entry=ttu&g_ep=EgoyMDI2MTEwOC4wIKXMDSoASAFQAw%3D%3D';
const mapUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=-95.728%2C29.783%2C-95.718%2C29.791&layer=mapnik&marker=29.7872242%2C-95.7229034';
function nextDates() {
  const shopDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const start = dateObject(shopDate);
  return Array.from({ length: 14 }, (_, index) => { const day = new Date(start); day.setDate(day.getDate() + index + 1); return dateKey(day); });
}
function announce(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => toast.classList.remove('visible'), 4200);
}
function go(route) {
  if (location.hash === `#${route}`) render(true);
  else location.hash = route;
}
function startBooking(serviceId = null) {
  Object.assign(state, { serviceId, upgradeIds: [], date: null, time: null, replacesId: null });
  go('services');
}
function restoreBookingSelection(appointment, replacesId = null) {
  const requestedUpgradeIds = appointment.upgradeIds ?? [];
  const upgradeIds = compatibleUpgradeIds(appointment.serviceId, requestedUpgradeIds);
  Object.assign(state, { serviceId: appointment.serviceId, upgradeIds, date: null, time: null, replacesId });
  if (upgradeIds.length !== requestedUpgradeIds.length) announce('Unavailable Upgradez were removed from this booking. Please review your selection.');
}
function scrollToHomeSection(hash) {
  const scroll = () => document.querySelector(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  scroll();
  setTimeout(scroll, 80);
}
function safeExternalUrl(value, fallback) {
  return typeof value === 'string' && value.startsWith('https://') ? value : fallback;
}
function stars(rating) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `<span class="review-stars" aria-label="${rounded} out of 5 stars">${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}</span>`;
}
function socialStatusView({ type, message, link, linkText }) {
  return `<div class="social-status" role="status"><span class="status-kicker">${type === 'loading' ? 'CONNECTING' : 'LIVE FEED'}</span><h3>${type === 'loading' ? 'Loading the latest…' : 'Connection pending.'}</h3><p>${esc(message)}</p>${type === 'loading' ? '' : `<a class="text-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(linkText)} ↗</a>`}</div>`;
}
function reviewsSectionView() {
  const reviews = reviewsLoader.getState();
  const googleUrl = safeExternalUrl(reviews.googleUrl, GOOGLE_REVIEWS_URL);
  let body;
  if (reviews.status === 'loading' || reviews.status === 'idle') body = socialStatusView({ type: 'loading', message: 'Checking Google for the latest customer feedback.', link: googleUrl, linkText: 'View on Google' });
  else if (reviews.status === 'success') {
    const aggregate = reviews.rating === null ? '' : `<strong>${Number(reviews.rating).toFixed(1)}</strong>${stars(reviews.rating)}`;
    body = `<div class="reviews-overview"><div>${aggregate}<span>${reviews.totalCount} Google review${reviews.totalCount === 1 ? '' : 's'} · ${esc(reviews.attribution || 'Google')}</span></div><a class="text-link" href="${esc(googleUrl)}" target="_blank" rel="noopener noreferrer">See every review on Google ↗</a></div><div class="review-grid">${reviews.reviews.slice(0, 5).map(review => `<article class="review-card"><div class="review-card-top"><strong>${esc(review.authorName)}</strong>${stars(review.rating)}</div><p>${esc(review.text || 'Rating shared without written feedback.')}</p><small>${esc(review.relativeTime)}</small></article>`).join('')}</div>`;
  }
  else body = socialStatusView({ type: reviews.status, message: reviews.message || 'Live Google reviews are temporarily unavailable.', link: googleUrl, linkText: 'View Rolaz Cutz on Google' });
  return `<section id="reviews" class="proof-section"><header class="social-heading"><div><span class="section-code">03 / CLIENT WORD</span><h2>THE ROLAZ EFFECT,<br><em>IN THEIR WORDS.</em></h2></div><p>Customer feedback comes from Google when the live backend connection is enabled.</p></header>${body}<button class="refresh-button" type="button" data-refresh="reviews">Refresh reviews</button></section>`;
}
function instagramSectionView() {
  const instagram = instagramLoader.getState();
  const profileUrl = safeExternalUrl(instagram.profileUrl, INSTAGRAM_PROFILE_URL);
  let body;
  if (instagram.status === 'loading' || instagram.status === 'idle') body = socialStatusView({ type: 'loading', message: 'Checking Instagram for the latest work from @rolaz_cutz.', link: profileUrl, linkText: 'Open Instagram' });
  else if (instagram.status === 'success') body = `<div class="instagram-grid">${instagram.posts.slice(0, 6).map(post => { const media = safeExternalUrl(post.thumbnailUrl || post.mediaUrl, ''); return `<a class="instagram-card" href="${esc(safeExternalUrl(post.permalink, profileUrl))}" target="_blank" rel="noopener noreferrer">${media ? `<img src="${esc(media)}" alt="${esc(post.caption ? post.caption.slice(0, 120) : 'Rolaz Cutz Instagram post')}" loading="lazy">` : '<span class="instagram-placeholder">VIEW POST</span>'}<span>${esc(post.caption ? post.caption.slice(0, 110) : 'See this look on Instagram.')}</span></a>`; }).join('')}</div><a class="button button-secondary social-follow" href="${esc(profileUrl)}" target="_blank" rel="noopener noreferrer">Follow @rolaz_cutz</a>`;
  else body = socialStatusView({ type: instagram.status, message: instagram.message || 'Live Instagram posts are temporarily unavailable.', link: profileUrl, linkText: 'Follow @rolaz_cutz on Instagram' });
  return `<section id="instagram" class="instagram-section"><header class="social-heading"><div><span class="section-code">04 / FROM THE CHAIR</span><h2>THE LATEST<br><em>WORKZ.</em></h2></div><p>A live look at recent work will update here through Instagram—never from hard-coded sample posts.</p></header>${body}<button class="refresh-button refresh-button-light" type="button" data-refresh="instagram">Refresh Instagram</button></section>`;
}
async function refreshReviews() {
  const pending = reviewsLoader.load(() => CustomerApi.getReviews());
  if (['', 'home', 'reviews', 'instagram', 'good-to-know', 'shop-info', 'service-menu'].includes(location.hash.slice(1))) await render();
  await pending;
  if (['', 'home', 'reviews', 'instagram', 'good-to-know', 'shop-info', 'service-menu'].includes(location.hash.slice(1))) await render();
}
async function refreshInstagram() {
  const pending = instagramLoader.load(() => CustomerApi.getInstagramPosts());
  if (['', 'home', 'reviews', 'instagram', 'good-to-know', 'shop-info', 'service-menu'].includes(location.hash.slice(1))) await render();
  await pending;
  if (['', 'home', 'reviews', 'instagram', 'good-to-know', 'shop-info', 'service-menu'].includes(location.hash.slice(1))) await render();
}
function homeView() {
  return `<div class="home-shell"><section class="suite-hero"><div class="hero-copy"><span class="section-code">ROLAZ CUTZ</span><h1>LOOK LIKE YOURSELF.<br><em>ONLY BETTER.</em></h1><p>Signature grooming, precise linework, and finishing details at Rolaz Cutz.</p></div><div class="hero-identity"><p class="rolaz-effect-mark" aria-label="The Rolaz Effect"><span>THE</span><strong>ROLAZ</strong><em>EFFECT</em></p><div class="logo-plate"><img src="rolaz-cutz-logo.jpeg" alt="Rolaz Cutz Barbershop emblem"><span>ROLAZ CUTZ / KATY, TEXAS</span></div></div></section><section id="service-menu" class="service-section"><header class="editorial-heading"><span>01 / BOOK YOUR VISIT</span><h2>FIND YOUR CUT.</h2><p>Choose your service, add any Upgradez, and find a time that works for you.</p></header><div class="service-cta"><span>YOUR NEXT LOOK STARTS HERE.</span><a class="button" href="#services" data-action="new">Ready to Get Right?</a></div></section><section id="shop-info" class="location-section"><div class="map-frame"><iframe title="Rolaz Cutz location map" src="${mapUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div><div class="location-copy"><span class="section-code">02 / FIND THE SHOP</span><h2>FIND US<br><em>IN KATY.</em></h2><address><strong>Rolaz Cutz Barbershop</strong><br>20260 Katy Freeway, Suite 116<br>Katy, Texas 77449</address><div class="contact-stack"><a href="tel:+18328748680">+1 832-874-8680</a><a href="mailto:rolazcutz@gmail.com">rolazcutz@gmail.com</a><a href="${directionsUrl}" target="_blank" rel="noopener noreferrer">Get directions →</a></div></div><div class="hours-panel"><div class="hours-title"><span>SHOP HOURS</span><small>All hours shown in Central time</small></div><dl class="hours">${state.business.hours.map(([day, hours]) => `<div><dt>${day}</dt><dd>${hours}</dd></div>`).join('')}</dl></div></section>${reviewsSectionView()}${instagramSectionView()}${goodToKnowView()}<section class="future-section"><span class="section-code">06 / COMING LATER</span><h2>MERCH & PARTNERS</h2><p>A reserved space for future Rolaz Cutz drops, local partnerships, and disclosed affiliate links—without distracting from booking today.</p><span class="future-mark" aria-hidden="true">ROLAZ</span></section></div>`;
}
function stepper(index) {
  return `<ol class="stepper" aria-label="Booking progress">${['Service', 'Date & time', 'Your details', 'Confirmation'].map((name, i) => `<li class="${i === index ? 'active' : i < index ? 'done' : ''}" ${i === index ? 'aria-current="step"' : ''}><span class="step-circle" aria-hidden="true">${i < index ? '✓' : i + 1}</span><span>${name}</span></li>`).join('')}</ol>`;
}
function summaryView(step) {
  const copy = runtimeCopy();
  const quote = selectionQuote();
  const ready = quote && (step === 'services' || state.date && state.time !== null);
  return `<div class="slip-label">YOUR APPOINTMENT</div><h3>${quote ? esc(quote.service.name) : 'CHOOSE A SERVICE'}</h3><p>${quote ? `${quote.duration} minutes at Rolaz Cutz` : 'Your time and total will appear here.'}</p>${quote?.upgrades.length ? `<div class="summary-detail">Upgradez<small>${quote.upgrades.map(item => esc(item.name)).join(' · ')}</small></div>` : ''}<div class="summary-detail">Rolaz Cutz Barbershop<small>20260 Katy Freeway, Suite 116<br>Katy, TX 77449</small></div>${state.date ? `<div class="summary-detail">${dateLabel(state.date)}<small>${state.time !== null ? timeLabel(state.time) : 'Choose a time'} · Central time</small></div>` : ''}<div class="summary-total"><span>Estimated total</span><strong>${quote ? money(quote.priceCents) : '—'}</strong></div>${step === 'review' ? `<button class="button button-full" type="submit" form="checkout-form">${copy.confirmButton}</button>` : `<button class="button button-full" data-action="next" ${ready ? '' : 'disabled'}>Continue →</button>`}<p class="fine-print">${copy.finePrint}</p>`;
}
function bookingLayout(title, index, content, step) {
  return `<div class="shell booking-shell"><div class="booking-header"><span class="section-code">${state.replacesId ? `RESCHEDULE ${CUSTOMER_CONFIG.mode === 'mock' ? 'DEMO ' : ''}APPOINTMENT` : `BOOKING / STEP ${index + 1} OF 4`}</span><h1>${title}</h1></div>${stepper(index)}<div class="booking-grid"><section class="booking-content" aria-label="${title}">${content}</section><aside class="summary" id="booking-summary" aria-label="Appointment summary">${summaryView(step)}</aside></div></div>`;
}
function upgradeFieldsetView() {
  const availableUpgrades = state.serviceId ? state.upgrades.filter(upgrade => upgrade.serviceIds.includes(state.serviceId)) : state.upgrades;
  const upgradeIntro = state.serviceId === 'workz'
    ? 'The Workz already includes every upgrade. No extra selections are needed.'
    : state.serviceId === 'beard'
      ? 'Add Eyebrow Detail to Lineworkz for a complete, clean finish.'
      : state.serviceId === 'kids'
        ? 'Scissor Workz and Eyebrow Detail are available for Kids Cutz.'
        : state.serviceId === 'regular'
          ? 'Choose any finishing detail for The OG.'
          : 'Choose a service to see its available Upgradez.';
  const upgradeMarkup = availableUpgrades.length
    ? `<div class="upgrade-list">${availableUpgrades.map(upgrade => { const allowed = upgrade.serviceIds.includes(state.serviceId); return `<label class="upgrade-choice ${allowed ? '' : 'is-disabled'}"><input type="checkbox" name="upgrade" value="${upgrade.id}" ${state.upgradeIds.includes(upgrade.id) ? 'checked' : ''} ${allowed ? '' : 'disabled'}><span class="upgrade-copy"><span class="upgrade-name">${esc(upgrade.name)}</span><span class="upgrade-description">${esc(upgrade.description)}</span><span class="service-duration">+${upgrade.duration} minutes</span></span><span class="upgrade-price">+${money(upgrade.priceCents)}</span></label>`; }).join('')}</div>`
    : '<div class="upgrade-empty" role="status">No extra selections for this service.</div>';
  return `<fieldset class="upgrade-fieldset"><legend>Upgradez</legend><p class="subtext">${upgradeIntro}</p>${upgradeMarkup}</fieldset>`;
}
function servicesView() {
  return bookingLayout('CHOOSE YOUR SERVICE.', 0, `<h2>START HERE.</h2><p class="subtext">Choose one service. Upgradez are if you need extra detail.</p><fieldset class="service-fieldset"><legend class="sr-only">Core services</legend><div class="service-list">${state.services.map(service => `<label class="service-choice"><input type="radio" name="service" value="${service.id}" ${state.serviceId === service.id ? 'checked' : ''}><span class="choice-number">${service.duration}M</span><span class="service-copy"><span class="service-name">${esc(service.name)}</span><span class="service-description">${esc(service.description)}</span><span class="service-duration">${service.duration} minutes</span></span><span class="service-price">${money(service.priceCents)}</span></label>`).join('')}</div></fieldset>${upgradeFieldsetView()}<div class="booking-actions"><a class="text-link" href="#home">← Back to the shop</a></div>`, 'services');
}
async function datesView(renderId) {
  const dates = nextDates();
  if (!state.date || !dates.includes(state.date)) state.date = dates.find(date => state.business.schedule[dateObject(date).getDay()]);
  const requestedDate = state.date;
  const availability = await CustomerApi.getAvailability({ date: requestedDate, serviceId: state.serviceId, upgradeIds: state.upgradeIds, replacesId: state.replacesId });
  if (renderId !== state.renderId || state.date !== requestedDate) return null;
  if (!availability.slots.some(slot => slot.time === state.time && slot.available)) state.time = null;
  return bookingLayout('CHOOSE A DATE & TIME.', 1, `<h2>PICK A TIME.</h2><p class="subtext">Choose a date and time below. All times are shown in Central time.</p><div class="date-grid" role="group" aria-label="Choose appointment date">${dates.map(date => { const day = dateObject(date); const closed = !state.business.schedule[day.getDay()]; return `<button class="date-button" data-date="${date}" aria-label="${dateLabel(date)}${closed ? ', shop closed' : ''}" aria-pressed="${date === state.date}" ${closed ? 'disabled' : ''}><span>${day.toLocaleDateString('en-US', { weekday: 'short' })}</span><strong>${day.getDate()}</strong><small>${closed ? 'CLOSED' : day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</small></button>`; }).join('')}</div><div class="slot-heading"><h3>${dateLabel(state.date)}</h3><span>${runtimeCopy().availabilityLabel} / ${selectionQuote().duration} MIN</span></div><div class="time-grid" role="group" aria-label="Choose appointment time">${availability.slots.map(slot => `<button class="time-button" data-time="${slot.time}" aria-pressed="${state.time === slot.time}" ${slot.available ? '' : 'disabled'} aria-label="${timeLabel(slot.time)}${slot.available ? '' : ', unavailable'}">${timeLabel(slot.time)}</button>`).join('')}</div><div class="notice">${CUSTOMER_CONFIG.mode === 'mock' ? 'Unavailable times are crossed out. Final availability will come from the future booking backend.' : 'Unavailable times are crossed out. Availability updates when you choose a date.'}</div><div class="booking-actions"><a class="text-link" href="#services">← Change service or Upgradez</a></div>`, 'dates');
}
function contactFields(profile, prefix = '', lockPhone = false) {
  return `<label class="field field-full" for="${prefix}name">Full name<input id="${prefix}name" name="name" autocomplete="name" required maxlength="80" value="${esc(profile.name)}"></label><label class="field" for="${prefix}email">Email address <span>(optional)</span><input id="${prefix}email" name="email" type="email" autocomplete="email" maxlength="160" value="${esc(profile.email)}"></label><label class="field" for="${prefix}phone">Phone number${lockPhone ? ' <span>(verified)</span>' : ''}<input id="${prefix}phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="30" value="${esc(profile.phone)}" ${lockPhone ? 'readonly aria-readonly="true"' : ''}></label>`;
}
function policyMarkup() {
  return `<section class="policy-panel" aria-labelledby="appointment-policy"><div class="policy-heading"><span>PLEASE READ BEFORE CONFIRMING</span><h2 id="appointment-policy">Appointment & Payment Policy</h2></div><div class="policy-grid"><p>If you are unable to attend your appointment or are running late, please call <a href="tel:+18328748680">+1 832-874-8680</a> so we can make arrangements.</p><p>Please cancel or reschedule at least <strong>2 hours before your appointment</strong>.</p><p>If you arrive <strong>more than 5 minutes late</strong>, service may be refused and the <strong>full service fee</strong> may be charged.</p><p>A <strong>no-show, including a no-call/no-show, will be charged the full service price</strong>.</p><p class="cash-note">Cash is still accepted.</p></div><label class="agreement policy-agreement"><input type="checkbox" name="policyAccepted" required><span>I have read and agree to the Appointment & Payment Policy, including the 2-hour cancellation or rescheduling requirement, late-arrival policy, and full-service no-show fee.</span></label></section>`;
}
function reviewView() {
  const copy = runtimeCopy();
  const stripePayment = CUSTOMER_CONFIG.mode === 'http' && !state.replacesId ? '<label class="payment-choice"><input type="radio" name="payment" value="stripe"><span>Pay Online with Stripe<small>Secure card payment before your appointment.</small></span></label>' : '';
  const demoPayment = CUSTOMER_CONFIG.mode === 'mock' ? '<label class="payment-choice"><input type="radio" name="payment" value="demo-card"><span>Demo card ···· 4242<small>Simulated payment only. No charge will be made.</small></span><span class="badge">DEMO ONLY</span></label>' : '';
  const prototypeAgreement = CUSTOMER_CONFIG.mode === 'mock' ? '<label class="agreement prototype-agreement"><input type="checkbox" name="acknowledge" required><span>I understand this is an approval prototype. Confirming creates a demo appointment only and does not reserve a time or charge a payment.</span></label>' : '';
  return bookingLayout('YOUR DETAILS.', 2, `<form id="checkout-form"><h2>CONTACT DETAILS.</h2><p class="subtext">Check your information before confirming. Your phone number is required; email is optional.</p><div class="form-grid">${contactFields(state.profile, 'booking-')}</div><section class="review-section"><h2>HOW WILL YOU PAY?</h2><p class="subtext">${CUSTOMER_CONFIG.mode === 'mock' ? 'No payment is collected in this prototype.' : 'Choose to pay online or at the shop.'}</p><label class="payment-choice"><input type="radio" name="payment" value="shop" checked><span>${copy.paymentTitle}<small>${copy.paymentDetail}</small></span></label>${stripePayment}${demoPayment}</section>${policyMarkup()}${prototypeAgreement}<p class="error" id="checkout-error" role="alert"></p></form><div class="booking-actions"><a class="text-link" href="#dates">← Change date & time</a></div>`, 'review');
}
function confirmationView() {
  const appointment = state.confirmation;
  const details = appointmentDetails(appointment);
  const copy = runtimeCopy();
  return `<div class="shell confirmation-shell"><section class="confirmation"><div class="confirmation-icon" aria-hidden="true">✓</div><span class="section-code">${esc(appointment.id)} / ${copy.confirmationCode}</span><h1>${copy.confirmationHeading.replace(' ', '<br>')}</h1><p>${copy.confirmationIntro}</p><div class="confirmation-card"><h2>${esc(details.service.name)}</h2><div class="detail-grid"><div><small>DATE & TIME</small><strong>${dateLabel(appointment.date)}<br>${timeLabel(appointment.time)} · Central time</strong></div><div><small>SERVICE</small><strong>${details.duration} minutes · ${money(details.priceCents)}${details.upgrades.length ? `<br>Upgradez: ${details.upgrades.map(item => esc(item.name)).join(' · ')}` : ''}</strong></div><div><small>THE SHOP</small><strong>Rolaz Cutz Barbershop<br>20260 Katy Freeway, Suite 116<br>Katy, TX 77449</strong></div><div><small>PAYMENT</small><strong>${appointment.paymentMethod === 'demo-card' ? 'Demo card ···· 4242' : 'Pay at the Shop · Zelle and Cash Welcome'}${CUSTOMER_CONFIG.mode === 'mock' ? '<br>No payment collected' : ''}</strong></div></div></div><div class="policy-reminder"><strong>Plans changed or running late?</strong><span>Call <a href="tel:+18328748680">+1 832-874-8680</a>. Cancel or reschedule at least 2 hours before the appointment.</span></div><div class="hero-actions"><a href="#account" class="button">View my appointments</a><a href="#home" class="text-link">Back to the shop</a></div>${CUSTOMER_CONFIG.mode === 'mock' ? '<div class="notice">No confirmation email or text is sent from this prototype. Your demo appointment appears in Account until you reload the page.</div>' : ''}</section></div>`;
}
function appointmentCard(appointment) {
  const details = appointmentDetails(appointment);
  const demo = CUSTOMER_CONFIG.mode === 'mock';
  return `<article class="appointment-card"><div class="appointment-top"><div><h3>${esc(details.service.name)}</h3><p>${shortDate(appointment.date)} · ${timeLabel(appointment.time)} CT<br>${details.duration} minutes · ${money(details.priceCents)} · Rolaz Cutz${details.upgrades.length ? `<br>Upgradez: ${details.upgrades.map(item => esc(item.name)).join(' · ')}` : ''}</p></div><span class="badge ${appointment.status === 'confirmed' ? 'badge-confirmed' : ''}">${appointment.status === 'confirmed' ? `${demo ? 'DEMO ' : ''}BOOKED` : esc(appointment.status.toUpperCase())}</span></div><div class="appointment-actions">${appointment.status === 'confirmed' ? `<button class="text-link" data-reschedule="${appointment.id}">Reschedule${demo ? ' demo' : ''}</button><button class="text-link" data-cancel="${appointment.id}" aria-expanded="false" aria-controls="cancel-${appointment.id}">Cancel${demo ? ' demo' : ''}</button>` : `<button class="text-link" data-rebook="${appointment.id}">Book this again ↗</button>`}${appointment.sample ? '<span class="subtext">Sample history</span>' : ''}</div>${appointment.status === 'confirmed' ? `<div id="cancel-${appointment.id}" class="cancel-confirmation" role="group" aria-label="Confirm appointment cancellation" hidden><p>Cancel this ${demo ? 'demo ' : ''}appointment?</p>${demo ? '<p class="subtext">This only changes the prototype. No real booking will be affected.</p>' : '<p class="subtext">This will cancel the appointment in the shop booking system.</p>'}<div class="cancel-confirmation-actions"><button class="button button-small button-secondary" data-keep="${appointment.id}">Keep appointment</button><button class="button button-small" data-confirm-cancel="${appointment.id}">Yes, cancel${demo ? ' demo' : ''}</button></div></div>` : ''}</article>`;
}
function accountEntryView() {
  return `<div class="account-entry"><section class="account-panel account-panel-register"><span class="section-code">NEW CLIENT / PASSWORDLESS</span><h2>CREATE YOUR ACCOUNT.</h2><p>Use your phone number to verify your account. No password to remember. Email is optional.</p><form id="register-form" class="account-form"><label class="field" for="account-name">Full name<input id="account-name" name="name" autocomplete="name" required maxlength="80"></label><label class="field" for="account-phone">Phone number<input id="account-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="30"></label><label class="field" for="account-email">Email address <span>(optional)</span><input id="account-email" name="email" type="email" autocomplete="email" maxlength="160"></label><p class="account-note">We will send a one-time verification code. Standard message and data rates may apply.</p><p class="error" role="alert"></p><button class="button button-full" type="submit">Text me a code</button></form></section><section class="account-panel account-panel-login"><span class="section-code">RETURNING CLIENT</span><h2>SIGN IN BY PHONE.</h2><p>Enter the phone number connected to your account. We will text you a secure one-time code.</p><form id="login-form" class="account-form"><label class="field" for="login-phone">Phone number<input id="login-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="30"></label><p class="error" role="alert"></p><button class="button button-full button-secondary" type="submit">Send sign-in code</button></form></section></div>`;
}
function verificationView() {
  const verification = state.verification;
  const seconds = Math.max(0, Math.ceil(((verification?.resendAt ?? 0) - Date.now()) / 1000));
  return `<div class="shell verification-shell"><section class="verification-card"><span class="section-code">SECURE PHONE CHECK</span><h1>ENTER YOUR CODE.</h1><p>Enter the 6-digit code for <strong>${esc(verification?.phone ?? '')}</strong>. The code expires in 10 minutes.</p>${CUSTOMER_CONFIG.mode === 'mock' ? `<div class="demo-code"><span>LOCAL DEMO CODE</span><strong>${esc(verification?.demoCode ?? '246810')}</strong><p>This preview does not send a real text message.</p></div>` : ''}<form id="verify-form"><label class="field" for="verification-code">6-digit verification code<input id="verification-code" class="code-input" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p class="error" role="alert"></p><button class="button button-full" type="submit">Verify and continue</button></form><div class="verification-actions"><button class="text-link" type="button" data-resend-code ${seconds ? 'disabled' : ''}>${seconds ? `Resend available in ${seconds}s` : 'Resend code'}</button><a class="text-link" href="#account">Use a different number</a></div></section></div>`;
}
function startVerificationCountdown() {
  clearInterval(startVerificationCountdown.timer);
  if (!state.verification) return;
  startVerificationCountdown.timer = setInterval(() => {
    const button = document.querySelector('[data-resend-code]');
    if (!button) { clearInterval(startVerificationCountdown.timer); return; }
    const seconds = Math.max(0, Math.ceil((state.verification.resendAt - Date.now()) / 1000));
    button.disabled = seconds > 0;
    button.textContent = seconds ? `Resend available in ${seconds}s` : 'Resend code';
    if (!seconds) clearInterval(startVerificationCountdown.timer);
  }, 1000);
}
async function accountView() {
  let appointments = [];
  if (state.session || CUSTOMER_CONFIG.mode === 'mock') {
    try { appointments = await CustomerApi.listAppointments(); }
    catch (error) { if (error.status !== 401) throw error; }
  }
  const upcoming = appointments.filter(item => item.status === 'confirmed');
  const history = appointments.filter(item => item.status !== 'confirmed');
  const signedIn = Boolean(state.session?.authenticated);
  const identity = state.session?.customer ?? state.profile;
  const appointmentsMarkup = `<section class="account-appointments"><div class="section-heading"><div><span class="section-code">${signedIn ? 'YOUR ACCOUNT' : 'THIS DEMO SESSION'}</span><h2>APPOINTMENTS.</h2></div><button class="text-link" data-action="new">Book another visit →</button></div>${upcoming.length ? upcoming.map(appointmentCard).join('') : '<div class="empty-state">No upcoming appointments. Choose a service when you are ready.</div>'}<h3 class="history-title">PAST & CHANGED</h3>${history.length ? history.map(appointmentCard).join('') : '<div class="empty-state">No past appointments yet.</div>'}<div class="policy-reminder"><strong>Appointment changes</strong><span>Call <a href="tel:+18328748680">+1 832-874-8680</a> if you cannot attend or are running late. Please cancel or reschedule at least 2 hours before your appointment.</span></div></section>`;
  if (!signedIn) return `<div class="shell account-shell"><div class="booking-header"><span class="section-code">CUSTOMER ACCOUNT</span><h1>YOUR CHAIR.<br>YOUR DETAILS.</h1></div>${accountEntryView()}${CUSTOMER_CONFIG.mode === 'mock' ? appointmentsMarkup : ''}</div>`;
  return `<div class="shell account-shell"><div class="booking-header account-heading"><div><span class="section-code">SIGNED IN / ${esc(identity.phone)}</span><h1>WELCOME BACK.</h1></div><button class="text-link" type="button" data-logout>Sign out</button></div><div class="profile-grid"><form class="profile-card" id="profile-form"><div class="avatar" aria-hidden="true">${esc(identity.name.split(' ').map(part => part[0]).slice(0, 2).join(''))}</div><h2>CONTACT DETAILS</h2><p class="subtext">Your verified phone number is your secure sign-in.</p>${contactFields(identity, 'profile-', true)}<p id="profile-error" class="error" role="alert"></p><button class="button button-full" type="submit">Save details</button></form>${appointmentsMarkup}</div></div>`;
}
async function render(focus = false) {
  const renderId = ++state.renderId;
  let route = location.hash.slice(1) || 'home';
  if (['shop-info', 'service-menu', 'reviews', 'instagram', 'good-to-know'].includes(route)) route = 'home';
  if (route === 'profile') route = 'account';
  if (['dates', 'review'].includes(route) && !selectedService()) { go('services'); return false; }
  if (route === 'review' && (!state.date || state.time === null)) { go('dates'); return false; }
  if (route === 'confirmation' && !state.confirmation) { go('services'); return false; }
  if (route === 'verify' && !state.verification) { go('account'); return false; }
  let html;
  if (route === 'services') html = servicesView();
  else if (route === 'dates') html = await datesView(renderId);
  else if (route === 'review') html = reviewView();
  else if (route === 'confirmation') html = confirmationView();
  else if (route === 'account') html = await accountView();
  else if (route === 'verify') html = verificationView();
  else html = homeView();
  if (renderId !== state.renderId || html === null) return false;
  main.innerHTML = html;
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === route || link.dataset.nav === 'services' && ['dates', 'review', 'confirmation'].includes(route);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.title = `Rolaz Cutz — ${({ services: 'Select service', dates: 'Date & time', review: 'Your details', confirmation: CUSTOMER_CONFIG.mode === 'mock' ? 'Demo confirmation' : 'Confirmation', account: 'Account', verify: 'Verify phone' })[route] || 'The shop'}${CUSTOMER_CONFIG.mode === 'mock' ? ' · Approval prototype' : ''}`;
  if (route === 'verify') startVerificationCountdown(); else clearInterval(startVerificationCountdown.timer);
  if (['#shop-info', '#service-menu', '#reviews', '#instagram', '#good-to-know'].includes(location.hash)) scrollToHomeSection(location.hash);
  else if (focus) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  return true;
}
document.addEventListener('change', event => {
  if (event.target.name === 'service') {
    const serviceId = event.target.value;
    Object.assign(state, { serviceId, upgradeIds: compatibleUpgradeIds(serviceId, state.upgradeIds), date: null, time: null });
    const upgradeFieldset = document.querySelector('.upgrade-fieldset');
    if (upgradeFieldset) upgradeFieldset.outerHTML = upgradeFieldsetView();
    document.querySelector('#booking-summary').innerHTML = summaryView('services');
  } else if (event.target.name === 'upgrade') {
    const upgrade = state.upgrades.find(item => item.id === event.target.value);
    if (!upgrade?.serviceIds.includes(state.serviceId)) return;
    state.upgradeIds = event.target.checked ? [...new Set([...state.upgradeIds, upgrade.id])] : state.upgradeIds.filter(id => id !== upgrade.id);
    state.date = null;
    state.time = null;
    document.querySelector('#booking-summary').innerHTML = summaryView('services');
  }
});
document.addEventListener('click', async event => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('.skip-link')) { event.preventDefault(); main.focus(); return; }
  if (target.matches('a[href="#shop-info"], a[href="#service-menu"], a[href="#reviews"], a[href="#instagram"], a[href="#good-to-know"]')) {
    event.preventDefault();
    const sectionHash = target.getAttribute('href');
    if (location.hash === sectionHash) scrollToHomeSection(sectionHash);
    else location.hash = sectionHash;
    return;
  }
  try {
    if (target.hasAttribute('data-retry-startup')) await withDisabledControl(target, initializeCustomerApp);
    else if (target.dataset.refresh === 'reviews') await withDisabledControl(target, refreshReviews);
    else if (target.dataset.refresh === 'instagram') await withDisabledControl(target, refreshInstagram);
    else if (target.hasAttribute('data-logout')) {
      await withDisabledControl(target, async () => CustomerApi.logout());
      clearPrivateCustomerState(state);
      await render();
      announce('You are signed out.');
    }
    else if (target.hasAttribute('data-resend-code')) {
      if (target.disabled || !state.verification) return;
      const response = await withDisabledControl(target, () => CustomerApi.requestVerificationCode({ phone: state.verification.phone, intent: state.verification.intent, name: state.verification.name, email: state.verification.email }));
      state.verification = { ...state.verification, ...response, resendAt: Date.now() + Number(response.resendAfterSeconds ?? 30) * 1000 };
      await render();
      announce(CUSTOMER_CONFIG.mode === 'mock' ? 'A new local demo code is ready.' : 'A new code was sent.');
    }
    else if (target.dataset.service) { event.preventDefault(); startBooking(target.dataset.service); }
    else if (target.dataset.action === 'new') { event.preventDefault(); startBooking(); }
    else if (target.dataset.action === 'next') {
      if (location.hash === '#services') go('dates');
      else if (location.hash === '#dates' && state.date && state.time !== null) go('review');
    }
    else if (target.dataset.date) {
      const requestedDate = target.dataset.date;
      state.date = requestedDate;
      state.time = null;
      document.querySelectorAll('[data-time]').forEach(button => { button.disabled = true; button.setAttribute?.('aria-pressed', 'false'); });
      document.querySelector('#booking-summary').innerHTML = summaryView('dates');
      const committed = await render();
      if (committed && state.date === requestedDate) document.querySelector(`[data-date="${requestedDate}"]`)?.focus();
    }
    else if (target.dataset.time) {
      if (target.disabled || location.hash !== '#dates') return;
      state.time = Number(target.dataset.time);
      document.querySelectorAll('[data-time]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.time) === state.time)));
      document.querySelector('#booking-summary').innerHTML = summaryView('dates');
    } else if (target.dataset.rebook) {
      const appointments = await CustomerApi.listAppointments();
      const appointment = appointments.find(item => item.id === target.dataset.rebook);
      restoreBookingSelection(appointment);
      go('services');
    }
    else if (target.dataset.cancel) {
      document.querySelector(`#cancel-${target.dataset.cancel}`).hidden = false;
      target.setAttribute('aria-expanded', 'true');
      document.querySelector(`[data-keep="${target.dataset.cancel}"]`).focus();
    } else if (target.dataset.keep) {
      document.querySelector(`#cancel-${target.dataset.keep}`).hidden = true;
      const trigger = document.querySelector(`[data-cancel="${target.dataset.keep}"]`);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    } else if (target.dataset.confirmCancel) {
      await withDisabledControl(target, () => CustomerApi.cancelAppointment({ id: target.dataset.confirmCancel }));
      await render();
      main.focus({ preventScroll: true });
      announce(CUSTOMER_CONFIG.mode === 'mock' ? 'Demo appointment canceled. No real booking was changed.' : 'Appointment canceled.');
    }
    else if (target.dataset.reschedule) {
      const appointments = await CustomerApi.listAppointments();
      const appointment = appointments.find(item => item.id === target.dataset.reschedule);
      restoreBookingSelection(appointment, appointment.id);
      go('dates');
    }
  } catch (error) { announce(error.message); }
});
document.addEventListener('submit', async event => {
  if (!['checkout-form', 'profile-form', 'register-form', 'login-form', 'verify-form'].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');
  const formError = form.querySelector('.error');
  if (submitButton) submitButton.disabled = true;
  if (formError) formError.textContent = '';
  if (form.id === 'register-form' || form.id === 'login-form') {
    const intent = form.id === 'register-form' ? 'register' : 'login';
    const request = { intent, phone: data.get('phone'), name: intent === 'register' ? data.get('name') : '', email: intent === 'register' ? data.get('email') : '' };
    try {
      const response = await CustomerApi.requestVerificationCode(request);
      state.verification = { ...request, phone: response.phone ?? normalizePhone(request.phone), demoCode: response.demoCode ?? '', resendAt: Date.now() + Number(response.resendAfterSeconds ?? 30) * 1000 };
      go('verify');
    } catch (error) {
      if (formError) formError.textContent = error.message;
      if (submitButton) submitButton.disabled = false;
    }
    return;
  }
  if (form.id === 'verify-form') {
    try {
      const verification = state.verification;
      state.session = await CustomerApi.verifyCode({ phone: verification.phone, code: data.get('code'), intent: verification.intent, name: verification.name, email: verification.email });
      state.profile = state.session.customer;
      state.verification = null;
      go('account');
      announce('Phone verified. Welcome to your account.');
    } catch (error) {
      if (formError) formError.textContent = error.message;
      if (submitButton) submitButton.disabled = false;
    }
    return;
  }
  const customer = { name: data.get('name'), email: data.get('email'), phone: data.get('phone') };
  if (form.id === 'profile-form') {
    try {
      state.profile = await CustomerApi.updateProfile(customer);
      if (state.session) state.session = { ...state.session, customer: state.profile };
      await render();
      announce(CUSTOMER_CONFIG.mode === 'mock' ? 'Demo profile saved for this page session.' : 'Your details were saved.');
    }
    catch (error) { document.querySelector('#profile-error').textContent = error.message; submitButton.disabled = false; }
    return;
  }
  const button = document.querySelector('[form="checkout-form"]');
  button.disabled = true;
  button.textContent = CUSTOMER_CONFIG.mode === 'mock' ? 'Creating demo appointment…' : 'Confirming appointment…';
  try {
    const policyAccepted = data.get('policyAccepted') === 'on';
    const prototypeAcknowledged = CUSTOMER_CONFIG.mode === 'http' || data.get('acknowledge') === 'on';
    if (!policyAccepted) throw new Error('Please accept the Appointment & Payment Policy before continuing.');
    if (!prototypeAcknowledged) throw new Error('Please accept the prototype acknowledgment before continuing.');
    if (CUSTOMER_CONFIG.mode === 'http' && data.get('payment') === 'stripe') {
      const checkout = await HttpCustomerApi.createStripeCheckout({ serviceId: state.serviceId, upgradeIds: state.upgradeIds, service: selectedService(), upgrades: selectedUpgrades(), date: state.date, time: state.time, customer, policyAccepted });
      if (checkout.guestToken && typeof sessionStorage !== 'undefined') sessionStorage.setItem('rolaz_stripe_guest_token', checkout.guestToken);
      window.location.assign(checkout.checkoutUrl);
      return;
    }
    const completed = await completeBooking(CustomerApi, { serviceId: state.serviceId, upgradeIds: state.upgradeIds, service: selectedService(), upgrades: selectedUpgrades(), date: state.date, time: state.time, customer, paymentMethod: data.get('payment'), policyAccepted, replacesId: state.replacesId }, { refreshProfile: Boolean(state.session) });
    state.confirmation = completed.appointment;
    if (completed.profile) state.profile = completed.profile;
    state.replacesId = null;
    go('confirmation');
  } catch (error) {
    document.querySelector('#checkout-error').textContent = error.message;
    button.disabled = false;
    button.textContent = runtimeCopy().confirmButton;
  }
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#payment-success' || location.hash === '#payment-cancel') {
    const success = location.hash === '#payment-success';
    main.innerHTML = `<div class="shell confirmation-shell"><section class="confirmation"><h1>${success ? 'PAYMENT SUBMITTED.' : 'PAYMENT NOT COMPLETED.'}</h1><p>${success ? 'Stripe has returned you to the shop. Your payment and appointment are only confirmed after the payment is verified. Contact the shop if you need confirmation.' : 'Your checkout was not completed. Your appointment may be held temporarily until the payment session expires. Please contact the shop before trying again.'}</p><a class="button" href="#home">Back to the shop</a></section></div>`;
    return;
  }
  render(true);
});
async function initializeCustomerApp() {
  return runCustomerStartup({
    load: () => loadInitialCustomerData(CustomerApi),
    loading: () => { main.innerHTML = '<div class="shell loading" role="status">Getting the shop ready…</div>'; },
    ready: async data => {
      Object.assign(state, data);
      if (location.hash === '#payment-success' || location.hash === '#payment-cancel') {
        window.dispatchEvent(new Event('hashchange'));
      } else {
        await render();
      }
      void refreshReviews();
      void refreshInstagram();
    },
    failed: error => { main.innerHTML = startupErrorView(error); }
  });
}
void initializeCustomerApp();
