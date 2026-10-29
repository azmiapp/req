/* Pusat Database ZIS - GitHub Pages frontend.
 * Set API_URL to the deployed Google Apps Script Web App URL.
 * API responses are JSON. See README for cross-origin deployment notes.
 */
const API_URL = "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE";
const $ = (id) => document.getElementById(id);
const state = { token: "", user: null, page: "dashboard", data: {} };
const modules = [
  {id:"dashboard",label:"Dashboard",icon:"▦",roles:["ALL"]},
  {id:"muzakki",label:"Database Muzakki",icon:"♙",roles:["ADMIN","PENGUMPULAN","PELAPORAN","PIMPINAN"]},
  {id:"mustahik",label:"Database Mustahik",icon:"♡",roles:["ADMIN","PENDISTRIBUSIAN","PENDAYAGUNAAN","PELAPORAN","PIMPINAN"]},
  {id:"penerimaan",label:"Penerimaan ZIS",icon:"＋",roles:["ADMIN","PENGUMPULAN","KEUANGAN","PELAPORAN","PIMPINAN"]},
  {id:"program",label:"Program & Anggaran",icon:"◇",roles:["ADMIN","PENDISTRIBUSIAN","PENDAYAGUNAAN","KEUANGAN","PELAPORAN","PIMPINAN"]},
  {id:"penyaluran",label:"Penyaluran",icon:"⇢",roles:["ADMIN","PENDISTRIBUSIAN","PENDAYAGUNAAN","KEUANGAN","PELAPORAN","PIMPINAN"]},
  {id:"keuangan",label:"Keuangan",icon:"▤",roles:["ADMIN","KEUANGAN","PELAPORAN","PIMPINAN"]},
  {id:"spj",label:"SPJ & Dokumen",icon:"▧",roles:["ALL"]},
  {id:"laporan",label:"Pelaporan",icon:"▥",roles:["ADMIN","PELAPORAN","PIMPINAN","KEUANGAN"]},
  {id:"umum",label:"Umum",icon:"▣",roles:["ADMIN","UMUM","PIMPINAN"]},
  {id:"sdm",label:"SDM",icon:"♧",roles:["ADMIN","SDM","PIMPINAN"]},
  {id:"users",label:"Pengguna & Role",icon:"⚙",roles:["ADMIN"]}
];
const schemas = {
  muzakki:{title:"Database Muzakki",desc:"Master muzakki dan donatur. Data dapat dirujuk oleh transaksi penerimaan.",sheet:"MUZAKKI",fields:[["nama","Nama lengkap","text",true],["email","Email","email",false],["telepon","Nomor telepon","text",false],["alamat","Alamat","textarea",false],["jenis_identitas","Jenis identitas","select:NIK|NIA|Lainnya",false],["nomor_identitas","Nomor identitas","text",false],["status","Status","select:Aktif|Tidak Aktif|Perlu Perbaikan",true]]},
  mustahik:{title:"Database Mustahik",desc:"Master penerima manfaat, kategori asnaf, verifikasi dan status kelayakan.",sheet:"MUSTAHIK",fields:[["nama","Nama lengkap","text",true],["nik","NIK / nomor identitas","text",false],["telepon","Nomor telepon","text",false],["alamat","Alamat","textarea",false],["kategori_asnaf","Kategori asnaf","select:Fakir|Miskin|Amil|Muallaf|Riqab|Gharimin|Fisabilillah|Ibnu Sabil",true],["status_verifikasi","Status verifikasi","select:Draft|Menunggu Verifikasi|Terverifikasi|Perlu Perbaikan",true],["status_kelayakan","Status kelayakan","select:Belum Dinilai|Layak|Tidak Layak",true]]},
  penerimaan:{title:"Penerimaan ZIS",desc:"Pencatatan penerimaan; transaksi resmi diverifikasi dan diposting oleh Keuangan.",sheet:"PENERIMAAN",fields:[["tanggal","Tanggal penerimaan","date",true],["id_muzakki","ID Muzakki (opsional)","text",false],["nama_penyetor","Nama penyetor","text",true],["jenis_dana","Jenis dana","select:Zakat|Infak|Sedekah|Dana Sosial Keagamaan Lainnya",true],["nominal","Nominal (Rp)","number",true],["metode","Metode","select:Transfer|Tunai|QRIS|Lainnya",true],["status","Status","select:Draft|Menunggu Verifikasi|Terverifikasi|Diposting|Ditolak",true],["catatan","Catatan","textarea",false]]},
  program:{title:"Program & Anggaran",desc:"Program penyaluran dan anggaran usulan. Persetujuan tidak otomatis berarti dana telah dibayar.",sheet:"PROGRAM",fields:[["nama_program","Nama program","text",true],["bidang_pelaksana","Bidang pelaksana","select:Pendistribusian|Pendayagunaan|Umum|SDM",true],["jenis_dana","Jenis dana","select:Zakat|Infak|Sedekah|Dana Sosial Keagamaan Lainnya",true],["tanggal_mulai","Tanggal mulai","date",false],["tanggal_selesai","Tanggal selesai","date",false],["anggaran","Anggaran disetujui (Rp)","number",true],["status","Status","select:Draft|Diajukan|Perlu Perbaikan|Disetujui|Ditolak|Selesai",true],["deskripsi","Deskripsi","textarea",false]]},
  penyaluran:{title:"Penyaluran Program",desc:"Setiap penyaluran terhubung dengan program, penerima, akun dana, pembayaran, dan SPJ.",sheet:"PENYALURAN",fields:[["tanggal","Tanggal penyaluran","date",true],["id_program","ID program","text",true],["id_mustahik","ID mustahik","text",true],["jenis_dana","Jenis dana","select:Zakat|Infak|Sedekah|Dana Sosial Keagamaan Lainnya",true],["nominal_rencana","Nominal rencana (Rp)","number",true],["nominal_realisasi","Nominal realisasi (Rp)","number",false],["status","Status","select:Draft|Diajukan|Disetujui|Menunggu Pembayaran|Disalurkan Sebagian|Tersalurkan|Dibatalkan",true],["bukti_url","Link bukti (Drive)","url",false]]},
  keuangan:{title:"Transaksi Keuangan",desc:"Daftar penerimaan, pembayaran, dan realisasi. Transaksi yang diposting tidak boleh dihapus biasa.",sheet:"KEUANGAN",fields:[["tanggal","Tanggal","date",true],["jenis_transaksi","Jenis transaksi","select:Penerimaan|Pembayaran|Koreksi",true],["referensi_id","ID referensi transaksi","text",true],["akun_dana","Akun / kategori dana","select:Zakat|Infak|Sedekah|Dana Sosial Keagamaan Lainnya|Operasional",true],["debit","Debit (Rp)","number",false],["kredit","Kredit (Rp)","number",false],["status","Status","select:Draft|Menunggu Verifikasi|Diposting|Direkonsiliasi|Dibatalkan",true],["keterangan","Keterangan","textarea",false]]},
  spj:{title:"SPJ & Dokumen",desc:"SPJ memiliki status administrasi terpisah dari status pembayaran.",sheet:"SPJ",fields:[["id_program","ID program / kegiatan","text",true],["id_penyaluran","ID penyaluran (jika terkait)","text",false],["bidang","Bidang pelaksana","select:Pendistribusian|Pendayagunaan|Umum|SDM|Pengumpulan",true],["tanggal_pengajuan","Tanggal pengajuan","date",true],["nominal_spj","Nominal SPJ (Rp)","number",true],["dokumen_url","Link folder / dokumen Drive","url",false],["status","Status SPJ","select:Draft|Diajukan|Pemeriksaan Atasan|Pemeriksaan Keuangan|Pemeriksaan Pelaporan|Perlu Perbaikan|Disetujui|Selesai",true],["catatan","Catatan pemeriksa","textarea",false]]},
  umum:{title:"Administrasi Umum",desc:"Surat, aset, inventaris, pengadaan, kegiatan umum dan dokumen pertanggungjawaban.",sheet:"UMUM",fields:[["jenis","Jenis administrasi","select:Surat Masuk|Surat Keluar|Aset|Inventaris|Pengadaan|Kegiatan",true],["nomor","Nomor dokumen","text",false],["tanggal","Tanggal","date",true],["judul","Judul / uraian","text",true],["penanggung_jawab","Penanggung jawab","text",false],["nominal","Nominal (Rp, jika ada)","number",false],["status","Status","select:Draft|Diproses|Selesai|Dibatalkan",true],["dokumen_url","Link dokumen","url",false]]},
  sdm:{title:"Administrasi SDM",desc:"Data pegawai, jabatan, unit kerja, status pegawai dan penugasan.",sheet:"SDM",fields:[["nama","Nama pegawai","text",true],["email","Email","email",true],["jabatan","Jabatan","text",true],["bidang","Bidang","select:Pengumpulan|Pendistribusian|Pendayagunaan|Keuangan|Pelaporan|Umum|SDM",true],["tanggal_masuk","Tanggal masuk","date",false],["status","Status pegawai","select:Aktif|Tidak Aktif|Cuti",true],["catatan","Catatan","textarea",false]]}
};
function toast(msg, bad=false){const el=$("toast");el.textContent=msg;el.style.background=bad?"#9f2d28":"#153b63";el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3500)}
function money(n){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0)}
function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function role(){return String(state.user?.role||"").toUpperCase()}
function allowed(m){return m.roles.includes("ALL")||m.roles.includes(role())}
async function api(action, payload={}) {
  if(!API_URL || API_URL.includes("PASTE_APPS_SCRIPT")) throw new Error("API_URL belum diisi. Buka github-pages/app.js lalu masukkan URL Web App Apps Script.");
  // API uses application/x-www-form-urlencoded to avoid preflight. Apps Script must be deployed as Web App.
  const params = new URLSearchParams({action, payload:JSON.stringify(payload), token:state.token||""});
  const response = await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:params.toString(),redirect:"follow"});
  if(!response.ok) throw new Error("API mengembalikan HTTP "+response.status);
  const result = await response.json();
  if(!result.ok) throw new Error(result.error||"Permintaan gagal");
  return result.data;
}
function renderNav(){
  $("nav").innerHTML=modules.filter(allowed).map(m=>`<button class="nav-btn ${state.page===m.id?"active":""}" data-page="${m.id}"><span class="nav-icon">${m.icon}</span>${m.label}</button>`).join("");
  $("nav").querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{state.page=b.dataset.page;$("sidebar").classList.remove("open");renderPage()});
}
function setPageTitle(title){$("pageTitle").textContent=title;$("crumb").textContent=title.toUpperCase()}
async function renderPage(){
  renderNav();
  const module=modules.find(m=>m.id===state.page);
  if(!module||!allowed(module)){state.page="dashboard";return renderPage()}
  setPageTitle(module.label);
  const root=$("pageContent");root.innerHTML='<div class="panel"><p class="muted">Memuat data...</p></div>';
  try{
    if(state.page==="dashboard") return await renderDashboard(root);
    if(state.page==="laporan") return await renderReports(root);
    if(state.page==="users") return await renderUsers(root);
    const schema=schemas[state.page];
    if(schema) return await renderTableModule(root,schema);
    return await renderSimpleModule(root,state.page,module.label);
  }catch(e){root.innerHTML=`<div class="error-box"><b>Gagal memuat data.</b><br>${safe(e.message)}<p>Periksa URL deployment Apps Script, izin akses Web App, dan koneksi internet.</p></div>`}
}
async function renderDashboard(root){
  const d=await api("dashboard");
  const stats=[
    ["Total Muzakki",d.muzakki||0,"Database muzakki","♙"],
    ["Total Mustahik",d.mustahik||0,"Database penerima manfaat","♡"],
    ["Penerimaan ZIS",money(d.penerimaan||0),"Total transaksi yang diposting","＋"],
    ["Realisasi Penyaluran",money(d.penyaluran||0),"Transaksi penyaluran sah","⇢"]
  ];
  root.innerHTML=`<div class="section-head"><div><h2>Ringkasan lembaga</h2><p>Data sesuai hak akses akun Anda.</p></div><span class="badge ok">● Sistem aktif</span></div>
  <div class="stats">${stats.map(s=>`<div class="stat"><span class="stat-icon">${s[3]}</span><div class="label">${s[0]}</div><div class="value">${safe(s[1])}</div><div class="foot">${s[2]}</div></div>`).join("")}</div>
  <div class="dashboard-grid"><section class="panel"><div class="section-head"><div><h2>Aktivitas yang perlu ditindaklanjuti</h2><p>Status operasional lintas modul</p></div></div><div class="mini-list">${(d.pending||[]).length?(d.pending||[]).map(x=>`<div class="mini-row"><span class="mini-dot"></span><span>${safe(x.label)}</span><b class="push">${safe(x.count)}</b></div>`).join(""):'<div class="empty">Belum ada item tertunda.</div>'}</div></section>
  <section class="panel"><div class="section-head"><div><h2>Kontrol data</h2><p>Prinsip integritas sistem</p></div></div><div class="mini-list"><div class="mini-row"><span class="mini-dot"></span>Transaksi memakai ID unik</div><div class="mini-row"><span class="mini-dot"></span>Role diperiksa di backend</div><div class="mini-row"><span class="mini-dot"></span>Perubahan tercatat di audit log</div><div class="mini-row"><span class="mini-dot"></span>SPJ dipisahkan dari status pembayaran</div></div></section></div>
  <div class="notice" style="margin-top:16px">Angka dashboard dihitung oleh backend dari data yang diizinkan. Pastikan transaksi berstatus Diposting/Direkonsiliasi sebelum dipakai sebagai angka laporan resmi.</div>`;
}
async function renderTableModule(root,schema){
  const rows=await api("list",{sheet:schema.sheet});
  const fields=schema.fields;
  root.innerHTML=`<div class="section-head"><div><h2>${schema.title}</h2><p>${schema.desc}</p></div><button id="addBtn" class="btn primary">＋ Tambah data</button></div>
  <div class="toolbar"><input id="searchBox" placeholder="Cari data..."><button id="reloadData" class="btn secondary">↻ Muat ulang</button><span class="badge">${rows.length} data</span></div>
  <div class="table-wrap"><table><thead><tr>${["ID",...fields.map(f=>f[1]),"Aksi"].map(x=>`<th>${safe(x)}</th>`).join("")}</tr></thead><tbody id="tableBody"></tbody></table></div>`;
  const body=$("tableBody");
  function draw(filter=""){
    const subset=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()));
    body.innerHTML=subset.length?subset.map(r=>`<tr><td>${safe(r.id||"")}</td>${fields.map(f=>`<td>${f[0].includes("nominal")||["anggaran","debit","kredit"].includes(f[0])?safe(money(r[f[0]])):f[0]==="status"||f[0]==="status_verifikasi"?`<span class="badge ${/disetujui|selesai|aktif|terverifikasi|diposting|tersalurkan/i.test(r[f[0]]||"")?"ok":/perbaikan|menunggu|diajukan/i.test(r[f[0]]||"")?"warn":""}">${safe(r[f[0]]||"—")}</span>`:safe(r[f[0]]||"—")}</td>`).join("")}<td><button class="btn secondary edit-btn" data-id="${safe(r.id)}">Edit</button></td></tr>`).join(""):`<tr><td colspan="${fields.length+2}" class="empty">Belum ada data yang cocok.</td></tr>`;
    body.querySelectorAll(".edit-btn").forEach(b=>b.onclick=()=>openRecordForm(schema,rows.find(r=>r.id===b.dataset.id)));
  }
  draw();$("searchBox").oninput=e=>draw(e.target.value);$("reloadData").onclick=()=>renderPage();$("addBtn").onclick=()=>openRecordForm(schema,null);
}
function openRecordForm(schema,row){
  const fields=schema.fields;
  const fieldHtml=fields.map(f=>{
    const [key,label,type,required]=f;const val=row?.[key]??"";
    let input;
    if(type.startsWith("select:"))input=`<select name="${key}" ${required?"required":""}>${type.slice(7).split("|").map(v=>`<option ${String(val)===v?"selected":""}>${safe(v)}</option>`).join("")}</select>`;
    else if(type==="textarea")input=`<textarea name="${key}" rows="3">${safe(val)}</textarea>`;
    else input=`<input name="${key}" type="${type}" value="${safe(val)}" ${required?"required":""} ${type==="number"?'min="0" step="1"':""}>`;
    return `<label class="${type==="textarea"?"wide":""}">${safe(label)}${input}</label>`;
  }).join("");
  const wrap=document.createElement("div");wrap.className="modal-backdrop";
  wrap.innerHTML=`<div class="modal panel"><div class="section-head"><div><h2>${row?"Edit data":"Tambah data"} — ${safe(schema.title)}</h2><p>Perubahan akan divalidasi di backend dan masuk audit log.</p></div><button class="btn secondary close">Tutup</button></div><form id="recordForm"><div class="form-grid">${fieldHtml}</div><div class="form-actions"><button type="button" class="btn secondary close">Batal</button><button class="btn primary" type="submit">Simpan</button></div></form></div>`;
  document.body.appendChild(wrap);wrap.querySelectorAll(".close").forEach(b=>b.onclick=()=>wrap.remove());
  wrap.querySelector("form").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const data={};fields.forEach(f=>data[f[0]]=fd.get(f[0])??"");try{await api("save",{sheet:schema.sheet,id:row?.id||"",record:data});toast("Data berhasil disimpan.");wrap.remove();renderPage()}catch(err){toast(err.message,true)}};
}
async function renderReports(root){
  const r=await api("reports");
  root.innerHTML=`<div class="section-head"><div><h2>Laporan konsolidasi</h2><p>Nominal bersumber dari transaksi yang memenuhi status valid.</p></div><button id="exportCsv" class="btn secondary">Ekspor ringkasan CSV</button></div>
  <div class="stats"><div class="stat"><div class="label">Total Penerimaan Diposting</div><div class="value">${money(r.penerimaan||0)}</div><div class="foot">Rupiah</div></div><div class="stat"><div class="label">Total Penyaluran Sah</div><div class="value">${money(r.penyaluran||0)}</div><div class="foot">Rupiah</div></div><div class="stat"><div class="label">Total Anggaran Program</div><div class="value">${money(r.anggaran||0)}</div><div class="foot">Program disetujui</div></div><div class="stat"><div class="label">SPJ Belum Selesai</div><div class="value">${r.spjPending||0}</div><div class="foot">Perlu tindak lanjut</div></div></div>
  <section class="panel"><div class="section-head"><div><h2>Ringkasan per jenis dana</h2><p>Data ini membantu rekonsiliasi, bukan pengganti laporan akuntansi resmi.</p></div></div><div class="table-wrap"><table><thead><tr><th>Jenis dana</th><th>Penerimaan</th><th>Penyaluran</th><th>Selisih sederhana</th></tr></thead><tbody>${(r.byFund||[]).map(x=>`<tr><td>${safe(x.name)}</td><td>${money(x.income)}</td><td>${money(x.outgoing)}</td><td>${money((x.income||0)-(x.outgoing||0))}</td></tr>`).join("")}</tbody></table></div><p class="kpi-note">Saldo akuntansi resmi perlu memperhitungkan jurnal, kewajiban, dan transaksi lain sesuai kebijakan lembaga.</p></section>`;
  $("exportCsv").onclick=()=>{const lines=[["Jenis Dana","Penerimaan","Penyaluran","Selisih"],...(r.byFund||[]).map(x=>[x.name,x.income,x.outgoing,(x.income||0)-(x.outgoing||0)])];const csv=lines.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="laporan-zis.csv";a.click();URL.revokeObjectURL(a.href)};
}
async function renderUsers(root){
  const rows=await api("users");
  root.innerHTML=`<div class="section-head"><div><h2>Pengguna dan role</h2><p>Admin dapat membuat akun. Password tidak pernah ditampilkan kembali.</p></div><button class="btn primary" id="newUser">＋ Buat pengguna</button></div><div class="notice" style="margin-bottom:14px">Gunakan password minimal 12 karakter untuk akun produksi. Role menentukan menu dan izin backend; menyembunyikan menu saja bukan kontrol keamanan.</div><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Bidang</th><th>Status</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${safe(u.nama)}</td><td>${safe(u.email)}</td><td><span class="badge">${safe(u.role)}</span></td><td>${safe(u.bidang||"—")}</td><td>${safe(u.status)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">Belum ada pengguna.</td></tr>'}</tbody></table></div>`;
  $("newUser").onclick=()=>{
    const wrap=document.createElement("div");wrap.className="modal-backdrop";
    wrap.innerHTML=`<div class="modal panel"><div class="section-head"><h2>Buat akun pengguna</h2><button class="btn secondary close">Tutup</button></div><form id="userForm" class="form-grid"><label class="wide">Nama<input name="nama" required></label><label class="wide">Email<input name="email" type="email" required></label><label>Password awal<input name="password" type="password" minlength="12" required></label><label>Role<select name="role">${["ADMIN","PIMPINAN","PENGUMPULAN","PENDISTRIBUSIAN","PENDAYAGUNAAN","KEUANGAN","PELAPORAN","UMUM","SDM"].map(x=>`<option>${x}</option>`).join("")}</select></label><label>Bidang<input name="bidang"></label><label>Status<select name="status"><option>Aktif</option><option>Tidak Aktif</option></select></label><div class="wide form-actions"><button class="btn primary">Simpan akun</button></div></form></div>`;
    document.body.appendChild(wrap);wrap.querySelectorAll(".close").forEach(b=>b.onclick=()=>wrap.remove());$("userForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);try{await api("createUser",Object.fromEntries(fd.entries()));toast("Akun dibuat.");wrap.remove();renderUsers(root)}catch(err){toast(err.message,true)}};
  };
}
async function renderSimpleModule(root,id,title){
  const names={};const sheetMap={};
  const msg=id==="umum"?"Kelola surat, inventaris, pengadaan, aset dan dokumen kegiatan.":id==="sdm"?"Kelola administrasi pegawai dan penugasan.":"Kelola SPJ lintas bidang dengan status administrasi dan keuangan yang terpisah.";
  root.innerHTML=`<section class="panel"><div class="section-head"><div><h2>${title}</h2><p>${msg}</p></div></div><div class="notice">Modul awal tersedia sebagai kerangka. Untuk transaksi resmi, gunakan formulir sesuai SOP dan pastikan dokumen pendukung disimpan di Google Drive dengan akses terbatas.</div></section>`;
}
async function startApp(){
  const user=await api("me");state.user=user;
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("userName").textContent=user.nama||user.email;$("userRole").textContent=(user.role||"").replaceAll("_"," ");$("userAvatar").textContent=(user.nama||user.email||"U").slice(0,1).toUpperCase();
  renderPage();
}
$("loginForm").onsubmit=async e=>{e.preventDefault();try{const result=await api("login",{email:$("loginEmail").value.trim(),password:$("loginPassword").value});state.token=result.token;sessionStorage.setItem("zis_session",state.token);await startApp();toast("Login berhasil.")}catch(err){toast(err.message,true)}};
$("logoutBtn").onclick=async()=>{try{await api("logout")}catch(_){}state.token="";state.user=null;sessionStorage.removeItem("zis_session");$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("loginPassword").value="";toast("Anda telah keluar.")};
$("refreshBtn").onclick=()=>renderPage();$("menuToggle").onclick=()=>$("sidebar").classList.toggle("open");
(function init(){const t=sessionStorage.getItem("zis_session");if(t){state.token=t;startApp().catch(()=>{sessionStorage.removeItem("zis_session");state.token=""})}})();
