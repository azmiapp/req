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

let firebaseApp = null;
let firebaseAuth = null;
let firebaseGoogleProvider = null;
let firebaseReady = false;

// Mencegah callback token native diproses lebih dari sekali.
let nativeTokenProcessing = false;

// Firebase module hanya dimuat SATU KALI
let firebaseAuthModule = null;
let firebaseInitPromise = null;

// Mencegah firebaseLogin ke Apps Script terkirim 2x
let firebaseLoginRequestRunning = false;

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
let selectedHistoryMonth = '';
let historyItemsCache = [];

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

function restoreLoginButton_(){
  const button = $('firebaseLoginButton');
  if(!button) return;

  button.disabled = false;
  button.innerHTML = `
    <span class="google-icon">G</span>
    <span>Masuk dengan Google</span>
  `;
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

// ============================================================
// NATIVE ANDROID AUTH BRIDGE
// Pada APK, Google Sign-In dilakukan native Android lalu Firebase
// ID Token dikirim kembali ke halaman ini. Backend Apps Script tetap
// memakai endpoint firebaseLogin yang sama.
// ============================================================
window.onNativeFirebaseToken = async function(firebaseIdToken, uid, email, displayName){
  if(!firebaseIdToken){
    loginProcessing = false;
    restoreLoginButton_();
    loading(false);
    showToast('Token Firebase tidak diterima.');
    return;
  }

  if(loginProcessing && (!isNativeAndroid_() || nativeTokenProcessing)){
    return;
  }

  nativeTokenProcessing = true;
  loginProcessing = true;

  try{
    loading(true, 'Memverifikasi Akun', 'Menghubungkan akun Google dengan data pegawai...');

    const result = await firebaseLoginJsonp_(firebaseIdToken);

    if(!result || !result.ok){
      throw new Error(
        result?.error || result?.message ||
        'Login gagal. Pastikan akun terdaftar.'
      );
    }

    sessionToken = String(result.sessionToken || '');
    if(!sessionToken) throw new Error('Server tidak memberikan sesi login.');

    localStorage.setItem('absen_session', sessionToken);
    currentUser = result.user || {
      uid: uid || '',
      email: email || '',
      nama: displayName || '',
      displayName: displayName || ''
    };
    cacheSet_('profile', currentUser);

    nativeTokenProcessing = false;
    loginProcessing = false;
    showApp();
    loading(false);
    refreshAll({ initial: true });

  }catch(error){
    console.error('Native Firebase Login Error:', error);
    nativeTokenProcessing = false;
    loginProcessing = false;
    restoreLoginButton_();
    loading(false);
    showToast(error?.message || 'Login Firebase gagal.');
  }
};

function isNativeAndroid_(){
  return !!window.AndroidAuth;
}

async function initFirebase(){

  // Kalau Firebase sudah siap, jangan initialize/import lagi.
  if(
    firebaseReady &&
    firebaseAuth &&
    firebaseGoogleProvider
  ){
    return true;
  }

  // Kalau proses init sedang berjalan,
  // gunakan promise yang sama.
  if(firebaseInitPromise){
    return firebaseInitPromise;
  }

  firebaseInitPromise = (async () => {

    loading(
      true,
      'Menyiapkan Login',
      'Menghubungkan sistem autentikasi...'
    );

    if(!await validConfig()){

      loading(false);

      showToast(
        'Konfigurasi Firebase belum lengkap.'
      );

      return false;
    }

    try{

      // ========================================================
      // FIREBASE APP MODULE
      // ========================================================

      const firebaseAppModule =
        await import(
          'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'
        );

      // ========================================================
      // FIREBASE AUTH MODULE
      // HANYA IMPORT SEKALI
      // ========================================================

      if(!firebaseAuthModule){

        firebaseAuthModule =
          await import(
            'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
          );

      }

      const {
        initializeApp,
        getApps
      } =
        firebaseAppModule;

      const {
        getAuth,
        GoogleAuthProvider,
        onAuthStateChanged,
        getRedirectResult
      } =
        firebaseAuthModule;

      // ========================================================
      // FIREBASE APP
      // ========================================================

      firebaseApp =
        getApps().length
          ? getApps()[0]
          : initializeApp(
              CONFIG.FIREBASE_CONFIG
            );

      // ========================================================
      // FIREBASE AUTH
      // ========================================================

      firebaseAuth =
        getAuth(
          firebaseApp
        );

      // ========================================================
      // GOOGLE PROVIDER
      // ========================================================

      firebaseGoogleProvider =
        new GoogleAuthProvider();

      firebaseGoogleProvider
        .setCustomParameters({
          prompt:'select_account'
        });

      firebaseReady = true;

      // ========================================================
      // REDIRECT RESULT
      // ========================================================

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

      // ========================================================
      // AUTH STATE
      //
      // PENTING:
      // onAuthStateChanged TIDAK langsung mengirim
      // firebaseLogin ke Apps Script kalau loginWithFirebase
      // sedang menangani hasil login.
      // ========================================================

      onAuthStateChanged(
        firebaseAuth,
        async user => {

          if(
            !user ||
            sessionToken ||
            firebaseLoginRequestRunning
          ){
            return;
          }

          // Jangan jalankan login otomatis ketika
          // proses login tombol sedang berjalan.
          if(loginProcessing){
            return;
          }

          try{

            loginProcessing = true;

            firebaseLoginRequestRunning = true;

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
              'Firebase Auth State Error:',
              error
            );

            loginProcessing = false;

            showToast(
              error?.message ||
              'Login Firebase gagal.'
            );

          }finally{

            firebaseLoginRequestRunning = false;

            loading(false);

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

      firebaseReady = false;

      firebaseAuth = null;
      firebaseGoogleProvider = null;

      loading(false);

      showToast(
        'Firebase gagal dimuat. Periksa Authorized Domains.'
      );

      return false;

    }

  })();

  try{

    return await firebaseInitPromise;

  }finally{

    firebaseInitPromise = null;

  }

}

/**
 * Mengirim Firebase ID token ke Apps Script dan menunggu hasil login.
 *
 * Backend lama menggunakan pola POST -> requestId -> status polling.
 * Karena itu login Firebase menggunakan mekanisme request() yang sama
 * dengan endpoint lainnya. Ini juga menghindari masalah CORS/no-cors.
 */
async function firebaseLoginJsonp_(firebaseIdToken){
  const token = String(firebaseIdToken || '').trim();

  if(!token){
    throw new Error('Token Firebase tidak tersedia.');
  }

  // Login Firebase memakai endpoint GET + JSONP.
  // Backend doGet(action=firebaseLogin) memang mengembalikan
  // hasil login secara langsung, sehingga TIDAK boleh memakai
  // POST -> requestId -> polling status.
  return await new Promise((resolve, reject) => {
    const cb = 'firebase_login_' + makeId();
    const scriptId = 'jsonp_' + cb;
    let finished = false;
    let timeout = null;

    function cleanup(){
      if(timeout) clearTimeout(timeout);
      try { delete window[cb]; } catch(e) {}
      const node = document.getElementById(scriptId);
      if(node) node.remove();
    }

    function finish(fn, value){
      if(finished) return;
      finished = true;
      cleanup();
      fn(value);
    }

    window[cb] = function(data){
      finish(resolve, data || {
        ok:false,
        error:'Server tidak mengembalikan respons login.'
      });
    };

    const script = document.createElement('script');
    script.id = scriptId;
    script.src =
      CONFIG.WEB_APP_URL +
      '?action=firebaseLogin' +
      '&firebaseIdToken=' + encodeURIComponent(token) +
      '&callback=' + encodeURIComponent(cb) +
      '&_=' + Date.now();

    script.onerror = function(){
      finish(reject, new Error(
        'Tidak dapat terhubung ke server login.'
      ));
    };

    timeout = setTimeout(function(){
      finish(reject, new Error(
        'Server login tidak memberikan respons. Periksa URL Web App dan koneksi internet.'
      ));
    }, 20000);

    document.body.appendChild(script);
  });
}

async function loginWithFirebase(){

  if(loginProcessing){
    return;
  }

  // ==========================================================
  // NATIVE ANDROID
  // ==========================================================

  if(isNativeAndroid_()){

    loginProcessing = true;

    const button =
      $('firebaseLoginButton');

    if(button){

      button.disabled = true;

      button.innerHTML = `
        <span class="material-symbols-rounded">
          progress_activity
        </span>
        Menghubungkan...
      `;

    }

    loading(
      true,
      'Login Google',
      'Membuka login Google Android...'
    );

    try{

      window.AndroidAuth.signIn();

    }catch(error){

      loginProcessing = false;

      restoreLoginButton_();

      loading(false);

      showToast(
        error?.message ||
        'Login Google Android gagal.'
      );

    }

    return;
  }

  // ==========================================================
  // WEB
  // ==========================================================

  if(!firebaseReady){

    const ready =
      await initFirebase();

    if(!ready){
      return;
    }

  }

  if(
    !firebaseAuth ||
    !firebaseGoogleProvider ||
    !firebaseAuthModule
  ){

    showToast(
      'Firebase belum siap. Silakan coba lagi.'
    );

    return;

  }

  loginProcessing = true;

  const button =
    $('firebaseLoginButton');

  if(button){

    button.disabled = true;

    button.innerHTML = `
      <span class="material-symbols-rounded">
        progress_activity
      </span>
      Menghubungkan...
    `;

  }

  loading(
    true,
    'Login Google',
    'Menghubungkan akun Google...'
  );

  try{

    const {
      signInWithPopup,
      signInWithRedirect
    } =
      firebaseAuthModule;

    // ========================================================
    // LOGIN GOOGLE
    // ========================================================

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

      const popupCode =
        String(
          popupError?.code ||
          ''
        );

      const useRedirect =
        popupCode === 'auth/popup-blocked' ||
        popupCode === 'auth/popup-closed-by-user' ||
        popupCode === 'auth/cancelled-popup-request' ||
        popupCode === 'auth/popup-operation-not-supported' ||
        popupCode === 'auth/web-storage-unsupported' ||
        popupCode === 'auth/internal-error';

      if(useRedirect){

        loading(
          true,
          'Membuka Login Google',
          'Silakan pilih akun Google Anda...'
        );

        // Redirect akan ditangani oleh initFirebase()
        // melalui getRedirectResult().
        await signInWithRedirect(
          firebaseAuth,
          firebaseGoogleProvider
        );

        return;

      }

      throw popupError;

    }

    // ========================================================
    // PENTING
    //
    // Jangan menunggu onAuthStateChanged untuk login kedua.
    // Kita proses hasil popup di sini.
    // ========================================================

    if(
      credentialResult?.user
    ){

      // Kunci supaya onAuthStateChanged tidak
      // mengirim firebaseLogin kedua.
      firebaseLoginRequestRunning = true;

      try{

        await completeFirebaseLogin_(
          credentialResult.user
        );

      }finally{

        firebaseLoginRequestRunning = false;

      }

    }

  }catch(error){

    loginProcessing = false;

    restoreLoginButton_();

    loading(false);

    console.error(
      'Firebase Login Error:',
      error
    );

    showToast(
      firebaseErrorMessage_(
        error
      )
    );

  }

}

async function completeFirebaseLogin_(user){

  if(!user){

    throw new Error(
      'Akun Firebase tidak ditemukan.'
    );

  }

  // Jangan kirim firebaseLogin dua kali.
  if(
    firebaseLoginRequestRunning &&
    !loginProcessing
  ){

    return;

  }

  loading(
    true,
    'Memverifikasi Akun',
    'Menghubungkan akun Google dengan data pegawai...'
  );

  try{

    const firebaseIdToken =
      await user.getIdToken(true);

    if(!firebaseIdToken){

      throw new Error(
        'Token Firebase tidak tersedia.'
      );

    }

    // ========================================================
    // SATU REQUEST SAJA KE APPS SCRIPT
    // ========================================================

    const result =
      await firebaseLoginJsonp_(
        firebaseIdToken
      );

    if(
      !result ||
      !result.ok
    ){

      throw new Error(
        result?.error ||
        result?.message ||
        'Login gagal. Pastikan akun terdaftar.'
      );

    }

    const newSessionToken =
      String(
        result.sessionToken ||
        ''
      );

    if(!newSessionToken){

      throw new Error(
        'Server tidak memberikan sesi login.'
      );

    }

    // ========================================================
    // SIMPAN SESSION
    // ========================================================

    sessionToken =
      newSessionToken;

    localStorage.setItem(
      'absen_session',
      sessionToken
    );

    currentUser =
      result.user ||
      null;

    if(currentUser){

      cacheSet_(
        'profile',
        currentUser
      );

    }

    // ========================================================
    // TAMPILKAN APP
    // ========================================================

    showApp();

    loading(false);

    // Login selesai.
    loginProcessing = false;

    restoreLoginButton_();

    // Data dashboard dimuat setelah UI tampil.
    setTimeout(
      () => {

        refreshAll({
          initial:true
        });

      },
      0
    );

  }catch(error){

    loginProcessing = false;

    restoreLoginButton_();

    loading(false);

    throw error;

  }

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

        keepalive:false

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

  setAdminAssignmentVisibility_();
  setAdminRequestVisibility_();

  const localPhoto = currentUser && currentUser.uid
    ? localStorage.getItem('absen_profile_photo_' + currentUser.uid) || ''
    : '';

  const photo =
    localPhoto ||
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
    request('history', { limit:500 }, r => {
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
        timeout: force ? 5000 : 2500,
        maximumAge: force ? 15000 : 120000
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

  items = Array.isArray(items) ? items : [];
  historyItemsCache = items.slice();

  const today = jakartaToday_();
  const todayItems = items
    .filter(x => normalizeDate_(x.date) === today)
    .sort((a,b) => String(a.time || '').localeCompare(String(b.time || '')));

  const masuk = todayItems.find(x => String(x.type || '').toUpperCase() === 'MASUK');
  const pulang = todayItems.find(x => String(x.type || '').toUpperCase() === 'PULANG');

  $('btnMasuk').disabled = !!masuk;
  $('btnPulang').disabled = !masuk || !!pulang;

  if (masuk && masuk.time) {
    $('arrivalTime').innerHTML = escapeHtml(formatAttendanceTime_(masuk.time)) + ' <span>WIB</span>';
  } else {
    $('arrivalTime').innerHTML = '--:-- <span>WIB</span>';
  }

  const badge = $('statusBadge');
  if (masuk && pulang) {
    badge.textContent = 'Absensi Lengkap';
    badge.className = 'status-badge ok';
    $('statusSymbol').innerHTML = '<span class="material-symbols-rounded">check_circle</span>';
  } else if (masuk) {
    badge.textContent = 'Sudah Absen Masuk';
    badge.className = 'status-badge ok';
    $('statusSymbol').innerHTML = '<span class="material-symbols-rounded">check_circle</span>';
  } else {
    badge.textContent = 'Belum Absen';
    badge.className = 'status-badge';
    $('statusSymbol').innerHTML = '<span class="material-symbols-rounded">login</span>';
  }

  if (todayItems.length) {
    $('todayHistory').innerHTML = todayItems.map(renderTodayAttendanceCard_).join('');
  } else {
    $('todayHistory').innerHTML = `
      <div class="empty-today">
        <span class="material-symbols-rounded">event_available</span>
        Belum ada absensi hari ini.<br>Silakan lakukan Absen Masuk.
      </div>`;
  }

  ensureHistoryMonthFilter_(items);
  renderMonthlyHistory_(items);
}

function getJakartaMonthKey_(){
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit'
  }).formatToParts(new Date());
  const get = type => parts.find(x => x.type === type)?.value || '';
  return get('year') + '-' + get('month');
}

function monthLabel_(key){
  const [y,m] = String(key || '').split('-').map(Number);
  if (!y || !m) return key || '';
  return new Intl.DateTimeFormat('id-ID', {
    month:'long', year:'numeric', timeZone:'Asia/Jakarta'
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function ensureHistoryMonthFilter_(items){
  const select = $('historyMonthFilter');
  if (!select) return;

  const keys = new Set();
  items.forEach(x => {
    const d = normalizeDate_(x.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) keys.add(d.slice(0,7));
  });
  keys.add(getJakartaMonthKey_());

  const ordered = Array.from(keys).sort().reverse();
  const current = selectedHistoryMonth || getJakartaMonthKey_();
  selectedHistoryMonth = ordered.includes(current) ? current : ordered[0] || current;

  select.innerHTML = ordered.map(key =>
    `<option value="${escapeHtml(key)}" ${key === selectedHistoryMonth ? 'selected' : ''}>${escapeHtml(monthLabel_(key))}</option>`
  ).join('');

  if (!select.dataset.bound) {
    select.dataset.bound = '1';
    select.addEventListener('change', function(){
      selectedHistoryMonth = this.value;
      renderMonthlyHistory_(historyItemsCache);
    });
  }
}

function renderMonthlyHistory_(items){
  const container = $('historyList');
  if (!container) return;

  const month = selectedHistoryMonth || getJakartaMonthKey_();
  const monthItems = (Array.isArray(items) ? items : []).filter(x => {
    const d = normalizeDate_(x.date);
    return d.slice(0,7) === month;
  });

  const byDate = Object.create(null);
  monthItems.forEach(x => {
    const d = normalizeDate_(x.date);
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(x);
  });

  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) {
    container.innerHTML = '<div class="empty-today">Bulan tidak valid.</div>';
    return;
  }

  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const rows = [];

  // Hari kerja (Senin-Jumat) tanpa absensi ditandai merah.
  // Sabtu/Minggu tidak dianggap lupa absen karena belum ada data jadwal kerja/libur.
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(monthNumber).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
    const records = byDate[date] || [];
    const hasMasuk = records.some(x => String(x.type || '').toUpperCase() === 'MASUK');
    const hasPulang = records.some(x => String(x.type || '').toUpperCase() === 'PULANG');
    const isFuture = date > jakartaToday_();

    if (!records.length && weekday >= 1 && weekday <= 5 && !isFuture) {
      rows.push(renderMissingHistoryDay_(date, 'missing'));
      continue;
    }

    if (records.length && (!hasMasuk || !hasPulang)) {
      rows.push(renderMissingHistoryDay_(date, 'warning', records));
      continue;
    }
  }

  // Tambahkan data absensi aktual, satu baris per catatan, setelah status hari.
  monthItems.sort((a,b) => {
    const da = normalizeDate_(a.date), db = normalizeDate_(b.date);
    return db.localeCompare(da) || String(b.time || '').localeCompare(String(a.time || ''));
  });

  const actualRows = monthItems.map(x => {
    const dateInfo = getDisplayDate_(x.date);
    const location = [x.district, x.regency].filter(Boolean).join(', ');
    const distance = x.distance !== undefined && x.distance !== null && x.distance !== '' && isFinite(Number(x.distance))
      ? Math.round(Number(x.distance)) + ' m' : '';
    const typeInfo = attendanceTypeInfo_(x.type);
    return `
      <div class="history-item history-item-complete">
        <div class="history-date-icon"><span class="material-symbols-rounded">${escapeHtml(typeInfo.icon)}</span></div>
        <div class="history-main">
          <div class="history-date">${escapeHtml(dateInfo.date)}</div>
          <div class="history-detail">${escapeHtml(dateInfo.day)} • ${escapeHtml(typeInfo.label)}${location ? ' • ' + escapeHtml(location) : ''}</div>
        </div>
        <div class="history-right">
          <div class="history-time">${escapeHtml(formatAttendanceTime_(x.time))} WIB</div>
          <div class="history-distance">${escapeHtml(distance)}</div>
        </div>
      </div>`;
  }).join('');

  if (!actualRows && !rows.length) {
    container.innerHTML = `
      <div class="empty-today">
        <span class="material-symbols-rounded">history</span>
        Belum ada riwayat untuk ${escapeHtml(monthLabel_(month))}.
      </div>`;
    return;
  }

  // Status ringkas diletakkan di atas data aktual, lalu daftar absensi.
  container.innerHTML = rows.reverse().join('') + actualRows;
}

function renderMissingHistoryDay_(date, status, records){
  const dateInfo = getDisplayDate_(date);
  let title = 'Tidak Absen';
  let detail = 'Tidak ada catatan absensi';
  let icon = 'event_busy';

  if (status === 'warning') {
    const hasMasuk = (records || []).some(x => String(x.type || '').toUpperCase() === 'MASUK');
    const hasPulang = (records || []).some(x => String(x.type || '').toUpperCase() === 'PULANG');
    title = 'Absensi Tidak Lengkap';
    detail = !hasMasuk && !hasPulang ? 'Lupa absen masuk & pulang' : (!hasMasuk ? 'Lupa absen masuk' : 'Lupa absen pulang');
    icon = 'warning';
  }

  return `
    <div class="history-item history-alert ${status}">
      <div class="history-date-icon"><span class="material-symbols-rounded">${icon}</span></div>
      <div class="history-main">
        <div class="history-date">${escapeHtml(dateInfo.date)}</div>
        <div class="history-detail">${escapeHtml(dateInfo.day)} • ${escapeHtml(detail)}</div>
      </div>
      <div class="history-right"><div class="history-alert-label">${escapeHtml(title)}</div></div>
    </div>`;
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
        ideal:640,
        max:1280
      },

      height:{
        ideal:480,
        max:1280
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
      request('history', {limit:500}, historyResult => {
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
  // Pastikan scroll halaman selalu aktif saat berpindah menu.
  // Penguncian overflow hanya boleh aktif ketika modal sedang terbuka.
  document.body.style.overflow = '';
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
      request('history', {limit:500}, r => {
        if (r?.ok) {
          const items = r.items || [];
          cacheSet_('history', items);
          renderHistory(items);
        }
      });
    }
  }

  if (page === 'request') {
    setAdminRequestVisibility_();
    loadRequests();
    if (isAdminUser_()) loadAdminRequests('MENUNGGU');
  }
  if (page === 'assignment') {
    setAdminAssignmentVisibility_();
    loadAssignments();
  }
}


function changeProfilePhoto(){
  const input = $('profilePhotoInput');
  if(input) input.click();
}

function compressProfilePhoto_(file){
  return new Promise((resolve, reject) => {
    if(!file) return reject(new Error('Foto tidak dipilih.'));
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 700;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d', {alpha:false});
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let data = canvas.toDataURL('image/jpeg', quality);
        while(data.length > 550000 && quality > 0.45){
          quality -= 0.07;
          data = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(data);
      };
      img.onerror = () => reject(new Error('Foto tidak dapat dibaca.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca foto.'));
    reader.readAsDataURL(file);
  });
}

async function handleProfilePhoto(event){
  const file = event?.target?.files?.[0];
  if(!file) return;

  try{
    loading(true, 'Menyimpan Foto Profil', 'Mengoptimalkan foto...');
    const data = await compressProfilePhoto_(file);

    if(!currentUser?.uid){
      throw new Error('Sesi pengguna tidak tersedia.');
    }

    // Simpan lokal terlebih dahulu agar UI langsung berubah.
    localStorage.setItem('absen_profile_photo_' + currentUser.uid, data);
    currentUser.photo = data;
    cacheSet_('profile', currentUser);
    renderUser(currentUser);

    // Persist ke backend/Google Drive agar foto tetap tersedia
    // setelah login di perangkat lain.
    if(sessionToken){
      const result = await requestPromise_('updateProfile', { photo: data });
      if(!result?.ok){
        throw new Error(result?.error || 'Foto profil gagal disimpan ke server.');
      }
      if(result.user){
        currentUser = Object.assign({}, currentUser, result.user);
        cacheSet_('profile', currentUser);
        renderUser(currentUser);
      }
    }

    showToast('Foto profil berhasil diganti.');
  }catch(error){
    console.error('PROFILE PHOTO:', error);
    showToast(error?.message || 'Foto profil gagal disimpan.');
  }finally{
    loading(false);
    if(event?.target) event.target.value = '';
  }
}

async function logout(){

  if(attendanceProcessing){
    showToast('Tunggu proses absensi selesai.');
    return;
  }

  loading(true, 'Keluar dari Aplikasi', 'Mengakhiri sesi login...');

  // Callback native dipanggil setelah Firebase + Google sign-out selesai.
  window.onNativeSignedOut = function(){
    try{
      localStorage.removeItem('absen_session');
      if(currentUser?.uid){
        // Foto profil boleh tetap tersimpan di perangkat; sesi login tidak.
      }
      cacheClearAll_();
      currentLocation = null;
      lastLocationAt = 0;
      locationLookupKey = '';
      sessionToken = '';
      currentUser = null;
      capturedDataUrl = '';
      stopCamera();

      if(window.AndroidAuth){
        try{ window.AndroidAuth.ready(); }catch(e){}
      }

      loading(false);
      window.location.replace('file:///android_asset/absenamil/index.html');
    }catch(error){
      console.error('Final logout:', error);
      loading(false);
      window.location.reload();
    }
  };

  try{
    if(isNativeAndroid_()){
      window.AndroidAuth.signOut();
      // Native callback akan menyelesaikan proses logout.
      return;
    }

    if(firebaseAuth){
      const { signOut } =
        await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
      await signOut(firebaseAuth);
    }
  }catch(error){
    console.warn('Auth signOut:', error);
  }

  // Browser/non-native fallback.
  window.onNativeSignedOut();
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


function setAdminRequestVisibility_(){
  const card = $('adminRequestCard');
  if(!card) return;
  const admin = isAdminUser_();
  card.style.display = admin ? '' : 'none';
}

function adminRequestStatusClass_(status){
  const s = String(status || '').toUpperCase();
  if(s === 'DISETUJUI') return 'approved';
  if(s === 'DITOLAK') return 'rejected';
  return 'pending';
}

function renderAdminRequests(items){
  const el = $('adminRequestList');
  if(!el) return;

  if(!Array.isArray(items) || !items.length){
    el.innerHTML = `
      <div class="admin-empty-state">
        <span class="material-symbols-rounded">inbox</span>
        <strong>Tidak ada pengajuan</strong>
        <span>Belum ada pengajuan pada filter ini.</span>
      </div>`;
    return;
  }

  el.innerHTML = items.map(item => {
    const id = String(item.requestId || '');
    const type = String(item.type || 'PENGAJUAN').toUpperCase();
    const status = String(item.status || 'MENUNGGU').toUpperCase();
    const name = item.name || item.email || 'Karyawan';
    const date = formatRequestDate(item.startDate || '');
    const end = item.endDate && item.endDate !== item.startDate
      ? ' — ' + formatRequestDate(item.endDate)
      : '';
    const reason = item.reason || '-';

    let actions = '';
    if(status === 'MENUNGGU'){
      actions = `
        <div class="admin-request-actions">
          <button type="button" class="request-approve-btn" onclick="reviewAdminRequest(${JSON.stringify(id)},'DISETUJUI')">
            <span class="material-symbols-rounded">check_circle</span>
            Setujui
          </button>
          <button type="button" class="request-reject-btn" onclick="reviewAdminRequest(${JSON.stringify(id)},'DITOLAK')">
            <span class="material-symbols-rounded">cancel</span>
            Tolak
          </button>
        </div>`;
    } else if(item.reviewNote){
      actions = `<div class="admin-review-note"><span class="material-symbols-rounded">notes</span>${esc_(item.reviewNote)}</div>`;
    }

    return `
      <article class="admin-request-item">
        <div class="admin-request-main">
          <div class="admin-request-avatar">${esc_((name || 'K').charAt(0).toUpperCase())}</div>
          <div class="admin-request-content">
            <div class="admin-request-top">
              <div>
                <div class="admin-request-name">${esc_(name)}</div>
                <div class="admin-request-meta">${esc_(item.nip || item.position || item.email || '')}</div>
              </div>
              <span class="request-status ${adminRequestStatusClass_(status)}">${esc_(status)}</span>
            </div>
            <div class="admin-request-type">
              <span class="material-symbols-rounded">${type === 'CUTI' ? 'beach_access' : 'event_busy'}</span>
              ${esc_(type)}
              <span class="admin-request-date">${esc_(date + end)}</span>
            </div>
            <div class="admin-request-reason">${esc_(reason)}</div>
            ${actions}
          </div>
        </div>
      </article>`;
  }).join('');
}

async function loadAdminRequests(status='MENUNGGU'){
  if(!isAdminUser_() || !sessionToken) return;

  document.querySelectorAll('[data-request-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.requestFilter === status);
  });

  const el = $('adminRequestList');
  if(el) el.innerHTML = '<div class="empty-today">Memuat pengajuan karyawan...</div>';

  try{
    const r = await requestPromise_('adminRequests', {status, limit:100});
    if(!r?.ok) throw new Error(r?.error || 'Gagal memuat pengajuan karyawan.');
    renderAdminRequests(r.items || []);
  }catch(err){
    console.error('ADMIN REQUESTS:', err);
    if(el) el.innerHTML = `<div class="empty-today">${esc_(err?.message || 'Gagal memuat pengajuan.')}</div>`;
  }
}

async function reviewAdminRequest(requestId, decision){
  if(!isAdminUser_()) return showToast('Menu ini khusus ADMIN.');

  let note = '';
  if(decision === 'DITOLAK'){
    note = window.prompt('Alasan penolakan (opsional):', '') || '';
  }

  const label = decision === 'DISETUJUI' ? 'menyetujui' : 'menolak';
  if(!window.confirm(`Yakin ingin ${label} pengajuan ini?`)) return;

  loading(true, decision === 'DISETUJUI' ? 'Menyetujui Pengajuan' : 'Menolak Pengajuan', 'Memproses keputusan admin...');

  try{
    const r = await requestPromise_('adminReviewRequest', {
      requestId,
      decision,
      note
    });

    if(!r?.ok) throw new Error(r?.error || 'Pengajuan gagal diproses.');

    showToast(decision === 'DISETUJUI'
      ? 'Pengajuan berhasil disetujui.'
      : 'Pengajuan berhasil ditolak.');

    await loadAdminRequests('MENUNGGU');
    cacheClear_('requests');
  }catch(err){
    console.error('ADMIN REVIEW REQUEST:', err);
    showToast(err?.message || 'Pengajuan gagal diproses.');
  }finally{
    loading(false);
  }
}

function isAdminUser_(){
  return String(currentUser?.role || '').trim().toUpperCase() === 'ADMIN';
}

function setAdminAssignmentVisibility_(){
  const card = $('adminAssignmentCreateCard');
  if(!card) return;

  const admin = isAdminUser_();
  card.style.display = admin ? '' : 'none';

  const subtitle = $('assignmentSubtitle');
  if(subtitle){
    subtitle.textContent = admin
      ? 'Kelola penugasan dan pantau tugas karyawan'
      : 'Daftar tugas yang diberikan kepada Anda';
  }

  if(admin){
    loadAdminAssignmentEmployees_();
    loadAdminAssignmentProgress_();
  }
}

async function loadAdminAssignmentEmployees_(){
  if(!isAdminUser_()) return;

  const select = $('adminAssignmentUid');
  if(!select) return;

  if(select.dataset.loaded === '1') return;

  select.innerHTML = '<option value="">Memuat karyawan...</option>';

  try{
    const r = await requestPromise_('adminEmployees', {});
    if(!r?.ok) throw new Error(r?.error || 'Gagal memuat daftar karyawan.');

    const items = Array.isArray(r.items) ? r.items : [];
    const active = items.filter(u =>
      String(u.status || '').trim().toUpperCase() === 'AKTIF' &&
      String(u.uid || '').trim()
    );

    select.innerHTML =
      '<option value="">Pilih karyawan...</option>' +
      active.map(u => {
        const label = [u.name, u.nip, u.position].filter(Boolean).join(' • ');
        return `<option value="${esc_(u.uid)}">${esc_(label || u.email || u.uid)}</option>`;
      }).join('');

    if(!active.length){
      select.innerHTML = '<option value="">Tidak ada karyawan aktif</option>';
    }

    select.dataset.loaded = '1';
  }catch(err){
    console.error('LOAD ADMIN EMPLOYEES:', err);
    select.innerHTML = '<option value="">Gagal memuat karyawan</option>';
    showToast(err?.message || 'Gagal memuat daftar karyawan.');
  }
}

function resetAdminAssignmentForm_(){
  const form = $('adminAssignmentForm');
  if(form) form.reset();

  const start = $('adminAssignmentStartDate');
  const end = $('adminAssignmentEndDate');
  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset()*60000)
    .toISOString().slice(0,10);

  if(start) start.value = iso;
  if(end) end.value = iso;
}

async function submitAdminAssignment(event){
  event?.preventDefault();

  if(!isAdminUser_()){
    showToast('Menu ini khusus ADMIN.');
    return;
  }

  const uid = $('adminAssignmentUid')?.value || '';
  const title = $('adminAssignmentTitle')?.value.trim() || '';
  const description = $('adminAssignmentDescription')?.value.trim() || '';
  const startDate = $('adminAssignmentStartDate')?.value || '';
  const endDate = $('adminAssignmentEndDate')?.value || '';
  const location = $('adminAssignmentLocation')?.value.trim() || '';
  const priority = $('adminAssignmentPriority')?.value || 'NORMAL';
  const notes = $('adminAssignmentNotes')?.value.trim() || '';

  if(!uid || !title || !startDate || !endDate){
    showToast('Lengkapi karyawan, judul, dan tanggal tugas.');
    return;
  }

  if(endDate < startDate){
    showToast('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    return;
  }

  const btn = $('adminAssignmentSubmit');
  if(btn){
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-rounded">progress_activity</span>Menyimpan...';
  }

  loading(true, 'Membuat Penugasan', 'Menyimpan tugas untuk karyawan...');

  try{
    const r = await requestPromise_('adminCreateAssignment', {
      uid,
      title,
      description,
      startDate,
      endDate,
      location,
      priority,
      notes
    });

    if(!r?.ok){
      throw new Error(r?.error || 'Penugasan gagal dibuat.');
    }

    cacheClear_('assignments');
    resetAdminAssignmentForm_();
    showToast('Penugasan berhasil dibuat.');
    await loadAssignments();
    await loadAdminAssignmentProgress_();
  }catch(err){
    console.error('ADMIN CREATE ASSIGNMENT:', err);
    showToast(err?.message || 'Penugasan gagal dibuat.');
  }finally{
    loading(false);
    if(btn){
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-rounded">send</span>Buat Penugasan';
    }
  }
}


function renderAdminAssignmentProgress(items){
  const summary = $('assignmentSummary');
  const list = $('assignmentEmployeeProgress');
  if(!summary || !list) return;

  const all = Array.isArray(items) ? items : [];
  const total = all.length;
  const done = all.filter(x => String(x.status || '').toLowerCase() === 'selesai').length;
  const verify = all.filter(x => String(x.status || '').toLowerCase() === 'menunggu verifikasi').length;
  const process = all.filter(x => String(x.status || '').toLowerCase() === 'diproses').length;
  const assigned = all.filter(x => String(x.status || '').toLowerCase() === 'ditugaskan').length;

  summary.innerHTML = `
    <div class="assignment-summary-item"><span class="material-symbols-rounded">assignment</span><strong>${total}</strong><small>Total Tugas</small></div>
    <div class="assignment-summary-item"><span class="material-symbols-rounded">schedule</span><strong>${assigned}</strong><small>Ditugaskan</small></div>
    <div class="assignment-summary-item"><span class="material-symbols-rounded">play_circle</span><strong>${process}</strong><small>Diproses</small></div>
    <div class="assignment-summary-item"><span class="material-symbols-rounded">fact_check</span><strong>${verify}</strong><small>Verifikasi</small></div>
    <div class="assignment-summary-item"><span class="material-symbols-rounded">task_alt</span><strong>${done}</strong><small>Selesai</small></div>`;

  if(!all.length){
    list.innerHTML = `
      <div class="admin-empty-state">
        <span class="material-symbols-rounded">groups</span>
        <strong>Belum ada penugasan</strong>
        <span>Daftar karyawan dan progres akan muncul setelah ADMIN membuat tugas.</span>
      </div>`;
    return;
  }

  const groups = {};
  all.forEach(item => {
    const key = item.uid || item.email || item.name || 'unknown';
    if(!groups[key]){
      groups[key] = {
        uid:key,
        name:item.name || item.email || 'Karyawan',
        nip:item.nip || '',
        position:item.position || '',
        tasks:[]
      };
    }
    groups[key].tasks.push(item);
  });

  list.innerHTML = Object.values(groups).map(g => {
    const tasks = g.tasks;
    const completed = tasks.filter(t => String(t.status||'').toLowerCase() === 'selesai').length;
    const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

    const statusCounts = {
      assigned: tasks.filter(t => String(t.status||'').toLowerCase() === 'ditugaskan').length,
      processing: tasks.filter(t => String(t.status||'').toLowerCase() === 'diproses').length,
      verification: tasks.filter(t => String(t.status||'').toLowerCase() === 'menunggu verifikasi').length,
      done: completed
    };

    return `
      <article class="employee-progress-card">
        <div class="employee-progress-head">
          <div class="employee-progress-avatar">${esc_((g.name || 'K').charAt(0).toUpperCase())}</div>
          <div class="employee-progress-info">
            <strong>${esc_(g.name)}</strong>
            <span>${esc_([g.nip, g.position].filter(Boolean).join(' • '))}</span>
          </div>
          <div class="employee-progress-percent">${percent}%</div>
        </div>
        <div class="employee-progress-bar"><span style="width:${percent}%"></span></div>
        <div class="employee-progress-stats">
          <span><b>${tasks.length}</b> tugas</span>
          <span><b>${statusCounts.assigned}</b> ditugaskan</span>
          <span><b>${statusCounts.processing}</b> diproses</span>
          <span><b>${statusCounts.verification}</b> verifikasi</span>
          <span><b>${statusCounts.done}</b> selesai</span>
        </div>
        <div class="employee-task-list">
          ${tasks.slice(0,8).map(t => `
            <div class="employee-task-row">
              <span class="employee-task-title">${esc_(t.title || 'Penugasan')}</span>
              <span class="request-status ${assignmentStatusClass_(t.status)}">${esc_(t.status || 'Ditugaskan')}</span>
            </div>`).join('')}
          ${tasks.length > 8 ? `<div class="employee-task-more">+ ${tasks.length - 8} tugas lainnya</div>` : ''}
        </div>
      </article>`;
  }).join('');
}

async function loadAdminAssignmentProgress_(){
  if(!isAdminUser_() || !sessionToken) return;

  const card = $('adminAssignmentProgressCard');
  const list = $('assignmentEmployeeProgress');
  if(card) card.style.display = '';

  if(list) list.innerHTML = '<div class="empty-today">Memuat progres karyawan...</div>';

  try{
    const r = await requestPromise_('adminAssignments', {
      limit:200,
      includeCompleted:'true'
    });

    if(!r?.ok) throw new Error(r?.error || 'Gagal memuat progres penugasan.');

    const items = r.items || r.data?.items || r.assignments || [];
    renderAdminAssignmentProgress(items);
  }catch(err){
    console.error('ADMIN ASSIGNMENT PROGRESS:', err);
    if(list) list.innerHTML = `<div class="empty-today">${esc_(err?.message || 'Gagal memuat progres.')}</div>`;
  }
}

function assignmentStatusClass_(status){const s=String(status||'').toLowerCase();if(s==='selesai')return'approved';if(s==='menunggu verifikasi')return'pending';if(s==='diproses')return'processing';return'assigned';}
function renderAssignments(items){
  const el=$('assignmentList');if(!el)return;
  if(!Array.isArray(items)||!items.length){el.innerHTML='<div class="empty-today">Belum ada penugasan.</div>';return;}
  el.innerHTML=items.map(i=>{
    const id=String(i.assignmentId||i.id||''),title=i.title||i.judul||'Penugasan',desc=i.description||i.deskripsi||'',start=i.startDate||i.date||'',end=i.endDate||'',status=i.status||'Ditugaskan',proof=i.proofUrl||'',proofName=i.proofName||'Bukti tugas';
    let action='';
    if(status==='Ditugaskan') action=`<button class="assignment-action primary" onclick='startAssignment(${JSON.stringify(id)})'><span class="material-symbols-rounded">play_arrow</span> Mulai Tugas</button>`;
    else if(status==='Diproses') action=`<div class="assignment-actions"><label class="assignment-upload"><span class="material-symbols-rounded">upload_file</span> ${proof?'Ganti Bukti':'Upload Bukti'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onchange='handleAssignmentProof(${JSON.stringify(id)},event)'></label>${proof?`<a class="assignment-action primary" href="${esc_(proof)}" target="_blank" rel="noopener"><span class="material-symbols-rounded">visibility</span> Lihat Bukti</a>`:''}<button class="assignment-action success" onclick='submitAssignmentVerification(${JSON.stringify(id)})' ${proof?'':'disabled'}><span class="material-symbols-rounded">send</span> Kirim Verifikasi</button></div>`;
    else if(status==='Menunggu Verifikasi') action=`<div class="assignment-wait"><span class="material-symbols-rounded">hourglass_top</span> Menunggu verifikasi admin</div>`;
    else action=`<div class="assignment-done"><span class="material-symbols-rounded">task_alt</span> Tugas selesai</div>`;
    return `<article class="assignment-item"><div class="assignment-item-head"><div><div class="assignment-item-title">${esc_(title)}</div><div class="assignment-item-date"><span class="material-symbols-rounded">event</span>${esc_(formatRequestDate(start))}${end&&end!==start?' — '+esc_(formatRequestDate(end)):''}</div></div><span class="request-status ${assignmentStatusClass_(status)}">${esc_(status)}</span></div>${desc?`<div class="assignment-item-desc">${esc_(desc)}</div>`:''}${i.location?`<div class="assignment-item-meta"><span class="material-symbols-rounded">location_on</span>${esc_(i.location)}</div>`:''}${i.priority?`<div class="assignment-item-meta"><span class="material-symbols-rounded">flag</span>Prioritas ${esc_(i.priority)}</div>`:''}${i.assignedBy?`<div class="assignment-item-meta"><span class="material-symbols-rounded">person</span>Diberikan oleh ${esc_(i.assignedBy)}</div>`:''}<div class="assignment-item-footer">${action}</div></article>`;
  }).join('');
}
async function startAssignment(id){const r=await requestPromise_('updateAssignmentStatus',{assignmentId:id,status:'Diproses'});if(!r?.ok)return showToast(r?.error||'Tugas gagal dimulai.');cacheClear_('assignments');showToast('Tugas dimulai.');await loadAssignments();}
async function handleAssignmentProof(id,event){
  const file=event?.target?.files?.[0];if(!file)return;
  if(file.size>5*1024*1024){showToast('Ukuran bukti maksimal 5 MB.');event.target.value='';return;}
  const reader=new FileReader();loading(true,'Mengunggah Bukti','Menyimpan bukti tugas ke server...');
  reader.onload=async()=>{try{const r=await requestPromise_('uploadAssignmentProof',{assignmentId:id,fileName:file.name,fileData:reader.result});if(!r?.ok)throw Error(r?.error||'Upload bukti gagal.');cacheClear_('assignments');showToast('Bukti tugas berhasil diunggah.');await loadAssignments();}catch(e){showToast(e.message||'Upload bukti gagal.');}finally{loading(false);event.target.value='';}};
  reader.onerror=()=>{loading(false);showToast('File tidak dapat dibaca.');event.target.value='';};reader.readAsDataURL(file);
}
async function submitAssignmentVerification(id){const r=await requestPromise_('updateAssignmentStatus',{assignmentId:id,status:'Menunggu Verifikasi'});if(!r?.ok)return showToast(r?.error||'Gagal mengirim verifikasi.');cacheClear_('assignments');showToast('Tugas dikirim untuk verifikasi admin.');await loadAssignments();}
async function loadAssignments(){
  if(!sessionToken)return;
  const el=$('assignmentList');
  const cached=cacheGet_('assignments',CACHE_TTL.assignments);
  if(cached){renderAssignments(cached);return;}
  if(el)el.innerHTML='<div class="empty-today">Memuat penugasan...</div>';
  const r=await requestPromise_('assignments',{limit:50,includeCompleted:'true'});
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

    if(isNativeAndroid_()){
      // Native Android akan mengirim token Firebase melalui bridge.
      // Sesi Apps Script yang tersimpan tetap bisa dipakai tanpa login ulang.
      if(sessionToken){
        showApp();
        setTimeout(() => refreshAll(), 0);
        loading(false);
      }else{
        loading(false);
        try{ window.AndroidAuth.ready(); }catch(e){ console.warn(e); }
      }
    }else{
      await initFirebase();
    }

    if(!isNativeAndroid_() && sessionToken){

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
