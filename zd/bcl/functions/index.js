const {onRequest} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();

exports.syncClaims = onRequest({region:'asia-southeast2',cors:false}, async (req,res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ok:false,error:'POST only'});
    const secret = process.env.BAZNAS_CLAIMS_SECRET;
    if (!secret || req.get('X-BAZNAS-SECRET') !== secret) return res.status(403).json({ok:false,error:'Forbidden'});
    const {uid,role,active,name,nip,jabatan,area} = req.body || {};
    if (!uid || !['admin','zmart'].includes(role)) return res.status(400).json({ok:false,error:'uid dan role valid wajib diisi'});
    await admin.auth().setCustomUserClaims(uid,{role,active:Boolean(active),name:name||'',nip:nip||'',jabatan:jabatan||'',area:area||''});
    return res.json({ok:true,uid,role,active:Boolean(active)});
  } catch (e) {
    console.error(e);
    return res.status(500).json({ok:false,error:e.message});
  }
});
