import { auth } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getProfile } from "./common.js";

const form=document.querySelector("#loginForm"), msg=document.querySelector("#loginMsg");
onAuthStateChanged(auth, async user=>{
  if(!user)return;
  try{
    const p=await getProfile();
    if(p?.role==="admin" && p.active===true) location.href="admin.html";
    else if(p?.role==="zmart" && p.active===true) location.href="zmart.html";
    else { msg.textContent="Akun belum terdaftar di Google Sheet USERS atau status NONAKTIF."; msg.className="notice error"; }
  }catch(e){msg.textContent=e.message||"Profil pengguna tidak dapat dibaca.";msg.className="notice error";}
});
form.addEventListener("submit",async e=>{
 e.preventDefault(); msg.className="notice hidden";
 try{
   await signInWithEmailAndPassword(auth,document.querySelector("#email").value.trim(),document.querySelector("#password").value);
 }catch(err){
   msg.textContent=err.code==="auth/invalid-credential"?"Email atau password salah.":err.message;
   msg.className="notice error";
 }
});
