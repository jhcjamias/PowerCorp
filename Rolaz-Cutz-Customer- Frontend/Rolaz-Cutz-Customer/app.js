'use strict';

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
    { id: 'eyebrow-detail', name: 'Eyebrow Detail', description: 'A clean eyebrow finish for a sharper overall look.', priceCents: 500, duration: 5, serviceIds: ['regular', 'kids'] },
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
  let appointments = [{ id: 'DEMO-1001', serviceId: 'regular', serviceName: 'The OG', upgradeIds: [], upgradeNames: [], priceCents: 4500, duration: 35, date: '2026-10-23', time: 660, status: 'completed', paymentMethod: 'shop', customer: { ...profile }, sample: true }];
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
    if (!customer?.name?.trim() || !customer.email?.includes('@') || !customer.phone?.trim()) throw new Error('Please complete your contact details.');
    return { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() };
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
      return result(profile);
    },
    getAvailability: async request => result({ date: request.date, timezone: business.timezone, slots: slotsFor(request) }),
    listAppointments: () => result(appointments),
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
      if (previous) previous.status = 'rescheduled';
      const appointment = {
        id: `DEMO-${++sequence}`,
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
        policyAccepted: true,
        policyVersion: '2026-11-05',
        status: 'confirmed',
        sample: false
      };
      appointments.unshift(appointment);
      return result(appointment);
    },
    cancelAppointment: async ({ id }) => {
      const appointment = appointments.find(item => item.id === id && item.status === 'confirmed');
      if (!appointment) throw new Error('This appointment cannot be canceled.');
      appointment.status = 'canceled';
      return result(appointment);
    }
  };
})();
window.MockCustomerApi = MockCustomerApi;

const state = { services: [], upgrades: [], business: null, profile: null, serviceId: null, upgradeIds: [], date: null, time: null, replacesId: null, confirmation: null, renderId: 0 };
const main = document.querySelector('#main');
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
function homeView() {
  return `<div class="home-shell"><section class="suite-hero"><div class="hero-copy"><span class="section-code">KATY, TEXAS / ROLAZ CUTZ</span><h1>LOOK LIKE YOURSELF.<br><em>ONLY BETTER.</em></h1><p>Signature grooming, precise linework, and finishing details at Rolaz Cutz in Katy.</p></div><div class="hero-identity"><p class="rolaz-effect-mark" aria-label="The Rolaz Effect"><span>THE</span><strong>ROLAZ</strong><em>EFFECT</em></p><div class="logo-plate"><img src="rolaz-cutz-logo.jpeg" alt="Rolaz Cutz Barbershop emblem"><span>ROLAZ CUTZ / KATY, TEXAS</span></div></div></section><section id="service-menu" class="service-section"><header class="editorial-heading"><span>01 / BOOK YOUR VISIT</span><h2>FIND YOUR CUT.</h2><p>Choose your service, add any Upgradez, and find a time that works for you.</p></header><div class="service-cta"><span>YOUR NEXT LOOK STARTS HERE.</span><a class="button" href="#services" data-action="new">Ready to Get Right?</a></div></section><section id="shop-info" class="location-section"><div class="map-frame"><iframe title="Rolaz Cutz location map" src="${mapUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div><div class="location-copy"><span class="section-code">02 / FIND THE SHOP</span><h2>FIND US<br><em>IN KATY.</em></h2><address><strong>Rolaz Cutz Barbershop</strong><br>20260 Katy Freeway, Suite 116<br>Katy, Texas 77449</address><div class="contact-stack"><a href="tel:+18328748680">+1 832-874-8680</a><a href="mailto:rolazcutz@gmail.com">rolazcutz@gmail.com</a><a href="${directionsUrl}" target="_blank" rel="noopener noreferrer">Get directions →</a></div></div><div class="hours-panel"><div class="hours-title"><span>SHOP HOURS</span><small>All hours shown in Central time</small></div><dl class="hours">${state.business.hours.map(([day, hours]) => `<div><dt>${day}</dt><dd>${hours}</dd></div>`).join('')}</dl></div></section><section class="future-section"><span class="section-code">03 / COMING LATER</span><h2>MERCH & PARTNERS</h2><p>A reserved space for future Rolaz Cutz drops, local partnerships, and disclosed affiliate links—without distracting from booking today.</p><span class="future-mark" aria-hidden="true">ROLAZ</span></section></div>`;
}
function stepper(index) {
  return `<ol class="stepper" aria-label="Booking progress">${['Service', 'Date & time', 'Your details', 'Confirmation'].map((name, i) => `<li class="${i === index ? 'active' : i < index ? 'done' : ''}" ${i === index ? 'aria-current="step"' : ''}><span class="step-circle" aria-hidden="true">${i < index ? '✓' : i + 1}</span><span>${name}</span></li>`).join('')}</ol>`;
}
function summaryView(step) {
  const quote = selectionQuote();
  const ready = quote && (step === 'services' || state.date && state.time !== null);
  return `<div class="slip-label">YOUR APPOINTMENT</div><h3>${quote ? esc(quote.service.name) : 'CHOOSE A SERVICE'}</h3><p>${quote ? `${quote.duration} minutes at Rolaz Cutz` : 'Your time and total will appear here.'}</p>${quote?.upgrades.length ? `<div class="summary-detail">Upgradez<small>${quote.upgrades.map(item => esc(item.name)).join(' · ')}</small></div>` : ''}<div class="summary-detail">Rolaz Cutz Barbershop<small>20260 Katy Freeway, Suite 116<br>Katy, TX 77449</small></div>${state.date ? `<div class="summary-detail">${dateLabel(state.date)}<small>${state.time !== null ? timeLabel(state.time) : 'Choose a time'} · Central time</small></div>` : ''}<div class="summary-total"><span>Estimated total</span><strong>${quote ? money(quote.priceCents) : '—'}</strong></div>${step === 'review' ? `<button class="button button-full" type="submit" form="checkout-form">Confirm demo appointment</button>` : `<button class="button button-full" data-action="next" ${ready ? '' : 'disabled'}>Continue →</button>`}<p class="fine-print">Approval prototype. Availability is simulated. No real appointment or payment will be made.</p>`;
}
function bookingLayout(title, index, content, step) {
  return `<div class="shell booking-shell"><div class="booking-header"><span class="section-code">${state.replacesId ? 'RESCHEDULE DEMO APPOINTMENT' : `BOOKING / STEP ${index + 1} OF 4`}</span><h1>${title}</h1></div>${stepper(index)}<div class="booking-grid"><section class="booking-content" aria-label="${title}">${content}</section><aside class="summary" id="booking-summary" aria-label="Appointment summary">${summaryView(step)}</aside></div></div>`;
}
function upgradeFieldsetView() {
  const availableUpgrades = state.serviceId ? state.upgrades.filter(upgrade => upgrade.serviceIds.includes(state.serviceId)) : state.upgrades;
  const upgradeIntro = state.serviceId === 'workz'
    ? 'The Workz already includes every upgrade. No extra selections are needed.'
    : state.serviceId === 'beard'
      ? 'This service is complete as listed. No Upgradez are available.'
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
  const availability = await MockCustomerApi.getAvailability({ date: requestedDate, serviceId: state.serviceId, upgradeIds: state.upgradeIds, replacesId: state.replacesId });
  if (renderId !== state.renderId || state.date !== requestedDate) return null;
  if (!availability.slots.some(slot => slot.time === state.time && slot.available)) state.time = null;
  return bookingLayout('CHOOSE A DATE & TIME.', 1, `<h2>PICK A TIME.</h2><p class="subtext">Choose a date and time below. All times are shown in Central time.</p><div class="date-grid" role="group" aria-label="Choose appointment date">${dates.map(date => { const day = dateObject(date); const closed = !state.business.schedule[day.getDay()]; return `<button class="date-button" data-date="${date}" aria-label="${dateLabel(date)}${closed ? ', shop closed' : ''}" aria-pressed="${date === state.date}" ${closed ? 'disabled' : ''}><span>${day.toLocaleDateString('en-US', { weekday: 'short' })}</span><strong>${day.getDate()}</strong><small>${closed ? 'CLOSED' : day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</small></button>`; }).join('')}</div><div class="slot-heading"><h3>${dateLabel(state.date)}</h3><span>DEMO AVAILABILITY / ${selectionQuote().duration} MIN</span></div><div class="time-grid" role="group" aria-label="Choose appointment time">${availability.slots.map(slot => `<button class="time-button" data-time="${slot.time}" aria-pressed="${state.time === slot.time}" ${slot.available ? '' : 'disabled'} aria-label="${timeLabel(slot.time)}${slot.available ? '' : ', unavailable'}">${timeLabel(slot.time)}</button>`).join('')}</div><div class="notice">Unavailable times are crossed out. Final availability will come from the future booking backend.</div><div class="booking-actions"><a class="text-link" href="#services">← Change service or Upgradez</a></div>`, 'dates');
}
function contactFields(profile, prefix = '') {
  return `<label class="field field-full" for="${prefix}name">Full name<input id="${prefix}name" name="name" autocomplete="name" required maxlength="80" value="${esc(profile.name)}"></label><label class="field" for="${prefix}email">Email address<input id="${prefix}email" name="email" type="email" autocomplete="email" required maxlength="160" value="${esc(profile.email)}"></label><label class="field" for="${prefix}phone">Phone number<input id="${prefix}phone" name="phone" type="tel" autocomplete="tel" required maxlength="30" value="${esc(profile.phone)}"></label>`;
}
function policyMarkup() {
  return `<section class="policy-panel" aria-labelledby="appointment-policy"><div class="policy-heading"><span>PLEASE READ BEFORE CONFIRMING</span><h2 id="appointment-policy">Appointment & Payment Policy</h2></div><div class="policy-grid"><p>If you are unable to attend your appointment or are running late, please call <a href="tel:+18328748680">+1 832-874-8680</a> so we can make arrangements.</p><p>Please cancel or reschedule at least <strong>2 hours before your appointment</strong>.</p><p>If you arrive <strong>more than 5 minutes late</strong>, service may be refused and the <strong>full service fee</strong> may be charged.</p><p>A <strong>no-show, including a no-call/no-show, will be charged the full service price</strong>.</p><p class="cash-note">Cash is still accepted.</p></div><label class="agreement policy-agreement"><input type="checkbox" name="policyAccepted" required><span>I have read and agree to the Appointment & Payment Policy, including the 2-hour cancellation or rescheduling requirement, late-arrival policy, and full-service no-show fee.</span></label></section>`;
}
function reviewView() {
  return bookingLayout('YOUR DETAILS.', 2, `<form id="checkout-form"><h2>CONTACT DETAILS.</h2><p class="subtext">Check your information before confirming. It stays in this page's memory only.</p><div class="form-grid">${contactFields(state.profile, 'booking-')}</div><section class="review-section"><h2>HOW WILL YOU PAY?</h2><p class="subtext">No payment is collected in this prototype.</p><label class="payment-choice"><input type="radio" name="payment" value="shop" checked><span>Pay at the Shop<small>Pay in person after your service. Zelle and Cash Welcome.</small></span></label><label class="payment-choice"><input type="radio" name="payment" value="demo-card"><span>Demo card ···· 4242<small>Simulated payment only. No charge will be made.</small></span><span class="badge">DEMO ONLY</span></label></section>${policyMarkup()}<label class="agreement prototype-agreement"><input type="checkbox" name="acknowledge" required><span>I understand this is an approval prototype. Confirming creates a demo appointment only and does not reserve a time or charge a payment.</span></label><p class="error" id="checkout-error" role="alert"></p></form><div class="booking-actions"><a class="text-link" href="#dates">← Change date & time</a></div>`, 'review');
}
function confirmationView() {
  const appointment = state.confirmation;
  const details = appointmentDetails(appointment);
  return `<div class="shell confirmation-shell"><section class="confirmation"><div class="confirmation-icon" aria-hidden="true">✓</div><span class="section-code">${esc(appointment.id)} / DEMO CONFIRMATION</span><h1>DEMO APPOINTMENT<br>CONFIRMED.</h1><p>This is how a confirmed appointment will be presented. No real appointment was booked and no payment was collected.</p><div class="confirmation-card"><h2>${esc(details.service.name)}</h2><div class="detail-grid"><div><small>DATE & TIME</small><strong>${dateLabel(appointment.date)}<br>${timeLabel(appointment.time)} · Central time</strong></div><div><small>SERVICE</small><strong>${details.duration} minutes · ${money(details.priceCents)}${details.upgrades.length ? `<br>Upgradez: ${details.upgrades.map(item => esc(item.name)).join(' · ')}` : ''}</strong></div><div><small>THE SHOP</small><strong>Rolaz Cutz Barbershop<br>20260 Katy Freeway, Suite 116<br>Katy, TX 77449</strong></div><div><small>PAYMENT PREVIEW</small><strong>${appointment.paymentMethod === 'demo-card' ? 'Demo card ···· 4242' : 'Pay at the Shop · Zelle and Cash Welcome'}<br>No payment collected</strong></div></div></div><div class="policy-reminder"><strong>Plans changed or running late?</strong><span>Call <a href="tel:+18328748680">+1 832-874-8680</a>. Cancel or reschedule at least 2 hours before the appointment.</span></div><div class="hero-actions"><a href="#profile" class="button">View my appointments</a><a href="#home" class="text-link">Back to the shop</a></div><div class="notice">No confirmation email or text is sent from this prototype. Your demo appointment appears in My profile until you reload the page.</div></section></div>`;
}
function appointmentCard(appointment) {
  const details = appointmentDetails(appointment);
  return `<article class="appointment-card"><div class="appointment-top"><div><h3>${esc(details.service.name)}</h3><p>${shortDate(appointment.date)} · ${timeLabel(appointment.time)} CT<br>${details.duration} minutes · ${money(details.priceCents)} · Rolaz Cutz${details.upgrades.length ? `<br>Upgradez: ${details.upgrades.map(item => esc(item.name)).join(' · ')}` : ''}</p></div><span class="badge ${appointment.status === 'confirmed' ? 'badge-confirmed' : ''}">${appointment.status === 'confirmed' ? 'DEMO BOOKED' : esc(appointment.status.toUpperCase())}</span></div><div class="appointment-actions">${appointment.status === 'confirmed' ? `<button class="text-link" data-reschedule="${appointment.id}">Reschedule demo</button><button class="text-link" data-cancel="${appointment.id}" aria-expanded="false" aria-controls="cancel-${appointment.id}">Cancel demo</button>` : `<button class="text-link" data-rebook="${appointment.id}">Book this again ↗</button>`}${appointment.sample ? '<span class="subtext">Sample history</span>' : ''}</div>${appointment.status === 'confirmed' ? `<div id="cancel-${appointment.id}" class="cancel-confirmation" role="group" aria-label="Confirm demo cancellation" hidden><p>Cancel this demo appointment?</p><p class="subtext">This only changes the prototype. No real booking will be affected.</p><div class="cancel-confirmation-actions"><button class="button button-small button-secondary" data-keep="${appointment.id}">Keep appointment</button><button class="button button-small" data-confirm-cancel="${appointment.id}">Yes, cancel demo</button></div></div>` : ''}</article>`;
}
async function profileView() {
  const appointments = await MockCustomerApi.listAppointments();
  const upcoming = appointments.filter(item => item.status === 'confirmed');
  const history = appointments.filter(item => item.status !== 'confirmed');
  return `<div class="shell profile-shell"><div class="booking-header"><span class="section-code">CUSTOMER / DEMO PROFILE</span><h1>MY APPOINTMENTS.</h1></div><div class="profile-grid"><form class="profile-card" id="profile-form"><div class="avatar" aria-hidden="true">${esc(state.profile.name.split(' ').map(part => part[0]).slice(0, 2).join(''))}</div><h2>CONTACT DETAILS</h2><p class="subtext">Demo customer. Details reset when this page reloads.</p>${contactFields(state.profile, 'profile-')}<p id="profile-error" class="error" role="alert"></p><button class="button button-full" type="submit">Save demo profile</button></form><section><div class="section-heading"><h2>UPCOMING</h2><button class="text-link" data-action="new">Book another visit →</button></div>${upcoming.length ? upcoming.map(appointmentCard).join('') : '<div class="empty-state">No upcoming demo appointments. Choose a service when you are ready.</div>'}<h3 class="history-title">PAST & CHANGED</h3><p class="subtext">Includes one example past visit to show how appointment history could look.</p>${history.map(appointmentCard).join('')}<div class="policy-reminder"><strong>Appointment changes</strong><span>Call <a href="tel:+18328748680">+1 832-874-8680</a> if you cannot attend or are running late. Please cancel or reschedule at least 2 hours before your appointment.</span></div><div class="notice">Account sign-in, real reminders, and live appointment management will connect to the future backend.</div></section></div></div>`;
}
async function render(focus = false) {
  const renderId = ++state.renderId;
  let route = location.hash.slice(1) || 'home';
  if (['shop-info', 'service-menu'].includes(route)) route = 'home';
  if (['dates', 'review'].includes(route) && !selectedService()) { go('services'); return false; }
  if (route === 'review' && (!state.date || state.time === null)) { go('dates'); return false; }
  if (route === 'confirmation' && !state.confirmation) { go('services'); return false; }
  let html;
  if (route === 'services') html = servicesView();
  else if (route === 'dates') html = await datesView(renderId);
  else if (route === 'review') html = reviewView();
  else if (route === 'confirmation') html = confirmationView();
  else if (route === 'profile') html = await profileView();
  else html = homeView();
  if (renderId !== state.renderId || html === null) return false;
  main.innerHTML = html;
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === route || link.dataset.nav === 'services' && ['dates', 'review', 'confirmation'].includes(route);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.title = `Rolaz Cutz — ${({ services: 'Select service', dates: 'Date & time', review: 'Your details', confirmation: 'Demo confirmation', profile: 'My appointments' })[route] || 'The shop'} · Approval prototype`;
  if (['#shop-info', '#service-menu'].includes(location.hash)) scrollToHomeSection(location.hash);
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
  if (target.matches('a[href="#shop-info"], a[href="#service-menu"]')) {
    event.preventDefault();
    const sectionHash = target.getAttribute('href');
    if (location.hash === sectionHash) scrollToHomeSection(sectionHash);
    else location.hash = sectionHash;
    return;
  }
  try {
    if (target.dataset.service) { event.preventDefault(); startBooking(target.dataset.service); }
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
      const appointments = await MockCustomerApi.listAppointments();
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
      target.disabled = true;
      await MockCustomerApi.cancelAppointment({ id: target.dataset.confirmCancel });
      await render();
      main.focus({ preventScroll: true });
      announce('Demo appointment canceled. No real booking was changed.');
    }
    else if (target.dataset.reschedule) {
      const appointments = await MockCustomerApi.listAppointments();
      const appointment = appointments.find(item => item.id === target.dataset.reschedule);
      restoreBookingSelection(appointment, appointment.id);
      go('dates');
    }
  } catch (error) { announce(error.message); }
});
document.addEventListener('submit', async event => {
  if (!['checkout-form', 'profile-form'].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const customer = { name: data.get('name'), email: data.get('email'), phone: data.get('phone') };
  if (form.id === 'profile-form') {
    const button = form.querySelector('button');
    button.disabled = true;
    try { state.profile = await MockCustomerApi.updateProfile(customer); await render(); announce('Demo profile saved for this page session.'); }
    catch (error) { document.querySelector('#profile-error').textContent = error.message; button.disabled = false; }
    return;
  }
  const button = document.querySelector('[form="checkout-form"]');
  button.disabled = true;
  button.textContent = 'Creating demo appointment…';
  try {
    const policyAccepted = data.get('policyAccepted') === 'on';
    const prototypeAcknowledged = data.get('acknowledge') === 'on';
    if (!policyAccepted || !prototypeAcknowledged) throw new Error('Please accept the policy and prototype acknowledgments before continuing.');
    state.confirmation = await MockCustomerApi.createAppointment({ serviceId: state.serviceId, upgradeIds: state.upgradeIds, date: state.date, time: state.time, customer, paymentMethod: data.get('payment'), policyAccepted, replacesId: state.replacesId });
    state.profile = await MockCustomerApi.getProfile();
    state.replacesId = null;
    go('confirmation');
  } catch (error) {
    document.querySelector('#checkout-error').textContent = error.message;
    button.disabled = false;
    button.textContent = 'Confirm demo appointment';
  }
});
window.addEventListener('hashchange', () => render(true));
(async function init() {
  main.innerHTML = '<div class="shell loading" role="status">Getting the shop ready…</div>';
  [state.services, state.upgrades, state.business, state.profile] = await Promise.all([MockCustomerApi.getServices(), MockCustomerApi.getUpgrades(), MockCustomerApi.getBusiness(), MockCustomerApi.getProfile()]);
  await render();
})();
