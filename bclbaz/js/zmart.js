import { guard,qs,qsa,esc,fmtDate,toast,logout,getMyAssignments,getMyDeliveries,findBcl as apiFindBcl,uploadDeliveryPhoto } from "./common.js";

let me,tasks=[],history=[],selectedTask=null,selectedBcl=null,stream=null,facing="environment",coords=null,photoBlob=null,scanner=null;

function setLoading(show,message="Memuat data..."){
  const el=qs("#loadingOverlay"); if(!el)return;
  el.classList.toggle("hidden",!show);
  const text=qs("#loadingText");if(text)text.textContent=message;
}
function monthOf(v){
  if(!v)return "";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function monthLabel(m){
  if(!m)return "Semua bulan";
  const [y,mo]=m.split("-");return new Date(Number(y),Number(mo)-1,1).toLocaleDateString("id-ID",{month:"long",year:"numeric"});
}
function escapePrint(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

setLoading(true,"Memuat tugas dan riwayat...");
guard("zmart",async(user,p)=>{
  me={...p,uid:user.uid};qs("#zmartName").textContent=p.name||user.email;qs("#hello").textContent=`Halo, ${p.name||"ZMart"} 👋`;bind();
  try{await loadTasks();await loadHistory();renderHome();renderTasks();}catch(e){toast(e.message||"Gagal memuat data.","error")}
  finally{setLoading(false)}
});

function bind(){
 qs("#logoutBtn").onclick=logout;
 qsa(".bottom-nav button").forEach(b=>b.onclick=()=>showZView(b.dataset.zview));
 qs("#openTasksBtn").onclick=()=>showZView("tasksView");
 qs("#backTasks").onclick=()=>{resetDeliver();showZView("tasksView")};
 qs("#startScan").onclick=startScanner;
 qs("#manualFind").onclick=()=>findBcl(qs("#manualBclId").value.trim());
 qs("#toPhoto").onclick=toPhoto;
 qs("#takePhoto").onclick=takePhoto;
 qs("#switchCamera").onclick=async()=>{facing=facing==="environment"?"user":"environment";if(stream){stopCamera();startCamera()}};
 qs("#submitDelivery").onclick=submitDelivery;
 qs("#historyMonth").onchange=renderHistory;
 qs("#zmartSpjBtn").onclick=showSpjForm;
}
function showZView(id){qsa(".mobile-content>.view").forEach(x=>x.classList.toggle("active",x.id===id));qsa(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.zview===id));window.scrollTo({top:0,behavior:"smooth"})}
async function loadTasks(){tasks=(await getMyAssignments()).filter(x=>x.status==="ASSIGNED"||x.status==="IN_PROGRESS");}
async function loadHistory(){history=await getMyDeliveries();renderHistory();}
function renderHome(){
 const done=history.length;qs("#taskTotal").textContent=tasks.length;qs("#taskDone").textContent=done;
 const pct=tasks.length?Math.min(100,Math.round(done/tasks.length*100)):0;qs("#progressText").textContent=`${done}/${tasks.length}`;qs("#progressBar").style.width=pct+"%";
 qs("#taskPreview").innerHTML=tasks.slice(0,5).map(t=>`<div class="list-row"><div><b>${esc(t.bclName)}</b><small>${esc(t.packageName||"Paket BCL")}</small></div><button class="btn small" data-task="${esc(t.id)}">Mulai</button></div>`).join("")||`<p class="muted">Belum ada penugasan.</p>`;
 qsa("[data-task]").forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}
function renderTasks(){
 qs("#taskList").innerHTML=tasks.map(t=>`<button class="task-card" data-task="${esc(t.id)}"><div class="task-avatar">${esc((t.bclName||"?")[0])}</div><div><b>${esc(t.bclName)}</b><span>${esc(t.bclId)} • ${esc(t.packageName||"Paket BCL")}</span><small>${t.status==="DONE"?"SELESAI":"BELUM SELESAI"} • Klik untuk mulai, lalu scan ID BCL</small></div><span>›</span></button>`).join("")||`<div class="card"><p class="muted">Belum ada tugas dari Admin.</p></div>`;
 qsa("#taskList [data-task]").forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}
function renderHistory(){
 const m=qs("#historyMonth")?.value||"";
 const rows=history.filter(x=>!m||monthOf(x.createdAt)===m);
 const wrap=qs("#historyList");
 wrap.innerHTML=`<div class="history-summary"><b>${rows.length} penyaluran</b><span>${m?monthLabel(m):"Semua bulan"}</span></div>`+
 rows.map(x=>`<div class="card history-item"><div><b>${esc(x.bclName)}</b><span>${esc(x.bclId)} • ${fmtDate(x.createdAt)}</span><span>${esc(x.district||"Lokasi tidak tersedia")} • ${esc(x.zmartName||"ZMart")}</span></div><span class="badge">${esc(x.status)}</span>${x.photoUrl?`<a target="_blank" rel="noopener noreferrer" href="${esc(x.photoUrl)}" class="btn small">Foto</a>`:""}</div>`).join("")||`<div class="card"><p class="muted">Belum ada penyaluran pada periode ini.</p></div>`;
}

async function openTask(id){
 selectedTask=tasks.find(x=>x.id===id);if(!selectedTask)return;
 stopScanner();stopCamera();selectedBcl=null;photoBlob=null;coords=null;
 qs("#deliverTitle").textContent=`Mulai: ${selectedTask.bclName}`;
 qs("#manualBclId").value="";
 qs("#scanResult").innerHTML=`<div class="notice"><b>Verifikasi wajib.</b><br>Masukkan ID BCL atau scan QR pada kartu BCL. Data penerima baru akan ditampilkan setelah ID terverifikasi.</div>`;
 qs("#deliverStep2").classList.add("hidden");qs("#deliverStep3").classList.add("hidden");qs("#deliverStep1").classList.remove("hidden");
 showZView("deliverView");
}
async function findBcl(id){
 if(!id){toast("Masukkan atau scan ID BCL.","error");return}
 setLoading(true,"Memverifikasi ID BCL...");
 try{
  const s=await apiFindBcl(id);selectedBcl=s;
  if(!selectedBcl){toast("Data BCL tidak ditemukan.","error");return}
  if(!selectedTask){toast("Pilih tugas terlebih dahulu.","error");return}
  if(selectedTask.bclId!==selectedBcl.id){selectedBcl=null;toast("QR/ID bukan BCL yang sedang ditugaskan.","error");return}
  const mapsButton=selectedBcl.mapsUrl?`<a href="${esc(selectedBcl.mapsUrl)}" target="_blank" rel="noopener noreferrer" class="btn small">🗺️ Buka Lokasi Rumah</a>`:`<small class="muted">📍 Lokasi rumah belum tersedia.</small>`;
  qs("#scanResult").innerHTML=`<div class="verified"><b>✓ BCL terverifikasi</b><span>${esc(selectedBcl.name)}</span><small>ID ${esc(selectedBcl.id)}</small><small>${esc(selectedBcl.district||"")} • ${esc(selectedBcl.village||"")}</small><small>${esc(selectedBcl.address||"Alamat belum tersedia")}</small><div style="margin-top:10px">${mapsButton}</div></div>`;
  qs("#deliverStep2").classList.remove("hidden");qs("#packageName").textContent=selectedTask.packageName||"Paket Sembako BCL";
  const items=selectedTask.items||[];
  qs("#itemChecklist").innerHTML=items.length?items.map((it,i)=>`<label class="check"><input type="checkbox" data-item="${i}"><span>${esc(it.name)}</span></label>`).join(""):`<p class="muted">Tidak ada rincian barang pada penugasan.</p>`;
  window.scrollTo({top:0,behavior:"smooth"});
 }catch(e){toast(e.message||"Gagal memverifikasi BCL.","error")}finally{setLoading(false)}
}
async function startScanner(){
 if(scanner)return;
 scanner=new Html5Qrcode("reader");
 setLoading(true,"Membuka scanner...");
 try{
  await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},text=>{
    const value=String(text||"").trim();
    if(selectedTask&&value!==selectedTask.bclId){toast("QR bukan BCL yang sedang ditugaskan.","error");return}
    findBcl(value);stopScanner();
  },()=>{});
  qs("#startScan").textContent="Scanner aktif";
 }catch(e){scanner=null;toast("Kamera/QR tidak dapat dibuka. Gunakan input manual.","error")}finally{setLoading(false)}
}
async function stopScanner(){if(scanner){try{await scanner.stop()}catch{}try{scanner.clear()}catch{}scanner=null}qs("#startScan").textContent="Buka Scanner"}

async function toPhoto(){
 const checks=[...document.querySelectorAll("[data-item]")];
 if(checks.length&&checks.some(x=>!x.checked)){toast("Centang semua barang sebelum lanjut.","error");return}
 qs("#deliverStep3").classList.remove("hidden");qs("#submitDelivery").disabled=true;startCamera();getLocation();
}
async function startCamera(){try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});qs("#camera").srcObject=stream}catch(e){toast("Kamera tidak tersedia. Pastikan HTTPS dan izin kamera aktif.","error")}}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
function takePhoto(){
 const v=qs("#camera"),c=qs("#canvas");
 if(!stream){toast("Kamera belum aktif.","error");return}
 if(!coords){toast("Lokasi GPS belum tersedia. Tunggu sampai lokasi didapat.","error");return}
 const maxW=1280,scale=Math.min(1,maxW/(v.videoWidth||1));
 c.width=Math.round((v.videoWidth||1280)*scale);c.height=Math.round((v.videoHeight||720)*scale);
 const ctx=c.getContext("2d");ctx.drawImage(v,0,0,c.width,c.height);drawWatermark(ctx,c.width,c.height,coords);
 c.toBlob(b=>{photoBlob=b;qs("#photoPreview").src=URL.createObjectURL(b);qs("#photoPreview").classList.remove("hidden");qs("#camera").classList.add("hidden");qs("#submitDelivery").disabled=!(coords&&photoBlob)},"image/jpeg",.88);
}
function drawWatermark(ctx,w,h,location){
 const now=new Date(),date=now.toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"}),time=now.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
 const lat=Number(location.latitude).toFixed(6),lng=Number(location.longitude).toFixed(6),acc=Math.round(location.accuracy||0);
 const lines=["BAZNAS KABUPATEN SRAGEN • BCL",`Tanggal: ${date}   Jam: ${time}`,`Lokasi: ${lat}, ${lng}   ±${acc} m`],pad=18,lineH=24,boxH=pad*2+lineH*lines.length,boxY=h-boxH;
 ctx.save();ctx.fillStyle="rgba(0,0,0,.68)";ctx.fillRect(0,boxY,w,boxH);ctx.fillStyle="#fff";ctx.font="600 18px Arial,sans-serif";ctx.textBaseline="top";
 lines.forEach((line,i)=>{ctx.font=i===0?"700 18px Arial,sans-serif":"16px Arial,sans-serif";ctx.fillText(line,pad,boxY+pad+i*lineH)});ctx.restore();
}
let locationWatchId=null,locationFastTimer=null;
function applyLocation(pos,refining=false){
 coords={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy};const accuracy=Math.round(coords.accuracy||0);
 qs("#locationBox").innerHTML=`✓ Lokasi ${refining?"didapat • sedang memperbaiki akurasi":"didapat"}<br><small>Lat ${coords.latitude.toFixed(6)} • Lng ${coords.longitude.toFixed(6)} • ±${accuracy} m</small>`;
 qs("#submitDelivery").disabled=!(coords&&photoBlob);
}
function getLocation(){
 coords=null;qs("#locationBox").textContent="Mencari lokasi GPS...";
 if(!navigator.geolocation){qs("#locationBox").textContent="GPS tidak didukung browser.";return}
 navigator.geolocation.getCurrentPosition(pos=>applyLocation(pos,true),()=>{},{enableHighAccuracy:false,timeout:4000,maximumAge:120000});
 if(locationWatchId!==null){try{navigator.geolocation.clearWatch(locationWatchId)}catch{}locationWatchId=null}
 if(locationFastTimer)clearTimeout(locationFastTimer);
 locationWatchId=navigator.geolocation.watchPosition(pos=>{applyLocation(pos,false);if(Number(pos.coords.accuracy||9999)<=50){try{navigator.geolocation.clearWatch(locationWatchId)}catch{}locationWatchId=null;if(locationFastTimer){clearTimeout(locationFastTimer);locationFastTimer=null}}},err=>{if(!coords){qs("#locationBox").textContent="Lokasi gagal: "+err.message;toast("Izinkan akses lokasi untuk melanjutkan.","error")}}, {enableHighAccuracy:true,timeout:8000,maximumAge:0});
 locationFastTimer=setTimeout(()=>{if(locationWatchId!==null){try{navigator.geolocation.clearWatch(locationWatchId)}catch{}locationWatchId=null}locationFastTimer=null;if(coords)qs("#locationBox").innerHTML+=`<br><small class="muted">Lokasi siap digunakan.</small>`},8500);
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}

async function submitDelivery(){
 if(!selectedTask||!selectedBcl||!photoBlob||!coords)return;
 qs("#submitDelivery").disabled=true;qs("#submitDelivery").textContent="Mengirim...";setLoading(true,"Menyimpan penyaluran dan foto...");
 try{
  const photoBase64=await blobToDataUrl(photoBlob);
  await uploadDeliveryPhoto({assignmentId:selectedTask.id,bclId:selectedBcl.id,bclName:selectedBcl.name,latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,photoBase64});
  toast("Penyaluran berhasil disimpan.");stopCamera();stopScanner();await loadTasks();await loadHistory();renderHome();renderTasks();resetDeliver();showZView("homeView");
 }catch(e){console.error(e);toast(e.message||"Upload gagal.","error");qs("#submitDelivery").disabled=false;qs("#submitDelivery").textContent="Submit Penyaluran"}finally{setLoading(false)}
}
function resetDeliver(){
 selectedTask=null;selectedBcl=null;photoBlob=null;coords=null;stopCamera();stopScanner();
 qs("#deliverStep2").classList.add("hidden");qs("#deliverStep3").classList.add("hidden");qs("#camera").classList.remove("hidden");qs("#photoPreview").classList.add("hidden");qs("#submitDelivery").textContent="Submit Penyaluran";qs("#submitDelivery").disabled=true;qs("#scanResult").innerHTML="";qs("#manualBclId").value="";
}

function showSpjForm(){
 const m=qs("#historyMonth").value;
 if(!m){toast("Pilih bulan terlebih dahulu.","error");return}
 const rows=history.filter(x=>monthOf(x.createdAt)===m);
 if(!rows.length){toast("Tidak ada penyaluran pada bulan yang dipilih.","error");return}
 setLoading(true,"Menyiapkan data SPJ...");
 setTimeout(()=>{
  const assignmentsById=Object.fromEntries(tasks.map(x=>[x.id,x]));
  // Riwayat dapat berisi assignment lama yang tidak lagi ada di tasks.
  getMyAssignments().then(all=>{
    const byId=Object.fromEntries(all.map(x=>[x.id,x]));
    openSpjModal(rows,byId,m);
  }).catch(e=>toast(e.message||"Gagal memuat rincian tugas.","error")).finally(()=>setLoading(false));
 },30);
}
function openSpjModal(rows,assignmentsById,m){
 openModal(`<h2>Generate SPJ Penyaluran</h2><p class="muted">Periode: <b>${esc(monthLabel(m))}</b> • ${rows.length} penyaluran</p><div class="spj-preview-list">${rows.map((d,i)=>{const a=assignmentsById[d.assignmentId];return `<div class="spj-row"><b>${i+1}. ${esc(d.bclName)}</b><small>${esc(d.bclId)} • ${esc(d.zmartName)} • ${esc(a?.packageName||"Paket BCL")}</small><small>${esc((a?.items||[]).map(it=>it.name).join(", ")||"-")}</small></div>`}).join("")}</div><label>Foto Nota <input id="zSpjNota" type="file" accept="image/*" capture="environment" required></label><small class="muted">Foto nota akan dimasukkan ke SPJ.</small><button id="zGenerateSpj" class="btn primary full" disabled>🖨️ Generate & Cetak SPJ</button>`);
 const input=qs("#zSpjNota"),btn=qs("#zGenerateSpj");let noteData="";
 input.onchange=()=>{const f=input.files?.[0];if(!f){btn.disabled=true;return}const r=new FileReader();r.onload=()=>{noteData=r.result;btn.disabled=false};r.readAsDataURL(f)};
 btn.onclick=()=>printSpj(rows,assignmentsById,m,noteData);
}
function openModal(html){
 let modal=document.querySelector("#spjModal");
 if(!modal){modal=document.createElement("dialog");modal.id="spjModal";document.body.appendChild(modal)}
 modal.innerHTML=`<div class="modal-card"><button class="modal-close" id="spjClose">×</button>${html}</div>`;modal.showModal();qs("#spjClose").onclick=()=>modal.close();
}
function printSpj(rows,assignmentsById,m,noteData){
 const w=window.open("","_blank","width=1000,height=800");
 if(!w){toast("Popup diblokir browser. Izinkan popup untuk mencetak SPJ.","error");return}
 const detail=rows.map((d,i)=>{const a=assignmentsById[d.assignmentId]||{};return `<tr><td>${i+1}</td><td>${escapePrint(d.bclId)}<br><b>${escapePrint(d.bclName)}</b><br><small>${escapePrint(d.district||"-")}</small></td><td>${escapePrint(d.zmartName||me?.name||"-")}</td><td><b>${escapePrint(a.packageName||"Paket BCL")}</b><br>${escapePrint((a.items||[]).map(it=>it.name).join(", ")||"-")}</td><td>${escapePrint(fmtDate(d.createdAt))}</td><td>${d.photoUrl?`<a href="${escapePrint(d.photoUrl)}" target="_blank">Bukti</a>`:"-"}</td></tr>`}).join("");
 const totalBcl=new Set(rows.map(x=>x.bclId)).size;
 w.document.write(`<!doctype html><html><head><title>SPJ BCL ${escapePrint(monthLabel(m))}</title><style>
 *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172b24;margin:0;padding:30px;font-size:12px}.head{text-align:center;border-bottom:3px solid #087f5b;padding-bottom:14px;margin-bottom:18px}.head h1{font-size:20px;margin:0}.head p{margin:5px 0;color:#5c6e66}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:15px}.meta div{border:1px solid #d5e6dd;border-radius:8px;padding:8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cfdad5;padding:7px;vertical-align:top}th{background:#eaf6f0;font-size:10px}.summary{margin:15px 0;font-weight:700}.nota{margin-top:25px;border-top:1px solid #cfdad5;padding-top:15px}.nota img{max-width:320px;max-height:420px;display:block;margin-top:8px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:55px;text-align:center}.sign p{margin-top:70px;border-top:1px solid #555;padding-top:5px}@media print{body{padding:12mm}}</style></head><body><div class="head"><h1>BERITA ACARA / SPJ PENYALURAN BCL</h1><p>BAZNAS KABUPATEN SRAGEN</p><p>Periode ${escapePrint(monthLabel(m))}</p></div><div class="meta"><div><b>ZMart Penyalur</b><br>${escapePrint(me?.name||"-")}</div><div><b>Jumlah Penyaluran</b><br>${rows.length} penyaluran / ${totalBcl} BCL</div></div><table><thead><tr><th>No</th><th>Data BCL</th><th>ZMart Penyalur</th><th>Barang / Paket</th><th>Tanggal</th><th>Bukti</th></tr></thead><tbody>${detail}</tbody></table><div class="summary">SPJ periode ${escapePrint(monthLabel(m))} memuat data BCL, barang yang disalurkan, ZMart penyalur, dan bukti penyaluran.</div><div class="nota"><b>NOTA / BUKTI BELANJA</b>${noteData?`<img src="${noteData}" alt="Nota">`:"<p>Tidak ada foto nota.</p>"}</div><div class="sign"><div>ZMart Penyalur<p>____________________________</p></div><div>BAZNAS Kabupaten Sragen<p>____________________________</p></div></div><script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);
 w.document.close();
}
