import { auth } from "./firebase.js";
import { createUserWithEmailAndPassword, getAuth as getSecondaryAuth, signOut as secondarySignOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { guard,qs,qsa,esc,fmtDate,toast,logout,getUsers,saveUserProfile,getBcls,saveBcl,getAssignments,createAssignment,getDeliveries } from "./common.js";

let bcls=[],users=[],assignments=[],deliveries=[],profile;
const $=qs;
guard("admin",async(user,p)=>{profile=p;$("#adminName").textContent=p.name||user.email;bind();await loadAll();renderAll();});

function bind(){
 $("#logoutBtn").onclick=logout;
 qsa(".nav-btn").forEach(b=>b.onclick=()=>showView(b.dataset.view));
 $("#addBclBtn").onclick=showBclForm;
 $("#addAssignmentBtn").onclick=showAssignmentForm;
 $("#addUserBtn").onclick=showUserForm;
 $("#bclSearch").oninput=renderBcl;$("#bclStatus").onchange=renderBcl;
 $("#deliverySearch").oninput=renderDeliveries;$("#deliveryStatus").onchange=renderDeliveries;
}
function showView(v){qsa(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.view===v));qsa(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+v))}
async function loadAll(){[bcls,users,assignments,deliveries]=await Promise.all([getBcls(),getUsers(),getAssignments(),getDeliveries()]);}
function renderAll(){renderStats();renderBcl();renderAssignments();renderDeliveries();renderUsers()}
function renderStats(){
 const total=bcls.length,assigned=bcls.filter(x=>x.status==="DITUGASKAN").length,done=bcls.filter(x=>x.status==="SELESAI").length;
 $("#statBcl").textContent=total;$("#statAssigned").textContent=assigned;$("#statDone").textContent=done;$("#statPending").textContent=Math.max(0,total-done);
 const counts={SUBMITTED:deliveries.filter(x=>x.status==="SUBMITTED").length,VERIFIED:deliveries.filter(x=>x.status==="VERIFIED").length};
 $("#statusBars").innerHTML=Object.entries(counts).map(([k,v])=>`<div class="bar-row"><span>${k}</span><b>${v}</b></div>`).join("")||`<p class="muted">Belum ada penyaluran.</p>`;
 $("#recentDeliveries").innerHTML=deliveries.slice(0,6).map(d=>`<div class="list-row"><div><b>${esc(d.bclName||d.bclId)}</b><small>${esc(d.zmartName||"ZMart")} • ${fmtDate(d.createdAt)}</small></div><span class="badge">${esc(d.status)}</span></div>`).join("")||`<p class="muted">Belum ada data.</p>`;
}
function renderBcl(){
 const s=($("#bclSearch").value||"").toLowerCase(),st=$("#bclStatus").value;
 const rows=bcls.filter(x=>(!st||x.status===st)&&[x.id,x.name,x.district,x.village].join(" ").toLowerCase().includes(s));
 $("#bclTable").innerHTML=`<table><thead><tr><th>ID</th><th>Penerima</th><th>Wilayah</th><th>Status</th><th>Lokasi</th><th>Aksi</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.id)}</td><td><b>${esc(x.name)}</b><small>${esc(x.address||"")}</small></td><td>${esc(x.district||"-")}<br>${esc(x.village||"-")}</td><td><span class="badge">${esc(x.status||"BELUM_DITUGASKAN")}</span></td><td>${x.mapsUrl?`<a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(x.mapsUrl)}">🗺️ Maps</a>`:`<span class="muted">Belum ada</span>`}</td><td><button class="btn small" data-edit-bcl="${esc(x.id)}">Edit</button></td></tr>`).join("")}</tbody></table>`;
 qsa("[data-edit-bcl]").forEach(b=>b.onclick=()=>showBclForm(b.dataset.editBcl));
}
function renderAssignments(){
 $("#assignmentTable").innerHTML=`<table><thead><tr><th>BCL</th><th>ZMart</th><th>Paket</th><th>Status</th><th>Waktu</th></tr></thead><tbody>${assignments.map(x=>`<tr><td><b>${esc(x.bclName)}</b><small>${esc(x.bclId)}</small></td><td>${esc(x.zmartName)}</td><td>${esc(x.packageName||"-")}</td><td><span class="badge">${esc(x.status)}</span></td><td>${fmtDate(x.createdAt)}</td></tr>`).join("")||`<tr><td colspan="5">Belum ada penugasan.</td></tr>`}</tbody></table>`;
}
function renderDeliveries(){
 const s=($("#deliverySearch").value||"").toLowerCase(),st=$("#deliveryStatus").value;
 const rows=deliveries.filter(x=>(!st||x.status===st)&&[x.bclId,x.bclName,x.zmartName,x.district].join(" ").toLowerCase().includes(s));
 $("#deliveryTable").innerHTML=`<table><thead><tr><th>Waktu</th><th>BCL</th><th>ZMart</th><th>Lokasi</th><th>Status</th><th>Bukti</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${fmtDate(x.createdAt)}</td><td><b>${esc(x.bclName)}</b><small>${esc(x.bclId)}</small></td><td>${esc(x.zmartName)}</td><td>${esc(x.district||"-")}<br><small>${x.latitude??"-"}, ${x.longitude??"-"}</small></td><td><span class="badge">${esc(x.status)}</span></td><td>${x.photoUrl?`<a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(x.photoUrl)}">Foto</a>`:"-"}</td></tr>`).join("")||`<tr><td colspan="6">Belum ada penyaluran.</td></tr>`}</tbody></table>`;
}
function renderUsers(){
 const rows=users.filter(x=>x.role==="zmart");
 $("#userTable").innerHTML=`<table><thead><tr><th>Nama</th><th>Email</th><th>Wilayah</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.email)}</td><td>${esc(x.area||"-")}</td><td><span class="badge ${x.active===false?"danger":""}">${x.active===false?"Nonaktif":"Aktif"}</span></td></tr>`).join("")||`<tr><td colspan="4">Belum ada ZMart.</td></tr>`}</tbody></table>`;
}
function openModal(html){$("#modalBody").innerHTML=html;$("#modal").showModal()}
function showBclForm(id=""){
 const x=bcls.find(v=>v.id===id)||{};
 openModal(`<h2>${id?"Edit":"Tambah"} BCL</h2><form id="bclForm"><label>ID BCL<input name="id" value="${esc(x.id||"BCL-"+Date.now())}" ${id?"readonly":""} required></label><label>Nama penerima<input name="name" value="${esc(x.name||"")}" required></label><label>Kecamatan<input name="district" value="${esc(x.district||"")}" required></label><label>Desa/Kelurahan<input name="village" value="${esc(x.village||"")}"></label><label>Alamat<textarea name="address">${esc(x.address||"")}</textarea></label><label>No. Kartu/Identitas<input name="cardNo" value="${esc(x.cardNo||"")}"></label><label>📍 Link Lokasi Rumah di Google Maps<input name="mapsUrl" type="url" value="${esc(x.mapsUrl||"")}" placeholder="https://maps.google.com/..."><small class="muted">Buka Google Maps → pilih lokasi rumah → Bagikan → Salin link → tempel di sini.</small></label><button class="btn primary full">Simpan</button></form>`);
 $("#bclForm").onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target));data.status=x.status||"BELUM_DITUGASKAN";data.assignedTo=x.assignedTo||"";data.assignedZmartName=x.assignedZmartName||"";await saveBcl(data);$("#modal").close();await loadAll();renderAll();toast("Data BCL tersimpan.")}catch(err){toast(err.message,"error")}};
}
function showAssignmentForm(){
 const pending=bcls.filter(x=>x.status!=="SELESAI"),zmarts=users.filter(x=>x.role==="zmart"&&x.active!==false);
 openModal(`<h2>Buat Penugasan</h2><form id="assignmentForm"><label>BCL<select name="bclId" required><option value="">Pilih BCL</option>${pending.map(x=>`<option value="${esc(x.id)}">${esc(x.id)} — ${esc(x.name)}</option>`).join("")}</select></label><label>ZMart<select name="zmartUid" required><option value="">Pilih ZMart</option>${zmarts.map(x=>`<option value="${esc(x.uid)}">${esc(x.name)} — ${esc(x.area||"")}</option>`).join("")}</select></label><label>Nama paket<input name="packageName" value="Paket Sembako BCL"></label><label>Isi paket (pisahkan dengan koma)<textarea name="items">Beras 5 kg, Minyak Goreng 1 L, Gula 1 kg, Tepung Terigu 1 kg, Susu 2 pcs</textarea></label><button class="btn primary full">Buat Penugasan</button></form>`);
 $("#assignmentForm").onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);const items=String(f.get("items")||"").split(",").map(x=>({name:x.trim(),checked:false})).filter(x=>x.name);await createAssignment({bclId:f.get("bclId"),zmartUid:f.get("zmartUid"),packageName:f.get("packageName"),items});$("#modal").close();await loadAll();renderAll();toast("Penugasan dibuat.")}catch(err){toast(err.message,"error")}};
}
function showUserForm(){
 openModal(`<h2>Tambah ZMart</h2><p class="muted">Akun Firebase Authentication dibuat otomatis. Data profil dan role disimpan di Google Sheet.</p><form id="userForm"><label>Nama ZMart<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Password awal<input name="password" type="password" minlength="6" required></label><label>Wilayah<input name="area"></label><button class="btn primary full">Buat akun</button></form>`);
 $("#userForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);let secondary;try{secondary=initializeApp(firebaseConfig,"Secondary-"+Date.now());const sa=getSecondaryAuth(secondary);const cred=await createUserWithEmailAndPassword(sa,f.get("email"),f.get("password"));await saveUserProfile({uid:cred.user.uid,email:f.get("email"),name:f.get("name"),nip:"",jabatan:"ZMart Deliver",role:"zmart",area:f.get("area"),status:"AKTIF"});await secondarySignOut(sa);$("#modal").close();await loadAll();renderUsers();toast("Akun ZMart dibuat dan disimpan di Google Sheet.")}catch(err){toast(err.message,"error")}}
}
