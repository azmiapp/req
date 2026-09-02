window.GPS = (() => {
  let last = null;

  function position(){
    return new Promise((resolve,reject) => {
      if(!navigator.geolocation) return reject(new Error('Browser tidak mendukung GPS.'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({
          lat:p.coords.latitude,
          lng:p.coords.longitude,
          acc:p.coords.accuracy
        }),
        e => {
          const msg = e.code===1 ? 'Izin lokasi ditolak.'
            : e.code===2 ? 'Lokasi tidak tersedia.'
            : e.code===3 ? 'GPS timeout. Coba lagi.'
            : 'GPS gagal digunakan.';
          reject(new Error(msg));
        },
        {enableHighAccuracy:true, timeout:12000, maximumAge:0}
      );
    });
  }

  async function get(force=false){
    if(!force && last && Date.now()-last.time < APP_CONFIG.GEO_CACHE_MS) return last.data;
    const data = await position();
    last = {time:Date.now(), data};
    return data;
  }

  async function reverse(lat,lng){
    const url = `${APP_CONFIG.GEOCODE_URL}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=14&addressdetails=1`;
    const r = await fetch(url, {
      headers:{'Accept':'application/json','Accept-Language':'id'}
    });
    if(!r.ok) throw new Error('Reverse geocoding gagal.');
    const d = await r.json();
    const a = d.address || {};
    return {
      kecamatan: a.suburb || a.town || a.village || a.city_district || a.municipality || '',
      kabupaten: a.county || a.city || 'Sragen',
      provinsi: a.state || 'Jawa Tengah',
      alamat: d.display_name || ''
    };
  }

  async function locate(force=false){
    const p = await get(force);
    let place = {kecamatan:'',kabupaten:'Sragen',provinsi:'Jawa Tengah',alamat:''};
    try { place = await reverse(p.lat,p.lng); } catch(e) {}
    return {...p,...place};
  }

  return {get, reverse, locate};
})();