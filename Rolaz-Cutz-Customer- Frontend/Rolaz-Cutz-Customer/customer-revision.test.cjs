const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const appPath = path.join(root, 'app.js');
const htmlPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'styles.css');
const logoPath = path.join(root, 'rolaz-cutz-logo.jpeg');
const app = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const allSource = `${html}\n${app}\n${css}`;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function createMockApi() {
  const marker = 'window.MockCustomerApi = MockCustomerApi;';
  const end = app.indexOf(marker);
  assert.notEqual(end, -1, 'MockCustomerApi must remain exposed for local review and tests');
  const context = vm.createContext({
    window: {}, setTimeout, clearTimeout, Intl, Date, JSON, Promise, Error,
    Number, String, Array, Object, RegExp, Map, Set,
  });
  new vm.Script(app.slice(0, end + marker.length), { filename: 'app.js' }).runInContext(context);
  return context.window.MockCustomerApi;
}

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function createCore({ fetchImpl = async () => { throw new Error('fetch was not stubbed'); }, sessionSeed = {}, config = {} } = {}) {
  const marker = 'window.RolazCustomerCore = RolazCustomerCore;';
  const end = app.indexOf(marker);
  assert.notEqual(end, -1, 'the customer core export must exist before DOM setup');
  const sessionStorage = createStorage(sessionSeed);
  class ContextDate extends Date {}
  const context = vm.createContext({
    window: { ROLAZ_CUSTOMER_CONFIG: config }, sessionStorage, fetch: fetchImpl,
    setTimeout, clearTimeout, Intl, Date: ContextDate, JSON, Promise, Error, TypeError,
    Number, String, Array, Object, RegExp, Map, Set, URLSearchParams, FormData,
  });
  new vm.Script(app.slice(0, end + marker.length), { filename: 'app.js' }).runInContext(context);
  return { core: context.window.RolazCustomerCore, sessionStorage, context };
}

async function firstAvailableSelection(api, serviceId = 'regular', upgradeIds = []) {
  const business = JSON.parse(JSON.stringify(await api.getBusiness()));
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: business.timezone }).format(new Date());
  const today = new Date(`${todayKey}T12:00:00`);
  for (let offset = 1; offset <= 21; offset += 1) {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const availability = await api.getAvailability({ date, serviceId, upgradeIds });
    const slot = availability.slots.find((item) => item.available);
    if (slot) return { date, time: slot.time };
  }
  throw new Error('Expected an available appointment within 21 days');
}

test('preserves the supplied customer edits before feature work', async () => {
  const api = createMockApi();
  const services = JSON.parse(JSON.stringify(await api.getServices()));
  const profile = JSON.parse(JSON.stringify(await api.getProfile()));

  assert.deepEqual(services.find((item) => item.id === 'kids'), {
    id: 'kids',
    name: 'Kids Cutz',
    description: 'A fresh finish for clients 12 and under.',
    priceCents: 4000,
    duration: 30,
  });
  assert.deepEqual(profile, { name: '', email: 'you@example.com', phone: '' });
  assert.match(app, /Choose one service\. Upgradez are if you need extra detail\./);
  assert.match(app, /google\.com\/maps\/place\/Rolaz\+Cutz\+Barbershop/);
});

test('starts with the approved service order and compatibility matrix', async () => {
  const api = createMockApi();
  const services = JSON.parse(JSON.stringify(await api.getServices()));
  const upgrades = JSON.parse(JSON.stringify(await api.getUpgrades()));

  assert.deepEqual(services.map((item) => item.id), ['workz', 'regular', 'kids', 'beard']);
  assert.deepEqual(upgrades.map((item) => [item.id, item.serviceIds]), [
    ['scissor-workz', ['regular', 'kids']],
    ['eyebrow-detail', ['regular', 'kids', 'beard']],
    ['lineworkz', ['regular']],
  ]);
});

test('preserves the approved shop contact details, hours, and booking policy', async () => {
  const business = JSON.parse(JSON.stringify(await createMockApi().getBusiness()));
  assert.equal(business.phone, '+1 832-874-8680');
  assert.deepEqual(business.hours, [
    ['Monday', 'Closed'],
    ['Tuesday', '11:00 AM – 7:00 PM'],
    ['Wednesday', '11:00 AM – 7:00 PM'],
    ['Thursday', '10:00 AM – 7:30 PM'],
    ['Friday', '9:00 AM – 7:45 PM'],
    ['Saturday', '9:00 AM – 3:00 PM'],
    ['Sunday', 'Closed'],
  ]);
  assert.match(app, /at least <strong>2 hours before your appointment<\/strong>/);
  assert.match(app, /more than 5 minutes late/);
  assert.match(app, /no-call\/no-show/);
  assert.match(app, /Cash is still accepted/);
});

test('preserves the requested brand language and social links', () => {
  assert.match(allSource, /ONLY BETTER/);
  assert.match(allSource, /The Rolaz Effect/i);
  assert.match(allSource, /Ready to Get Right\?/);
  assert.match(allSource, /https:\/\/www\.instagram\.com\/rolaz_cutz\//);
  assert.match(allSource, /https:\/\/www\.facebook\.com\/RolazCutz\//);
  assert.match(allSource, /https:\/\/x\.com\/rolaz_cutz/);
  assert.match(app, /Pay at the Shop/);
  assert.match(app, /Zelle and Cash Welcome/);
});

test('preserves the supplied logo byte for byte', () => {
  assert.equal(sha256(logoPath), 'cc53f8588c64c5c4e65c4b6f18a8434c718126041fe2f54775bfc93f745f4ef5');
});

test('keeps all customer assets local and directly openable', () => {
  for (const file of ['index.html', 'styles.css', 'app.js', 'rolaz-cutz-logo.jpeg']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
  assert.doesNotMatch(html, /node_modules|\/src\/main\.js/);
});

test('exposes one selected customer API and keeps customer/admin sessions separate', () => {
  const { core } = createCore();
  assert.equal(core.CUSTOMER_CONFIG.mode, 'mock');
  assert.equal(core.CustomerApi, core.MockCustomerApi);
  assert.equal(core.CUSTOMER_SESSION_KEY, 'rolaz_customer_session');
  assert.notEqual(core.CUSTOMER_SESSION_KEY, 'rolaz_admin_session');

  const afterCore = app.slice(app.indexOf('window.RolazCustomerCore = RolazCustomerCore;'));
  assert.doesNotMatch(afterCore, /MockCustomerApi\.(?:get|list|create|update|cancel|request|verify|logout)/);
});

test('HTTP requests send cookies, use the configured base URL, and accept 204', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 204, headers: { get: () => '' }, text: async () => '' };
  };
  const { core } = createCore({ fetchImpl, config: { mode: 'http', apiBaseUrl: 'https://api.example.test/' } });
  const value = await core.HttpCustomerApi.logout();

  assert.equal(value, null);
  assert.equal(calls[0].url, 'https://api.example.test/api/customer/auth/logout');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'include');
});

test('HTTP errors are safe and keep structured backend messages', async () => {
  const structured = createCore({
    config: { mode: 'http' },
    fetchImpl: async () => ({ ok: false, status: 409, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ message: 'That time was just booked.' }) }),
  }).core;
  await assert.rejects(structured.HttpCustomerApi.getServices(), (error) => error.status === 409 && error.message === 'That time was just booked.');

  const invalidJson = createCore({
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{broken' }),
  }).core;
  await assert.rejects(invalidJson.HttpCustomerApi.getServices(), /invalid response/i);

  const offline = createCore({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }).core;
  await assert.rejects(offline.HttpCustomerApi.getServices(), /unable to reach/i);
});

test('a 401 clears only the customer session marker', async () => {
  const { core, sessionStorage } = createCore({
    sessionSeed: { rolaz_customer_session: 'customer', rolaz_admin_session: 'admin' },
    fetchImpl: async () => ({ ok: false, status: 401, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ message: 'Sign in again.' }) }),
  });

  await assert.rejects(core.HttpCustomerApi.getSession(), /Sign in again/);
  assert.deepEqual(sessionStorage.snapshot(), { rolaz_admin_session: 'admin' });
});

test('Good To Know renders exactly the seven approved answers as an accessible accordion', () => {
  const { core } = createCore();
  const entries = JSON.parse(JSON.stringify(core.GOOD_TO_KNOW));
  assert.deepEqual(entries, [
    ['Do you accept walk-ins?', 'No, Rolaz Cutz is appointment-only. All clients must book an appointment in advance to secure their spot.'],
    ["What happens if I'm running late?", "If you're running late, please call as soon as possible so we can try to make arrangements. Arriving more than 5 minutes late may result in your appointment being canceled and the full service fee being charged. We reserve the right to refuse service for late arrivals."],
    ['What is your cancellation or rescheduling policy?', 'We ask that you cancel or reschedule your appointment at least 2 hours before your scheduled time. If something comes up, please call to let us know so we can discuss your options.'],
    ['What happens if I miss my appointment?', "No-call, no-show appointments will be charged the full price of the scheduled service. Please contact us ahead of time if you're unable to make it."],
    ['Do you accept cash?', 'Absolutely. Cash is still accepted as a payment method.'],
    ['Can I bring a reference photo?', "Absolutely. Whether it's a specific fade, style, or something completely different, reference photos help communicate the look you're going for."],
    ['Where are you located?', 'Rolaz Cutz is located inside Phenix Salon Suites at 20260 Katy Freeway, Suite 116, Katy, TX 77449.'],
  ]);
  const rendered = core.goodToKnowView();
  assert.match(rendered, /GOOD TO KNOW/);
  assert.equal((rendered.match(/<details/g) || []).length, 7);
  assert.equal((rendered.match(/<summary/g) || []).length, 7);
  assert.doesNotMatch(rendered, /How do I book|What products do you use/i);
});

test('social payloads normalize success, empty, unavailable, and malformed data safely', () => {
  const { core } = createCore();
  const reviews = core.normalizeReviewsPayload({
    rating: 4.9,
    totalCount: 83,
    googleUrl: 'https://g.page/example',
    attribution: 'Google',
    reviews: [{ id: 'r1', authorName: 'Jordan', rating: 5, text: 'Great service.', relativeTime: 'a week ago', authorPhotoUrl: '' }],
  });
  assert.equal(reviews.status, 'success');
  assert.equal(reviews.reviews.length, 1);
  assert.equal(reviews.rating, 4.9);
  assert.equal(core.normalizeReviewsPayload({ reviews: [], googleUrl: 'https://g.page/example' }).status, 'empty');
  assert.equal(core.normalizeReviewsPayload({ status: 'unavailable', reviews: [] }).status, 'unavailable');
  assert.equal(core.normalizeReviewsPayload({ reviews: 'not-an-array' }).status, 'unavailable');

  const instagram = core.normalizeInstagramPayload({
    profileUrl: 'https://www.instagram.com/rolaz_cutz/',
    posts: [{ id: 'p1', mediaType: 'IMAGE', mediaUrl: 'https://cdn.example/post.jpg', thumbnailUrl: '', permalink: 'https://www.instagram.com/p/example/', caption: 'Fresh work.', timestamp: '2026-11-10T12:00:00Z' }],
  });
  assert.equal(instagram.status, 'success');
  assert.equal(instagram.posts.length, 1);
  assert.equal(core.normalizeInstagramPayload({ posts: [], profileUrl: 'https://www.instagram.com/rolaz_cutz/' }).status, 'empty');
  assert.equal(core.normalizeInstagramPayload({ status: 'unavailable', posts: [] }).status, 'unavailable');
  assert.equal(core.normalizeInstagramPayload(null).status, 'unavailable');
});

test('social refreshes keep the newest response and report provider failure', async () => {
  const { core } = createCore();
  let resolveOlder;
  const older = new Promise((resolve) => { resolveOlder = resolve; });
  const loader = core.createLatestOnlyLoader(core.normalizeReviewsPayload);
  const olderLoad = loader.load(() => older);
  await loader.load(async () => ({ rating: 5, totalCount: 1, googleUrl: 'https://g.page/new', reviews: [{ id: 'new', authorName: 'New', rating: 5, text: 'Newest', relativeTime: 'today' }] }));
  resolveOlder({ rating: 1, totalCount: 1, googleUrl: 'https://g.page/old', reviews: [{ id: 'old', authorName: 'Old', rating: 1, text: 'Old', relativeTime: 'yesterday' }] });
  await olderLoad;
  assert.equal(loader.getState().reviews[0].id, 'new');

  await loader.load(async () => { throw new Error('provider down'); });
  assert.equal(loader.getState().status, 'error');
  assert.match(loader.getState().message, /temporarily unavailable/i);
});

test('mock mode never invents Google reviews or Instagram posts', async () => {
  const api = createCore().core.MockCustomerApi;
  const reviews = JSON.parse(JSON.stringify(await api.getReviews()));
  const instagram = JSON.parse(JSON.stringify(await api.getInstagramPosts()));
  assert.deepEqual(reviews.reviews, []);
  assert.equal(reviews.status, 'unavailable');
  assert.deepEqual(instagram.posts, []);
  assert.equal(instagram.status, 'unavailable');
});

test('Eyebrow Detail is the only Lineworkz upgrade and totals 40 dollars for 35 minutes', async () => {
  const api = createCore().core.MockCustomerApi;
  const upgrades = JSON.parse(JSON.stringify(await api.getUpgrades()));
  assert.deepEqual(upgrades.map((item) => [item.id, item.serviceIds]), [
    ['scissor-workz', ['regular', 'kids']],
    ['eyebrow-detail', ['regular', 'kids', 'beard']],
    ['lineworkz', ['regular']],
  ]);
  const choice = await firstAvailableSelection(api, 'beard', ['eyebrow-detail']);
  const appointment = JSON.parse(JSON.stringify(await api.createAppointment({
    serviceId: 'beard', upgradeIds: ['eyebrow-detail'], date: choice.date, time: choice.time,
    customer: { name: 'Demo Customer', email: '', phone: '(832) 555-0100' },
    paymentMethod: 'shop', policyAccepted: true,
  })));
  assert.equal(appointment.priceCents, 4000);
  assert.equal(appointment.duration, 35);
  await assert.rejects(api.getAvailability({ date: choice.date, serviceId: 'beard', upgradeIds: ['scissor-workz'] }), /not available/i);
  await assert.rejects(api.getAvailability({ date: choice.date, serviceId: 'workz', upgradeIds: ['eyebrow-detail'] }), /not available/i);
});

test('phone helpers normalize US numbers and reject unsafe account input', async () => {
  const { core } = createCore();
  assert.equal(core.normalizePhone('(832) 874-8680'), '+18328748680');
  assert.equal(core.normalizePhone('+1 832 874 8680'), '+18328748680');
  assert.throws(() => core.normalizePhone('555'), /valid 10-digit/i);
  await assert.rejects(core.MockCustomerApi.requestVerificationCode({ phone: '(832) 555-0100', intent: 'register', name: '', email: '' }), /full name/i);
  await assert.rejects(core.MockCustomerApi.requestVerificationCode({ phone: '(832) 555-0100', intent: 'register', name: 'Demo Customer', email: 'not-email' }), /valid email/i);
});

test('mock phone verification supports passwordless registration, expiry, cooldown, login, and logout', async () => {
  const { core, context } = createCore();
  let now = 2_000_000_000_000;
  context.Date.now = () => now;
  const api = core.MockCustomerApi;

  const sent = JSON.parse(JSON.stringify(await api.requestVerificationCode({ phone: '(832) 555-0100', intent: 'register', name: 'Demo Customer', email: '' })));
  assert.equal(sent.status, 'demo');
  assert.match(sent.demoCode, /^\d{6}$/);
  assert.equal(sent.resendAfterSeconds, 30);
  await assert.rejects(api.requestVerificationCode({ phone: '(832) 555-0100', intent: 'register', name: 'Demo Customer', email: '' }), /wait .*second/i);
  await assert.rejects(api.verifyCode({ phone: '(832) 555-0100', code: '000000', intent: 'register', name: 'Demo Customer', email: '' }), /incorrect/i);

  const session = JSON.parse(JSON.stringify(await api.verifyCode({ phone: '(832) 555-0100', code: sent.demoCode, intent: 'register', name: 'Demo Customer', email: '' })));
  assert.equal(session.customer.phone, '+18325550100');
  assert.equal(session.customer.email, '');
  assert.equal('password' in session, false);
  assert.deepEqual(JSON.parse(JSON.stringify(await api.getSession())), session);
  await api.logout();
  assert.equal(await api.getSession(), null);

  now += 31_000;
  const login = JSON.parse(JSON.stringify(await api.requestVerificationCode({ phone: '+18325550100', intent: 'login' })));
  now += 601_000;
  await assert.rejects(api.verifyCode({ phone: '+18325550100', code: login.demoCode, intent: 'login' }), /expired/i);
});

test('account markup uses a six-digit one-time code and contains no password field', () => {
  assert.match(app, /autocomplete="one-time-code"/);
  assert.match(app, /inputmode="numeric"/);
  assert.match(app, /maxlength="6"/);
  assert.match(app, /Zelle and Cash Welcome/);
  assert.doesNotMatch(allSource, /type="password"|name="password"|create a password/i);
});

test('creating an account does not claim a booking made as a guest', async () => {
  const api = createCore().core.MockCustomerApi;
  const choice = await firstAvailableSelection(api);
  const guest = JSON.parse(JSON.stringify(await api.createAppointment({
    serviceId: 'regular', upgradeIds: [], date: choice.date, time: choice.time,
    customer: { name: 'Guest Client', email: '', phone: '(832) 555-0133' },
    paymentMethod: 'shop', policyAccepted: true,
  })));
  assert.equal((await api.listAppointments()).some((item) => item.id === guest.id), true);

  const sent = await api.requestVerificationCode({ phone: '(832) 555-0133', intent: 'register', name: 'Guest Client', email: '' });
  await api.verifyCode({ phone: '(832) 555-0133', code: sent.demoCode, intent: 'register', name: 'Guest Client', email: '' });
  assert.equal((await api.listAppointments()).some((item) => item.id === guest.id), false);
});

test('maps booking selections to the admin appointment contract without time-zone drift', () => {
  const { core } = createCore();
  const payload = JSON.parse(JSON.stringify(core.mapAppointmentRequest({
    date: '2026-12-04', time: 795,
    service: { id: 'regular', name: 'The OG', priceCents: 4500, duration: 35 },
    upgrades: [{ id: 'eyebrow-detail', name: 'Eyebrow Detail', priceCents: 500, duration: 5 }],
    customer: { name: 'Demo Customer', email: '', phone: '(832) 555-0100' },
    policyAccepted: true,
    notes: 'Reference photo will be shown at the shop.',
  })));
  assert.deepEqual(payload, {
    date: '2026-12-04',
    time: '13:15',
    customer: { name: 'Demo Customer', email: '', phone: '+18325550100' },
    services: [
      { id: 'regular', name: 'The OG', price: 45, durationMin: 35 },
      { id: 'eyebrow-detail', name: 'Eyebrow Detail', price: 5, durationMin: 5 },
    ],
    status: 'Booked',
    payment: 'Pay at Shop',
    paymentMethod: 'shop',
    receiptSent: false,
    referencePhotos: 0,
    notes: 'Reference photo will be shown at the shop.',
    policyAccepted: true,
    policyVersion: '2026-11-11',
  });
});

test('HTTP create posts once and reschedule patches the same appointment ID', async () => {
  const calls = [];
  const responseAppointment = { id: 'APT-42', date: '2026-12-04', time: '13:15', status: 'Booked', customer: { name: 'Demo Customer', email: '', phone: '+18325550100' }, services: [{ id: 'regular', name: 'The OG', price: 45, durationMin: 35 }], paymentMethod: 'shop' };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(responseAppointment) };
  };
  const { core } = createCore({ fetchImpl, config: { mode: 'http' } });
  const selection = {
    date: '2026-12-04', time: 795,
    service: { id: 'regular', name: 'The OG', priceCents: 4500, duration: 35 }, upgrades: [],
    customer: { name: 'Demo Customer', email: '', phone: '(832) 555-0100' }, policyAccepted: true,
  };
  const created = await core.HttpCustomerApi.createAppointment(selection);
  const moved = await core.HttpCustomerApi.createAppointment({ ...selection, time: 810, replacesId: 'APT-42' });

  assert.equal(created.id, 'APT-42');
  assert.equal(moved.id, 'APT-42');
  assert.equal(calls[0].url, '/api/customer/appointments');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].body.time, '13:15');
  assert.equal(calls[1].url, '/api/customer/appointments/APT-42');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[1].body.time, '13:30');
});

test('mock rescheduling updates the same appointment instead of creating a replacement', async () => {
  const api = createCore().core.MockCustomerApi;
  const first = await firstAvailableSelection(api);
  const customer = { name: 'Demo Customer', email: '', phone: '(832) 555-0100' };
  const original = JSON.parse(JSON.stringify(await api.createAppointment({ serviceId: 'regular', upgradeIds: [], date: first.date, time: first.time, customer, paymentMethod: 'shop', policyAccepted: true })));
  const availability = await api.getAvailability({ date: first.date, serviceId: 'regular', upgradeIds: [], replacesId: original.id });
  const later = availability.slots.find((slot) => slot.available && slot.time !== first.time);
  assert.ok(later, 'a different reschedule slot should exist');
  const moved = JSON.parse(JSON.stringify(await api.createAppointment({ serviceId: 'regular', upgradeIds: [], date: first.date, time: later.time, customer, paymentMethod: 'shop', policyAccepted: true, replacesId: original.id })));

  assert.equal(moved.id, original.id);
  assert.equal(moved.time, later.time);
  assert.equal((await api.listAppointments()).filter((item) => item.id === original.id).length, 1);
});

test('HTTP mode uses only real booking language and Pay at the Shop', () => {
  const { core } = createCore({ config: { mode: 'http' } });
  const copy = core.runtimeCopy();
  assert.equal(copy.confirmButton, 'Confirm appointment');
  assert.equal(copy.confirmationHeading, 'APPOINTMENT CONFIRMED.');
  assert.equal(copy.paymentTitle, 'Pay at the Shop');
  assert.match(copy.paymentDetail, /Zelle and Cash Welcome/);
  assert.doesNotMatch(JSON.stringify(copy), /demo|prototype|4242/i);
});

test('the customer API contract documents every frontend endpoint and admin mapping rule', () => {
  const file = path.join(root, 'CUSTOMER_API_CONTRACT.md');
  assert.equal(fs.existsSync(file), true, 'CUSTOMER_API_CONTRACT.md should exist');
  const contract = fs.readFileSync(file, 'utf8');
  for (const [method, endpoint] of [
    ['GET', '/api/public/business'], ['GET', '/api/public/services'], ['GET', '/api/public/upgrades'],
    ['GET', '/api/public/availability'], ['GET', '/api/public/reviews'], ['GET', '/api/public/instagram'],
    ['POST', '/api/customer/auth/send-code'], ['POST', '/api/customer/auth/verify-code'],
    ['GET', '/api/customer/session'], ['POST', '/api/customer/auth/logout'],
    ['GET', '/api/customer/profile'], ['PATCH', '/api/customer/profile'],
    ['GET', '/api/customer/appointments'], ['POST', '/api/customer/appointments'],
    ['PATCH', '/api/customer/appointments/:id'],
    ['GET', '/api/customer/appointments/:id/photos'], ['POST', '/api/customer/appointments/:id/photos'],
    ['DELETE', '/api/customer/appointments/:id/photos/:photoId'],
  ]) {
    assert.equal(contract.includes(`${method} \`${endpoint}\``), true, `${method} ${endpoint} should be documented`);
  }
  assert.match(contract, /status[^\n]*Booked[^\n]*Completed[^\n]*Cancelled/i);
  assert.match(contract, /409[^\n]*(overlap|conflict)/i);
  assert.match(contract, /policyVersion/);
  assert.match(contract, /price[^\n]*dollars/i);
  assert.match(contract, /durationMin/);
});

test('the backend handoff is send-ready and keeps all provider secrets on the server', () => {
  const file = path.join(root, 'BACKEND_HANDOFF.md');
  assert.equal(fs.existsSync(file), true, 'BACKEND_HANDOFF.md should exist');
  const handoff = fs.readFileSync(file, 'utf8');
  assert.match(handoff, /phone verification/i);
  assert.match(handoff, /6-digit/i);
  assert.match(handoff, /10 minutes/i);
  assert.match(handoff, /rate limit/i);
  assert.match(handoff, /Google/i);
  assert.match(handoff, /Instagram/i);
  assert.match(handoff, /(server only|backend only|never.*front end)/i);
  assert.match(handoff, /do not.*claim/i);
  assert.doesNotMatch(`${handoff}\n${fs.readFileSync(path.join(root, 'CUSTOMER_API_CONTRACT.md'), 'utf8')}`, /(AIza[0-9A-Za-z_-]{20,}|EA[A-Za-z0-9]{30,}|SK[0-9a-f]{30,}|password\s*[:=]\s*\S+)/);
});

test('successful guest checkout does not fail on an optional protected profile refresh', async () => {
  const { core } = createCore();
  let profileCalls = 0;
  const appointment = { id: 'APT-GUEST-1' };
  const api = {
    createAppointment: async () => appointment,
    getProfile: async () => { profileCalls += 1; throw new core.CustomerApiError('Sign in again.', 401); },
  };
  const guestResult = await core.completeBooking(api, { any: 'request' }, { refreshProfile: false });
  assert.equal(guestResult.appointment, appointment);
  assert.equal(guestResult.profile, null);
  assert.equal(profileCalls, 0);

  const signedResult = await core.completeBooking(api, { any: 'request' }, { refreshProfile: true });
  assert.equal(signedResult.appointment, appointment);
  assert.equal(signedResult.profile, null);
  assert.equal(profileCalls, 1);
});

test('401 handling clears private customer state and invokes the app callback only for the customer session', async () => {
  const privateState = {
    session: { authenticated: true },
    profile: { name: 'Private', email: 'private@example.com', phone: '+18325550100' },
    verification: { phone: '+18325550100' },
    confirmation: { id: 'APT-1' },
  };
  const { core, sessionStorage } = createCore({
    sessionSeed: { rolaz_customer_session: 'customer', rolaz_admin_session: 'admin' },
    fetchImpl: async () => ({ ok: false, status: 401, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ message: 'Sign in again.' }) }),
  });
  let callbackCount = 0;
  core.setCustomerUnauthorizedHandler(() => { callbackCount += 1; core.clearPrivateCustomerState(privateState); });
  await assert.rejects(core.HttpCustomerApi.getSession(), /Sign in again/);
  assert.equal(callbackCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(privateState)), { session: null, profile: { name: '', email: '', phone: '' }, verification: null, confirmation: null });
  assert.deepEqual(sessionStorage.snapshot(), { rolaz_admin_session: 'admin' });
});

test('mobile navigation keeps Account reachable', () => {
  assert.match(html, /href="#account"[^>]*data-mobile-nav/);
  assert.match(css, /nav\s*>\s*a:not\(\.button\):not\(\[data-mobile-nav\]\)\s*\{\s*display:\s*none/);
});

test('disabled controls recover after an async failure so the action can be retried', async () => {
  const { core } = createCore();
  const button = { disabled: false };
  await assert.rejects(core.withDisabledControl(button, async () => { throw new Error('provider unavailable'); }), /provider unavailable/);
  assert.equal(button.disabled, false);
  const value = await core.withDisabledControl(button, async () => 'retry worked');
  assert.equal(value, 'retry worked');
  assert.equal(button.disabled, false);
});

test('startup failures replace loading with an accessible retry state', async () => {
  const { core } = createCore();
  const events = [];
  const error = new core.CustomerApiError('Unable to reach the booking service.', 0);
  const result = await core.runCustomerStartup({
    load: async () => { throw error; },
    loading: () => events.push('loading'),
    ready: () => events.push('ready'),
    failed: (caught) => events.push(core.startupErrorView(caught)),
  });
  assert.equal(result, false);
  assert.equal(events[0], 'loading');
  assert.equal(events.some((entry) => /Unable to reach the booking service\./.test(entry) && /data-retry-startup/.test(entry) && /role="alert"/.test(entry)), true);
  assert.equal(events.includes('ready'), false);
});

test('missing or out-of-range review ratings never become fabricated zero-star reviews', () => {
  const { core } = createCore();
  for (const rating of [null, '', -1, 6, 'not-a-number']) {
    const normalized = core.normalizeReviewsPayload({
      rating: null,
      totalCount: 1,
      reviews: [{ id: 'bad', authorName: 'Customer', rating, text: 'Text', relativeTime: 'today' }],
    });
    assert.notEqual(normalized.status, 'success');
    assert.deepEqual(normalized.reviews, []);
    assert.notEqual(normalized.rating, 0);
  }
});

test('mock profile changes persist through sign-out and the next verified sign-in', async () => {
  const { core, context } = createCore();
  let now = 2_100_000_000_000;
  context.Date.now = () => now;
  const api = core.MockCustomerApi;
  const registration = await api.requestVerificationCode({ phone: '(832) 555-0144', intent: 'register', name: 'First Name', email: '' });
  await api.verifyCode({ phone: '(832) 555-0144', code: registration.demoCode, intent: 'register', name: 'First Name', email: '' });
  await api.updateProfile({ name: 'Updated Name', email: 'updated@example.com', phone: '+18325550144' });
  await api.logout();
  now += 31_000;
  const login = await api.requestVerificationCode({ phone: '+18325550144', intent: 'login' });
  const session = await api.verifyCode({ phone: '+18325550144', code: login.demoCode, intent: 'login' });
  assert.deepEqual(JSON.parse(JSON.stringify(session.customer)), { name: 'Updated Name', email: 'updated@example.com', phone: '+18325550144' });
});

test('backend documents cookie CORS, booking validation, terminal statuses, admin switch, and shared integration checks', () => {
  const contract = fs.readFileSync(path.join(root, 'CUSTOMER_API_CONTRACT.md'), 'utf8');
  const handoff = fs.readFileSync(path.join(root, 'BACKEND_HANDOFF.md'), 'utf8');
  const docs = `${contract}\n${handoff}`;
  assert.match(docs, /credentialed CORS/i);
  assert.match(docs, /approved frontend origin/i);
  assert.match(docs, /policyAccepted[^\n]*policyVersion/i);
  assert.match(docs, /future (?:shop-local )?date/i);
  assert.match(docs, /Completed[^\n]*Cancelled[^\n]*(?:cannot|must not|reject)/i);
  assert.match(docs, /VITE_USE_MOCK_APPOINTMENTS/);
  assert.match(docs, /shared[^\n]*(?:booking|appointment)[^\n]*(?:test|check|verification)/i);
});

test('review cards display escaped provider attribution', () => {
  assert.match(app, /reviews\.attribution/);
  assert.match(app, /esc\(reviews\.attribution/);
});

test('the test suite is self-contained inside an extracted deliverable', () => {
  const suiteBeforeSelfCheck = fs.readFileSync(__filename, 'utf8').split("test('the test suite is self-contained")[0];
  assert.doesNotMatch(app, /PowerCorp-Daniel-1-source/);
  assert.doesNotMatch(suiteBeforeSelfCheck, /sourceRoot|PowerCorp-Daniel-1-source/);
});

test('reference photo selection enforces the back end limits before booking', () => {
  const { core } = createCore();
  const photo = (name, type = 'image/jpeg', size = 1000) => ({ name, type, size });
  assert.deepEqual(JSON.parse(JSON.stringify(core.validatePhotoSelection([]))), { files: [], error: '' });
  assert.equal(core.validatePhotoSelection([photo('empty.jpg', 'image/jpeg', 0)]).files.length, 0, 'an empty file input is ignored');
  assert.equal(core.validatePhotoSelection([photo('a.jpg'), photo('b.png', 'image/png'), photo('c.webp', 'image/webp')]).files.length, 3);
  assert.match(core.validatePhotoSelection([photo('a'), photo('b'), photo('c'), photo('d')]).error, /up to 3/);
  assert.match(core.validatePhotoSelection([photo('cut.heic', 'image/heic')]).error, /cut\.heic isn't a JPEG, PNG, or WebP/);
  assert.match(core.validatePhotoSelection([photo('big.jpg', 'image/jpeg', core.PHOTO_MAX_BYTES + 1)]).error, /larger than 8 MB/);
});

test('photo uploads keep the booking when one photo fails and pass the guest token', async () => {
  const { core } = createCore();
  const calls = [];
  const api = {
    uploadPhoto: async (request) => {
      calls.push(request);
      if (request.file.name === 'bad.jpg') throw new Error('Photo storage is down.');
      return { photos: [] };
    },
  };
  const appointment = { id: '42', guestToken: 'guest-secret' };
  const result = await core.uploadReferencePhotos(api, appointment, [{ name: 'good.jpg' }, { name: 'bad.jpg' }]);
  assert.equal(result.uploaded, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.failed)), [{ name: 'bad.jpg', message: 'Photo storage is down.' }]);
  assert.deepEqual(calls.map((call) => [call.id, call.guestToken]), [['42', 'guest-secret'], ['42', 'guest-secret']]);
});

test('HTTP photo upload sends multipart form data with the guest token header', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 201, headers: { get: () => '' }, text: async () => '{"photos":[]}' };
  };
  const { core } = createCore({ fetchImpl, config: { mode: 'http', apiBaseUrl: 'https://api.example.test' } });
  const file = new File(['jpeg-bytes'], 'fade.jpg', { type: 'image/jpeg' });
  await core.HttpCustomerApi.uploadPhoto({ id: '7', file, guestToken: 'guest-secret' });

  assert.equal(calls[0].url, 'https://api.example.test/api/customer/appointments/7/photos');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.body instanceof FormData, true);
  assert.equal(calls[0].options.body.get('photo').name, 'fade.jpg');
  assert.equal(calls[0].options.headers['X-Guest-Token'], 'guest-secret');
  assert.equal('Content-Type' in calls[0].options.headers, false, 'the browser must set the multipart boundary');
});

test('mock photo uploads count toward the appointment and stop at the limit', async () => {
  const api = createMockApi();
  const selection = await firstAvailableSelection(api);
  const appointment = await api.createAppointment({
    serviceId: 'regular', upgradeIds: [], ...selection,
    customer: { name: 'Photo Tester', phone: '8325550100', email: '' },
    paymentMethod: 'shop', policyAccepted: true,
  });
  const photo = { name: 'look.jpg', type: 'image/jpeg', size: 1000 };
  for (let i = 0; i < 3; i += 1) await api.uploadPhoto({ id: appointment.id, file: photo });
  await assert.rejects(() => api.uploadPhoto({ id: appointment.id, file: photo }), /up to 3 photos/);
  const listed = (await api.listAppointments()).find((item) => item.id === appointment.id);
  assert.equal(listed.referencePhotos, 3);
});

function stripeRequest() {
  return {
    serviceId: 'regular', upgradeIds: [], date: '2026-12-01', time: 720, policyAccepted: true,
    service: { id: 'regular', name: 'The OG', priceCents: 4500, duration: 35 }, upgrades: [],
    customer: { name: 'Pat Guest', email: '', phone: '832-555-0101' },
  };
}

test('Stripe checkout posts an online-payment booking and only accepts a Stripe-hosted link', async () => {
  const calls = [];
  let checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_123';
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 201, headers: { get: () => '' }, text: async () => JSON.stringify({ checkoutUrl, sessionId: 'cs_test_123', appointmentId: '41', guestToken: 'guest-secret' }) };
  };
  const { core } = createCore({ fetchImpl, config: { mode: 'http', apiBaseUrl: 'https://api.example.test' } });
  const checkout = await core.HttpCustomerApi.createStripeCheckout(stripeRequest());
  assert.equal(calls[0].url, 'https://api.example.test/api/customer/stripe/checkout');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.payment, 'Stripe');
  assert.equal(body.paymentMethod, 'stripe');
  assert.equal(checkout.sessionId, 'cs_test_123');
  assert.equal(checkout.guestToken, 'guest-secret');

  checkoutUrl = 'https://evil.example/checkout';
  await assert.rejects(core.HttpCustomerApi.createStripeCheckout(stripeRequest()), /invalid checkout link/);
});

test('the payment return page loads the booking with the guest code, and cancel releases it', async () => {
  const calls = [];
  const appointment = { id: '41', date: '2026-12-01', time: '12:00', status: 'Booked', payment: 'Paid', paymentMethod: 'Online card', services: [{ id: 'regular', name: 'The OG', price: 45, durationMin: 35 }] };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, headers: { get: () => '' }, text: async () => JSON.stringify(appointment) };
  };
  const { core } = createCore({ fetchImpl, config: { mode: 'http', apiBaseUrl: 'https://api.example.test' } });
  const result = await core.HttpCustomerApi.getCheckoutResult({ sessionId: 'cs_test_123', guestToken: 'guest-secret' });
  assert.equal(calls[0].url, 'https://api.example.test/api/customer/stripe/checkout/cs_test_123');
  assert.equal(calls[0].options.method, undefined, 'a GET request');
  assert.equal(calls[0].options.headers['X-Guest-Token'], 'guest-secret');
  assert.equal(result.payment, 'Paid');
  assert.equal(result.priceCents, 4500);

  await core.HttpCustomerApi.cancelAppointment({ id: '41', guestToken: 'guest-secret' });
  assert.equal(calls[1].url, 'https://api.example.test/api/customer/appointments/41');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[1].options.headers['X-Guest-Token'], 'guest-secret');
  assert.deepEqual(JSON.parse(calls[1].options.body), { status: 'Cancelled' });
});

test('online payment is offered only on the live site, never in the prototype', () => {
  const api = createMockApi();
  assert.equal(api.createStripeCheckout, undefined, 'the mock API must not reach a real payment service');
  assert.match(app, /CUSTOMER_CONFIG\.mode === 'http' && !state\.replacesId \? '<label class="payment-choice"><input type="radio" name="payment" value="stripe">/);
  assert.match(app, /if \(route === 'payment-success'\) html = await paymentSuccessView\(\);/);
  assert.match(app, /GUEST BOOKING CODE/);
});
