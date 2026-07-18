(function(){
  'use strict';
  const cfg = window.VALLE_SUPABASE_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(cfg.url || '') && !String(cfg.anonKey || '').includes('COLE_AQUI');
  const CACHE_PREFIX = 'valle_offline_v1_';
  let client = null;
  let profile = null;
  let sessionProfile = null;
  let syncTimer = null;
  let loadingRemote = false;
  let syncState = navigator.onLine ? 'idle' : 'offline';
  let lastSyncError = null;
  let lastSyncedAt = null;
  let onlineHandlerInstalled = false;

  function getClient(){
    if (!configured || !window.supabase?.createClient) return null;
    if (!client) client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function safeGet(key, fallback=null){
    try { const raw = localStorage.getItem(CACHE_PREFIX + key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function safeSet(key, value){
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('Não foi possível gravar o cache offline:', e); return false; }
  }
  function safeRemove(key){ try { localStorage.removeItem(CACHE_PREFIX + key); } catch (_) {} }
  function currentSessionId(){
    if (!profile) return null;
    return profile.role === 'session' ? profile.id : profile.session_user_id || null;
  }
  function profileCacheKey(id){ return `profile_${id}`; }
  function sessionProfileCacheKey(id){ return `session_profile_${id}`; }
  function workspaceCacheKey(id){ return `workspace_${id}`; }
  function pendingCacheKey(id){ return `pending_workspace_${id}`; }
  function permissionsCacheKey(id){ return `permissions_${id}`; }

  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function isExpired(date){ return !!date && String(date).slice(0,10) < todayISO(); }
  function normalizePhone(v){ return String(v || '').replace(/\D/g,''); }
  function isOnline(){ return navigator.onLine !== false; }
  function clone(value){ try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; } }

  async function getCurrentAuth(){
    const c = getClient();
    if (!c) return null;
    // getSession usa a sessão persistida no aparelho e continua funcionando offline.
    const sessionResult = await c.auth.getSession();
    if (sessionResult?.data?.session?.user) return sessionResult.data.session.user;
    if (!isOnline()) return null;
    const { data, error } = await c.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  }

  async function loadProfile(userId){
    const c = getClient();
    if (!c) throw new Error('Supabase não configurado.');
    if (!isOnline()) {
      const cached = safeGet(profileCacheKey(userId));
      if (!cached) throw new Error('Primeiro acesso deste usuário precisa ser feito com internet.');
      profile = cached;
      sessionProfile = profile.role === 'service'
        ? safeGet(sessionProfileCacheKey(profile.session_user_id))
        : (profile.role === 'session' ? profile : null);
      return profile;
    }
    try {
      const { data, error } = await c.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      profile = data;
      safeSet(profileCacheKey(userId), data);
      sessionProfile = null;
      if (data.role === 'service' && data.session_user_id) {
        const res = await c.from('profiles').select('*').eq('id', data.session_user_id).single();
        if (res.error) throw res.error;
        sessionProfile = res.data;
        safeSet(sessionProfileCacheKey(data.session_user_id), res.data);
      } else if (data.role === 'session') {
        sessionProfile = data;
        safeSet(sessionProfileCacheKey(data.id), data);
      }
      return data;
    } catch (err) {
      const cached = safeGet(profileCacheKey(userId));
      if (!cached) throw err;
      profile = cached;
      sessionProfile = profile.role === 'service'
        ? safeGet(sessionProfileCacheKey(profile.session_user_id))
        : (profile.role === 'session' ? profile : null);
      return profile;
    }
  }

  function accessState(){
    if (!profile) return { allowed:false, reason:'Perfil não encontrado.' };
    const base = profile.role === 'service' ? sessionProfile : profile;
    if (!profile.active) return { allowed:false, reason:'Usuário bloqueado.', whatsapp: base?.admin_whatsapp };
    if ((profile.role === 'session' || profile.role === 'service') && (!base?.active || isExpired(base?.valid_until))) {
      return { allowed:false, reason:'Sessão interrompida. Fale com o administrador.', whatsapp: base?.admin_whatsapp };
    }
    return { allowed:true };
  }

  async function signIn(email, password){
    const c = getClient();
    if (!c) throw new Error('Supabase ainda não foi configurado. Preencha js/supabase-config.js.');
    if (!isOnline()) throw new Error('Para entrar pela primeira vez, conecte-se à internet. Depois o sistema continuará disponível offline neste aparelho.');
    const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    await loadProfile(data.user.id);
    const state = accessState();
    if (!state.allowed) {
      await c.auth.signOut();
      const err = new Error(state.reason);
      err.whatsapp = state.whatsapp;
      throw err;
    }
    return profile;
  }

  async function restoreSession(){
    const user = await getCurrentAuth();
    if (!user) return null;
    await loadProfile(user.id);
    const state = accessState();
    if (!state.allowed) {
      // Offline não encerra a sessão, pois isso apagaria o acesso local. O bloqueio
      // continuará sendo conferido assim que a conexão voltar.
      if (isOnline()) await getClient().auth.signOut();
      return { blocked:true, ...state };
    }
    installOnlineHandlers();
    return profile;
  }

  async function signOut(){
    if (getClient()) await getClient().auth.signOut();
    profile = null; sessionProfile = null;
  }

  async function setMyTheme(theme){
    const value = theme === 'dark' ? 'dark' : 'light';
    if (profile) {
      profile.user_theme = value;
      safeSet(profileCacheKey(profile.id), profile);
    }
    if (!isOnline()) return value;
    const { data, error } = await getClient().rpc('set_my_theme', { new_theme:value });
    if (error) throw error;
    return data || value;
  }

  function cachedWorkspaceSnapshot(){
    const sid = currentSessionId();
    return sid ? safeGet(workspaceCacheKey(sid)) : null;
  }

  async function loadWorkspaceSnapshot(){
    if (!profile || !['session','service'].includes(profile.role)) return null;
    const sid = currentSessionId();
    if (!isOnline()) return cachedWorkspaceSnapshot();
    loadingRemote = true;
    try {
      const { data, error } = await getClient()
        .from('session_workspaces')
        .select('data,updated_at,updated_by')
        .eq('session_user_id', sid)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        if (data.updated_at) lastSyncedAt = data.updated_at;
        safeSet(workspaceCacheKey(sid), data);
      }
      return data || cachedWorkspaceSnapshot();
    } catch (err) {
      lastSyncError = err.message || String(err);
      return cachedWorkspaceSnapshot();
    } finally { loadingRemote = false; }
  }

  async function loadWorkspace(){
    const snapshot = await loadWorkspaceSnapshot();
    return snapshot?.data || null;
  }

  function emitSyncState(){
    window.dispatchEvent(new CustomEvent('valle-cloud-sync', { detail:{
      state: syncState,
      error: lastSyncError,
      lastSyncedAt,
      online: isOnline(),
      pending: !!(currentSessionId() && safeGet(pendingCacheKey(currentSessionId())))
    }}));
  }

  function sanitizeWorkspace(data){
    let completeData = data && typeof data === 'object' ? clone(data) : {};
    try {
      if (completeData.settings) {
        // Configurações financeiras são individuais de cada usuário de serviço
        // e ficam em service_permissions, não no workspace compartilhado.
        delete completeData.settings.percentualJuros50;
        delete completeData.settings.percentualJuros;
        delete completeData.settings.taxaAtrasoDiario;
        delete completeData.settings.tipoTaxaAtrasoDiario;
      }
    } catch (_) {}
    return completeData;
  }

  function storePending(data){
    const sid = currentSessionId();
    if (!sid) return false;
    const now = new Date().toISOString();
    const pending = { data:sanitizeWorkspace(data), queued_at:now, updated_by:profile?.id || null };
    safeSet(pendingCacheKey(sid), pending);
    safeSet(workspaceCacheKey(sid), { data:pending.data, updated_at:now, updated_by:pending.updated_by, offline:true });
    syncState = 'offline';
    lastSyncError = null;
    emitSyncState();
    return true;
  }

  async function pushWorkspace(data, queuedAt=null){
    const sid = currentSessionId();
    if (!sid) return false;
    const completeData = sanitizeWorkspace(data);
    const payload = {
      session_user_id: sid,
      updated_by: profile.id,
      data: completeData,
      updated_at: queuedAt || new Date().toISOString()
    };
    const { error } = await getClient().from('session_workspaces').upsert(payload, { onConflict:'session_user_id' });
    if (error) throw error;
    safeSet(workspaceCacheKey(sid), { data:completeData, updated_at:payload.updated_at, updated_by:profile.id });
    safeRemove(pendingCacheKey(sid));
    syncState = 'synced';
    lastSyncedAt = payload.updated_at;
    lastSyncError = null;
    emitSyncState();
    return true;
  }

  async function saveWorkspace(data){
    if (loadingRemote || !profile || !['session','service'].includes(profile.role)) return false;
    // A alteração é gravada localmente antes de qualquer tentativa de rede.
    storePending(data);
    if (!isOnline()) return true;
    syncState = 'syncing'; lastSyncError = null; emitSyncState();
    try {
      const pending = safeGet(pendingCacheKey(currentSessionId()));
      return await pushWorkspace(pending?.data || data, pending?.queued_at || null);
    } catch (error) {
      syncState = 'offline';
      lastSyncError = error.message || String(error);
      emitSyncState();
      console.warn('Alteração guardada no aparelho; será enviada quando a internet voltar:', error);
      return true;
    }
  }

  async function syncPendingWorkspace(){
    if (!profile || !isOnline()) return false;
    const sid = currentSessionId();
    const pending = sid ? safeGet(pendingCacheKey(sid)) : null;
    if (!pending?.data) return false;
    syncState = 'syncing'; lastSyncError = null; emitSyncState();
    try { return await pushWorkspace(pending.data, pending.queued_at || null); }
    catch (error) {
      syncState = 'offline'; lastSyncError = error.message || String(error); emitSyncState();
      return false;
    }
  }

  function queueWorkspace(data){
    clearTimeout(syncTimer);
    const snapshot = clone(data || {});
    // Grava imediatamente a fila local; o debounce é usado apenas no envio.
    storePending(snapshot);
    syncTimer = setTimeout(() => saveWorkspace(snapshot), 450);
  }

  async function flushWorkspace(data){
    clearTimeout(syncTimer);
    return saveWorkspace(data);
  }

  function installOnlineHandlers(){
    if (onlineHandlerInstalled) return;
    onlineHandlerInstalled = true;
    window.addEventListener('online', async()=>{
      syncState = 'syncing'; emitSyncState();
      try {
        if (profile?.id) await loadProfile(profile.id); // revalida bloqueio e validade
        await syncPendingWorkspace();
        if (syncState !== 'synced') { syncState='idle'; emitSyncState(); }
      } catch (e) {
        syncState='offline'; lastSyncError=e.message||String(e); emitSyncState();
      }
    });
    window.addEventListener('offline', ()=>{ syncState='offline'; emitSyncState(); });
  }

  async function invokeManage(action, payload={}){
    if (!isOnline()) throw new Error('Esta ação administrativa precisa de internet.');
    const c = getClient();
    const { data, error } = await c.functions.invoke(cfg.manageUserFunction || 'manage-user', { body:{ action, ...payload } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }


  function auditCacheKey(id){ return `audit_logs_${id}`; }
  function auditHash(input){
    let h=2166136261; const str=JSON.stringify(input||{});
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
    return `VALLE-${Date.now().toString(36).toUpperCase()}-${(h>>>0).toString(16).padStart(8,'0').toUpperCase()}`;
  }
  async function recordAudit(action, entityType, entityId, details={}){
    if (!profile || !['session','service'].includes(profile.role)) return false;
    const sid=currentSessionId(); const now=new Date().toISOString();
    const d=clone(details||{}); const signature=auditHash({sid,uid:profile.id,action,entityType,entityId,d,now});
    const item={
      session_user_id:sid, actor_user_id:profile.id, actor_name:profile.name||profile.email||'Usuário',
      actor_role:profile.role, action:String(action||'').toUpperCase(), module:String(d.module||entityType||'SISTEMA').toUpperCase(),
      title:String(d.title||'Ação registrada'), description:String(d.description||''),
      entity_type:String(entityType||'registro'), entity_id:String(entityId||''), client_name:d.client_name||d.nome||null,
      vale_number:d.vale_number||d.numero||null, old_data:d.old_data||null, new_data:d.new_data||null,
      changes:d.changes||{}, details:d, signature, created_at:now
    };
    const cached=safeGet(auditCacheKey(sid),[]); cached.unshift(item); safeSet(auditCacheKey(sid),cached.slice(0,2000));
    if(!isOnline()) return true;
    try{ const {error}=await getClient().from('audit_logs').insert(item); if(error) throw error; return true; }
    catch(e){ console.warn('Log guardado localmente:',e); return true; }
  }

  async function listAuditLogs(limit=1000){
    if(!profile || profile.role!=='session') return [];
    const sid=currentSessionId();
    if(!isOnline()) return safeGet(auditCacheKey(sid),[]).slice(0,limit);
    const {data,error}=await getClient().from('audit_logs').select('*').eq('session_user_id',sid).order('created_at',{ascending:false}).limit(limit);
    if(error) throw error; safeSet(auditCacheKey(sid),data||[]); return data||[];
  }

  async function listManagedUsers(){
    if (!profile) return [];
    if (!isOnline()) return safeGet(`managed_users_${profile.id}`, []);
    let q = getClient().from('profiles').select('*').order('created_at', {ascending:false});
    if (profile.role === 'session') q = q.eq('session_user_id', profile.id).eq('role','service');
    else if (profile.role === 'admin') q = q.eq('role','session');
    else return [];
    const { data, error } = await q;
    if (error) throw error;
    safeSet(`managed_users_${profile.id}`, data || []);
    return data || [];
  }

  async function getPermissions(userId){
    if (!isOnline()) return safeGet(permissionsCacheKey(userId), {});
    try {
      const { data, error } = await getClient().from('service_permissions').select('*').eq('service_user_id',userId).maybeSingle();
      if (error) throw error;
      safeSet(permissionsCacheKey(userId), data || {});
      return data || {};
    } catch (e) { return safeGet(permissionsCacheKey(userId), {}); }
  }

  async function savePermissions(userId, permissions){
    if (!isOnline()) throw new Error('Alterar permissões precisa de internet.');
    const payload = { service_user_id:userId, session_user_id:profile.id, ...permissions, updated_at:new Date().toISOString() };
    const { error } = await getClient().from('service_permissions').upsert(payload,{onConflict:'service_user_id'});
    if (error) throw error;
    safeSet(permissionsCacheKey(userId), payload);
  }

  async function loadMyPermissions(){
    if (!profile || profile.role !== 'service') return {};
    return getPermissions(profile.id);
  }

  installOnlineHandlers();
  window.ValleCloud = {
    configured, getClient, signIn, signOut, restoreSession, loadProfile,
    get profile(){return profile}, get sessionProfile(){return sessionProfile},
    accessState, setMyTheme, loadWorkspace, loadWorkspaceSnapshot, saveWorkspace, queueWorkspace, flushWorkspace,
    syncPendingWorkspace, invokeManage, listManagedUsers, getPermissions, savePermissions, loadMyPermissions, recordAudit, listAuditLogs,
    normalizePhone, isOnline,
    get syncState(){return syncState},
    get lastSyncError(){return lastSyncError},
    get lastSyncedAt(){return lastSyncedAt}
  };
})();
