// Firebase digunakan HANYA untuk Authentication.
// Tidak ada Firestore dan tidak ada Firebase Storage.
export const firebaseConfig = {
  apiKey: "AIzaSyBDd5zsPaDuhHYALIO0t3__I2Vx76NZx7M",
  authDomain: "zmartdeliver.firebaseapp.com",
  projectId: "zmartdeliver",
  storageBucket: "zmartdeliver.firebasestorage.app",
  messagingSenderId: "307696790963",
  appId: "1:307696790963:web:5833bc70304304f2caafc6",
};

// URL Web App Google Apps Script.
// Deploy Code.gs sebagai Web app: Execute as Me, Who has access: Anyone.
export const appsScriptConfig = {
  apiUrl: "https://script.google.com/macros/s/AKfycbzLTYOY5_lScS0g-WtHRxWDUT3xsRwL_OeNwaaayA4keEpdN1kXOhDgajkxXV5faNza/exec"
};
