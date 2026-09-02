window.Layout = {
  header(title){
    return `
      <div class="page-head">
        <div>
          <h2>${esc(title)}</h2>
          <p class="muted" id="pageSub"></p>
        </div>
        <button class="btn gray small" onclick="history.back()">Kembali</button>
      </div>`;
  },
  userName(){
    const u = Auth.user() || {};
    return u.nama || u.NAMA || '-';
  }
};