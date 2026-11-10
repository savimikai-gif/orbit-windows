/* ORBIT Cloud v0.1 — dependency-free Supabase Auth + PostgREST adapter.
   Requires public publishable/anon key and RLS policies in supabase_setup.sql.
   Syncs reminders only. No tokens or reminders are stored in GitHub. */
const loadJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const saveJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const cleanItem = item => ({
  id: String(item.id), title: String(item.title || '').slice(0, 300),
  when: Number(item.when), repeat: ['once','daily','weekdays','custom'].includes(item.repeat) ? item.repeat : 'once',
  days: Array.isArray(item.days) ? item.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [],
  done: !!item.done
});
const serialize = item => JSON.stringify(cleanItem(item));
const isValid = item => item && item.id && item.title && Number.isFinite(Number(item.when));
const fromRow = row => ({id: row.id, title: row.title, when: new Date(row.due_at).getTime(), repeat: row.repeat, days: row.days || [], done: !!row.done});
const asRow = (item, userId, deleted = false) => ({
  user_id: userId, id: item.id, title: item.title || '(deleted)',
  due_at: new Date(Number.isFinite(item.when) ? item.when : Date.now()).toISOString(),
  repeat: item.repeat || 'once', days: item.days || [], done: !!item.done, deleted
});

export class OrbitCloud {
  constructor({config, prefix = 'orbit_cloud_v1', getItems, onRemote, onStatus, getPrefs, onPrefs}) {
    this.url = String(config.url || '').trim().replace(/\/$/, '');
    this.key = String(config.anonKey || '').trim();
    this.ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(this.url) && this.key.length > 30;
    this.prefix = prefix;
    this.getItems = getItems;
    this.onRemote = onRemote;
    this.getPrefs = getPrefs || (() => ({accentColor:'blue',language:'en'}));
    this.onPrefs = onPrefs || (() => {});
    this.prefShadow = loadJSON(prefix + ':prefShadow', this.getPrefs());
    this.prefDirty = loadJSON(prefix + ':prefDirty', false);
    this.onStatus = onStatus || (() => {});
    this.session = loadJSON(prefix + ':session', null);
    this.pending = loadJSON(prefix + ':pending', {});
    this.shadow = loadJSON(prefix + ':shadow', {});
    this.accountId = localStorage.getItem(prefix + ':account') || '';
    this.syncing = false;
    this.started = false;
    this.listenersAdded = false;
    this.timer = null;
    this.status();
  }
  status(message) {
    const value = message || (!this.ready ? 'Cloud not configured' : !this.session ? 'Cloud disconnected' : 'Cloud connected');
    this.onStatus(value);
  }
  isSignedIn() { return !!this.session?.access_token && !!this.session?.user?.id; }
  async request(path, {method='GET', body, auth=false, headers={}}={}) {
    const token = auth ? await this.accessToken() : null;
    const response = await fetch(this.url + path, {
      method, headers: {'apikey':this.key, ...(token ? {'Authorization':`Bearer ${token}`} : {}), 'Content-Type':'application/json', ...headers},
      ...(body !== undefined ? {body:JSON.stringify(body)} : {})
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.msg || err.message || err.error_description || `Cloud error ${response.status}`);
    }
    if (response.status === 204) return null;
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  saveSession(data) {
    if (!data?.access_token || !data?.user?.id) throw new Error('No session returned. Confirm your email if required.');
    if (this.accountId && this.accountId !== data.user.id) throw new Error('This ORBIT installation is linked to another cloud account. Use the original account to prevent mixing private reminders.');
    this.accountId = data.user.id;
    localStorage.setItem(this.prefix + ':account', this.accountId);
    this.session = {access_token:data.access_token, refresh_token:data.refresh_token,
      expiresAt:Date.now() + Number(data.expires_in || 3600)*1000, user:data.user};
    saveJSON(this.prefix + ':session', this.session);
    this.status('Signed in · syncing…');
  }
  async signIn(email, password) {
    if (!this.ready) throw new Error('Add your Supabase Project URL and publishable key in ORBIT Settings first.');
    const result = await this.request('/auth/v1/token?grant_type=password', {method:'POST',body:{email,password}});
    this.saveSession(result);
    this.observe(this.getItems());
    await this.sync();
    return result;
  }
  async signUp(email, password) {
    if (!this.ready) throw new Error('Cloud not configured.');
    const result = await this.request('/auth/v1/signup', {method:'POST',body:{email,password}});
    if (result?.access_token) { this.saveSession(result); this.observe(this.getItems()); await this.sync(); }
    return !!result?.access_token;
  }
  async accessToken() {
    if (!this.session?.access_token) throw new Error('Not signed in to ORBIT Cloud.');
    if (Date.now() < this.session.expiresAt - 90_000) return this.session.access_token;
    const data = await fetch(this.url + '/auth/v1/token?grant_type=refresh_token', {
      method:'POST', headers:{'apikey':this.key,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:this.session.refresh_token})
    });
    if (!data.ok) throw new Error('Cloud session expired. Sign in again.');
    const session = await data.json();
    this.saveSession(session);
    return this.session.access_token;
  }
  signOut() {
    this.session = null;
    localStorage.removeItem(this.prefix + ':session');
    this.status('Signed out · reminders remain on this device');
  }
  // Diff against last applied local snapshot. Deletions become tombstones.
  observe(items) {
    const next = {};
    for (const raw of items) {
      if (!isValid(raw)) continue;
      const item = cleanItem(raw);
      next[item.id] = item;
      if (!this.shadow[item.id] || serialize(this.shadow[item.id]) !== serialize(item)) {
        this.pending[item.id] = {item, deleted:false};
      }
    }
    for (const id of Object.keys(this.shadow)) {
      if (!next[id]) this.pending[id] = {item:this.shadow[id], deleted:true};
    }
    this.shadow = next;
    saveJSON(this.prefix + ':shadow', this.shadow);
    saveJSON(this.prefix + ':pending', this.pending);
  }
  observePrefs(prefs) {
    const clean = {accentColor:String(prefs.accentColor || 'blue'),language:prefs.language === 'ro' ? 'ro' : 'en'};
    if (JSON.stringify(clean) !== JSON.stringify(this.prefShadow)) {
      this.prefDirty = true;
      this.prefShadow = clean;
      saveJSON(this.prefix + ':prefShadow', clean);
      saveJSON(this.prefix + ':prefDirty', true);
    }
  }
  async syncPrefs() {
    const id = encodeURIComponent(this.session.user.id);
    if (this.prefDirty) {
      const current = {...this.prefShadow};
      await this.request('/rest/v1/orbit_preferences?on_conflict=user_id', {
        method:'POST',auth:true,body:[{user_id:this.session.user.id,accent_color:current.accentColor,language:current.language}],
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}
      });
      if (JSON.stringify(current) === JSON.stringify(this.prefShadow)) {
        this.prefDirty=false;
        saveJSON(this.prefix + ':prefDirty',false);
      }
    }
    let rows = await this.request(`/rest/v1/orbit_preferences?select=accent_color,language&user_id=eq.${id}`,{auth:true});
    if (!rows?.length) {
      const current=this.getPrefs();
      await this.request('/rest/v1/orbit_preferences?on_conflict=user_id',{
        method:'POST',auth:true,body:[{user_id:this.session.user.id,accent_color:current.accentColor,language:current.language}],
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}
      });
      rows=[{accent_color:current.accentColor,language:current.language}];
    }
    if (!this.prefDirty) {
      const incoming={accentColor:rows[0].accent_color,language:rows[0].language};
      this.prefShadow=incoming;
      saveJSON(this.prefix + ':prefShadow',incoming);
      this.onPrefs(incoming);
    }
  }
  scheduleSync() {
    if (!this.isSignedIn() || !this.ready) return;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.sync().catch(() => {}), 550);
  }
  async fetchRows() {
    const id = encodeURIComponent(this.session.user.id);
    return await this.request(`/rest/v1/orbit_reminders?select=id,title,due_at,repeat,days,done,deleted,updated_at&user_id=eq.${id}`, {auth:true});
  }
  async sync() {
    if (!this.ready || !this.isSignedIn() || this.syncing || !navigator.onLine) return;
    this.syncing = true;
    this.status('Syncing…');
    try {
      const batch = {...this.pending};
      if (Object.keys(batch).length) {
        const rows = Object.values(batch).map(change => asRow(change.item, this.session.user.id, change.deleted));
        await this.request('/rest/v1/orbit_reminders?on_conflict=user_id,id', {
          method:'POST', auth:true, body:rows,
          headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}
        });
        for (const [id, change] of Object.entries(batch)) {
          if (JSON.stringify(this.pending[id]) === JSON.stringify(change)) delete this.pending[id];
        }
        saveJSON(this.prefix + ':pending', this.pending);
      }
      const remoteRows = await this.fetchRows();
      const merged = new Map();
      for (const row of remoteRows || []) {
        if (!row.deleted) {
          const item = fromRow(row);
          if (isValid(item)) merged.set(item.id, item);
        }
      }
      // Preserve edits made during the network request.
      for (const [id, change] of Object.entries(this.pending)) {
        if (change.deleted) merged.delete(id);
        else merged.set(id, change.item);
      }
      const result = [...merged.values()];
      this.shadow = Object.fromEntries(result.map(item => [item.id, cleanItem(item)]));
      saveJSON(this.prefix + ':shadow', this.shadow);
      this.onRemote(result);
      await this.syncPrefs();
      this.status(`Synced · ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`);
    } catch (err) {
      this.status(`Sync pending · ${err.message}`);
      throw err;
    } finally { this.syncing = false; }
  }
  start() {
    if (this.started) return;
    this.started = true;
    this.observe(this.getItems());
    this.timer = setInterval(() => { if (this.isSignedIn()) this.sync().catch(() => {}); }, 12000);
    if (!this.listenersAdded) {
      window.addEventListener('online', () => this.scheduleSync());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.scheduleSync(); });
      this.listenersAdded = true;
    }
    if (this.isSignedIn()) this.sync().catch(() => {});
  }
  stop() { clearInterval(this.timer); clearTimeout(this.debounce); this.started = false; }
}
