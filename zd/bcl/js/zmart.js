import { auth, db, storage } from "./firebase.js";
import { guard, qs, qsa, esc, fmtDate, toast, logout } from "./common.js";
import { collection, getDocs, query, where, orderBy, addDoc, updateDoc, doc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

let me, tasks=[], selectedTask=null, selectedBcl=null, stream=null, facing="environment", coords=null, photoBlob=null, scanner=null;

guard("zmart", async(user,p)=>{me={...p,uid:user.uid};qs("#zmartName").textContent=p.name||user.email;qs("#hello").textContent=`Halo, ${p.name||"ZMart"} 👋`;bind();await loadTasks();renderHome();renderTasks();renderHistory();});

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
async function loadTasks(){
 const snap=await getDocs(query(collection(db,"assignments"),where("zmartUid","==",me.uid)));
 tasks=snap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.status==="ASSIGNED"||x.status==="IN_PROGRESS");
}
function renderHome(){
 const done=tasks.filter(x=>x.status==="DONE").length; qs("#taskTotal").textContent=tasks.length;qs("#taskDone").textContent=done;
 const pct=tasks.length?Math.round(done/tasks.length*100):0;qs("#progressText").textContent=`${done}/${tasks.length}`;qs("#progressBar").style.width=pct+"%";
 qs("#taskPreview").innerHTML=tasks.slice(0,5).map(t=>`<div class="list-row"><div><b>${esc(t.bclName)}</b><small>${esc(t.packageName||"Paket BCL")}</small></div><button class="btn small" data-task="${esc(t.id)}">Buka</button></div>`).join("")||`<p class="muted">Belum ada penugasan.</p>`;
 qsa("[data-task]").forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}
function renderTasks(){
 qs("#taskList").innerHTML=tasks.map(t=>`<button class="task-card" data-task="${esc(t.id)}"><div class="task-avatar">${esc((t.bclName||"?")[0])}</div><div><b>${esc(t.bclName)}</b><span>${esc(t.bclId)} • ${esc(t.packageName||"Paket BCL")}</span><small>${esc(t.status)}</small></div><span>›</span></button>`).join("")||`<div class="card"><p class="muted">Belum ada tugas dari Admin.</p></div>`;
 qsa("#taskList [data-task]").forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}
function renderHistory(){
 const wrap=qs("#historyList");
 getDocs(query(collection(db,"deliveries"),where("zmartUid","==",me.uid),orderBy("createdAt","desc"))).then(s=>{
  const rows=s.docs.map(x=>({id:x.id,...x.data()}));
  wrap.innerHTML=rows.map(x=>`<div class="card history-item"><div><b>${esc(x.bclName)}</b><span>${fmtDate(x.createdAt)}</span><span>${esc(x.district||"Lokasi tidak tersedia")}</span></div><span class="badge">${esc(x.status)}</span>${x.photoUrl?`<a target="_blank" href="${esc(x.photoUrl)}" class="btn small">Foto</a>`:""}</div>`).join("")||`<div class="card"><p class="muted">Belum ada riwayat.</p></div>`;
 });
}
async function openTask(id){
 selectedTask=tasks.find(x=>x.id===id); if(!selectedTask)return;
 qs("#deliverTitle").textContent=selectedTask.bclName;qs("#scanResult").innerHTML="";qs("#manualBclId").value=selectedTask.bclId;
 showZView("deliverView");
 await findBcl(selectedTask.bclId);
}
async function findBcl(id){
 if(!id){toast("Masukkan ID BCL.","error");return}
 const s=await getDoc(doc(db,"bcl",id));
 if(!s.exists()){toast("BCL tidak ditemukan.","error");return}
 selectedBcl={id:s.id,...s.data()};
 if(selectedTask && selectedTask.bclId!==selectedBcl.id){toast("QR bukan BCL yang sedang ditugaskan.","error");return}
 qs("#scanResult").innerHTML=`<div class="verified"><b>✓ Penerima ditemukan</b><span>${esc(selectedBcl.name)}</span><small>${esc(selectedBcl.district||"")} • ${esc(selectedBcl.village||"")}</small></div>`;
 qs("#deliverStep2").classList.remove("hidden");
 qs("#packageName").textContent=selectedTask?.packageName||"Paket Sembako BCL";
 const items=selectedTask?.items||[{name:"Beras 5 kg"},{name:"Minyak Goreng 1 L"},{name:"Gula 1 kg"}];
 qs("#itemChecklist").innerHTML=items.map((it,i)=>`<label class="check"><input type="checkbox" data-item="${i}"><span>${esc(it.name)}</span></label>`).join("");
}
async function startScanner(){
 if(scanner)return;
 scanner=new Html5Qrcode("reader");
 try{
  await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},text=>{
    if(selectedTask && text!==selectedTask.bclId){toast("QR bukan BCL yang ditugaskan.","error");return}
    findBcl(text);stopScanner();
  },()=>{});
  qs("#startScan").textContent="Scanner aktif";
 }catch(e){scanner=null;toast("Kamera/QR tidak dapat dibuka. Gunakan input manual.","error")}
}
async function stopScanner(){if(scanner){try{await scanner.stop()}catch{};scanner.clear();scanner=null}qs("#startScan").textContent="Buka Scanner"}
async function toPhoto(){
 const checks=[...document.querySelectorAll("[data-item]")];
 if(checks.some(x=>!x.checked)){toast("Centang semua sembako sebelum lanjut.","error");return}
 qs("#deliverStep3").classList.remove("hidden");qs("#submitDelivery").disabled=true;startCamera();getLocation();
}
async function startCamera(){
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});qs("#camera").srcObject=stream}catch(e){toast("Kamera tidak tersedia. Pastikan HTTPS dan izin kamera aktif.","error")}
}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
function takePhoto(){
 const v=qs("#camera"), c=qs("#canvas"); if(!stream){toast("Kamera belum aktif.","error");return}
 const maxW=1280, scale=Math.min(1,maxW/v.videoWidth||1);c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext("2d").drawImage(v,0,0,c.width,c.height);
 c.toBlob(b=>{photoBlob=b;qs("#photoPreview").src=URL.createObjectURL(b);qs("#photoPreview").classList.remove("hidden");qs("#camera").classList.add("hidden");qs("#submitDelivery").disabled=!(coords&&photoBlob)}, "image/jpeg", .78);
}
function getLocation(){
 qs("#locationBox").textContent="Mengambil lokasi GPS...";
 if(!navigator.geolocation){qs("#locationBox").textContent="GPS tidak didukung browser.";return}
 navigator.geolocation.getCurrentPosition(pos=>{
   coords={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy};
   qs("#locationBox").innerHTML=`✓ Lokasi didapat<br><small>Lat ${coords.latitude.toFixed(6)} • Lng ${coords.longitude.toFixed(6)} • ±${Math.round(coords.accuracy)} m</small>`;
   qs("#submitDelivery").disabled=!(coords&&photoBlob);
 },err=>{qs("#locationBox").textContent="Lokasi gagal: "+err.message;toast("Izinkan akses lokasi untuk melanjutkan.","error")},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
async function submitDelivery(){
 if(!selectedTask||!selectedBcl||!photoBlob||!coords)return;
 qs("#submitDelivery").disabled=true;qs("#submitDelivery").textContent="Mengirim...";
 try{
  const stamp=Date.now(), path=`users/${me.uid}/deliveries/${selectedTask.id}/${stamp}.jpg`;
  const storageRef=ref(storage,path);await uploadBytes(storageRef,photoBlob,{contentType:"image/jpeg",customMetadata:{bclId:selectedBcl.id,zmartUid:me.uid}});
  const photoUrl=await getDownloadURL(storageRef);
  await addDoc(collection(db,"deliveries"),{assignmentId:selectedTask.id,bclId:selectedBcl.id,bclName:selectedBcl.name,zmartUid:me.uid,zmartName:me.name||"",district:selectedBcl.district||"",latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,photoUrl,photoPath:path,status:"SUBMITTED",createdAt:serverTimestamp()});
  await updateDoc(doc(db,"assignments",selectedTask.id),{status:"DONE",completedAt:serverTimestamp()});
  await updateDoc(doc(db,"bcl",selectedBcl.id),{status:"SELESAI",deliveredAt:serverTimestamp()});
  toast("Penyaluran berhasil disubmit.");stopCamera();await loadTasks();renderHome();renderTasks();renderHistory();resetDeliver();showZView("homeView");
 }catch(e){console.error(e);toast(e.message||"Upload gagal.","error");qs("#submitDelivery").disabled=false;qs("#submitDelivery").textContent="Submit Penyaluran"}
}
function resetDeliver(){selectedTask=null;selectedBcl=null;photoBlob=null;coords=null;qs("#deliverStep2").classList.add("hidden");qs("#deliverStep3").classList.add("hidden");qs("#camera").classList.remove("hidden");qs("#photoPreview").classList.add("hidden");qs("#submitDelivery").textContent="Submit Penyaluran";qs("#submitDelivery").disabled=true;qs("#scanResult").innerHTML=""}
