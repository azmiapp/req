window.Auth = {
  token(){ return localStorage.getItem(APP_CONFIG.TOKEN_KEY) || ''; },
  user(){
    try { return JSON.parse(localStorage.getItem(APP_CONFIG.USER_KEY) || 'null'); }
    catch { return null; }
  },
  save(result){
    localStorage.setItem(APP_CONFIG.TOKEN_KEY, result.token);
    localStorage.setItem(APP_CONFIG.USER_KEY, JSON.stringify(result.user || {}));
  },
  clear(){
    localStorage.removeItem(APP_CONFIG.TOKEN_KEY);
    localStorage.removeItem(APP_CONFIG.USER_KEY);
  },
  async login(username,password){
    const result = await API.call('login',username,password);
    this.save(result);
    return result;
  },
  async logout(){
    const token = this.token();
    try { if(token) await API.call('logout',token); } catch(e){}
    this.clear();
    location.href = '../index.html';
  },
  async verify(){
    const token = this.token();
    if(!token) return null;
    try {
      const data = await API.call('getMe',token);
      const user = data.user || data.me || data;
      localStorage.setItem(APP_CONFIG.USER_KEY, JSON.stringify(user));
      return user;
    } catch(e) {
      this.clear();
      return null;
    }
  },
  requireLoggedIn(){
    if(!this.token()) location.href = '../index.html';
  },
  requireLoggedOut(){
    if(this.token()) location.href = 'pages/dashboard.html';
  }
};