// Where the customer site gets its data.
//   mode: 'http'  -> real back end: bookings are saved in the database and show up in the admin
//   mode: 'mock'  -> demo data only, nothing is saved
//
// apiBaseUrl is picked automatically:
//   On your computer (localhost / 127.0.0.1) -> the local back end started with "python crud.py".
//   Anywhere else (AWS)                      -> PRODUCTION_API_URL below.
//
// PRODUCTION_API_URL = '' means "same domain as this site" (CloudFront forwards /api/* to the
// back end). That is the recommended setup because the login cookie stays first-party.
// If the API has its own domain, put it here, e.g. 'https://api.yourdomain.com'.
(function () {
  var PRODUCTION_API_URL = '';
  var LOCAL_API_URL = 'http://127.0.0.1:5000';

  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

  window.ROLAZ_CUSTOMER_CONFIG = {
    mode: 'http',
    apiBaseUrl: isLocal ? LOCAL_API_URL : PRODUCTION_API_URL
  };
})();
