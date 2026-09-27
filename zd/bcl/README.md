# BCL V2 — BAZNAS Kabupaten Sragen

V2 mempertahankan UI dan alur BCL/ZMart dari V1, tetapi **master user, role, profil, dan status akun dipindahkan ke Google Sheet**.

## Arsitektur V2

```text
Firebase Authentication
  └─ Email + Password + UID
           │
           ▼
Google Apps Script API
  └─ verifikasi Firebase ID Token
           │
           ▼
Google Sheet / USERS  ← MASTER USER & ROLE
  ├─ UID
  ├─ EMAIL
  ├─ NAMA
  ├─ NIP
  ├─ JABATAN
  ├─ ROLE (admin/zmart)
  ├─ AREA
  └─ STATUS (AKTIF/NONAKTIF)
           │
           ▼
Cloud Function syncClaims
           │
           ▼
Firebase Custom Claims
  ├─ role
  ├─ active
  ├─ name
  ├─ nip
  ├─ jabatan
  └─ area
           │
           ▼
Firestore / Storage Rules
```

**Tidak ada lagi `users/{uid}` Firestore sebagai sumber role.** Collection tersebut bahkan ditolak oleh `firestore.rules`.

## 1. Firebase

1. Buat/ gunakan Firebase Project.
2. Aktifkan Authentication → Sign-in method → Email/Password.
3. Buat Cloud Firestore.
4. Buat Cloud Storage.
5. Register Web App.
6. Isi `js/firebase-config.js`.

## 2. Google Sheet USERS

Buat spreadsheet, kemudian buat sheet bernama **USERS** dengan kolom persis:

```text
UID | EMAIL | NAMA | NIP | JABATAN | ROLE | AREA | STATUS
```

Contoh:

```text
UID_FIREBASE | admin@baznas-sragen.id | Admin BAZNAS | 001 | Administrator | admin | Sragen | AKTIF
UID_FIREBASE | zmart1@gmail.com        | Ahmad         | 002 | ZMart Deliver | zmart | Sragen | AKTIF
UID_FIREBASE | zmart2@gmail.com        | Budi          | 003 | ZMart Deliver | zmart | Gemolong | NONAKTIF
```

`ROLE` hanya:
- `admin`
- `zmart`

`STATUS` hanya:
- `AKTIF`
- `NONAKTIF`

Template juga tersedia di `USER_SHEET_TEMPLATE.csv`.

## 3. Google Apps Script

Buat project Google Apps Script, lalu salin `apps-script/Code.gs`.

Buka **Project Settings → Script Properties** dan buat:

```text
SPREADSHEET_ID = ID spreadsheet USERS
FIREBASE_WEB_API_KEY = Web API Key Firebase
CLAIM_SYNC_URL = URL Cloud Function syncClaims
CLAIM_SYNC_SECRET = secret yang sama dengan BAZNAS_CLAIMS_SECRET
```

Jalankan fungsi `setupSheet()` sekali dari Apps Script untuk memastikan header USERS benar.

### Deploy Apps Script

Deploy → New deployment → Web app:

```text
Execute as: Me
Who has access: Anyone
```

Salin URL `/exec` dan masukkan ke:

```js
// js/firebase-config.js
appsScriptConfig.apiUrl = "URL_WEB_APP_APPS_SCRIPT";
```

Frontend memakai POST `text/plain`, sehingga tidak membutuhkan request preflight CORS khusus.

## 4. Cloud Function untuk Firebase Custom Claims

Google Apps Script tidak memiliki Firebase Admin SDK bawaan untuk `setCustomUserClaims`. Karena itu V2 menyediakan Cloud Function kecil yang menerima permintaan sinkronisasi dari Apps Script.

Masuk ke folder project:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
```

Buat `functions/.env` berdasarkan `functions/.env.example`:

```env
BAZNAS_CLAIMS_SECRET=buat-secret-panjang-dan-acak
```

Gunakan secret yang sama pada Script Property:

```text
CLAIM_SYNC_SECRET
```

Deploy:

```bash
firebase deploy --only functions:syncClaims
```

Setelah deploy, Firebase akan memberikan URL HTTPS function. Masukkan URL tersebut sebagai:

```text
CLAIM_SYNC_URL
```

## 5. Admin pertama

Buat akun pertama di:

Firebase Console → Authentication → Users → Add user

Setelah akun dibuat, salin UID-nya ke baris pertama sheet:

```text
UID | EMAIL | NAMA | NIP | JABATAN | ROLE | AREA | STATUS
UID_DARI_FIREBASE | email-admin | Admin BAZNAS | 001 | Administrator | admin | Sragen | AKTIF
```

Login dari `index.html`.

Saat login, frontend meminta profil ke Apps Script. Apps Script:

1. memvalidasi Firebase ID Token;
2. mencari UID/email di USERS;
3. menyinkronkan role/status ke Custom Claims;
4. mengembalikan profil ke frontend;
5. frontend me-refresh ID Token agar Firestore Rules menggunakan claim terbaru.

## 6. Membuat ZMart

Admin Dashboard → Pengguna → Tambah ZMart.

Proses V2:

```text
Admin
 ↓
Firebase createUserWithEmailAndPassword
 ↓
UID baru
 ↓
Apps Script saveUser
 ↓
Google Sheet USERS
 ↓
Cloud Function setCustomUserClaims
 ↓
ZMart dapat login
```

Password tetap ditangani Firebase Authentication dan **tidak disimpan di Google Sheet**.

## 7. Mengubah role/status

Cukup ubah Google Sheet.

Contoh:

```text
zmart → admin
```

atau:

```text
AKTIF → NONAKTIF
```

Pada login/refresh profil berikutnya, Apps Script menyinkronkan nilai tersebut ke Firebase Custom Claims.

Jika akun dibuat NONAKTIF, `guard()` akan menolak akses aplikasi dan Firestore/Storage Rules juga menolak akses karena `active=false`.

## 8. Firestore Rules

`firestore.rules` sekarang memakai:

```js
request.auth.token.role
request.auth.token.active
```

Bukan lagi:

```text
users/{uid}.role
```

Deploy:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 9. File yang berubah

### Frontend

- `js/firebase-config.js` — konfigurasi Firebase + URL Apps Script.
- `js/login.js` — login kemudian mengambil role dari Google Sheet melalui API.
- `js/common.js` — API profile/user + guard berbasis Sheet/Custom Claims.
- `js/admin.js` — daftar ZMart berasal dari Google Sheet; pembuatan user menyimpan profil ke Sheet.
- `js/zmart.js` — menggunakan profil hasil Apps Script.

### Security

- `firestore.rules` — role/active berasal dari Firebase Custom Claims.
- `storage.rules` — role/active juga berasal dari Custom Claims.

### Backend

- `apps-script/Code.gs` — API master user Google Sheet.
- `functions/index.js` — sinkronisasi Firebase Custom Claims.
- `functions/package.json` — dependency Cloud Function.
- `functions/.env.example` — contoh secret.

## 10. Data aplikasi lainnya

Data berikut **tetap di Firestore**, karena bukan master user:

```text
bcl/{bclId}
assignments/{assignmentId}
deliveries/{deliveryId}
```

Foto tetap berada di Firebase Storage:

```text
users/{zmartUid}/deliveries/{assignmentId}/{timestamp}.jpg
```

## 11. Keamanan penting

- Jangan memasukkan password ke Google Sheet.
- Jangan memasukkan `FIREBASE_WEB_API_KEY` ke Script Property secara keliru; gunakan Web API Key dari Firebase Web App.
- Jangan membagikan `CLAIM_SYNC_SECRET`.
- Jangan mengubah `firestore.rules` menjadi `allow read, write: if true`.
- Apps Script hanya mengizinkan `listUsers` dan `saveUser` untuk profil dengan `role=admin` dan `STATUS=AKTIF` di Sheet.
- Frontend tidak pernah membaca collection Firestore `users`.
- Firestore Rules tidak lagi mempercayai collection `users` untuk role.

## 12. Alur login V2

```text
Email + Password
      ↓
Firebase Authentication
      ↓
Firebase UID
      ↓
Apps Script / getProfile
      ↓
Google Sheet USERS
      ↓
ROLE + STATUS + PROFIL
      ↓
Sync Custom Claims
      ↓
Refresh Firebase ID Token
      ↓
Admin Dashboard / ZMart Deliver
```

## 13. Struktur folder V2

```text
BCL_V2/
├── index.html
├── admin.html
├── zmart.html
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── USER_SHEET_TEMPLATE.csv
├── js/
│   ├── firebase.js
│   ├── firebase-config.js
│   ├── login.js
│   ├── common.js
│   ├── admin.js
│   └── zmart.js
├── apps-script/
│   └── Code.gs
└── functions/
    ├── index.js
    ├── package.json
    └── .env.example
```

## 14. Catatan perubahan dari V1

V1:

```text
Firebase Auth
   ↓
Firestore users/{uid}
   ↓
role/profile
```

V2:

```text
Firebase Auth
   ↓
Apps Script
   ↓
Google Sheet USERS
   ↓
Custom Claims
   ↓
Firestore Rules
```

Dengan desain ini, **Google Sheet adalah master data user dan role**, sedangkan Firebase Authentication tetap menjadi sistem autentikasi.
