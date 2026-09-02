window.API = (() => {
  let busy = false;

  async function call(fn, ...args){
    const action = APP_CONFIG.ACTION_MAP[fn] || fn;
    let params = {};

    if (fn === 'login') {
      params = {username:args[0], password:args[1]};
    } else if (
      ['logout','getMe','getDashboard','getPendingApprovals','getEmployees'].includes(fn)
    ) {
      params = {token:args[0]};
    } else if (fn === 'submitAttendance') {
      const [token,p] = args;
      params = {
        token,
        jenis:p?.jenis || '',
        latitude:p?.lat || '',
        longitude:p?.lng || '',
        accuracy:p?.acc || '',
        kecamatan:p?.kecamatan || '',
        kabupaten:p?.kabupaten || 'Sragen',
        alamat:p?.alamat || '',
        keterangan:p?.keterangan || '',
        photoData:p?.photoData || ''
      };
    } else if (fn === 'submitRequest') {
      const [token,p] = args;
      params = {
        token,
        payload:{
          jenis:p?.jenis || '',
          mulai:p?.tglMulai || '',
          selesai:p?.tglSelesai || '',
          alasan:p?.alasan || '',
          lampiran:p?.lampiranUrl || ''
        }
      };
    } else if (fn === 'approveManager' || fn === 'approveSdm') {
      params = {token:args[0], id:args[1], approved:args[2], note:args[3] || ''};
    } else if (fn === 'getAttendanceHistory') {
      const [token,f] = args;
      params = {
        token,
        month:f?.month || '',
        nik:f?.nik || '',
        status:f?.status || ''
      };
    } else {
      throw new Error('API action belum dipetakan: '+fn);
    }

    if (busy) throw new Error('Sedang memproses. Tunggu sebentar.');
    busy = true;

    try {
      const response = await fetch(APP_CONFIG.API_URL, {
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action,params}),
        redirect:'follow'
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error('Respons server bukan JSON. Periksa deployment Code.gs.'); }

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || data.message || `Server error (${response.status})`);
      }
      return data.data;
    } catch (e) {
      if (e.message.includes('Failed to fetch')) {
        throw new Error('Tidak dapat terhubung ke server. Periksa koneksi dan URL API.');
      }
      throw e;
    } finally {
      busy = false;
    }
  }

  return {call};
})();