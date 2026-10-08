import { auth } from "./firebase.js";
import { createUserWithEmailAndPassword, getAuth as getSecondaryAuth, signOut as secondarySignOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { guard,qs,qsa,esc,fmtDate,toast,logout,getUsers,saveUserProfile,getBcls,saveBcl,getAssignments,createAssignment,getDeliveries } from "./common.js";

let bcls=[],users=[],assignments=[],deliveries=[],profile;
const $=qs;

function setLoading(show,message="Memuat data..."){
  const el=$("#loadingOverlay"); if(!el)return;
  el.classList.toggle("hidden",!show);
  const text=$("#loadingText"); if(text)text.textContent=message;
}
function monthOf(v){
  if(!v)return "";
  const d=new Date(v); if(Number.isNaN(d.getTime()))return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(m){
  if(!m)return "Semua bulan";
  const [y,mo]=m.split("-"); return new Date(Number(y),Number(mo)-1,1).toLocaleDateString("id-ID",{month:"long",year:"numeric"});
}
function driveImageUrl(url=""){const u=String(url);const m=u.match(/(?:file\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/);return m?`https://drive.google.com/uc?export=view&id=${m[1]}`:u}
function escapePrint(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

setLoading(true,"Memuat data admin...");
guard("admin",async(user,p)=>{
  profile=p;$("#adminName").textContent=p.name||user.email;bind();
  try{await loadAll();renderAll()}catch(e){toast(e.message||"Gagal memuat data.","error")}
  finally{setLoading(false)}
});

function bind(){
 $("#logoutBtn").onclick=logout;
 qsa(".nav-btn").forEach(b=>b.onclick=()=>showView(b.dataset.view));
 $("#addBclBtn").onclick=()=>showBclForm();
 $("#addAssignmentBtn").onclick=showAssignmentForm;
 $("#addUserBtn").onclick=showUserForm;
 $("#bclSearch").oninput=renderBcl;$("#bclStatus").onchange=renderBcl;
 $("#assignmentStatus").onchange=renderAssignments;
 $("#dashboardMonth").onchange=renderStats;
 $("#dashboardAllMonths").onclick=()=>{$("#dashboardMonth").value="";renderStats()};
 $("#deliverySearch").oninput=renderDeliveries;$("#deliveryStatus").onchange=renderDeliveries;
 $("#deliveryMonth").onchange=()=>{updateDeliveryQuickState();renderDeliveries()};
 $("#resetDeliveryFilter").onclick=resetDeliveryFilters;
 $("#deliveryThisMonth").onclick=()=>{const d=new Date();$("#deliveryMonth").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;updateDeliveryQuickState();renderDeliveries()};
 $("#deliveryAllMonths").onclick=()=>{$("#deliveryMonth").value="";updateDeliveryQuickState();renderDeliveries()};
 $("#makeSpjBtn").onclick=()=>showSpjForm("admin");
}
function showView(v){qsa(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.view===v));qsa(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+v))}
async function loadAll(){[bcls,users,assignments,deliveries]=await Promise.all([getBcls(),getUsers(),getAssignments(),getDeliveries()]);}

function renderAll(){renderStats();renderBcl();renderAssignments();updateDeliveryQuickState();renderDeliveries();renderUsers()}
function renderStats(){
 const m=$("#dashboardMonth")?.value||"";
 let total=0,assigned=0,done=0,pending=0;
 if(!m){
   total=bcls.length;
   assigned=bcls.filter(x=>x.status==="DITUGASKAN").length;
   done=bcls.filter(x=>x.status==="SELESAI").length;
   pending=assignments.filter(x=>x.status!=="DONE").length;
 }else{
   // Statistik bulanan mengikuti aktivitas pada bulan tersebut, bukan status terakhir BCL.
   // Total BCL = BCL yang dibuat pada bulan pilihan.
   total=bcls.filter(x=>monthOf(x.createdAt)===m).length;
   const periodAssignments=assignments.filter(x=>monthOf(x.createdAt)===m);
   assigned=new Set(periodAssignments.map(x=>x.bclId)).size;
   done=assignments.filter(x=>x.status==="DONE"&&monthOf(x.completedAt)===m).length;
   pending=periodAssignments.filter(x=>x.status!=="DONE").length;
 }
 $("#statBcl").textContent=total;
 $("#statAssigned").textContent=assigned;
 $("#statDone").textContent=done;
 $("#statPending").textContent=pending;
 const periodDeliveries=m?deliveries.filter(x=>monthOf(x.createdAt)===m):deliveries;
 const counts={SUBMITTED:periodDeliveries.filter(x=>x.status==="SUBMITTED").length,VERIFIED:periodDeliveries.filter(x=>x.status==="VERIFIED").length};
 $("#statusBars").innerHTML=Object.entries(counts).map(([k,v])=>`<div class="bar-row"><span>${k}</span><b>${v}</b></div>`).join("")||`<p class="muted">Belum ada penyaluran.</p>`;
 const recent=periodDeliveries.slice(0,6);
 $("#recentDeliveries").innerHTML=recent.map(d=>`<div class="list-row"><div><b>${esc(d.bclName||d.bclId)}</b><small>${esc(d.zmartName||"ZMart")} • ${fmtDate(d.createdAt)}</small></div><span class="badge">${esc(d.status)}</span></div>`).join("")||`<p class="muted">Belum ada data.</p>`;
 const period=$("#dashboardPeriod");
 if(period)period.textContent=m?`Menampilkan data bulan ${monthLabel(m)}`:"Menampilkan semua bulan";
}

function renderBcl(){
 const s=($("#bclSearch").value||"").toLowerCase(),st=$("#bclStatus").value;
 const rows=bcls.filter(x=>(!st||x.status===st)&&[x.id,x.name,x.district,x.village].join(" ").toLowerCase().includes(s));
 $("#bclTable").innerHTML=`<table><thead><tr><th>ID</th><th>Penerima</th><th>Wilayah</th><th>Lokasi</th><th>Status</th><th>Lokasi</th><th>QR</th><th>Aksi</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.id)}</td><td><b>${esc(x.name)}</b><small>${esc(x.address||"")}</small></td><td>${esc(x.district||"-")}<br>${esc(x.village||"-")}</td><td><span class="badge">${esc(x.status||"BELUM_DITUGASKAN")}</span></td><td>${x.mapsUrl?`<a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(x.mapsUrl)}">🗺️ Maps</a>`:`<span class="muted">Belum ada</span>`}</td><td><button class="btn small" data-qr-bcl="${esc(x.id)}">▣ QR</button></td><td><button class="btn small" data-edit-bcl="${esc(x.id)}">Edit</button></td></tr>`).join("")||`<tr><td colspan="7">Belum ada BCL.</td></tr>`}</tbody></table>`;
 qsa("[data-edit-bcl]").forEach(b=>b.onclick=()=>showBclForm(b.dataset.editBcl));
 qsa("[data-qr-bcl]").forEach(b=>b.onclick=()=>showQr(b.dataset.qrBcl));
}

function showQr(id){
 const x=bcls.find(v=>v.id===id);if(!x)return;
 openModal(`<h2>Kartu BCL</h2><p><b>${esc(x.name)}</b><br><span class="muted">ID: ${esc(x.id)}</span></p><div id="qrCanvas" class="qr-box"></div><div class="inline"><button id="printBclCard" class="btn primary">🖨️ Cetak Kartu BCL</button><button id="downloadQr" class="btn">Download QR</button><button id="closeQr" class="btn ghost">Tutup</button></div>`);
 const box=$("#qrCanvas");
 if(typeof QRCode==="undefined"){box.innerHTML=`<p class="muted">Library QR belum termuat.</p>`;return}
 new QRCode(box,{text:x.id,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});
 $("#downloadQr").onclick=()=>{const img=box.querySelector("img");const canvas=box.querySelector("canvas");const src=img?.src||canvas?.toDataURL("image/png");if(!src)return;const a=document.createElement("a");a.href=src;a.download=`QR-${x.id}.png`;a.click()};
 $("#printBclCard").onclick=()=>printBclCard(x,box);
 $("#closeQr").onclick=()=>$("#modal").close();
}
function printBclCard(x,box){
 const img=box.querySelector("img"),canvas=box.querySelector("canvas"),qr=img?.src||canvas?.toDataURL("image/png")||"";
 const w=window.open("","_blank","width=520,height=720");
 if(!w){toast("Popup diblokir browser. Izinkan popup untuk mencetak kartu.","error");return}
 w.document.write(`<!doctype html><html><head><title>Kartu BCL ${escapePrint(x.id)}</title><style>
 body{font-family:Arial,sans-serif;background:#f3f7f4;margin:0;padding:25px}.card{width:350px;margin:auto;background:#fff;border:2px solid #087f5b;border-radius:22px;padding:22px;text-align:center;box-shadow:0 10px 30px #0002}.brand{font-size:13px;font-weight:800;color:#087f5b;letter-spacing:2px}.wr{font-size:34px;font-weight:950;margin:8px 0;color:#164537}.title{font-size:20px;font-weight:900}.id{display:inline-block;background:#e7f5ee;color:#087f5b;border-radius:20px;padding:6px 12px;font-weight:800;margin:8px}.data{text-align:left;border-top:1px solid #d5e6dd;margin-top:14px;padding-top:12px;font-size:13px;line-height:1.55}.qr{width:180px;height:180px;margin:15px auto 5px}.note{font-size:10px;color:#6f817a;margin-top:12px}@media print{body{background:#fff;padding:0}.card{box-shadow:none}}</style></head><body><div class="card"><div class="brand">BAZNAS KABUPATEN SRAGEN</div><div class="wr">WR</div><div class="title">DATA BCL</div><div class="id">${escapePrint(x.id)}</div><img class="qr" src="${qr}"><div class="data"><b>Nama:</b> ${escapePrint(x.name)}<br><b>Kecamatan:</b> ${escapePrint(x.district||"-")}<br><b>Desa/Kelurahan:</b> ${escapePrint(x.village||"-")}<br><b>Alamat:</b> ${escapePrint(x.address||"-")}<br><b>No. Kartu/Identitas:</b> ${escapePrint(x.cardNo||"-")}</div><div class="note">Kartu BCL • Simpan kartu untuk proses verifikasi penyaluran</div></div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
 w.document.close();
}

function renderAssignments(){
 const st=$("#assignmentStatus").value;
 const rows=assignments.filter(x=>!st||(st==="DONE"?x.status==="DONE":x.status!=="DONE"));
 $("#assignmentTable").innerHTML=`<table><thead><tr><th>BCL</th><th>ZMart</th><th>Paket</th><th>Status</th><th>Dibuat / Deadline</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.bclName)}</b><small>${esc(x.bclId)}</small></td><td>${esc(x.zmartName)}</td><td>${esc(x.packageName||"-")}<small>${esc((x.items||[]).map(i=>i.name).join(", "))}</small></td><td><span class="badge ${x.status==="DONE"?"":"pending-badge"}">${x.status==="DONE"?"SELESAI":"BELUM SELESAI"}</span></td><td>${fmtDate(x.createdAt)}<small class=\"${x.deadline && x.status!==\"DONE\" && new Date(x.deadline)<new Date()?\"danger\":\"muted\"}\">Batas: ${x.deadline?fmtDate(x.deadline):\"Tidak ditentukan\"}</small></td></tr>`).join("")||`<tr><td colspan="5">Belum ada penugasan.</td></tr>`}</tbody></table>`;
}

function renderDeliveries(){
 const s=($("#deliverySearch").value||"").trim().toLowerCase(),st=$("#deliveryStatus").value,m=$("#deliveryMonth").value;
 const rows=deliveries.filter(x=>(!st||x.status===st)&&(!m||monthOf(x.createdAt)===m)&&[x.bclId,x.bclName,x.zmartName,x.district,x.village].join(" ").toLowerCase().includes(s));
 const total=deliveries.length;
 $("#deliveryTable").innerHTML=`<div class="table-meta"><div><b>${rows.length}</b> penyaluran ditemukan <small>${m?`• ${monthLabel(m)}`:"• Semua periode"}</small></div><span>${total} total data</span></div><table><thead><tr><th>Waktu</th><th>BCL</th><th>ZMart</th><th>Lokasi</th><th>Status</th><th>Bukti</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${fmtDate(x.createdAt)}</td><td><b>${esc(x.bclName)}</b><small>${esc(x.bclId)}</small></td><td>${esc(x.zmartName)}</td><td>${esc(x.district||"-")}<br><small>${x.latitude??"-"}, ${x.longitude??"-"}</small></td><td><span class="badge">${esc(x.status)}</span></td><td>${x.photoUrl?`<a target="_blank" rel="noopener noreferrer" href="${esc(x.photoUrl)}"><img class="evidence-thumb" loading="lazy" src="${esc(driveImageUrl(x.photoUrl))}" alt="Foto laporan" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"></a><a class="btn small" style="display:none" target="_blank" rel="noopener noreferrer" href="${esc(x.photoUrl)}">Buka foto</a>`:"-"}</td></tr>`).join("")||`<tr><td colspan="6"><div class="empty-state">Belum ada penyaluran yang sesuai filter.</div></td></tr>`}</tbody></table>`;
 updateDeliveryFilterSummary(rows.length);
}
function resetDeliveryFilters(){
 $("#deliverySearch").value="";$("#deliveryStatus").value="";$("#deliveryMonth").value="";updateDeliveryQuickState();renderDeliveries();
}
function updateDeliveryQuickState(){
 const m=$("#deliveryMonth").value,d=new Date(),current=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
 $("#deliveryThisMonth")?.classList.toggle("active",m===current);
 $("#deliveryAllMonths")?.classList.toggle("active",!m);
 const btn=$("#makeSpjBtn");if(btn){btn.disabled=!m;btn.title=m?"Buat SPJ dari bulan terpilih":"Pilih bulan terlebih dahulu"}
}
function updateDeliveryFilterSummary(count){
 const s=($("#deliverySearch").value||"").trim(),st=$("#deliveryStatus").value,m=$("#deliveryMonth").value;
 const parts=[];if(m)parts.push(`Bulan: ${monthLabel(m)}`);if(st)parts.push(`Status: ${st}`);if(s)parts.push(`Pencarian: “${esc(s)}”`);
 $("#deliveryFilterSummary").innerHTML=parts.length?`<b>Filter aktif:</b> ${parts.join(" • ")} <span>→ ${count} data</span>`:`Menampilkan <b>semua ${count} penyaluran</b>`;
}

function renderUsers(){
 const rows=users.filter(x=>x.role==="zmart");
 $("#userTable").innerHTML=`<table><thead><tr><th>Nama</th><th>Email</th><th>Wilayah</th><th>Lokasi</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.email)}</td><td>${esc(x.area||"-")}</td><td>${x.mapsUrl?`<a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(x.mapsUrl)}">🗺️ Maps</a>`:'-'} </td><td><span class="badge ${x.active===false?"danger":""}">${x.active===false?"Nonaktif":"Aktif"}</span></td></tr>`).join("")||`<tr><td colspan="5">Belum ada ZMart.</td></tr>`}</tbody></table>`;
}

function openModal(html){
 $("#modalBody").innerHTML=`<div class="modal-card"><button type="button" class="modal-close" id="modalCloseBtn" aria-label="Tutup">×</button>${html}</div>`;
 $("#modal").showModal();const close=$("#modalCloseBtn");if(close)close.onclick=()=>$("#modal").close();
}

function showBclForm(id=""){
 const x=bcls.find(v=>v.id===id)||{};
 openModal(`<h2>${id?"Edit":"Tambah"} BCL</h2><form id="bclForm"><label>ID BCL<input name="id" value="${esc(x.id||"BCL-"+Date.now())}" ${id?"readonly":""} required></label><label>Nama penerima<input name="name" value="${esc(x.name||"")}" required></label><label>Kecamatan<input name="district" value="${esc(x.district||"")}" required></label><label>Desa/Kelurahan<input name="village" value="${esc(x.village||"")}"></label><label>Alamat<textarea name="address">${esc(x.address||"")}</textarea></label><label>No. Kartu/Identitas<input name="cardNo" value="${esc(x.cardNo||"")}"></label><label>📍 Link Lokasi Rumah di Google Maps<input name="mapsUrl" type="url" value="${esc(x.mapsUrl||"")}" placeholder="https://maps.google.com/..."><small class="muted">Buka Google Maps → pilih lokasi rumah → Bagikan → Salin link → tempel di sini.</small></label><button id="saveBclBtn" class="btn primary full">Simpan & Generate Kartu BCL</button></form>`);
 $("#bclForm").onsubmit=async e=>{e.preventDefault();const btn=$("#saveBclBtn");btn.disabled=true;btn.textContent="Menyimpan...";setLoading(true,"Menyimpan data BCL...");try{const data=Object.fromEntries(new FormData(e.target));data.status=x.status||"BELUM_DITUGASKAN";data.assignedTo=x.assignedTo||"";data.assignedZmartName=x.assignedZmartName||"";const saved=await saveBcl(data);await loadAll();renderAll();$("#modal").close();toast("Data BCL tersimpan.");showQr(saved?.id||data.id)}catch(err){toast(err.message,"error");btn.disabled=false;btn.textContent="Simpan & Generate Kartu BCL"}finally{setLoading(false)}};
}

function showAssignmentForm(){
 const pending=[...bcls].sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),"id")),zmarts=users.filter(x=>x.role==="zmart"&&x.active!==false);
 openModal(`<h2>Buat Penugasan</h2><p class="muted">Silahkan Buat Penugasan Baru.</p><form id="assignmentForm"><label>BCL<select name="bclId" required><option value="">Pilih BCL</option>${pending.map(x=>`<option value="${esc(x.id)}">${esc(x.id)} — ${esc(x.name)} — ${esc(x.district||"")}</option>`).join("")}</select></label><div id="assignmentBclPreview" class="assignment-preview"></div><label>ZMart<select name="zmartUid" required><option value="">Pilih ZMart</option>${zmarts.map(x=>`<option value="${esc(x.uid)}">${esc(x.name)} — ${esc(x.area||"")}</option>`).join("")}</select></label><label>Nama paket<input name="packageName" value="Paket Sembako BCL"></label><label>Isi paket (pisahkan dengan koma)<textarea name="items">Beras 5 kg, Minyak Goreng 1 L, Gula 1 kg, Tepung Terigu 1 kg, Susu 2 pcs</textarea></label><label>Deadline penyelesaian tugas<input name="deadline" type="datetime-local" required></label><label>Ongkos kirim per km (Rp)<input name="costPerKm" type="number" min="0" step="500" value="2000" required></label><small class="muted">Jarak dihitung perkiraan garis lurus jika tautan Maps berisi koordinat.</small><button id="saveAssignmentBtn" class="btn primary full">Buat Penugasan</button></form>`);
 const select=$("#assignmentForm select[name=bclId]"),preview=$("#assignmentBclPreview");
 const updatePreview=()=>{const x=bcls.find(v=>v.id===select.value);preview.innerHTML=x?`<div class="verified"><b>✓ Data BCL tersimpan</b><span>${esc(x.name)}</span><small>ID ${esc(x.id)} • ${esc(x.district||"-")} • ${esc(x.village||"-")}</small><small>${esc(x.address||"Alamat belum diisi")}</small><small><b>Status terakhir:</b> ${esc(x.status||"BELUM_DITUGASKAN")} • BCL dapat ditugaskan kembali.</small></div>`:""};
 select.onchange=updatePreview;updatePreview();
 $("#assignmentForm").onsubmit=async e=>{e.preventDefault();const btn=$("#saveAssignmentBtn");btn.disabled=true;btn.textContent="Menyimpan...";setLoading(true,"Menyimpan penugasan...");try{const f=new FormData(e.target);const items=String(f.get("items")||"").split(",").map(x=>({name:x.trim(),checked:false})).filter(x=>x.name);await createAssignment({bclId:f.get("bclId"),zmartUid:f.get("zmartUid"),packageName:f.get("packageName"),items,deadline:f.get("deadline"),costPerKm:Number(f.get("costPerKm")||0)});$("#modal").close();await loadAll();renderAll();toast("Penugasan dibuat.")}catch(err){toast(err.message,"error");btn.disabled=false;btn.textContent="Buat Penugasan"}finally{setLoading(false)}};
}

function showSpjForm(){
 const m=$("#deliveryMonth").value;
 if(!m){toast("Pilih bulan terlebih dahulu pada filter Penyaluran.","error");return}
 const rows=deliveries.filter(x=>monthOf(x.createdAt)===m);
 if(!rows.length){toast("Tidak ada penyaluran pada bulan yang dipilih.","error");return}
 const assignmentsById=Object.fromEntries(assignments.map(x=>[x.id,x]));
 openModal(`<h2>Generate SPJ</h2><p class="muted">Periode: <b>${esc(monthLabel(m))}</b> • ${rows.length} penyaluran</p><div class="spj-preview-list">${rows.map((d,i)=>{const a=assignmentsById[d.assignmentId];return `<div class="spj-row"><b>${i+1}. ${esc(d.bclName)}</b><small>${esc(d.bclId)} • ${esc(d.zmartName)} • ${esc(a?.packageName||"Paket BCL")}</small><small>${esc((a?.items||[]).map(it=>it.name).join(", ")||"-")}</small></div>`}).join("")}</div><label>Foto Nota <input id="spjNota" type="file" accept="image/*" capture="environment" required></label><small class="muted">Foto nota akan dimasukkan ke halaman SPJ.</small><button id="generateSpjBtn" class="btn primary full" disabled>🖨️ Generate & Cetak SPJ</button>`);
 const input=$("#spjNota"),btn=$("#generateSpjBtn");let noteData="";
 input.onchange=()=>{const file=input.files?.[0];if(!file){btn.disabled=true;return}const r=new FileReader();r.onload=()=>{noteData=r.result;btn.disabled=false};r.readAsDataURL(file)};
 btn.onclick=()=>printSpj(rows,assignmentsById,m,noteData,"ADMIN / BAZNAS SRAGEN");
}

function printSpj(rows,assignmentsById,m,noteData,actor){
 const w=window.open("","_blank","width=1000,height=800");
 if(!w){toast("Popup diblokir browser. Izinkan popup untuk mencetak SPJ.","error");return}
 const detail=rows.map((d,i)=>{const a=assignmentsById[d.assignmentId]||{};return `<tr><td>${i+1}</td><td>${escapePrint(d.bclId)}<br><b>${escapePrint(d.bclName)}</b><br><small>${escapePrint(d.district||"-")}</small></td><td>${escapePrint(d.zmartName||"-")}</td><td><b>${escapePrint(a.packageName||"Paket BCL")}</b><br>${escapePrint((a.items||[]).map(it=>it.name).join(", ")||"-")}</td><td>${escapePrint(fmtDate(d.createdAt))}</td><td>${d.photoUrl?`<img class="spj-photo" src="${escapePrint(driveImageUrl(d.photoUrl))}" alt="Foto laporan"><br><a href="${escapePrint(d.photoUrl)}" target="_blank">Buka foto</a>`:"-"}</td></tr>`}).join("");
 const totalBcl=new Set(rows.map(x=>x.bclId)).size;
 w.document.write(`<!doctype html><html><head><title>SPJ BCL ${escapePrint(monthLabel(m))}</title><style>
 *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172b24;margin:0;padding:30px;font-size:12px}h1{font-size:20px;margin:0}.head{text-align:center;border-bottom:3px solid #087f5b;padding-bottom:14px;margin-bottom:18px}.head p{margin:5px 0;color:#5c6e66}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:15px}.meta div{border:1px solid #d5e6dd;border-radius:8px;padding:8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cfdad5;padding:7px;vertical-align:top}th{background:#eaf6f0;font-size:10px}.summary{margin:15px 0;font-weight:700}.spj-photo{max-width:110px;max-height:90px;object-fit:cover;border-radius:6px}.nota{margin-top:25px;border-top:1px solid #cfdad5;padding-top:15px}.nota img{max-width:320px;max-height:420px;display:block;margin-top:8px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:55px;text-align:center}.sign p{margin-top:70px;border-top:1px solid #555;padding-top:5px}@media print{body{padding:12mm}.no-print{display:none}}</style></head><body><div class="head"><h1>BERITA ACARA / SPJ PENYALURAN BCL</h1><p>BAZNAS KABUPATEN SRAGEN</p><p>Periode ${escapePrint(monthLabel(m))}</p></div><div class="meta"><div><b>Dibuat oleh</b><br>${escapePrint(actor)}</div><div><b>Jumlah Penyaluran</b><br>${rows.length} penyaluran / ${totalBcl} BCL</div></div><table><thead><tr><th>No</th><th>Data BCL</th><th>ZMart Penyalur</th><th>Barang / Paket</th><th>Tanggal</th><th>Bukti</th></tr></thead><tbody>${detail}</tbody></table><div class="summary">SPJ ini memuat data BCL, barang yang disalurkan, ZMart penyalur, dan bukti penyaluran untuk periode ${escapePrint(monthLabel(m))}.</div><div class="nota"><b>NOTA / BUKTI BELANJA</b>${noteData?`<img src="${noteData}" alt="Nota">`:"<p>Tidak ada foto nota.</p>"}</div><div class="sign"><div>Kepala Pelaksana<p>____________________________</p></div><div>Wakil Bidang 2<p>____________________________</p></div><div>Pelaksana Pendistribusian<p>____________________________</p></div></div><script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);
 w.document.close();
}

function showUserForm(){
 openModal(`<h2>Tambah ZMart</h2><p class="muted">Akun Firebase Authentication dibuat otomatis. Data profil dan role disimpan di Google Sheet.</p><form id="userForm"><label>Nama ZMart<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Password awal<input name="password" type="password" minlength="6" required></label><label>Wilayah<input name="area"></label><label>📍 Link Google Maps lokasi ZMart<input name="mapsUrl" type="url" placeholder="https://maps.google.com/..."><small class="muted">Tempel link lokasi gudang/toko ZMart untuk estimasi jarak.</small></label><button id="saveUserBtn" class="btn primary full">Buat akun</button></form>`);
 $("#userForm").onsubmit=async e=>{e.preventDefault();const btn=$("#saveUserBtn");btn.disabled=true;btn.textContent="Membuat akun...";setLoading(true,"Membuat akun ZMart...");const f=new FormData(e.target);let secondary;try{secondary=initializeApp(firebaseConfig,"Secondary-"+Date.now());const sa=getSecondaryAuth(secondary);const cred=await createUserWithEmailAndPassword(sa,f.get("email"),f.get("password"));await saveUserProfile({uid:cred.user.uid,email:f.get("email"),name:f.get("name"),nip:"",jabatan:"ZMart Deliver",role:"zmart",area:f.get("area"),status:"AKTIF"});await secondarySignOut(sa);$("#modal").close();await loadAll();renderUsers();toast("Akun ZMart dibuat dan disimpan di Google Sheet.")}catch(err){toast(err.message,"error");btn.disabled=false;btn.textContent="Buat akun"}finally{setLoading(false)}};
}
