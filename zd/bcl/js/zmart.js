import { guard,qs,qsa,esc,fmtDate,toast,logout,getMyAssignments,getMyDeliveries,findBcl as apiFindBcl,uploadDeliveryPhoto } from "./common.js";

let me,tasks=[],history=[],selectedTask=null,selectedBcl=null,stream=null,facing="environment",coords=null,photoBlob=null,scanner=null;

guard("zmart",async(user,p)=>{me={...p,uid:user.uid};qs("#zmartName").textContent=p.name||user.email;qs("#hello").textContent=`Halo, ${p.name||"ZMart"} 👋`;bind();await loadTasks();renderHome();renderTasks();await loadHistory();});

function bind(){
 qs("#logoutBtn").onclick=logout;
 qsa(".bottom-nav button").forEach(b=>b.onclick=()=>showZView(b.dataset.zview));
 qs("#openTasksBtn").onclick=()=>showZView("tasksView");
 qs("#backTasks").onclick=()=>showZView("tasksView");
 qs("#startScan").onclick=startScanner;
 qs("#manualFind").onclick=()=>findBcl(qs("#manualBclId").value.trim());
 qs("#toPhoto").onclick=toPhoto;
 qs("#takePhoto").onclick=takePhoto;
 qs("#switchCamera").onclick=async()=>{facing=facing==="environment"?"user":"environment";if(stream){stopCamera();startCamera()}};
 qs("#submitDelivery").onclick=submitDelivery;
}
function showZView(id){qsa(".mobile-content>.view").forEach(x=>x.classList.toggle("active",x.id===id));qsa(".bottom-nav button").forEach(x=>x.classList.toggle("active",x.dataset.zview===id));window.scrollTo({top:0,behavior:"smooth"})}
async function loadTasks(){tasks=(await getMyAssignments()).filter(x=>x.status==="ASSIGNED"||x.status==="IN_PROGRESS");}
async function loadHistory(){history=await getMyDeliveries();renderHistory();}
function renderHome(){
 const done=history.length;qs("#taskTotal").textContent=tasks.length;qs("#taskDone").textContent=done;
 const pct=tasks.length?Math.round(done/tasks.length*100):0;qs("#progressText").textContent=`${done}/${tasks.length}`;qs("#progressBar").style.width=Math.min(100,pct)+"%";
 qs("#taskPreview").innerHTML=tasks.slice(0,5).map(t=>`<div class="list-row"><div><b>${esc(t.bclName)}</b><small>${esc(t.packageName||"Paket BCL")}</small></div><button class="btn small" data-task="${esc(t.id)}">Buka</button></div>`).join("")||`<p class="muted">Belum ada penugasan.</p>`;
 qsa("[data-task]").forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}
function renderTasks(){
 qs("#taskList").innerHTML=tasks.map(t=>`<button class="task-card" data-task="${esc(t.id)}"><div class="task-avatar">${esc((t.bclName||"?")[0])}</div><div><b>${esc(t.bclName)}</b><span>${esc(t.bclId)} • ${esc(t.packageName||"Paket BCL")}</span><small>${esc(t.status)}</small></div><span>›</span></button>`).join("")||`<div class="card"><p class="muted">Belum ada tugas dari Admin.</p></div>`;
 qsa("#taskList [data-task]").forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}
function renderHistory(){
 const wrap=qs("#historyList");
 wrap.innerHTML=history.map(x=>`<div class="card history-item"><div><b>${esc(x.bclName)}</b><span>${fmtDate(x.createdAt)}</span><span>${esc(x.district||"Lokasi tidak tersedia")}</span></div><span class="badge">${esc(x.status)}</span>${x.photoUrl?`<a target="_blank" rel="noopener noreferrer" href="${esc(x.photoUrl)}" class="btn small">Foto</a>`:""}</div>`).join("")||`<div class="card"><p class="muted">Belum ada riwayat.</p></div>`;
}
async function openTask(id){selectedTask=tasks.find(x=>x.id===id);if(!selectedTask)return;qs("#deliverTitle").textContent=selectedTask.bclName;qs("#scanResult").innerHTML="";qs("#manualBclId").value=selectedTask.bclId;showZView("deliverView");await findBcl(selectedTask.bclId);}
async function findBcl(id){
 if(!id){toast("Masukkan ID BCL.","error");return}
 try{
  const s=await apiFindBcl(id);selectedBcl=s;
  if(!selectedBcl){toast("Data BCL tidak ditemukan.","error");return}
  if(selectedTask&&selectedTask.bclId!==selectedBcl.id){toast("QR bukan BCL yang sedang ditugaskan.","error");return}

  const mapsButton=selectedBcl.mapsUrl
    ? `<a href="${esc(selectedBcl.mapsUrl)}" target="_blank" rel="noopener noreferrer" class="btn small">🗺️ Buka Lokasi Rumah</a>`
    : `<small class="muted">📍 Lokasi rumah belum tersedia.</small>`;

  qs("#scanResult").innerHTML=`<div class="verified"><b>✓ Penerima ditemukan</b><span>${esc(selectedBcl.name)}</span><small>${esc(selectedBcl.district||"")} • ${esc(selectedBcl.village||"")}</small><div style="margin-top:10px">${mapsButton}</div></div>`;
  qs("#deliverStep2").classList.remove("hidden");qs("#packageName").textContent=selectedTask?.packageName||"Paket Sembako BCL";
  const items=selectedTask?.items||[{name:"Beras 5 kg"},{name:"Minyak Goreng 1 L"},{name:"Gula 1 kg"}];
  qs("#itemChecklist").innerHTML=items.map((it,i)=>`<label class="check"><input type="checkbox" data-item="${i}"><span>${esc(it.name)}</span></label>`).join("");
 }catch(e){toast(e.message,"error")}
}
async function startScanner(){
 if(scanner)return;scanner=new Html5Qrcode("reader");
 try{await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},text=>{if(selectedTask&&text!==selectedTask.bclId){toast("QR bukan BCL yang ditugaskan.","error");return}findBcl(text);stopScanner()},()=>{});qs("#startScan").textContent="Scanner aktif"}
 catch(e){scanner=null;toast("Kamera/QR tidak dapat dibuka. Gunakan input manual.","error")}
}
async function stopScanner(){if(scanner){try{await scanner.stop()}catch{}try{scanner.clear()}catch{}scanner=null}qs("#startScan").textContent="Buka Scanner"}
async function toPhoto(){const checks=[...document.querySelectorAll("[data-item]")];if(checks.some(x=>!x.checked)){toast("Centang semua sembako sebelum lanjut.","error");return}qs("#deliverStep3").classList.remove("hidden");qs("#submitDelivery").disabled=true;startCamera();getLocation()}
async function startCamera(){try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});qs("#camera").srcObject=stream}catch(e){toast("Kamera tidak tersedia. Pastikan HTTPS dan izin kamera aktif.","error")}}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
function takePhoto(){const v=qs("#camera"),c=qs("#canvas");if(!stream){toast("Kamera belum aktif.","error");return}const maxW=1280,scale=Math.min(1,maxW/(v.videoWidth||1));c.width=Math.round((v.videoWidth||1280)*scale);c.height=Math.round((v.videoHeight||720)*scale);c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(b=>{photoBlob=b;qs("#photoPreview").src=URL.createObjectURL(b);qs("#photoPreview").classList.remove("hidden");qs("#camera").classList.add("hidden");qs("#submitDelivery").disabled=!(coords&&photoBlob)},"image/jpeg",.78)}
function getLocation(){
 qs("#locationBox").textContent="Mengambil lokasi GPS...";
 if(!navigator.geolocation){qs("#locationBox").textContent="GPS tidak didukung browser.";return}
 navigator.geolocation.getCurrentPosition(pos=>{coords={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy};qs("#locationBox").innerHTML=`✓ Lokasi didapat<br><small>Lat ${coords.latitude.toFixed(6)} • Lng ${coords.longitude.toFixed(6)} • ±${Math.round(coords.accuracy)} m</small>`;qs("#submitDelivery").disabled=!(coords&&photoBlob)},err=>{qs("#locationBox").textContent="Lokasi gagal: "+err.message;toast("Izinkan akses lokasi untuk melanjutkan.","error")},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
async function submitDelivery(){
 if(!selectedTask||!selectedBcl||!photoBlob||!coords)return;
 qs("#submitDelivery").disabled=true;qs("#submitDelivery").textContent="Mengirim...";
 try{
  const photoBase64=await blobToDataUrl(photoBlob);
  await uploadDeliveryPhoto({assignmentId:selectedTask.id,bclId:selectedBcl.id,bclName:selectedBcl.name,latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,photoBase64});
  toast("Penyaluran berhasil disubmit.");stopCamera();await loadTasks();await loadHistory();renderHome();renderTasks();resetDeliver();showZView("homeView");
 }catch(e){console.error(e);toast(e.message||"Upload gagal.","error");qs("#submitDelivery").disabled=false;qs("#submitDelivery").textContent="Submit Penyaluran"}
}
function resetDeliver(){selectedTask=null;selectedBcl=null;photoBlob=null;coords=null;qs("#deliverStep2").classList.add("hidden");qs("#deliverStep3").classList.add("hidden");qs("#camera").classList.remove("hidden");qs("#photoPreview").classList.add("hidden");qs("#submitDelivery").textContent="Submit Penyaluran";qs("#submitDelivery").disabled=true;qs("#scanResult").innerHTML=""}
