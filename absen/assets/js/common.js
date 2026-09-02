window.$ = id => document.getElementById(id);

window.esc = function(value){
  return String(value ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));
};

window.toast = function(message){
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.style.display = 'none', 2600);
};

window.role = function(user){
  return String(user?.role || user?.ROLE || '').toUpperCase();
};

window.badge = function(status){
  const s = String(status || 'MENUNGGU');
  const cls = s.includes('DITOLAK') ? 'no' : s.includes('DISETUJUI') ? 'ok' : 'wait';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
};

window.pageShell = function(title, active='home'){
  const token = localStorage.getItem(APP_CONFIG.TOKEN_KEY);
  if (!token) {
    location.href = '../index.html';
    return;
  }
  document.body.innerHTML = `
    <div class="app">
      <header class="top"><b>Teams BAZNAS Sragen</b></header>
      <main id="page" class="content"></main>
      <nav class="bottom">
        <a class="nav ${active==='home'?'active':''}" href="dashboard.html">🏠<span>Beranda</span></a>
        <a class="nav fab" href="absensi.html">📷</a>
        <a class="nav ${active==='profile'?'active':''}" href="profil.html">👤<span>Profil</span></a>
      </nav>
    </div>
    <div id="toast" class="toast"></div>`;
};

window.todayISO = function(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off*60000).toISOString().slice(0,10);
};