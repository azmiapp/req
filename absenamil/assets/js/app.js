let sessionToken =
  localStorage.getItem(
    'absen_session'
  ) || '';

let currentUser =
  null;

let currentLocation =
  null;

let cameraStream =
  null;

let facingMode =
  'user';

let attendanceType =
  'MASUK';

let capturedDataUrl =
  '';

let loginProcessing =
  false;

let attendanceProcessing =
  false;

let firebaseApp =
  null;

let firebaseAuth =
  null;

let firebaseGoogleProvider =
  null;

let firebaseReady =
  false;

// ============================================================
// CLIENT PERFORMANCE CACHE
// Mengurangi request berulang ke Google Apps Script.
// ============================================================
const CLIENT_CACHE = Object.create(null);
const CLIENT_INFLIGHT = Object.create(null);
const CACHE_TTL = {
  profile: 5 * 60 * 1000,
  history: 20 * 1000,
  requests: 30 * 1000,
  assignments: 30 * 1000,
  location: 5 * 60 * 1000
};
let locationInFlight = false;
let lastLocationAt = 0;
let locationLookupKey = '';

function cacheGet_(key, ttl) {
  const item = CLIENT_CACHE[key];
  if (!item) return null;
  if (Date.now() - item.at > ttl) {
    delete CLIENT_CACHE[key];
    return null;
  }
  return item.value;
}

function cacheSet_(key, value) {
  CLIENT_CACHE[key] = { at: Date.now(), value: value };
  return value;
}

function cacheClear_(key) {
  if (key) delete CLIENT_CACHE[key];
}

function cacheClearAll_() {
  Object.keys(CLIENT_CACHE).forEach(k => delete CLIENT_CACHE[k]);
}

function requestPromise_(action, extra = {}) {
  return new Promise(resolve => request(action, extra, resolve));
}

const $ =
  id =>
    document.getElementById(id);

async function validConfig(){

  const f =
    CONFIG.FIREBASE_CONFIG || {};

  return (

    typeof CONFIG.WEB_APP_URL ===
      'string'

    &&

    CONFIG.WEB_APP_URL.startsWith(
      'https://'
    )

    &&

    f.apiKey

    &&

    !f.apiKey.startsWith(
      'PASTE_'
    )

    &&

    f.projectId

    &&

    !f.projectId.startsWith(
      'PASTE_'
    )

    &&

    f.appId

    &&

    !f.appId.startsWith(
      'PASTE_'
    )

  );

}

function showToast(message){

  const toast =
    $('toast');

  if(!toast){
    return;
  }

  toast.textContent =
    String(
      message || ''
    );

  toast.classList.add(
    'show'
  );

  clearTimeout(
    window.toastTimer
  );

  window.toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          'show'
        );

      },
      3500
    );

}

function loading(
  on,
  title='Memproses...',
  text='Mohon tunggu sebentar.'
){

  $('loadingTitle')
    .textContent =
    title;

  $('loadingText')
    .textContent =
    text;

  $('loading')
    .classList.toggle(
      'show',
      !!on
    );

}

async function initFirebase(){

  loading(
    true,
    'Menyiapkan Login',
    'Menghubungkan sistem autentikasi...'
  );

  if(
    !await validConfig()
  ){

    loading(false);

    showToast(
      'Konfigurasi Firebase belum lengkap.'
    );

    return false;

  }

  try{

    const {
      initializeApp,
      getApps
    } =
      await import(
        'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'
      );

    const {
      getAuth,
      GoogleAuthProvider,
      onAuthStateChanged,
      getRedirectResult
    } =
      await import(
        'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
      );

    firebaseApp =
      getApps().length
        ? getApps()[0]
        : initializeApp(
            CONFIG.FIREBASE_CONFIG
          );

    firebaseAuth =
      getAuth(
        firebaseApp
      );

    firebaseGoogleProvider =
      new GoogleAuthProvider();

    firebaseGoogleProvider
      .setCustomParameters({
        prompt:'select_account'
      });

    firebaseReady =
      true;

    try{

      await getRedirectResult(
        firebaseAuth
      );

    }catch(error){

      console.warn(
        'Redirect result:',
        error
      );

    }

    onAuthStateChanged(
      firebaseAuth,
      async user => {

        if(
          !user ||
          loginProcessing ||
          sessionToken
        ){

          return;

        }

        try{

          loginProcessing =
            true;

          loading(
            true,
            'Memverifikasi Akun',
            'Menghubungkan akun Google dengan data pegawai...'
          );

          await completeFirebaseLogin_(
            user
          );

        }catch(error){

          console.error(
            error
          );

          loginProcessing =
            false;

          loading(false);

          showToast(
            error.message ||
            'Login Firebase gagal.'
          );

        }

      }
    );

    loading(false);

    return true;

  }catch(error){

    console.error(
      'Firebase Init Error:',
      error
    );

    loading(false);

    showToast(
      'Firebase gagal dimuat. Periksa Authorized Domains.'
    );

    return false;

  }

}

async function loginWithFirebase(){

  if(
    loginProcessing
  ){
    return;
  }

  if(
    !firebaseReady
  ){

    const ready =
      await initFirebase();

    if(!ready){
      return;
    }

  }

  loginProcessing =
    true;

  const button =
    $('firebaseLoginButton');

  if(button){

    button.disabled =
      true;

    button.innerHTML = `
      <span class="material-symbols-rounded">
        progress_activity
      </span>
      Menghubungkan...
    `;

  }

  loading(
    true,
    'Memverifikasi Akun',
    'Menghubungkan akun Google dengan data pegawai...'
  );

  try{

    const {
      signInWithPopup,
      signInWithRedirect
    } =
      await import(
        'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
      );

    let credentialResult;

    try{

      credentialResult =
        await signInWithPopup(
          firebaseAuth,
          firebaseGoogleProvider
        );

    }catch(popupError){

      console.warn(
        'Popup login gagal:',
        popupError
      );

      if(

        popupError?.code ===
          'auth/popup-blocked'

        ||

        popupError?.code ===
          'auth/popup-closed-by-user'

        ||

        popupError?.code ===
          'auth/cancelled-popup-request'

      ){

        loading(
          true,
          'Membuka Login Google',
          'Silakan pilih akun Google Anda...'
        );

        await signInWithRedirect(
          firebaseAuth,
          firebaseGoogleProvider
        );

        return;

      }

      throw popupError;

    }

    if(
      credentialResult?.user
    ){

      await completeFirebaseLogin_(
        credentialResult.user
      );

    }

  }catch(error){

    loginProcessing =
      false;

    restoreLoginButton_();

    loading(false);

    console.error(
      'Firebase Login Error:',
      error
    );

    showToast(
      firebaseErrorMessage_(error)
    );

  }

}

function restoreLoginButton_(){

  const button =
    $('firebaseLoginButton');

  if(!button){
    return;
  }

  button.disabled =
    false;

  button.innerHTML = `
    <span class="google-icon">
      G
    </span>

    <span>
      Masuk dengan Google
    </span>
  `;

}

async function completeFirebaseLogin_(user){

  if(!user){

    throw new Error(
      'Akun Firebase tidak ditemukan.'
    );

  }

  const requestId =
    makeId();

  loading(
    true,
    'Memverifikasi Akun',
    'Menghubungkan akun Google dengan data pegawai...'
  );

  const firebaseIdToken =
    await user.getIdToken(
      true
    );

  const sent =
    await postForm({

      action:
        'firebaseLogin',

      requestId:
        requestId,

      firebaseIdToken:
        firebaseIdToken

    });

  if(!sent){

    throw new Error(
      'Tidak dapat mengirim data login ke server.'
    );

  }

  poll(
    requestId,
    result => {

      loginProcessing =
        false;

      restoreLoginButton_();

      if(
        !result ||
        !result.ok
      ){

        loading(false);

        showToast(
          result?.error ||
          'Login gagal. Pastikan akun terdaftar.'
        );

        return;

      }

      sessionToken =
        result.sessionToken ||
        '';

      if(!sessionToken){

        loading(false);

        showToast(
          'Server tidak memberikan sesi login.'
        );

        return;

      }

      localStorage.setItem(
        'absen_session',
        sessionToken
      );

      currentUser =
        result.user ||
        null;

      if (currentUser) cacheSet_('profile', currentUser);

      showApp();

      // Tampilkan aplikasi segera. Data utama dimuat bertahap di background.
      loading(false);
      refreshAll({ initial: true });

    }
  );

}

function firebaseErrorMessage_(error){

  const code =
    String(
      error?.code || ''
    );

  const messages = {

    'auth/popup-blocked':
      'Popup login diblokir browser. Izinkan popup lalu coba lagi.',

    'auth/popup-closed-by-user':
      'Jendela login ditutup sebelum selesai.',

    'auth/cancelled-popup-request':
      'Proses login sedang berjalan.',

    'auth/unauthorized-domain':
      'Domain aplikasi belum ditambahkan ke Authorized Domains Firebase.',

    'auth/operation-not-allowed':
      'Login Google belum diaktifkan di Firebase Authentication.',

    'auth/network-request-failed':
      'Koneksi internet bermasalah. Periksa jaringan Anda.'

  };

  return (
    messages[code] ||
    error?.message ||
    'Login Firebase gagal.'
  );

}

function makeId(){

  if(
    window.crypto &&
    crypto.randomUUID
  ){

    return crypto
      .randomUUID()
      .replaceAll(
        '-',
        ''
      );

  }

  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now().toString(36)
  );

}

async function postForm(fields){

  const body =
    new URLSearchParams();

  Object.entries(fields)
    .forEach(
      ([key,value]) => {

        body.append(
          key,
          value ?? ''
        );

      }
    );

  try{

    await fetch(
      CONFIG.WEB_APP_URL,
      {

        method:'POST',

        mode:'no-cors',

        headers:{
          'Content-Type':
            'application/x-www-form-urlencoded;charset=UTF-8'
        },

        body:
          body.toString(),

        redirect:'follow',

        keepalive:true

      }
    );

    return true;

  }catch(error){

    console.error(
      'POST Apps Script gagal:',
      error
    );

    try{

      const form =
        document.createElement(
          'form'
        );

      form.method =
        'POST';

      form.action =
        CONFIG.WEB_APP_URL;

      form.target =
        'postFrame';

      form.style.display =
        'none';

      Object.entries(fields)
        .forEach(
          ([key,value]) => {

            const input =
              document.createElement(
                'input'
              );

            input.type =
              'hidden';

            input.name =
              key;

            input.value =
              value ?? '';

            form.appendChild(
              input
            );

          }
        );

      document.body.appendChild(
        form
      );

      form.submit();

      setTimeout(
        () => {

          try{
            form.remove();
          }catch(e){}

        },
        1000
      );

      return true;

    }catch(fallbackError){

      console.error(
        'Fallback POST gagal:',
        fallbackError
      );

      return false;

    }

  }

}

function poll(
  requestId,
  onDone,
  tries = 0
){
  const MAX_TRIES = 28;
  const delays = [120, 180, 250, 350, 450, 600];
  const cb = 'cb_' + makeId();
  let finished = false;
  let timer = null;

  function cleanup(){
    if (timer) clearTimeout(timer);
    try { delete window[cb]; } catch(e) {}
    const oldScript = document.getElementById('jsonp_' + cb);
    if (oldScript) oldScript.remove();
  }

  function finish(result){
    if (finished) return;
    finished = true;
    cleanup();
    onDone(result);
  }

  function retry(nextTry, delay){
    if (finished) return;
    if (nextTry >= MAX_TRIES) {
      finish({ ok:false, error:'Waktu menunggu respons server habis.' });
      return;
    }
    try { delete window[cb]; } catch(e) {}
    const currentScript = document.getElementById('jsonp_' + cb);
    if (currentScript) currentScript.remove();
    timer = setTimeout(() => poll(requestId, onDone, nextTry), delay);
  }

  window[cb] = function(data){
    if (finished) return;

    if (data && data.state === 'DONE') {
      finish(data.result || data);
      return;
    }

    if (data && data.state === 'NOT_FOUND' && tries >= MAX_TRIES) {
      finish({ ok:false, error:data.error || 'Request tidak ditemukan.' });
      return;
    }

    // Backend Apps Script memakai CacheService untuk status.
    // Poll cepat di awal, lalu melambat agar tidak membebani endpoint.
    retry(tries + 1, delays[Math.min(tries, delays.length - 1)]);
  };

  const script = document.createElement('script');
  script.id = 'jsonp_' + cb;
  script.src = CONFIG.WEB_APP_URL +
    '?action=status' +
    '&requestId=' + encodeURIComponent(requestId) +
    '&callback=' + encodeURIComponent(cb) +
    '&_=' + Date.now();

  script.onerror = function(){
    if (finished) return;
    try { delete window[cb]; } catch(e) {}
    script.remove();
    retry(tries + 1, Math.min(900, 250 + tries * 75));
  };

  document.body.appendChild(script);
}

function request(
  action,
  extra,
  onDone
){
  const callback = typeof onDone === 'function' ? onDone : function(){};
  const payloadExtra = extra || {};
  const requestId = makeId();
  const payload = Object.assign({
    action: action,
    requestId: requestId,
    sessionToken: sessionToken
  }, payloadExtra);

  // Read-only requests dapat dideduplikasi ketika halaman sedang memuat.
  const dedupeActions = {
    profile: true,
    history: true,
    requests: true,
    assignments: true,
    location: true
  };
  const dedupeKey = dedupeActions[action]
    ? action + ':' + JSON.stringify(payloadExtra)
    : '';

  if (dedupeKey && CLIENT_INFLIGHT[dedupeKey]) {
    CLIENT_INFLIGHT[dedupeKey].then(callback);
    return CLIENT_INFLIGHT[dedupeKey];
  }

  const promise = Promise.resolve()
    .then(() => postForm(payload))
    .then(sent => {
      if (sent === false) {
        return { ok:false, error:'Gagal mengirim permintaan ke server.' };
      }
      return new Promise(resolve => poll(requestId, resolve, 0));
    })
    .catch(error => ({
      ok:false,
      error:error?.message || 'Terjadi kesalahan komunikasi dengan server.'
    }));

  if (dedupeKey) {
    CLIENT_INFLIGHT[dedupeKey] = promise;
    promise.finally(() => {
      setTimeout(() => {
        if (CLIENT_INFLIGHT[dedupeKey] === promise) delete CLIENT_INFLIGHT[dedupeKey];
      }, 0);
    });
  }

  promise.then(callback);
  return promise;
}

function showApp(){

  $('loginView')
    .style.display =
    'none';

  $('appView')
    .style.display =
    'block';

  if(currentUser){

    renderUser(
      currentUser
    );

  }

}

function renderUser(u){

  if(!u){
    return;
  }

  const name =
    u.name ||
    '-';

  $('userName')
    .textContent =
    name;

  $('userPosition')
    .textContent =
    [
      u.position,
      u.role
    ]
    .filter(Boolean)
    .join(' • ') ||
    '-';

  $('profileName')
    .textContent =
    name;

  $('profilePosition')
    .textContent =
    u.position ||
    '-';

  $('profileNip')
    .textContent =
    u.nip ||
    '-';

  $('profileEmail')
    .textContent =
    u.email ||
    '-';

  $('profileRole')
    .textContent =
    u.role ||
    '-';

  $('profileStatus')
    .textContent =
    u.status ||
    '-';

  const photo =
    u.photo ||
    '';

  const avatar =
    photo ||
    avatarData(
      name
    );

  $('avatar').src =
    avatar;

  $('profilePhoto').src =
    avatar;

  updateGreeting_();

}

function updateGreeting_(){

  const hour =
    Number(
      new Intl.DateTimeFormat(
        'en-US',
        {

          hour:'2-digit',

          hour12:false,

          timeZone:
            'Asia/Jakarta'

        }
      )
      .format(
        new Date()
      )
    );

  let greeting =
    'Selamat Datang';

  if(hour >= 4 && hour < 11){

    greeting =
      'Selamat Pagi';

  }else if(
    hour >= 11 &&
    hour < 15
  ){

    greeting =
      'Selamat Siang';

  }else if(
    hour >= 15 &&
    hour < 18
  ){

    greeting =
      'Selamat Sore';

  }else{

    greeting =
      'Selamat Malam';

  }

  const el =
    $('greetingText');

  if(el){

    el.textContent =
      greeting;

  }

}

function avatarData(name){

  const initial =
    String(
      name ||
      '?'
    )
    .charAt(0)
    .toUpperCase();

  return (

    'data:image/svg+xml;charset=UTF-8,' +

    encodeURIComponent(

      `<svg
        xmlns="http://www.w3.org/2000/svg"
        width="200"
        height="200"
      >

        <rect
          width="100%"
          height="100%"
          rx="45"
          fill="#eaf3ff"
        />

        <text
          x="50%"
          y="58%"
          text-anchor="middle"
          font-family="Arial"
          font-size="82"
          font-weight="700"
          fill="#1769e0"
        >
          ${initial}
        </text>

      </svg>`

    )

  );

}

async function refreshAll(options = {}){
  if (!sessionToken) return;

  const initial = !!options.initial;

  // User hasil login sudah dikembalikan backend, jadi profile tidak perlu
  // diminta lagi pada startup. Profile hanya disegarkan bila belum ada.
  if (!currentUser || !cacheGet_('profile', CACHE_TTL.profile)) {
    request('profile', {}, r => {
      if (r?.ok && r.user) {
        currentUser = r.user;
        cacheSet_('profile', r.user);
        renderUser(currentUser);
      }
    });
  } else {
    renderUser(currentUser);
  }

  // GPS tidak menghalangi render Home.
  getLocation(false);

  const cachedHistory = cacheGet_('history', CACHE_TTL.history);
  if (cachedHistory) {
    renderHistory(cachedHistory);
  } else {
    request('history', { limit:60 }, r => {
      if (r?.ok) {
        const items = r.items || [];
        cacheSet_('history', items);
        renderHistory(items);
      }
    });
  }
}

function getLocation(force){
  if (!navigator.geolocation) {
    $('locationText').textContent = 'Browser tidak mendukung GPS';
    $('accuracyText').textContent = 'Gunakan browser yang mendukung lokasi.';
    return Promise.resolve(null);
  }

  if (!force && currentLocation && Date.now() - lastLocationAt < CACHE_TTL.location) {
    return Promise.resolve(currentLocation);
  }

  if (locationInFlight) return Promise.resolve(currentLocation);
  locationInFlight = true;

  $('locationText').textContent = 'Mengambil lokasi...';
  $('accuracyText').textContent = 'Mohon izinkan lokasi pada browser.';

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        currentLocation = {
          latitude: Number(pos.coords.latitude),
          longitude: Number(pos.coords.longitude),
          accuracy: Number(pos.coords.accuracy)
        };
        lastLocationAt = Date.now();

        $('accuracyText').textContent =
          'Akurasi GPS: ' + Math.round(currentLocation.accuracy) + ' meter';

        // Jangan reverse-geocode berulang untuk titik yang sama.
        const key = currentLocation.latitude.toFixed(4) + ',' + currentLocation.longitude.toFixed(4);
        if (key === locationLookupKey) {
          locationInFlight = false;
          resolve(currentLocation);
          return;
        }
        locationLookupKey = key;

        const cached = cacheGet_('location:' + key, CACHE_TTL.location);
        if (cached) {
          Object.assign(currentLocation, cached);
          const area = [cached.district, cached.regency].filter(Boolean).join(', ');
          $('locationText').textContent = area || 'Area lokasi belum terdeteksi.';
          locationInFlight = false;
          resolve(currentLocation);
          return;
        }

        request('location', {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        }, r => {
          if (r?.ok) {
            const data = {
              district: r.district || '',
              regency: r.regency || '',
              province: r.province || ''
            };
            Object.assign(currentLocation, data);
            cacheSet_('location:' + key, data);
            $('locationText').textContent =
              [data.district, data.regency].filter(Boolean).join(', ') ||
              'Area lokasi belum terdeteksi.';
          } else {
            $('locationText').textContent = 'Area lokasi belum terdeteksi.';
          }
          locationInFlight = false;
          resolve(currentLocation);
        });
      },
      err => {
        currentLocation = null;
        locationInFlight = false;
        $('locationText').textContent = 'Lokasi belum tersedia';
        $('accuracyText').textContent = getLocationErrorMessage_(err);
        resolve(null);
      },
      {
        enableHighAccuracy: !!force,
        timeout: force ? 8000 : 5000,
        maximumAge: force ? 0 : 120000
      }
    );
  });
}

function getLocationErrorMessage_(err){

  if(!err){

    return 'Aktifkan izin lokasi.';

  }

  if(
    err.code === 1
  ){

    return 'Izin lokasi ditolak. Aktifkan lokasi browser.';

  }

  if(
    err.code === 2
  ){

    return 'Lokasi tidak tersedia. Pastikan GPS aktif.';

  }

  if(
    err.code === 3
  ){

    return 'Pengambilan lokasi terlalu lama. Coba lagi.';

  }

  return (
    err.message ||
    'Lokasi belum tersedia.'
  );

}

function updateClock(){

  const dateEl =
    $('dateText');

  const clockEl =
    $('clockText');

  if(
    !dateEl ||
    !clockEl
  ){

    return;

  }

  const now =
    new Date();

  dateEl.textContent =
    new Intl.DateTimeFormat(
      'id-ID',
      {

        weekday:'long',

        day:'2-digit',

        month:'long',

        year:'numeric',

        timeZone:
          'Asia/Jakarta'

      }
    )
    .format(now);

  const time =
    new Intl.DateTimeFormat(
      'id-ID',
      {

        hour:'2-digit',

        minute:'2-digit',

        second:'2-digit',

        hour12:false,

        timeZone:
          'Asia/Jakarta'

      }
    )
    .format(now);

  clockEl.innerHTML =
    escapeHtml(
      time
    ) +
    ' <span>WIB</span>';

  updateGreeting_();

}

setInterval(
  updateClock,
  1000
);

updateClock();

function formatAttendanceTime_(value){

  if(
    value === null ||
    value === undefined ||
    value === ''
  ){

    return '--:--';

  }

  const raw =
    String(value)
      .trim();

  const clockMatch =
    raw.match(
      /\b(\d{1,2}):(\d{2})(?::\d{2})?\b/
    );

  if(clockMatch){

    return (
      String(
        Number(
          clockMatch[1]
        )
      ).padStart(
        2,
        '0'
      ) +
      ':' +
      clockMatch[2]
    );

  }

  const shortMatch =
    raw.match(
      /^\s*(\d{1,2})[.: -](\d{2})\s*(?:WIB)?\s*$/i
    );

  if(shortMatch){

    return (
      String(
        Number(
          shortMatch[1]
        )
      ).padStart(
        2,
        '0'
      ) +
      ':' +
      shortMatch[2]
    );

  }

  const parsed =
    new Date(
      raw
    );

  if(
    !Number.isNaN(
      parsed.getTime()
    )
  ){

    return new Intl.DateTimeFormat(
      'en-GB',
      {

        timeZone:
          'Asia/Jakarta',

        hour:'2-digit',

        minute:'2-digit',

        hour12:false

      }
    )
    .format(
      parsed
    );

  }

  return '--:--';

}

function normalizeDate_(value){

  if(
    value === null ||
    value === undefined ||
    value === ''
  ){

    return '';

  }

  const raw =
    String(value)
      .trim();

  const iso =
    raw.match(
      /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/
    );

  if(iso){

    const y =
      Number(iso[1]);

    const m =
      Number(iso[2]);

    const d =
      Number(iso[3]);

    if(
      m >= 1 &&
      m <= 12 &&
      d >= 1 &&
      d <= 31
    ){

      return (
        y +
        '-' +
        String(m).padStart(2,'0') +
        '-' +
        String(d).padStart(2,'0')
      );

    }

  }

  const numeric =
    raw.match(
      /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/
    );

  if(numeric){

    let a =
      Number(
        numeric[1]
      );

    let b =
      Number(
        numeric[2]
      );

    const y =
      Number(
        numeric[3]
      );

    let day =
      a;

    let month =
      b;

    if(
      a <= 12 &&
      b > 12
    ){

      month =
        a;

      day =
        b;

    }

    if(
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ){

      return (
        y +
        '-' +
        String(month).padStart(2,'0') +
        '-' +
        String(day).padStart(2,'0')
      );

    }

  }

  const parsed =
    new Date(
      raw
    );

  if(
    !Number.isNaN(
      parsed.getTime()
    )
  ){

    const parts =
      new Intl.DateTimeFormat(
        'en-GB',
        {

          timeZone:
            'Asia/Jakarta',

          year:'numeric',

          month:'2-digit',

          day:'2-digit'

        }
      )
      .formatToParts(
        parsed
      );

    const get =
      type =>
        parts.find(
          x =>
            x.type === type
        )?.value || '';

    if(
      get('year') &&
      get('month') &&
      get('day')
    ){

      return (
        get('year') +
        '-' +
        get('month') +
        '-' +
        get('day')
      );

    }

  }

  return raw.slice(
    0,
    10
  );

}

function jakartaToday_(){

  const parts =
    new Intl.DateTimeFormat(
      'en-GB',
      {

        timeZone:
          'Asia/Jakarta',

        year:'numeric',

        month:'2-digit',

        day:'2-digit'

      }
    )
    .formatToParts(
      new Date()
    );

  const get =
    type =>
      parts.find(
        x =>
          x.type === type
      )?.value || '';

  return (
    get('year') +
    '-' +
    get('month') +
    '-' +
    get('day')
  );

}

function getDisplayDate_(value){

  const normalized =
    normalizeDate_(
      value
    );

  if(!normalized){

    return {
      day:'-',
      date:'-'
    };

  }

  const match =
    normalized.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if(!match){

    return {
      day:'-',
      date:String(
        value ||
        '-'
      )
    };

  }

  const year =
    Number(
      match[1]
    );

  const month =
    Number(
      match[2]
    );

  const day =
    Number(
      match[3]
    );

  const d =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  const dayName =
    new Intl.DateTimeFormat(
      'id-ID',
      {

        weekday:'long',

        timeZone:'UTC'

      }
    )
    .format(d);

  const longDate =
    new Intl.DateTimeFormat(
      'id-ID',
      {

        day:'2-digit',

        month:'long',

        year:'numeric',

        timeZone:'UTC'

      }
    )
    .format(d);

  return {

    day:
      dayName,

    date:
      longDate

  };

}

function attendanceTypeInfo_(type){

  const t =
    String(
      type ||
      ''
    )
    .trim()
    .toUpperCase();

  if(
    t === 'MASUK'
  ){

    return {

      label:
        'Absen Masuk',

      icon:
        'login',

      className:
        'masuk'

    };

  }

  if(
    t === 'PULANG'
  ){

    return {

      label:
        'Absen Pulang',

      icon:
        'logout',

      className:
        'pulang'

    };

  }

  return {

    label:
      type ||
      'Absensi',

    icon:
      'check_circle',

    className:
      'masuk'

  };

}

function renderTodayAttendanceCard_(item){

  const typeInfo =
    attendanceTypeInfo_(
      item.type
    );

  const dateInfo =
    getDisplayDate_(
      item.date
    );

  const location =
    [
      item.district,
      item.regency
    ]
    .filter(Boolean)
    .join(', ');

  const distance =
    item.distance !== undefined &&
    item.distance !== null &&
    item.distance !== '' &&
    isFinite(
      Number(
        item.distance
      )
    )
      ? (
          Math.round(
            Number(
              item.distance
            )
          ) +
          ' meter dari titik kantor'
        )
      : 'Jarak tidak tersedia';

  return `

    <div class="today-card ${typeInfo.className}">

      <div class="today-head">

        <div class="today-title">

          <div class="today-type-icon">

            <span class="material-symbols-rounded">
              ${escapeHtml(typeInfo.icon)}
            </span>

          </div>

          <span>
            ${escapeHtml(typeInfo.label)}
          </span>

        </div>

        <span class="today-status">
          Tercatat
        </span>

      </div>

      <div class="today-grid">

        <div class="today-info">

          <div class="today-label">
            Hari
          </div>

          <div class="today-value">
            ${escapeHtml(dateInfo.day)}
          </div>

        </div>

        <div class="today-info">

          <div class="today-label">
            Tanggal
          </div>

          <div class="today-value">
            ${escapeHtml(dateInfo.date)}
          </div>

        </div>

        <div class="today-info">

          <div class="today-label">
            Jam
          </div>

          <div class="today-value today-time">
            ${escapeHtml(
              formatAttendanceTime_(
                item.time
              )
            )}
            WIB
          </div>

        </div>

        <div class="today-info">

          <div class="today-label">
            Status
          </div>

          <div class="today-value">
            ${escapeHtml(
              typeInfo.label
            )}
          </div>

        </div>

        <div class="today-info full">

          <div class="today-label">
            Lokasi
          </div>

          <div class="today-value today-location">

            <span class="material-symbols-rounded">
              location_on
            </span>

            <span>

              ${
                escapeHtml(
                  location ||
                  'Lokasi tercatat'
                )
              }

              <div class="today-distance">
                ${escapeHtml(distance)}
              </div>

            </span>

          </div>

        </div>

      </div>

    </div>

  `;

}

function renderHistory(items){

  items =
    Array.isArray(items)
      ? items
      : [];

  const today =
    jakartaToday_();

  const todayItems =
    items
      .filter(
        x =>
          normalizeDate_(
            x.date
          ) === today
      )
      .sort(
        (a,b) =>
          String(
            a.time ||
            ''
          )
          .localeCompare(
            String(
              b.time ||
              ''
            )
          )
      );

  const masuk =
    todayItems.find(
      x =>
        String(
          x.type ||
          ''
        )
        .toUpperCase() ===
        'MASUK'
    );

  const pulang =
    todayItems.find(
      x =>
        String(
          x.type ||
          ''
        )
        .toUpperCase() ===
        'PULANG'
    );

  $('btnMasuk').disabled =
    !!masuk;

  $('btnPulang').disabled =
    !masuk ||
    !!pulang;

  if(
    masuk &&
    masuk.time
  ){

    $('arrivalTime').innerHTML =
      escapeHtml(
        formatAttendanceTime_(
          masuk.time
        )
      ) +
      ' <span>WIB</span>';

  }else{

    $('arrivalTime').innerHTML =
      '--:-- <span>WIB</span>';

  }

  const badge =
    $('statusBadge');

  if(
    masuk &&
    pulang
  ){

    badge.textContent =
      'Absensi Lengkap';

    badge.className =
      'status-badge ok';

    $('statusSymbol').innerHTML = `
      <span class="material-symbols-rounded">
        check_circle
      </span>
    `;

  }else if(masuk){

    badge.textContent =
      'Sudah Absen Masuk';

    badge.className =
      'status-badge ok';

    $('statusSymbol').innerHTML = `
      <span class="material-symbols-rounded">
        check_circle
      </span>
    `;

  }else{

    badge.textContent =
      'Belum Absen';

    badge.className =
      'status-badge';

    $('statusSymbol').innerHTML = `
      <span class="material-symbols-rounded">
        login
      </span>
    `;

  }

  if(
    todayItems.length
  ){

    $('todayHistory').innerHTML =
      todayItems
        .map(
          item =>
            renderTodayAttendanceCard_(
              item
            )
        )
        .join('');

  }else{

    $('todayHistory').innerHTML = `

      <div class="empty-today">

        <span class="material-symbols-rounded">
          event_available
        </span>

        Belum ada absensi hari ini.

        <br>

        Silakan lakukan Absen Masuk.

      </div>

    `;

  }

  if(
    items.length
  ){

    $('historyList').innerHTML =
      items
        .map(
          x => {

            const dateInfo =
              getDisplayDate_(
                x.date
              );

            const location =
              [
                x.district,
                x.regency
              ]
              .filter(Boolean)
              .join(', ');

            const distance =
              x.distance !== undefined &&
              x.distance !== null &&
              x.distance !== '' &&
              isFinite(
                Number(
                  x.distance
                )
              )
                ? (
                    Math.round(
                      Number(
                        x.distance
                      )
                    ) +
                    ' m'
                  )
                : '';

            const typeInfo =
              attendanceTypeInfo_(
                x.type
              );

            return `

              <div class="history-item">

                <div class="history-date-icon">

                  <span class="material-symbols-rounded">
                    ${escapeHtml(typeInfo.icon)}
                  </span>

                </div>

                <div class="history-main">

                  <div class="history-date">

                    ${escapeHtml(
                      dateInfo.date
                    )}

                  </div>

                  <div class="history-detail">

                    ${escapeHtml(
                      dateInfo.day
                    )}

                    •

                    ${escapeHtml(
                      typeInfo.label
                    )}

                    ${
                      location
                        ? ' • ' +
                          escapeHtml(
                            location
                          )
                        : ''
                    }

                  </div>

                </div>

                <div class="history-right">

                  <div class="history-time">

                    ${escapeHtml(
                      formatAttendanceTime_(
                        x.time
                      )
                    )}

                    WIB

                  </div>

                  <div class="history-distance">

                    ${escapeHtml(
                      distance
                    )}

                  </div>

                </div>

              </div>

            `;

          }
        )
        .join('');

  }else{

    $('historyList').innerHTML = `

      <div class="empty-today">

        <span class="material-symbols-rounded">
          history
        </span>

        Belum ada riwayat absensi.

      </div>

    `;

  }

}

function escapeHtml(value){

  return String(
    value ??
    ''
  )
  .replace(
    /[&<>"']/g,
    char =>
      ({

        '&':
          '&amp;',

        '<':
          '&lt;',

        '>':
          '&gt;',

        '"':
          '&quot;',

        "'":
          '&#039;'

      })[char]
  );

}

async function openCamera(type){

  if(
    attendanceProcessing
  ){

    return;

  }

  if(
    !currentLocation
  ){

    getLocation(true);

    showToast(
      'Lokasi sedang diambil. Tunggu sampai lokasi tersedia.'
    );

    return;

  }

  attendanceType =
    String(
      type ||
      'MASUK'
    )
    .toUpperCase();

  capturedDataUrl =
    '';

  $('cameraTitle')
    .textContent =
    attendanceType === 'MASUK'
      ? 'Absen Masuk'
      : 'Absen Pulang';

  resetCameraUI_();

  $('cameraModal')
    .classList.add(
      'show'
    );

  document.body.style.overflow =
    'hidden';

  try{

    await startCamera();

  }catch(error){

    console.error(
      'Camera error:',
      error
    );

    closeCamera();

    showToast(
      'Kamera tidak dapat dibuka. Pastikan izin kamera diberikan.'
    );

  }

}

function resetCameraUI_(){

  const video =
    $('video');

  const preview =
    $('preview');

  const capture =
    $('captureBtn');

  const submit =
    $('submitPhotoBtn');

  const switchButton =
    $('switchCameraBtn');

  if(video){

    video.style.display =
      'block';

  }

  if(preview){

    preview.style.display =
      'none';

    preview.removeAttribute(
      'src'
    );

  }

  if(capture){

    capture.disabled =
      false;

    capture.innerHTML = `
      <span class="material-symbols-rounded">
        photo_camera
      </span>
      Ambil Foto
    `;

  }

  if(submit){

    submit.disabled =
      false;

    submit.style.display =
      'none';

    submit.innerHTML = `
      <span class="material-symbols-rounded">
        how_to_reg
      </span>
      Gunakan Foto & Absen
    `;

  }

  if(switchButton){

    switchButton.disabled =
      false;

    switchButton.innerHTML = `
      <span class="material-symbols-rounded">
        flip_camera_android
      </span>
      Ganti Kamera
    `;

  }

}

async function startCamera(){

  if(
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ){

    throw new Error(
      'Browser tidak mendukung kamera.'
    );

  }

  stopCamera();

  let constraints = {

    video:{

      facingMode:{
        ideal:
          facingMode
      },

      width:{
        ideal:1280
      },

      height:{
        ideal:1280
      }

    },

    audio:false

  };

  try{

    cameraStream =
      await navigator.mediaDevices
        .getUserMedia(
          constraints
        );

  }catch(firstError){

    console.warn(
      'Kamera utama gagal:',
      firstError
    );

    try{

      cameraStream =
        await navigator.mediaDevices
          .getUserMedia({

            video:{
              facingMode:
                facingMode
            },

            audio:false

          });

    }catch(secondError){

      console.warn(
        'Fallback kamera gagal:',
        secondError
      );

      cameraStream =
        await navigator.mediaDevices
          .getUserMedia({

            video:true,

            audio:false

          });

    }

  }

  const video =
    $('video');

  video.srcObject =
    cameraStream;

  video.muted =
    true;

  video.playsInline =
    true;

  try{

    await video.play();

  }catch(error){

    console.warn(
      'Video play:',
      error
    );

  }

}

function stopCamera(){

  if(cameraStream){

    cameraStream
      .getTracks()
      .forEach(
        track => {

          try{

            track.stop();

          }catch(error){}

        }
      );

    cameraStream =
      null;

  }

  const video =
    $('video');

  if(video){

    try{

      video.pause();

    }catch(error){}

    video.srcObject =
      null;

  }

}

async function switchCamera(){

  if(
    attendanceProcessing
  ){

    return;

  }

  const previous =
    facingMode;

  facingMode =
    facingMode === 'user'
      ? 'environment'
      : 'user';

  const button =
    $('switchCameraBtn');

  if(button){

    button.disabled =
      true;

    button.innerHTML = `
      <span class="material-symbols-rounded">
        progress_activity
      </span>
      Membuka...
    `;

  }

  try{

    await startCamera();

  }catch(error){

    console.error(
      error
    );

    facingMode =
      previous;

    showToast(
      'Kamera tidak tersedia.'
    );

  }finally{

    if(button){

      button.disabled =
        false;

      button.innerHTML = `
        <span class="material-symbols-rounded">
          flip_camera_android
        </span>
        Ganti Kamera
      `;

    }

  }

}

function capturePhoto(){

  if(
    attendanceProcessing
  ){

    return;

  }

  const video =
    $('video');

  const canvas =
    $('canvas');

  if(
    !video ||
    !canvas
  ){

    showToast(
      'Komponen kamera belum siap.'
    );

    return;

  }

  if(
    !video.videoWidth ||
    !video.videoHeight
  ){

    showToast(
      'Kamera belum siap. Tunggu sebentar.'
    );

    return;

  }

  const maxWidth =
    800;

  const sourceWidth =
    video.videoWidth;

  const sourceHeight =
    video.videoHeight;

  const ratio =
    sourceHeight /
    sourceWidth;

  const width =
    Math.min(
      maxWidth,
      sourceWidth
    );

  const height =
    Math.round(
      width *
      ratio
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const ctx =
    canvas.getContext(
      '2d',
      {
        alpha:false
      }
    );

  if(!ctx){

    showToast(
      'Canvas kamera tidak tersedia.'
    );

    return;

  }

  ctx.imageSmoothingEnabled =
    true;

  ctx.imageSmoothingQuality =
    'high';

  ctx.drawImage(
    video,
    0,
    0,
    width,
    height
  );

  const MAX_CLIENT_BYTES =
    600 *
    1024;

  let quality =
    0.80;

  let dataUrl =
    '';

  for(
    let i = 0;
    i < 10;
    i++
  ){

    dataUrl =
      canvas.toDataURL(
        'image/jpeg',
        quality
      );

    const estimatedBytes =
      Math.floor(
        dataUrl.length *
        0.75
      );

    if(
      estimatedBytes <=
      MAX_CLIENT_BYTES
    ){

      break;

    }

    quality -=
      0.06;

    if(
      quality < 0.35
    ){

      quality =
        0.35;

    }

  }

  const validPhoto =
    /^data:image\/[^;]+;base64,/i
      .test(
        String(
          dataUrl ||
          ''
        )
      );

  if(!validPhoto){

    showToast(
      'Foto gagal diproses. Silakan ambil foto lagi.'
    );

    return;

  }

  const finalPhoto =
    String(
      dataUrl
    )
    .trim();

  if(
    !finalPhoto ||
    finalPhoto.length < 100
  ){

    showToast(
      'Foto belum berhasil disimpan.'
    );

    return;

  }

  capturedDataUrl =
    finalPhoto;

  $('preview').src =
    capturedDataUrl;

  $('video').style.display =
    'none';

  $('preview').style.display =
    'block';

  $('captureBtn').innerHTML = `
    <span class="material-symbols-rounded">
      replay
    </span>
    Ambil Ulang
  `;

  $('submitPhotoBtn').style.display =
    'flex';

  showToast(
    'Foto berhasil diambil. Periksa foto lalu tekan Gunakan Foto & Absen.'
  );

}

function closeCamera(){

  stopCamera();

  $('cameraModal')
    .classList.remove(
      'show'
    );

  document.body.style.overflow =
    '';

}

function submitAttendance(){

  if(
    attendanceProcessing
  ){

    return;

  }

  const photoToSend =
    String(
      capturedDataUrl ||
      ''
    )
    .trim();

  const validPhoto =
    /^data:image\/[^;]+;base64,/i
      .test(
        photoToSend
      );

  if(
    !photoToSend ||
    !validPhoto
  ){

    showToast(
      'Foto selfie belum siap. Silakan ambil foto terlebih dahulu.'
    );

    return;

  }

  const locationToSend =
    currentLocation
      ? {

          latitude:
            Number(
              currentLocation.latitude
            ),

          longitude:
            Number(
              currentLocation.longitude
            ),

          accuracy:
            Number(
              currentLocation.accuracy
            )

        }
      : null;

  if(
    !locationToSend ||

    !isFinite(
      locationToSend.latitude
    ) ||

    !isFinite(
      locationToSend.longitude
    ) ||

    !isFinite(
      locationToSend.accuracy
    )
  ){

    showToast(
      'Lokasi GPS belum siap. Tunggu sampai lokasi tersedia.'
    );

    return;

  }

  if(
    locationToSend.accuracy <= 0
  ){

    showToast(
      'Akurasi GPS belum valid. Silakan tunggu sebentar.'
    );

    return;

  }

  const typeToSend =
    attendanceType;

  attendanceProcessing =
    true;

  const submitButton =
    $('submitPhotoBtn');

  const captureButton =
    $('captureBtn');

  const switchButton =
    $('switchCameraBtn');

  if(submitButton){

    submitButton.disabled =
      true;

    submitButton.innerHTML = `
      <span class="material-symbols-rounded">
        progress_activity
      </span>
      Menyimpan Absensi...
    `;

  }

  if(captureButton){

    captureButton.disabled =
      true;

  }

  if(switchButton){

    switchButton.disabled =
      true;

  }

  const photoBackup =
    photoToSend;

  closeCamera();

  loading(
    true,
    'Menyimpan Absensi',
    'Mengirim foto, lokasi, dan data absensi...'
  );

  request(
    'attendance',
    {

      type:
        typeToSend,

      latitude:
        locationToSend.latitude,

      longitude:
        locationToSend.longitude,

      accuracy:
        locationToSend.accuracy,

      photo:
        photoToSend

    },
    r => {

      loading(false);

      attendanceProcessing =
        false;

      if(
        !r ||
        !r.ok
      ){

        capturedDataUrl =
          photoBackup;

        showToast(
          r?.error ||
          'Absen gagal. Silakan coba lagi.'
        );

        restoreCameraAfterSubmitError_();

        $('preview').src =
          capturedDataUrl;

        $('preview').style.display =
          'block';

        $('video').style.display =
          'none';

        $('submitPhotoBtn').style.display =
          'flex';

        $('cameraModal')
          .classList.add(
            'show'
          );

        document.body.style.overflow =
          'hidden';

        return;

      }

      $('resultTime')
        .textContent =
        (
          r.time ||
          formatAttendanceTime_(
            new Date()
          )
        ) +
        ' WIB';

      $('resultDate')
        .textContent =
        r.date ||
        '-';

      $('resultLoc')
        .textContent =
        [
          r.district,
          r.regency
        ]
        .filter(Boolean)
        .join(', ') ||
        'Lokasi tercatat';

      $('resultPhoto')
        .src =
        photoBackup;

      $('resultModal')
        .classList.add(
          'show'
        );

      document.body.style.overflow =
        'hidden';

      capturedDataUrl =
        '';

      // Jangan memuat ulang profile + GPS setelah absensi. Cukup segarkan history.
      cacheClear_('history');
      request('history', {limit:60}, historyResult => {
        if (historyResult?.ok) {
          const items = historyResult.items || [];
          cacheSet_('history', items);
          renderHistory(items);
        }
      });

    }
  );

}

function restoreCameraAfterSubmitError_(){

  const submit =
    $('submitPhotoBtn');

  const capture =
    $('captureBtn');

  const switchButton =
    $('switchCameraBtn');

  if(submit){

    submit.disabled =
      false;

    submit.innerHTML = `
      <span class="material-symbols-rounded">
        how_to_reg
      </span>
      Gunakan Foto & Absen
    `;

  }

  if(capture){

    capture.disabled =
      false;

    capture.innerHTML = `
      <span class="material-symbols-rounded">
        replay
      </span>
      Ambil Ulang
    `;

  }

  if(switchButton){

    switchButton.disabled =
      false;

  }

}

function closeResult(){

  $('resultModal')
    .classList.remove(
      'show'
    );

  document.body.style.overflow =
    '';

  showPage(
    'home'
  );

}

function showPage(page){
  [
    'home','history','request','assignment','profile'
  ].forEach(p => {
    const pageEl = $(p + 'Page');
    if (pageEl) pageEl.classList.toggle('active', p === page);
  });

  ['Home','History','Request','Assignment','Profile'].forEach(p => {
    const navEl = $('nav' + p);
    if (navEl) navEl.classList.toggle('active', p.toLowerCase() === page);
  });

  window.scrollTo({ top:0, behavior:'auto' });

  if (page === 'history') {
    const cached = cacheGet_('history', CACHE_TTL.history);
    if (cached) {
      renderHistory(cached);
    } else {
      request('history', {limit:60}, r => {
        if (r?.ok) {
          const items = r.items || [];
          cacheSet_('history', items);
          renderHistory(items);
        }
      });
    }
  }

  if (page === 'request') loadRequests();
  if (page === 'assignment') loadAssignments();
}

async function logout(){

  if(
    attendanceProcessing
  ){

    showToast(
      'Tunggu proses absensi selesai.'
    );

    return;

  }

  loading(
    true,
    'Keluar dari Aplikasi',
    'Mengakhiri sesi login...'
  );

  try{

    if(
      firebaseAuth
    ){

      const {
        signOut
      } =
        await import(
          'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
        );

      await signOut(
        firebaseAuth
      );

    }

  }catch(error){

    console.warn(
      'Firebase signOut:',
      error
    );

  }

  localStorage.removeItem(
    'absen_session'
  );

  cacheClearAll_();
  currentLocation = null;
  lastLocationAt = 0;
  locationLookupKey = '';

  sessionToken =
    '';

  currentUser =
    null;

  capturedDataUrl =
    '';

  stopCamera();

  window.location.reload();

}



function esc_(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setRequestType(type){const t=String(type||'IZIN').toUpperCase();$('requestType').value=t;$('requestTabIzin')?.classList.toggle('active',t==='IZIN');$('requestTabCuti')?.classList.toggle('active',t==='CUTI');const end=$('requestEndField');if(end)end.style.display=t==='IZIN'?'none':'';const input=$('requestEndDate');if(input){input.required=t==='CUTI';if(t==='IZIN')input.value=$('requestStartDate')?.value||'';}}
function formatRequestDate(v){if(!v)return '-';const d=new Date(v+(String(v).length===10?'T00:00:00':''));return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(d);}
function requestStatusClass(s){s=String(s||'').toLowerCase();if(s.includes('setuju')||s.includes('approve')||s.includes('disetujui'))return'approved';if(s.includes('tolak')||s.includes('reject')||s.includes('ditolak'))return'rejected';return'pending';}
function renderRequests(items){const el=$('requestList');if(!el)return;if(!Array.isArray(items)||!items.length){el.innerHTML='<div class="empty-today">Belum ada pengajuan.</div>';return;}el.innerHTML=items.map(i=>{const type=String(i.type||i.jenis||'PENGAJUAN').toUpperCase(),status=i.status||i.Status||'Menunggu',start=i.startDate||i.tanggalMulai||i.date||'',end=i.endDate||i.tanggalSelesai||'',reason=i.reason||i.alasan||i.keperluan||'-';return `<div class="request-item"><div class="request-item-head"><div><div class="request-item-title">${esc_(type)}</div><div class="request-item-meta">${esc_(formatRequestDate(start))}${end&&end!==start?' — '+esc_(formatRequestDate(end)):''}</div></div><span class="request-status ${requestStatusClass(status)}">${esc_(status)}</span></div><div class="request-item-meta">${esc_(reason)}</div></div>`}).join('');}
async function loadRequests(){
  if(!sessionToken)return;
  const el=$('requestList');
  const cached=cacheGet_('requests',CACHE_TTL.requests);
  if(cached){renderRequests(cached);return;}
  if(el)el.innerHTML='<div class="empty-today">Memuat pengajuan...</div>';
  const r=await requestPromise_('requests',{limit:50});
  if(r?.ok){const items=r.items||r.data?.items||r.requests||[];cacheSet_('requests',items);renderRequests(items);}
  else if(el)el.innerHTML=`<div class="empty-today">${esc_(r?.error||'Belum dapat memuat pengajuan.')}</div>`;
}
async function submitRequestForm(e){e?.preventDefault();if(!sessionToken)return showToast('Sesi login tidak tersedia.');const type=$('requestType')?.value||'IZIN',startDate=$('requestStartDate')?.value||'',endDate=type==='IZIN'?startDate:($('requestEndDate')?.value||''),reason=$('requestReason')?.value.trim()||'';if(!startDate||!reason||(type==='CUTI'&&!endDate))return showToast('Lengkapi data pengajuan terlebih dahulu.');if(type==='CUTI'&&endDate<startDate)return showToast('Tanggal selesai tidak boleh sebelum tanggal mulai.');const b=$('submitRequestBtn');if(b){b.disabled=true;b.innerHTML='<span class="material-symbols-rounded">progress_activity</span>Mengirim...';}loading(true,'Mengirim Pengajuan','Menyimpan pengajuan Anda...');try{const r=await new Promise(resolve=>request('submitRequest',{type,startDate,endDate,reason},resolve));if(!r?.ok)throw new Error(r?.error||'Pengajuan gagal dikirim.');$('requestReason').value='';$('requestStartDate').value='';$('requestEndDate').value='';showToast('Pengajuan berhasil dikirim.');cacheClear_('requests');await loadRequests();}catch(err){console.error('SUBMIT REQUEST ERROR:',err);showToast(err?.message||'Pengajuan gagal dikirim.');}finally{loading(false);if(b){b.disabled=false;b.innerHTML='<span class="material-symbols-rounded">send</span>Kirim Pengajuan';}}}
function renderAssignments(items){const el=$('assignmentList');if(!el)return;if(!Array.isArray(items)||!items.length){el.innerHTML='<div class="empty-today">Belum ada penugasan.</div>';return;}el.innerHTML=items.map(i=>{const title=i.title||i.judul||i.assignment||i.penugasan||'Penugasan',desc=i.description||i.deskripsi||i.detail||'',date=i.date||i.tanggal||i.startDate||'',status=i.status||'';return `<div class="assignment-item"><div class="assignment-item-head"><div class="assignment-item-title">${esc_(title)}</div>${status?`<span class="request-status ${requestStatusClass(status)}">${esc_(status)}</span>`:''}</div>${desc?`<div class="assignment-item-desc">${esc_(desc)}</div>`:''}${date?`<div class="assignment-item-date"><span class="material-symbols-rounded">event</span>${esc_(formatRequestDate(date))}</div>`:''}</div>`}).join('');}
async function loadAssignments(){
  if(!sessionToken)return;
  const el=$('assignmentList');
  const cached=cacheGet_('assignments',CACHE_TTL.assignments);
  if(cached){renderAssignments(cached);return;}
  if(el)el.innerHTML='<div class="empty-today">Memuat penugasan...</div>';
  const r=await requestPromise_('assignments',{limit:50});
  if(r?.ok){const items=r.items||r.data?.items||r.assignments||[];cacheSet_('assignments',items);renderAssignments(items);}
  else if(el)el.innerHTML=`<div class="empty-today">${esc_(r?.error||'Belum dapat memuat penugasan.')}</div>`;
}

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    loading(
      true,
      'Menyiapkan Aplikasi',
      'Memuat sistem absensi...'
    );

    await initFirebase();

    if(
      sessionToken
    ){

      showApp();

      loading(
        true,
        'Memuat Absensi',
        'Memeriksa sesi login Anda...'
      );

      setTimeout(
        () => {

          refreshAll();

          setTimeout(
            () => {

              loading(false);

            },
            700
          );

        },
        200
      );

    }else{

      loading(false);

    }

  }
);

$('cameraModal')
  .addEventListener(
    'click',
    event => {

      if(
        event.target ===
        $('cameraModal')
      ){

        closeCamera();

      }

    }
  );

$('resultModal')
  .addEventListener(
    'click',
    event => {

      if(
        event.target ===
        $('resultModal')
      ){

        closeResult();

      }

    }
  );

document.addEventListener(
  'visibilitychange',
  () => {

    if(
      document.visibilityState ===
      'visible'
    ){

      updateClock();

    }

  }
);

window.addEventListener(
  'beforeunload',
  () => {

    stopCamera();

  }
);

document.addEventListener(
  'touchstart',
  () => {},
  {
    passive:true
  }
);

setRequestType('IZIN');
