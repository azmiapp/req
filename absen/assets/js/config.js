window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwAx06c0c2tRDtJ-fSWEWGuCurQplwgM5yvelen--uKi7nNt6__EYBRovTuVQXxlXWDdA/exec',

  // Reverse geocoding untuk mendapatkan nama kecamatan.
  // Bisa diganti dengan endpoint geocoding milik sendiri.
  GEOCODE_URL: 'https://nominatim.openstreetmap.org/reverse',

  ACTION_MAP: {
    login:'login',
    logout:'logout',
    getMe:'dashboard',
    getDashboard:'dashboard',
    submitAttendance:'attendance',
    submitRequest:'request',
    getMyRequests:'myRequests',
    getPendingApprovals:'pending',
    approveManager:'managerApproval',
    approveSdm:'sdmApproval',
    getAttendanceHistory:'history',
    getEmployees:'employees'
  },

  TOKEN_KEY: 'baznas_token',
  USER_KEY: 'baznas_user',
  GEO_CACHE_MS: 5 * 60 * 1000
};