import { auth } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getProfile } from "./common.js";

const form=document.querySelector("#loginForm"), msg=document.querySelector("#loginMsg"), overlay=document.querySelector("#loadingOverlay"), submitBtn=form.querySelector("button[type=submit]");
function loading(show,text="Memeriksa akun..."){overlay?.classList.toggle("hidden",!show);const t=document.querySelector("#loadingText");if(t)t.textContent=text;if(submitBtn){submitBtn.disabled=show;submitBtn.textContent=show?"Memproses...":"Masuk"}}
onAuthStateChanged(auth, async user=>{
  if(!user){loading(false);return;}
  loading(true,"Memuat profil akun...");
  try{
    const p=await getProfile();
    if(p?.role==="admin" && p.active===true) location.href="admin.html";
    else if(p?.role==="zmart" && p.active===true) location.href="zmart.html";
    else { msg.textContent="Akun belum terdaftar di Google Sheet USERS atau status NONAKTIF."; msg.className="notice error"; }
  }catch(e){msg.textContent=e.message||"Profil pengguna tidak dapat dibaca.";msg.className="notice error";loading(false);}
});
form.addEventListener("submit",async e=>{
 e.preventDefault(); msg.className="notice hidden";loading(true,"Memverifikasi email dan password...");
 try{
   await signInWithEmailAndPassword(auth,document.querySelector("#email").value.trim(),document.querySelector("#password").value);
 }catch(err){
   msg.textContent=err.code==="auth/invalid-credential"?"Email atau password salah.":err.message;
   msg.className="notice error";loading(false);
 }
});
