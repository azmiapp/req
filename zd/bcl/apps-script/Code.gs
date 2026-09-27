/**
 * BAZNAS Sragen BCL V2 - Google Sheet User API
 *
 * Script Properties yang wajib dibuat:
 * SPREADSHEET_ID   = ID spreadsheet master USERS
 * FIREBASE_WEB_API_KEY = Web API Key Firebase
 * CLAIM_SYNC_URL   = URL HTTPS Cloud Function sync custom claims
 * CLAIM_SYNC_SECRET = secret yang sama dengan Cloud Function
 */
const SHEET_NAME = 'USERS';
const HEADERS = ['UID','EMAIL','NAMA','NIP','JABATAN','ROLE','AREA','STATUS'];

function doGet(e) {
  return json_({ok:true,service:'BAZNAS Sragen User API',version:'V2'});
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const auth = verifyFirebaseIdToken_(body.idToken);
    const action = String(body.action || '');
    const profile = findUser_(auth.uid, auth.email);

    if (action === 'getProfile') {
      if (!profile) throw new Error('Akun belum terdaftar di sheet USERS.');
      syncClaims_(profile);
      return json_({ok:true,data:profile});
    }

    requireAdmin_(profile);

    if (action === 'listUsers') {
      return json_({ok:true,data:listUsers_()});
    }

    if (action === 'saveUser') {
      const u = body.user || {};
      if (!u.uid || !u.email || !u.name) throw new Error('UID, email, dan nama wajib diisi.');
      const saved = saveUser_(u);
      syncClaims_(saved);
      return json_({ok:true,data:saved});
    }

    if (action === 'syncAllClaims') {
      const rows = listUsers_();
      const results = rows.map(r => {
        try { syncClaims_(r); return {uid:r.uid,ok:true}; }
        catch(err) { return {uid:r.uid,ok:false,error:err.message}; }
      });
      return json_({ok:true,data:results});
    }

    throw new Error('Action tidak dikenal.');
  } catch (err) {
    return json_({ok:false,error:err.message || String(err)});
  }
}

function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Script Property SPREADSHEET_ID belum diisi.');
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

function setupSheet() {
  const sh = getSheet_();
  sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
  return 'USERS siap.';
}

function listUsers_() {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const map = headerMap_(values[0]);
  return values.slice(1).filter(r => String(r[map.UID] || '').trim()).map(rowToUser_(map));
}

function findUser_(uid, email) {
  const users = listUsers_();
  const u = users.find(x => x.uid === uid);
  if (u) return u;
  const em = String(email || '').trim().toLowerCase();
  return users.find(x => x.email.toLowerCase() === em) || null;
}

function saveUser_(u) {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  const map = headerMap_(values[0]);
  const row = [
    String(u.uid), String(u.email).toLowerCase(), String(u.name || ''), String(u.nip || ''),
    String(u.jabatan || ''), String(u.role || 'zmart').toLowerCase(), String(u.area || ''),
    String(u.status || 'AKTIF').toUpperCase()
  ];
  if (!['admin','zmart'].includes(row[5])) throw new Error('ROLE harus admin atau zmart.');
  if (!['AKTIF','NONAKTIF'].includes(row[7])) throw new Error('STATUS harus AKTIF atau NONAKTIF.');

  let target = -1;
  for (let i=1;i<values.length;i++) {
    if (String(values[i][map.UID]) === row[0] || String(values[i][map.EMAIL]).toLowerCase() === row[1]) { target=i+1; break; }
  }
  if (target < 0) { sh.appendRow(row); target=sh.getLastRow(); }
  else sh.getRange(target,1,1,HEADERS.length).setValues([row]);
  return rowToUser_(map)(sh.getRange(target,1,1,HEADERS.length).getValues()[0]);
}

function rowToUser_(map) {
  return function(row) {
    return {
      uid:String(row[map.UID] || ''), email:String(row[map.EMAIL] || ''), name:String(row[map.NAMA] || ''),
      nip:String(row[map.NIP] || ''), jabatan:String(row[map.JABATAN] || ''), role:String(row[map.ROLE] || '').toLowerCase(),
      area:String(row[map.AREA] || ''), status:String(row[map.STATUS] || '').toUpperCase(),
      active:String(row[map.STATUS] || '').toUpperCase() === 'AKTIF'
    };
  };
}

function headerMap_(headers) {
  const h = headers.map(x => String(x).trim().toUpperCase());
  const out={}; HEADERS.forEach(k=>out[k]=h.indexOf(k));
  HEADERS.forEach(k=>{if(out[k]<0) throw new Error('Kolom '+k+' tidak ditemukan di sheet USERS.');});
  return out;
}

function requireAdmin_(profile) {
  if (!profile || profile.role !== 'admin' || profile.active !== true) throw new Error('Akses admin ditolak.');
}

function verifyFirebaseIdToken_(idToken) {
  if (!idToken) throw new Error('Firebase ID token wajib dikirim.');
  const key=PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!key) throw new Error('Script Property FIREBASE_WEB_API_KEY belum diisi.');
  const url='https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(key);
  const res=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({idToken:idToken}),muteHttpExceptions:true});
  const code=res.getResponseCode();
  const data=JSON.parse(res.getContentText()||'{}');
  if (code!==200 || !data.users || !data.users.length) throw new Error('Firebase token tidak valid atau sudah kedaluwarsa.');
  const u=data.users[0];
  return {uid:u.localId,email:String(u.email||'').toLowerCase(),emailVerified:u.emailVerified===true};
}

function syncClaims_(user) {
  const url=PropertiesService.getScriptProperties().getProperty('CLAIM_SYNC_URL');
  const secret=PropertiesService.getScriptProperties().getProperty('CLAIM_SYNC_SECRET');
  if (!url || !secret) throw new Error('CLAIM_SYNC_URL/CLAIM_SYNC_SECRET belum diisi.');
  const res=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{'X-BAZNAS-SECRET':secret},payload:JSON.stringify({uid:user.uid,role:user.role,active:user.active,name:user.name,nip:user.nip,jabatan:user.jabatan,area:user.area}),muteHttpExceptions:true});
  const data=JSON.parse(res.getContentText()||'{}');
  if (res.getResponseCode()!==200 || data.ok!==true) throw new Error(data.error || 'Sinkronisasi Custom Claims gagal.');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
