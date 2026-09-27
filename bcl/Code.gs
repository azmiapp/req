/**
 * ============================================================
 * BAZNAS SRAGEN BCL V2 - BACKEND GABUNGAN FINAL
 * ============================================================
 * Google Apps Script + Google Sheets + Google Drive
 * Authentication: Firebase Authentication ONLY
 *
 * TIDAK MENGGUNAKAN:
 * - Firestore
 * - Firebase Storage
 * - Firebase Custom Claims
 * - CLAIM_SYNC_URL / CLAIM_SYNC_SECRET
 * - Cloud Function
 *
 * SHEET MASTER:
 * - USERS
 * - BCL
 * - ASSIGNMENTS
 * - PENYALURAN
 *
 * KETERANGAN:
 * File ini menggabungkan kemampuan Code.gs BCL lengkap dengan
 * pola autentikasi, validasi, dan upload Drive dari versi kedua.
 *
 * PENTING:
 * Isi FIREBASE_WEB_API_KEY dengan Web API Key Firebase Anda.
 */

const CONFIG = {
  SPREADSHEET_ID: '1tnoO234g49JUblM1vyb3btdesV4dgcwHQdnAuB9hD8s',
  DRIVE_FOLDER_ID: '1o-fBRo-Q9vmVW-cu6QCP_JgdfZ3reTvh',
  FIREBASE_WEB_API_KEY: 'AIzaSyBDd5zsPaDuhHYALIO0t3__I2Vx76NZx7M',
  DRIVE_FILE_ACCESS: 'ANYONE_WITH_LINK',
  MAX_PHOTO_BYTES: 8 * 1024 * 1024
};

const SHEETS = {
  USERS: 'USERS',
  BCL: 'BCL',
  ASSIGNMENTS: 'ASSIGNMENTS',
  PENYALURAN: 'PENYALURAN'
};

const HEADERS = {
  USERS: ['UID','EMAIL','NAMA','NIP','JABATAN','ROLE','AREA','STATUS'],
  BCL: ['ID','NAMA','DISTRICT','VILLAGE','ADDRESS','CARD_NO','MAPS_URL','STATUS','ASSIGNED_TO','ASSIGNED_ZMART_NAME','CREATED_AT','UPDATED_AT','DELIVERED_AT'],
  ASSIGNMENTS: ['ID','BCL_ID','BCL_NAME','ZMART_UID','ZMART_NAME','PACKAGE_NAME','ITEMS_JSON','STATUS','CREATED_AT','COMPLETED_AT'],
  PENYALURAN: ['ID','ASSIGNMENT_ID','BCL_ID','BCL_NAME','ZMART_UID','ZMART_NAME','DISTRICT','LATITUDE','LONGITUDE','ACCURACY','PHOTO_FILE_ID','PHOTO_URL','STATUS','CREATED_AT']
};

const LEGACY_PENYALURAN_HEADERS = [
  'ID','TIMESTAMP','UID','EMAIL','NAMA','NIP','JABATAN','AREA','KETERANGAN','FILE_ID','PHOTO_URL','STATUS'
];

const DRIVE_ROOT_NAME = 'BAZNAS SRAGEN - FOTO PENYALURAN ZMART';

/* ============================================================
 * WEB API
 * ============================================================ */

function doGet() {
  return json_({
    ok: true,
    service: 'BAZNAS Sragen BCL V2',
    version: 'Firebase Auth + Google Sheet + Google Drive',
    sheets: SHEETS
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Request POST tidak memiliki data.');
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents || '{}');
    } catch (err) {
      throw new Error('Format JSON request tidak valid.');
    }

    const auth = verifyFirebaseIdToken_(body.idToken);
    const action = String(body.action || '').trim();
    const profile = findUser_(auth.uid, auth.email);

    /* getProfile boleh dipanggil sebelum pengecekan status aktif */
    if (action === 'getProfile') {
      if (!profile) throw new Error('Akun belum terdaftar di sheet USERS.');
      return json_({ok:true, data:profile});
    }

    if (!profile) throw new Error('Akun belum terdaftar di sheet USERS.');
    if (!profile.active) throw new Error('Akun Anda berstatus NONAKTIF.');

    /* ========================================================
     * ZMART / ADMIN - READ OPERATIONS
     * ======================================================== */

    if (action === 'listMyAssignments') {
      requireRole_(profile, ['zmart','admin']);
      return json_({
        ok:true,
        data:listAssignments_(profile.role === 'zmart' ? profile.uid : '')
      });
    }

    if (action === 'listMyDeliveries') {
      requireRole_(profile, ['zmart','admin']);
      return json_({
        ok:true,
        data:listDeliveries_(profile.role === 'zmart' ? profile.uid : '')
      });
    }

    if (action === 'findBcl') {
      requireRole_(profile, ['zmart','admin']);
      const id = String(body.id || '').trim();
      const item = getBclById_(id);
      if (!item) throw new Error('BCL tidak ditemukan.');
      return json_({ok:true, data:item});
    }

    /* ========================================================
     * UPLOAD FOTO PENYALURAN
     * ======================================================== */

    if (action === 'uploadDeliveryPhoto') {
      requireRole_(profile, ['zmart','admin']);
      return json_({ok:true, data:submitDelivery_(body, profile)});
    }

    /* ========================================================
     * ADMIN ONLY
     * ======================================================== */

    requireRole_(profile, ['admin']);

    if (action === 'listUsers') {
      return json_({ok:true, data:listUsers_()});
    }

    if (action === 'saveUser') {
      return json_({ok:true, data:saveUser_(body.user || {})});
    }

    if (action === 'listBcl') {
      return json_({ok:true, data:listBcl_()});
    }

    if (action === 'saveBcl') {
      return json_({ok:true, data:saveBcl_(body.bcl || {})});
    }

    if (action === 'listAssignments') {
      return json_({ok:true, data:listAssignments_('')});
    }

    if (action === 'createAssignment') {
      return json_({ok:true, data:createAssignment_(body.assignment || {})});
    }

    if (action === 'listDeliveries') {
      return json_({ok:true, data:listDeliveries_('')});
    }

    throw new Error('Action tidak dikenal: ' + action);

  } catch (err) {
    return json_({
      ok:false,
      error:err && err.message ? err.message : String(err)
    });
  }
}

/* ============================================================
 * SETUP / SHEETS
 * ============================================================ */

function getSpreadsheet_() {
  const id = String(CONFIG.SPREADSHEET_ID || '').trim();
  if (!id) throw new Error('CONFIG.SPREADSHEET_ID belum diisi.');

  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error(
      'Spreadsheet tidak dapat dibuka. Periksa SPREADSHEET_ID dan akses Apps Script.'
    );
  }
}

function getSheetByKey_(key) {
  const ss = getSpreadsheet_();
  const name = SHEETS[key];
  const headers = HEADERS[key];

  if (!name || !headers) throw new Error('Konfigurasi sheet tidak ditemukan: ' + key);

  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }

  /*
   * PENYALURAN versi kedua memiliki header lama.
   * Migrasi hanya dilakukan bila struktur lama terdeteksi.
   */
  if (key === 'PENYALURAN') {
    migrateLegacyPenyaluranIfNeeded_(sh);
  }

  ensureHeaders_(sh, headers, name);
  sh.setFrozenRows(1);
  return sh;
}

function ensureHeaders_(sh, headers, name) {
  if (sh.getLastColumn() < headers.length) {
    sh.insertColumnsAfter(sh.getLastColumn() || 1, headers.length - Math.max(sh.getLastColumn(), 1));
  }

  const current = sh.getRange(1,1,1,headers.length).getValues()[0];

  for (let i=0; i<headers.length; i++) {
    if (String(current[i] || '').trim().toUpperCase() !== headers[i].toUpperCase()) {
      throw new Error(
        'Header sheet ' + name + ' tidak sesuai. Wajib: ' + headers.join(', ')
      );
    }
  }
}

function setupSheets() {
  Object.keys(SHEETS).forEach(function(key) {
    getSheetByKey_(key);
  });
  return 'USERS, BCL, ASSIGNMENTS, dan PENYALURAN siap digunakan.';
}

/* Alias untuk kompatibilitas dengan versi kedua */
function setupSheet() {
  return setupSheets();
}

function setupAll() {
  const result = setupSheets();
  setupDrive();
  return result + ' Google Drive siap digunakan.';
}

function migrateLegacyPenyaluranIfNeeded_(sh) {
  if (sh.getLastRow() < 1) return;

  const lastCol = sh.getLastColumn();
  if (lastCol < LEGACY_PENYALURAN_HEADERS.length) return;

  const current = sh.getRange(1,1,1,LEGACY_PENYALURAN_HEADERS.length).getValues()[0]
    .map(function(v){ return String(v || '').trim().toUpperCase(); });

  const legacy = LEGACY_PENYALURAN_HEADERS.map(function(v){ return v.toUpperCase(); });
  const modern = HEADERS.PENYALURAN.map(function(v){ return v.toUpperCase(); });

  if (current.join('|') !== legacy.join('|')) return;
  if (current.join('|') === modern.join('|')) return;

  const oldValues = sh.getLastRow() > 1
    ? sh.getRange(2,1,sh.getLastRow()-1,LEGACY_PENYALURAN_HEADERS.length).getValues()
    : [];

  const newValues = oldValues.map(function(row) {
    const id = row[0] || '';
    const timestamp = row[1] || '';
    const uid = String(row[2] || '').trim();
    const email = String(row[3] || '').trim();
    const name = String(row[4] || '').trim();
    const nip = String(row[5] || '').trim();
    const jabatan = String(row[6] || '').trim();
    const area = String(row[7] || '').trim();
    const keterangan = String(row[8] || '').trim();
    const fileId = String(row[9] || '').trim();
    const photoUrl = String(row[10] || '').trim();
    const status = String(row[11] || 'SUBMITTED').trim();

    let assignmentId = '';
    let bclId = '';
    let bclName = name;
    let zmartUid = uid;
    let zmartName = name;
    let district = area;

    /* KETERANGAN lama dapat berisi assignment/BCL bila format JSON. */
    try {
      const parsed = JSON.parse(keterangan || '{}');
      assignmentId = String(parsed.assignmentId || '').trim();
      bclId = String(parsed.bclId || '').trim();
      bclName = String(parsed.bclName || bclName).trim();
      zmartName = String(parsed.zmartName || zmartName).trim();
      district = String(parsed.district || district).trim();
    } catch (e) {
      /* Bukan JSON: data lama tetap dipertahankan sebagai nama/keterangan */
    }

    return [
      id,
      assignmentId,
      bclId,
      bclName,
      zmartUid,
      zmartName,
      district,
      '',
      '',
      '',
      fileId,
      photoUrl,
      status || 'SUBMITTED',
      timestamp || ''
    ];
  });

  sh.clearContents();
  sh.getRange(1,1,1,HEADERS.PENYALURAN.length).setValues([HEADERS.PENYALURAN]);

  if (newValues.length) {
    sh.getRange(2,1,newValues.length,HEADERS.PENYALURAN.length).setValues(newValues);
  }

  sh.setFrozenRows(1);
}

function headerMap_(headers) {
  const map = {};
  const normalized = headers.map(function(x){
    return String(x || '').trim().toUpperCase();
  });

  normalized.forEach(function(header, index) {
    map[header] = index;
  });

  return function(name) {
    const key = String(name || '').toUpperCase();
    const i = normalized.indexOf(key);
    if (i < 0) throw new Error('Kolom ' + name + ' tidak ditemukan.');
    return i;
  };
}

function rows_(key) {
  const sh = getSheetByKey_(key);
  const values = sh.getDataRange().getValues();
  if (!values.length) throw new Error('Sheet ' + SHEETS[key] + ' tidak memiliki header.');
  return {sh:sh, values:values, map:headerMap_(values[0])};
}

function now_() {
  return new Date();
}

function iso_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/* ============================================================
 * USERS
 * ============================================================ */

function listUsers_() {
  const data = rows_('USERS');
  const values = data.values;
  const map = data.map;

  return values.slice(1)
    .filter(function(r){ return String(r[map('UID')] || '').trim() !== ''; })
    .map(function(r){
      return {
        uid: String(r[map('UID')] || '').trim(),
        email: String(r[map('EMAIL')] || '').trim().toLowerCase(),
        name: String(r[map('NAMA')] || '').trim(),
        nip: String(r[map('NIP')] || '').trim(),
        jabatan: String(r[map('JABATAN')] || '').trim(),
        role: String(r[map('ROLE')] || '').trim().toLowerCase(),
        area: String(r[map('AREA')] || '').trim(),
        status: String(r[map('STATUS')] || '').trim().toUpperCase(),
        active: String(r[map('STATUS')] || '').trim().toUpperCase() === 'AKTIF'
      };
    });
}

function findUser_(uid, email) {
  const users = listUsers_();
  const cleanUid = String(uid || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (cleanUid) {
    const byUid = users.find(function(x){ return x.uid === cleanUid; });
    if (byUid) return byUid;
  }

  if (cleanEmail) {
    return users.find(function(x){ return x.email === cleanEmail; }) || null;
  }

  return null;
}

function saveUser_(u) {
  const data = rows_('USERS');
  const sh = data.sh;
  const values = data.values;
  const map = data.map;

  const uid = String(u.uid || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const name = String(u.name || '').trim();
  const nip = String(u.nip || '').trim();
  const jabatan = String(u.jabatan || '').trim();
  const role = String(u.role || 'zmart').trim().toLowerCase();
  const area = String(u.area || '').trim();
  const status = String(u.status || 'AKTIF').trim().toUpperCase();

  if (!uid || !email || !name) {
    throw new Error('UID, email, dan nama wajib diisi.');
  }

  if (!['admin','zmart'].includes(role)) {
    throw new Error('ROLE harus admin atau zmart.');
  }

  if (!['AKTIF','NONAKTIF'].includes(status)) {
    throw new Error('STATUS harus AKTIF atau NONAKTIF.');
  }

  const row = [uid,email,name,nip,jabatan,role,area,status];
  let target = -1;

  for (let i=1; i<values.length; i++) {
    const oldUid = String(values[i][map('UID')] || '').trim();
    const oldEmail = String(values[i][map('EMAIL')] || '').trim().toLowerCase();
    if (oldUid === uid || oldEmail === email) {
      target = i + 1;
      break;
    }
  }

  if (target < 0) {
    sh.appendRow(row);
    target = sh.getLastRow();
  } else {
    sh.getRange(target,1,1,row.length).setValues([row]);
  }

  return listUsers_().find(function(x){ return x.uid === uid; }) || null;
}

/* ============================================================
 * BCL
 * ============================================================ */

function listBcl_() {
  const data = rows_('BCL');
  const values = data.values;
  const map = data.map;

  return values.slice(1)
    .filter(function(r){ return String(r[map('ID')] || '').trim() !== ''; })
    .map(function(r){
      return {
        id: String(r[map('ID')] || '').trim(),
        name: String(r[map('NAMA')] || '').trim(),
        district: String(r[map('DISTRICT')] || '').trim(),
        village: String(r[map('VILLAGE')] || '').trim(),
        address: String(r[map('ADDRESS')] || '').trim(),
        cardNo: String(r[map('CARD_NO')] || '').trim(),
        mapsUrl: String(r[map('MAPS_URL')] || '').trim(),
        status: String(r[map('STATUS')] || 'BELUM_DITUGASKAN').trim(),
        assignedTo: String(r[map('ASSIGNED_TO')] || '').trim(),
        assignedZmartName: String(r[map('ASSIGNED_ZMART_NAME')] || '').trim(),
        createdAt: iso_(r[map('CREATED_AT')]),
        updatedAt: iso_(r[map('UPDATED_AT')]),
        deliveredAt: iso_(r[map('DELIVERED_AT')])
      };
    });
}

function getBclById_(id) {
  return listBcl_().find(function(x){
    return x.id === String(id || '').trim();
  }) || null;
}

function saveBcl_(b) {
  const data = rows_('BCL');
  const sh = data.sh;
  const values = data.values;
  const map = data.map;

  const id = String(b.id || '').trim();
  if (!id) throw new Error('ID BCL wajib diisi.');

  const old = listBcl_().find(function(x){ return x.id === id; }) || {};
  const mapsUrl = String(b.mapsUrl || '').trim();

  if (mapsUrl && !/^https?:\/\/.+/i.test(mapsUrl)) {
    throw new Error('Link Google Maps tidak valid.');
  }

  const row = [
    id,
    String(b.name || '').trim(),
    String(b.district || '').trim(),
    String(b.village || '').trim(),
    String(b.address || '').trim(),
    String(b.cardNo || '').trim(),
    mapsUrl,
    String(b.status || old.status || 'BELUM_DITUGASKAN').trim(),
    String(b.assignedTo || old.assignedTo || '').trim(),
    String(b.assignedZmartName || old.assignedZmartName || '').trim(),
    b.createdAt ? new Date(b.createdAt) : (old.createdAt ? new Date(old.createdAt) : now_()),
    now_(),
    old.deliveredAt ? new Date(old.deliveredAt) : ''
  ];

  if (!row[1]) throw new Error('Nama penerima wajib diisi.');

  let target = -1;
  for (let i=1; i<values.length; i++) {
    if (String(values[i][map('ID')] || '').trim() === id) {
      target = i + 1;
      break;
    }
  }

  if (target < 0) {
    sh.appendRow(row);
  } else {
    sh.getRange(target,1,1,row.length).setValues([row]);
  }

  return getBclById_(id);
}

/* ============================================================
 * ASSIGNMENTS
 * ============================================================ */

function listAssignments_(uidFilter) {
  const data = rows_('ASSIGNMENTS');
  const values = data.values;
  const map = data.map;

  return values.slice(1)
    .filter(function(r){ return String(r[map('ID')] || '').trim() !== ''; })
    .map(function(r){
      return {
        id: String(r[map('ID')] || '').trim(),
        bclId: String(r[map('BCL_ID')] || '').trim(),
        bclName: String(r[map('BCL_NAME')] || '').trim(),
        zmartUid: String(r[map('ZMART_UID')] || '').trim(),
        zmartName: String(r[map('ZMART_NAME')] || '').trim(),
        packageName: String(r[map('PACKAGE_NAME')] || '').trim(),
        items: parseItems_(r[map('ITEMS_JSON')]),
        status: String(r[map('STATUS')] || '').trim(),
        createdAt: iso_(r[map('CREATED_AT')]),
        completedAt: iso_(r[map('COMPLETED_AT')])
      };
    })
    .filter(function(x){ return !uidFilter || x.zmartUid === uidFilter; })
    .sort(function(a,b){
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

function parseItems_(v) {
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(String(v || '[]'));
  } catch (e) {
    return [];
  }
}

function createAssignment_(a) {
  const bclId = String(a.bclId || '').trim();
  const zmartUid = String(a.zmartUid || '').trim();
  const bcl = getBclById_(bclId);

  if (!bcl) throw new Error('BCL tidak ditemukan.');

  const zmart = listUsers_().find(function(x){
    return x.uid === zmartUid && x.role === 'zmart' && x.active;
  });

  if (!zmart) throw new Error('ZMart tidak ditemukan atau tidak aktif.');
  if (bcl.status === 'SELESAI') throw new Error('BCL sudah selesai disalurkan.');

  const items = Array.isArray(a.items) ? a.items : [];
  const id = 'ASG-' + Date.now();

  const sh = getSheetByKey_('ASSIGNMENTS');
  sh.appendRow([
    id,
    bcl.id,
    bcl.name,
    zmart.uid,
    zmart.name,
    String(a.packageName || 'Paket Sembako BCL').trim(),
    JSON.stringify(items),
    'ASSIGNED',
    now_(),
    ''
  ]);

  saveBcl_({
    ...bcl,
    status:'DITUGASKAN',
    assignedTo:zmart.uid,
    assignedZmartName:zmart.name
  });

  return listAssignments_('').find(function(x){ return x.id === id; }) || null;
}

function updateAssignmentDone_(id) {
  const data = rows_('ASSIGNMENTS');
  const sh = data.sh;
  const values = data.values;
  const map = data.map;

  for (let i=1; i<values.length; i++) {
    if (String(values[i][map('ID')] || '') === id) {
      sh.getRange(i+1,map('STATUS')+1).setValue('DONE');
      sh.getRange(i+1,map('COMPLETED_AT')+1).setValue(now_());
      return true;
    }
  }

  throw new Error('Penugasan tidak ditemukan.');
}

/* ============================================================
 * PENYALURAN
 * ============================================================ */

function listDeliveries_(uidFilter) {
  const data = rows_('PENYALURAN');
  const values = data.values;
  const map = data.map;

  return values.slice(1)
    .filter(function(r){ return String(r[map('ID')] || '').trim() !== ''; })
    .map(function(r){
      return {
        id: String(r[map('ID')] || '').trim(),
        assignmentId: String(r[map('ASSIGNMENT_ID')] || '').trim(),
        bclId: String(r[map('BCL_ID')] || '').trim(),
        bclName: String(r[map('BCL_NAME')] || '').trim(),
        zmartUid: String(r[map('ZMART_UID')] || '').trim(),
        zmartName: String(r[map('ZMART_NAME')] || '').trim(),
        district: String(r[map('DISTRICT')] || '').trim(),
        latitude: toNumber_(r[map('LATITUDE')]),
        longitude: toNumber_(r[map('LONGITUDE')]),
        accuracy: toNumber_(r[map('ACCURACY')]),
        photoFileId: String(r[map('PHOTO_FILE_ID')] || '').trim(),
        photoUrl: String(r[map('PHOTO_URL')] || '').trim(),
        status: String(r[map('STATUS')] || '').trim(),
        createdAt: iso_(r[map('CREATED_AT')])
      };
    })
    .filter(function(x){ return !uidFilter || x.zmartUid === uidFilter; })
    .sort(function(a,b){
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

function toNumber_(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ============================================================
 * DELIVERY SUBMIT
 * ============================================================ */

function submitDelivery_(body, profile) {
  const assignmentId = String(body.assignmentId || '').trim();
  const bclId = String(body.bclId || '').trim();

  if (!assignmentId || !bclId) {
    throw new Error('Assignment ID dan BCL ID wajib dikirim.');
  }

  const assignments = listAssignments_('');
  const assignment = assignments.find(function(x){ return x.id === assignmentId; });

  if (!assignment) throw new Error('Penugasan tidak ditemukan.');
  if (profile.role === 'zmart' && assignment.zmartUid !== profile.uid) {
    throw new Error('Penugasan ini bukan milik Anda.');
  }
  if (assignment.status === 'DONE') throw new Error('Penugasan sudah selesai.');
  if (assignment.bclId !== bclId) throw new Error('BCL tidak sesuai dengan penugasan.');

  const bcl = getBclById_(bclId);
  if (!bcl) throw new Error('BCL tidak ditemukan.');

  const upload = uploadDeliveryPhoto_(body, profile);
  const id = 'DLV-' + Date.now();
  const sh = getSheetByKey_('PENYALURAN');

  sh.appendRow([
    id,
    assignmentId,
    bcl.id,
    bcl.name,
    assignment.zmartUid,
    assignment.zmartName,
    bcl.district,
    toNumber_(body.latitude),
    toNumber_(body.longitude),
    toNumber_(body.accuracy),
    upload.fileId,
    upload.directUrl,
    'SUBMITTED',
    now_()
  ]);

  updateAssignmentDone_(assignmentId);
  saveBcl_({
    ...bcl,
    status:'SELESAI',
    deliveredAt:now_()
  });

  return listDeliveries_('').find(function(x){ return x.id === id; }) || null;
}

/* ============================================================
 * GOOGLE DRIVE
 * ============================================================ */

function setupDrive() {
  const folder = getDriveRootFolder_();
  return JSON.stringify({
    ok:true,
    folderId:folder.getId(),
    folderName:folder.getName(),
    folderUrl:folder.getUrl()
  }, null, 2);
}

function getDriveRootFolder_() {
  const id = String(CONFIG.DRIVE_FOLDER_ID || '').trim();

  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      throw new Error('DRIVE_FOLDER_ID tidak valid atau folder tidak dapat diakses.');
    }
  }

  return DriveApp.createFolder(DRIVE_ROOT_NAME);
}

function getOrCreateChildFolder_(parent, name) {
  const safe = sanitizeFileName_(name) || 'LAINNYA';
  const it = parent.getFoldersByName(safe);
  return it.hasNext() ? it.next() : parent.createFolder(safe);
}

function uploadDeliveryPhoto_(body, profile) {
  const dataUrl = String(body.photoBase64 || '').trim();
  if (!dataUrl) throw new Error('Foto penyaluran belum dikirim.');

  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!match) {
    throw new Error('Format foto tidak valid. Gunakan JPG, PNG, atau WEBP.');
  }

  const mime = normalizeImageMime_(match[1]);
  const base64 = match[2];
  const estimated = Math.floor(base64.length * 3 / 4) -
    (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

  if (estimated > CONFIG.MAX_PHOTO_BYTES) {
    throw new Error('Ukuran foto terlalu besar. Maksimal 8 MB.');
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (e) {
    throw new Error('Data foto Base64 tidak valid.');
  }

  if (bytes.length > CONFIG.MAX_PHOTO_BYTES) {
    throw new Error('Ukuran foto terlalu besar. Maksimal 8 MB.');
  }

  const now = now_();
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const year = Utilities.formatDate(now, tz, 'yyyy');
  const month = Utilities.formatDate(now, tz, 'MM - MMMM');

  const root = getDriveRootFolder_();
  const yearFolder = getOrCreateChildFolder_(root, year);
  const monthFolder = getOrCreateChildFolder_(yearFolder, month);

  const assignmentId = sanitizeFileName_(body.assignmentId || 'assignment');
  const bclId = sanitizeFileName_(body.bclId || 'bcl');
  const bclName = sanitizeFileName_(body.bclName || 'Penerima');
  const uid = sanitizeFileName_(profile.uid || 'user');
  const timestamp = Utilities.formatDate(now, tz, 'yyyyMMdd-HHmmss');
  const ext = extensionFromMime_(mime);
  const fileName = [timestamp,bclId,bclName,uid,assignmentId].join('_') + '.' + ext;

  const file = monthFolder.createFile(
    Utilities.newBlob(bytes, mime, fileName)
  );

  file.setDescription(JSON.stringify({
    source:'BAZNAS Sragen BCL V2',
    type:'foto_penyaluran_zmart',
    assignmentId:String(body.assignmentId || ''),
    bclId:String(body.bclId || ''),
    bclName:String(body.bclName || ''),
    uid:profile.uid,
    email:profile.email,
    latitude:body.latitude == null ? '' : Number(body.latitude),
    longitude:body.longitude == null ? '' : Number(body.longitude),
    accuracy:body.accuracy == null ? '' : Number(body.accuracy),
    uploadedAt:now.toISOString()
  }));

  const access = String(CONFIG.DRIVE_FILE_ACCESS || 'ANYONE_WITH_LINK')
    .trim().toUpperCase();

  if (access === 'ANYONE_WITH_LINK') {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareError) {
      console.warn('Gagal mengatur sharing file: ' + shareError.message);
    }
  }

  return {
    fileId:file.getId(),
    fileName:file.getName(),
    fileUrl:file.getUrl(),
    directUrl:'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(file.getId()),
    folderId:monthFolder.getId(),
    folderUrl:monthFolder.getUrl(),
    uploadedAt:now.toISOString(),
    access:access
  };
}

/* ============================================================
 * FIREBASE AUTHENTICATION
 * ============================================================ */

function verifyFirebaseIdToken_(idToken) {
  if (!idToken) throw new Error('Firebase ID token wajib dikirim.');

  const key = String(CONFIG.FIREBASE_WEB_API_KEY || '').trim();
  if (!key || key === 'ISI_FIREBASE_WEB_API_KEY_ANDA') {
    throw new Error('CONFIG.FIREBASE_WEB_API_KEY belum diisi.');
  }

  const url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
    encodeURIComponent(key);

  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      method:'post',
      contentType:'application/json',
      payload:JSON.stringify({idToken:idToken}),
      muteHttpExceptions:true
    });
  } catch (e) {
    throw new Error('Tidak dapat menghubungi Firebase Authentication: ' + e.message);
  }

  const code = response.getResponseCode();
  const responseText = response.getContentText() || '{}';
  let data = {};

  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error('Response Firebase tidak valid.');
  }

  if (code !== 200 || !data.users || !data.users.length) {
    throw new Error('Firebase token tidak valid atau sudah kedaluwarsa.');
  }

  const firebaseUser = data.users[0];
  const uid = String(firebaseUser.localId || '').trim();
  const email = String(firebaseUser.email || '').trim().toLowerCase();

  if (!uid) throw new Error('UID Firebase tidak ditemukan.');

  return {
    uid:uid,
    email:email,
    emailVerified:firebaseUser.emailVerified === true
  };
}

function requireRole_(profile, roles) {
  if (!profile) throw new Error('Akun tidak terdaftar.');
  if (!profile.active) throw new Error('Akun Anda berstatus NONAKTIF.');
  if (!roles.includes(profile.role)) throw new Error('Akses ditolak.');
}

/* Alias kompatibilitas dari versi kedua */
function requireAdmin_(profile) {
  requireRole_(profile, ['admin']);
}

function requireActiveZmart_(profile) {
  requireRole_(profile, ['zmart','admin']);
}

/* ============================================================
 * IMAGE / FILE HELPERS
 * ============================================================ */

function normalizeImageMime_(mime) {
  const v = String(mime || '').toLowerCase();
  if (v === 'image/jpg') return 'image/jpeg';
  if (['image/jpeg','image/png','image/webp'].includes(v)) return v;
  throw new Error('Jenis file gambar tidak didukung.');
}

function extensionFromMime_(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function sanitizeFileName_(v) {
  return String(v == null ? '' : v)
    .trim()
    .replace(/[\\/:*?"<>|#%{}~]/g,'-')
    .replace(/\s+/g,' ')
    .slice(0,120);
}

/* ============================================================
 * JSON RESPONSE
 * ============================================================ */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
