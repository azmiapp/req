import { auth } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getProfile } from "./common.js";

const form=document.querySelector("#loginForm"), msg=document.querySelector("#loginMsg");
onAuthStateChanged(auth, async user=>{
  if(!user)return;
  const p=await getProfile(user.uid);
  if(p?.role==="admin") location.href="admin.html";
  else if(p?.role==="zmart") location.href="zmart.html";
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
