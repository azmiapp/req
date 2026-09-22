import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

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
export async function getProfile(uid){
  const s=await getDoc(doc(db,"users",uid)); return s.exists()?{id:s.id,...s.data()}:null;
}
export function guard(role, callback){
  onAuthStateChanged(auth, async user=>{
    if(!user){location.href="index.html";return}
    try{
      const p=await getProfile(user.uid);
      if(!p || p.role!==role || p.active===false){await signOut(auth);alert("Akses tidak sesuai role.");location.href="index.html";return}
      callback(user,p);
    }catch(e){console.error(e);toast("Gagal memuat profil.","error")}
  });
}
export async function logout(){await signOut(auth);location.href="index.html"}
