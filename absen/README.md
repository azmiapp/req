# Teams BAZNAS Sragen — Lite Modular

Struktur:
- `index.html` — login
- `pages/dashboard.html` — dashboard
- `pages/absensi.html` — selfie + GPS + nama kecamatan
- `pages/pengajuan.html` — cuti/izin/sakit/dinas
- `pages/pengajuan-saya.html` — daftar pengajuan
- `pages/approval.html` — approval Manager/SDM
- `pages/riwayat.html` — riwayat absensi + CSV
- `pages/profil.html` — profil/logout
- `assets/css/app.css` — CSS bersama
- `assets/js/config.js` — URL API
- `assets/js/api.js` — komunikasi Google Apps Script
- `assets/js/auth.js` — token/login
- `assets/js/gps.js` — GPS + reverse geocoding
- `assets/js/common.js` — fungsi umum

## Instalasi

1. Upload seluruh folder ke hosting/server yang mendukung HTTPS.
2. Pastikan struktur folder tidak berubah.
3. Buka `index.html`.
4. URL Google Apps Script sudah diisi pada `assets/js/config.js`.
5. Kamera dan GPS wajib menggunakan HTTPS.

## Lokasi Kecamatan

Saat GPS didapat, `gps.js` melakukan reverse geocoding dan membaca nama kecamatan dari alamat.
Data yang dikirim ke Apps Script antara lain:
- latitude
- longitude
- accuracy
- kecamatan
- kabupaten
- alamat

Contoh:
`Kecamatan Sragen, Kabupaten Sragen`

### Catatan produksi
Endpoint Nominatim publik dipakai sebagai contoh ringan. Untuk penggunaan dengan banyak karyawan/request, lebih baik reverse geocoding dipindahkan ke backend/Google Apps Script atau layanan geocoding resmi agar tidak terkena rate limit.

## Kompatibilitas Code.gs

Frontend mengikuti kontrak action dari kode sebelumnya:
login, dashboard, attendance, request, myRequests, pending,
managerApproval, sdmApproval, history, employees.

Pastikan Code.gs membaca field tambahan `kecamatan`, `kabupaten`, dan `alamat` pada action attendance jika ingin menyimpannya ke Sheet.
