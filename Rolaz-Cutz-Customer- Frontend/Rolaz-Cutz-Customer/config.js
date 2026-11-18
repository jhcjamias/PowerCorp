// Customer site connection and booking settings.
(function () {
  'use strict';

  var PRODUCTION_API_URL = '';
  var LOCAL_API_URL = 'http://127.0.0.1:5000';
  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  var adminUrl = isLocal ? 'http://127.0.0.1:5173/admin/' : '/admin/';

  window.ROLAZ_CUSTOMER_CONFIG = Object.freeze({
    ...(window.ROLAZ_CUSTOMER_CONFIG || {}),
    mode: 'http',
    apiBaseUrl: isLocal ? LOCAL_API_URL : PRODUCTION_API_URL,
    bookingWindowDays: 30,
    adminUrl: adminUrl
  });

  window.addEventListener('DOMContentLoaded', function () {
    var adminLink = document.querySelector('#staff-admin-link');
    if (adminLink) adminLink.setAttribute('href', adminUrl);
  }, { once: true });
})();
