import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { appsScriptConfig } from "./firebase-config.js";

export function qs(s){return document.querySelector(s)}
export function qsa(s){return [...document.querySelectorAll(s)]}
export function toast(msg, type="ok"){
  const el=qs("#toast"); if(!el)return; el.textContent=msg; el.className=`toast show ${type}`;
  setTimeout(()=>el.className="toast",3200);
}
export function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
export function fmtDate(v){
  if(!v)return "-"; const d=v?.toDate?v.toDate():new Date(v);
  if(Number.isNaN(d.getTime()))return "-";
  return d.toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});
}

async function api(action, payload={}){
  if(!appsScriptConfig.apiUrl || appsScriptConfig.apiUrl.includes("GANTI_")) throw new Error("URL Apps Script belum diisi di js/firebase-config.js");
  const user=auth.currentUser;
  if(!user) throw new Error("Sesi login tidak ditemukan.");
  const idToken=await user.getIdToken(true);
  const body=JSON.stringify({action,...payload});
  const res=await fetch(appsScriptConfig.apiUrl,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({idToken,action,...payload})});
  const text=await res.text();
  let data; try{data=JSON.parse(text)}catch{throw new Error("Respons Apps Script tidak valid: "+text.slice(0,180))}
  if(!data.ok) throw new Error(data.error||"Permintaan gagal.");
  return data.data;
}

export async function getProfile(){ return api("getProfile"); }
export async function getUsers(){ return api("listUsers"); }
export async function saveUserProfile(userData){ return api("saveUser",{user:userData}); }

export function guard(role, callback){
  onAuthStateChanged(auth, async user=>{
    if(!user){location.href="index.html";return}
    try{
      const p=await getProfile();
      await user.getIdToken(true);
      if(!p || p.role!==role || p.active!==true){await signOut(auth);alert("Akses tidak sesuai role atau akun nonaktif.");location.href="index.html";return}
      callback(user,p);
    }catch(e){console.error(e);toast(e.message||"Gagal memuat profil.","error")}
  });
}
export async function logout(){await signOut(auth);location.href="index.html"}
