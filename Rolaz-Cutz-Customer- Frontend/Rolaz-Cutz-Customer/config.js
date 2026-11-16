// Where the customer site gets its data.
//   mode: 'http'  -> real back end (python crud.py): bookings are saved in the database and show up in the admin
//   mode: 'mock'  -> demo data only, nothing is saved
// Change apiBaseUrl when the back end is hosted somewhere other than your computer.
window.ROLAZ_CUSTOMER_CONFIG = { mode: 'http', apiBaseUrl: 'http://127.0.0.1:5000' };
