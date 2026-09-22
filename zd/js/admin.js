import { auth, db, storage, app } from "./firebase.js";
import { guard, qs, qsa, esc, fmtDate, toast, logout } from "./common.js";
import {
 collection, getDocs, addDoc, setDoc, updateDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

let bcls=[], users=[], assignments=[], deliveries=[], profile;
const $=qs;
guard("admin", async (user,p)=>{profile=p; $("#adminName").textContent=p.name||user.email; bind(); await loadAll(); renderAll();});

function bind(){
 $("#logoutBtn").onclick=logout;
 qsa(".nav-btn").forEach(b=>b.onclick=()=>showView(b.dataset.view));
 $("#addBclBtn").onclick=showBclForm;
 $("#addAssignmentBtn").onclick=showAssignmentForm;
 $("#addUserBtn").onclick=showUserForm;
 $("#bclSearch").oninput=renderBcl; $("#bclStatus").onchange=renderBcl;
 $("#deliverySearch").oninput=renderDeliveries; $("#deliveryStatus").onchange=renderDeliveries;
}
function showView(v){qsa(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.view===v));qsa(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+v))}
async function loadAll(){
 const [a,u,as,d]=await Promise.all([getDocs(collection(db,"bcl")),getDocs(collection(db,"users")),getDocs(collection(db,"assignments")),getDocs(query(collection(db,"deliveries"),orderBy("createdAt","desc")))]);
 bcls=a.docs.map(x=>({id:x.id,...x.data()})); users=u.docs.map(x=>({id:x.id,...x.data()})); assignments=as.docs.map(x=>({id:x.id,...x.data()})); deliveries=d.docs.map(x=>({id:x.id,...x.data()}));
}
function renderAll(){renderStats();renderBcl();renderAssignments();renderDeliveries();renderUsers()}
function renderStats(){
 const total=bcls.length, assigned=bcls.filter(x=>x.status==="DITUGASKAN").length, done=bcls.filter(x=>x.status==="SELESAI").length;
 $("#statBcl").textContent=total;$("#statAssigned").textContent=assigned;$("#statDone").textContent=done;$("#statPending").textContent=Math.max(0,total-done);
 const counts={SUBMITTED:deliveries.filter(x=>x.status==="SUBMITTED").length,VERIFIED:deliveries.filter(x=>x.status==="VERIFIED").length};
 $("#statusBars").innerHTML=Object.entries(counts).map(([k,v])=>`<div class="bar-row"><span>${k}</span><b>${v}</b></div>`).join("")||`<p class="muted">Belum ada penyaluran.</p>`;
 $("#recentDeliveries").innerHTML=deliveries.slice(0,6).map(d=>`<div class="list-row"><div><b>${esc(d.bclName||d.bclId)}</b><small>${esc(d.zmartName||"ZMart")} • ${fmtDate(d.createdAt)}</small></div><span class="badge">${esc(d.status)}</span></div>`).join("")||`<p class="muted">Belum ada data.</p>`;
}
function renderBcl(){
 const s=($("#bclSearch").value||"").toLowerCase(), st=$("#bclStatus").value;
 const rows=bcls.filter(x=>(!st||x.status===st)&&[x.id,x.name,x.district,x.village].join(" ").toLowerCase().includes(s));
 $("#bclTable").innerHTML=`<table><thead><tr><th>ID</th><th>Penerima</th><th>Wilayah</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.id)}</td><td><b>${esc(x.name)}</b><small>${esc(x.address||"")}</small></td><td>${esc(x.district||"-")}<br>${esc(x.village||"-")}</td><td><span class="badge">${esc(x.status||"BELUM_DITUGASKAN")}</span></td><td><button class="btn small" data-edit-bcl="${esc(x.id)}">Edit</button></td></tr>`).join("")}</tbody></table>`;
 qsa("[data-edit-bcl]").forEach(b=>b.onclick=()=>showBclForm(b.dataset.editBcl));
}
function renderAssignments(){
 $("#assignmentTable").innerHTML=`<table><thead><tr><th>BCL</th><th>ZMart</th><th>Paket</th><th>Status</th><th>Waktu</th></tr></thead><tbody>${assignments.map(x=>`<tr><td><b>${esc(x.bclName)}</b><small>${esc(x.bclId)}</small></td><td>${esc(x.zmartName)}</td><td>${esc(x.packageName||"-")}</td><td><span class="badge">${esc(x.status)}</span></td><td>${fmtDate(x.createdAt)}</td></tr>`).join("")||`<tr><td colspan="5">Belum ada penugasan.</td></tr>`}</tbody></table>`;
}
function renderDeliveries(){
 const s=($("#deliverySearch").value||"").toLowerCase(), st=$("#deliveryStatus").value;
 const rows=deliveries.filter(x=>(!st||x.status===st)&&[x.bclId,x.bclName,x.zmartName,x.district].join(" ").toLowerCase().includes(s));
 $("#deliveryTable").innerHTML=`<table><thead><tr><th>Waktu</th><th>BCL</th><th>ZMart</th><th>Lokasi</th><th>Status</th><th>Bukti</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${fmtDate(x.createdAt)}</td><td><b>${esc(x.bclName)}</b><small>${esc(x.bclId)}</small></td><td>${esc(x.zmartName)}</td><td>${esc(x.district||"-")}<br><small>${x.latitude??"-"}, ${x.longitude??"-"}</small></td><td><span class="badge">${esc(x.status)}</span></td><td>${x.photoUrl?`<a class="btn small" target="_blank" href="${esc(x.photoUrl)}">Foto</a>`:"-"}</td></tr>`).join("")||`<tr><td colspan="6">Belum ada penyaluran.</td></tr>`}</tbody></table>`;
}
function renderUsers(){
 const rows=users.filter(x=>x.role==="zmart");
 $("#userTable").innerHTML=`<table><thead><tr><th>Nama</th><th>Email</th><th>Wilayah</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.email)}</td><td>${esc(x.area||"-")}</td><td><span class="badge ${x.active===false?"danger":""}">${x.active===false?"Nonaktif":"Aktif"}</span></td></tr>`).join("")||`<tr><td colspan="4">Belum ada ZMart.</td></tr>`}</tbody></table>`;
}
function openModal(html){$("#modalBody").innerHTML=html;$("#modal").showModal()}
function showBclForm(id=""){
 const x=bcls.find(v=>v.id===id)||{};
 openModal(`<h2>${id?"Edit":"Tambah"} BCL</h2><form id="bclForm">
 <label>ID BCL<input name="id" value="${esc(x.id||"BCL-"+Date.now())}" ${id?"readonly":""} required></label>
 <label>Nama penerima<input name="name" value="${esc(x.name||"")}" required></label>
 <label>Kecamatan<input name="district" value="${esc(x.district||"")}" required></label>
 <label>Desa/Kelurahan<input name="village" value="${esc(x.village||"")}"></label>
 <label>Alamat<textarea name="address">${esc(x.address||"")}</textarea></label>
 <label>No. Kartu/Identitas<input name="cardNo" value="${esc(x.cardNo||"")}"></label>
 <button class="btn primary full">Simpan</button></form>`);
 $("#bclForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target), data=Object.fromEntries(f);data.status=x.status||"BELUM_DITUGASKAN";data.updatedAt=serverTimestamp();await setDoc(doc(db,"bcl",data.id),data,{merge:true});$("#modal").close();await loadAll();renderAll();toast("Data BCL tersimpan.")};
}
function showAssignmentForm(){
 const pending=bcls.filter(x=>x.status!=="SELESAI"), zmarts=users.filter(x=>x.role==="zmart"&&x.active!==false);
 openModal(`<h2>Buat Penugasan</h2><form id="assignmentForm">
 <label>BCL<select name="bclId" required><option value="">Pilih BCL</option>${pending.map(x=>`<option value="${esc(x.id)}">${esc(x.id)} — ${esc(x.name)}</option>`).join("")}</select></label>
 <label>ZMart<select name="zmartUid" required><option value="">Pilih ZMart</option>${zmarts.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} — ${esc(x.area||"")}</option>`).join("")}</select></label>
 <label>Nama paket<input name="packageName" value="Paket Sembako BCL"></label>
 <label>Isi paket (pisahkan dengan koma)<textarea name="items">Beras 5 kg, Minyak Goreng 1 L, Gula 1 kg, Tepung Terigu 1 kg, Susu 2 pcs</textarea></label>
 <button class="btn primary full">Buat Penugasan</button></form>`);
 $("#assignmentForm").onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target), bcl=bcls.find(x=>x.id===f.get("bclId")), z=users.find(x=>x.id===f.get("zmartUid"));
  const items=f.get("items").split(",").map(x=>({name:x.trim(),checked:false})).filter(x=>x.name);
  await addDoc(collection(db,"assignments"),{bclId:bcl.id,bclName:bcl.name,zmartUid:z.id,zmartName:z.name,packageName:f.get("packageName"),items,status:"ASSIGNED",createdAt:serverTimestamp()});
  await updateDoc(doc(db,"bcl",bcl.id),{status:"DITUGASKAN",assignedTo:z.id,assignedZmartName:z.name,updatedAt:serverTimestamp()});
  $("#modal").close();await loadAll();renderAll();toast("Penugasan dibuat.");
 };
}
function showUserForm(){
 openModal(`<h2>Tambah ZMart</h2><p class="muted">Akun Authentication dibuat otomatis memakai email/password. Simpan password awal dan minta ZMart menggantinya.</p>
 <form id="userForm"><label>Nama ZMart<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Password awal<input name="password" type="password" minlength="6" required></label><label>Wilayah<input name="area"></label><button class="btn primary full">Buat akun</button></form>`);
 $("#userForm").onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target);let secondary;
  try{
   secondary=initializeApp(firebaseConfig,"Secondary-"+Date.now());
   const sa=getSecondaryAuth(secondary);const cred=await createUserWithEmailAndPassword(sa,f.get("email"),f.get("password"));
   await setDoc(doc(db,"users",cred.user.uid),{name:f.get("name"),email:f.get("email"),role:"zmart",area:f.get("area"),active:true,createdAt:serverTimestamp()});
   await secondarySignOut(sa);$("#modal").close();await loadAll();renderUsers();toast("Akun ZMart dibuat.");
  }catch(err){toast(err.message,"error")}
 };
}
