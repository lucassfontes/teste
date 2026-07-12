
(function(){
  'use strict';
  const cfg = window.VALLE_SUPABASE_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/i.test(cfg.url || '') && !String(cfg.anonKey || '').includes('COLE_AQUI');
  let client = null;
  let profile = null;
  let sessionProfile = null;
  let syncTimer = null;
  let loadingRemote = false;
  let syncState = 'idle';
  let lastSyncError = null;
  let lastSyncedAt = null;

  function getClient(){
    if (!configured || !window.supabase?.createClient) return null;
    if (!client) client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function isExpired(date){ return !!date && String(date).slice(0,10) < todayISO(); }
  function normalizePhone(v){ return String(v || '').replace(/\D/g,''); }

  async function getCurrentAuth(){
    const c = getClient();
    if (!c) return null;
    const { data, error } = await c.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  }

  async function loadProfile(userId){
    const c = getClient();
    const { data, error } = await c.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    profile = data;
    sessionProfile = null;
    if (data.role === 'service' && data.session_user_id) {
      const res = await c.from('profiles').select('*').eq('id', data.session_user_id).single();
      if (res.error) throw res.error;
      sessionProfile = res.data;
    } else if (data.role === 'session') {
      sessionProfile = data;
    }
    return data;
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
      await getClient().auth.signOut();
      return { blocked:true, ...state };
    }
    return profile;
  }

  async function signOut(){
    if (getClient()) await getClient().auth.signOut();
    profile = null; sessionProfile = null;
  }


  async function setMyTheme(theme){
    const value = theme === 'dark' ? 'dark' : 'light';
    const { data, error } = await getClient().rpc('set_my_theme', { new_theme:value });
    if (error) throw error;
    if (profile) profile.user_theme = value;
    return data || value;
  }

  async function loadWorkspaceSnapshot(){
    if (!profile || !['session','service'].includes(profile.role)) return null;
    loadingRemote = true;
    try {
      const { data, error } = await getClient()
        .from('session_workspaces')
        .select('data,updated_at,updated_by')
        .eq('session_user_id', profile.role === 'session' ? profile.id : profile.session_user_id)
        .maybeSingle();
      if (error) throw error;
      if (data?.updated_at) lastSyncedAt = data.updated_at;
      return data || null;
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
      lastSyncedAt
    }}));
  }

  async function saveWorkspace(data){
    if (loadingRemote || !profile || !['session','service'].includes(profile.role)) return false;
    let completeData = data && typeof data === 'object' ? data : {};
    try{
      completeData=JSON.parse(JSON.stringify(completeData));
      if(completeData.settings){
        delete completeData.settings.percentualJuros50;
        delete completeData.settings.taxaAtrasoDiario;
        delete completeData.settings.tipoTaxaAtrasoDiario;
      }
    }catch(_){ }
    syncState = 'syncing'; lastSyncError = null; emitSyncState();
    const payload = {
      session_user_id: profile.role === 'session' ? profile.id : profile.session_user_id,
      updated_by: profile.id,
      // Um único banco compartilhado por sessão. Todos os usuários de serviço
      // vinculados à mesma sessão leem e atualizam este mesmo JSON.
      data: completeData,
      updated_at: new Date().toISOString()
    };
    const { error } = await getClient().from('session_workspaces').upsert(payload, { onConflict:'session_user_id' });
    if (error) {
      syncState = 'error'; lastSyncError = error.message || String(error); emitSyncState();
      console.error('Falha ao sincronizar os dados compartilhados da sessão com Supabase:', error);
      return false;
    }
    syncState = 'synced'; lastSyncedAt = payload.updated_at; emitSyncState();
    return true;
  }

  function queueWorkspace(data){
    clearTimeout(syncTimer);
    // Clona no momento da fila para evitar que alterações posteriores produzam
    // uma versão inconsistente durante o envio.
    let snapshot = data;
    try { snapshot = JSON.parse(JSON.stringify(data || {})); } catch (_) {}
    syncTimer = setTimeout(() => saveWorkspace(snapshot), 350);
  }

  async function flushWorkspace(data){
    clearTimeout(syncTimer);
    return saveWorkspace(data);
  }

  async function invokeManage(action, payload={}){
    const c = getClient();
    const { data, error } = await c.functions.invoke(cfg.manageUserFunction || 'manage-user', { body:{ action, ...payload } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function listManagedUsers(){
    if (!profile) return [];
    let q = getClient().from('profiles').select('*').order('created_at', {ascending:false});
    if (profile.role === 'session') q = q.eq('session_user_id', profile.id).eq('role','service');
    else if (profile.role === 'admin') q = q.eq('role','session');
    else return [];
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function getPermissions(userId){
    const { data, error } = await getClient().from('service_permissions').select('*').eq('service_user_id',userId).maybeSingle();
    if (error) throw error;
    return data || {};
  }

  async function savePermissions(userId, permissions){
    const payload = { service_user_id:userId, session_user_id:profile.id, ...permissions, updated_at:new Date().toISOString() };
    const { error } = await getClient().from('service_permissions').upsert(payload,{onConflict:'service_user_id'});
    if (error) throw error;
  }

  async function loadMyPermissions(){
    if (!profile || profile.role !== 'service') return {};
    return getPermissions(profile.id);
  }

  window.ValleCloud = {
    configured, getClient, signIn, signOut, restoreSession, loadProfile,
    get profile(){return profile}, get sessionProfile(){return sessionProfile},
    accessState, setMyTheme, loadWorkspace, loadWorkspaceSnapshot, saveWorkspace, queueWorkspace, flushWorkspace,
    invokeManage, listManagedUsers, getPermissions, savePermissions, loadMyPermissions,
    normalizePhone,
    get syncState(){return syncState},
    get lastSyncError(){return lastSyncError},
    get lastSyncedAt(){return lastSyncedAt}
  };
})();
