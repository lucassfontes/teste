
(function(){
'use strict';
const PERMS = [
 ['can_view_dashboard','Dashboard'],['can_create_client','Criar cliente'],['can_edit_client','Editar cliente'],
 ['can_delete_client','Excluir cliente'],['can_create_vale','Criar VALLE'],['can_edit_vale','Editar VALLE'],
 ['can_delete_vale','Excluir VALLE'],['can_receive_payment','Receber pagamento'],['can_view_history','Ver histórico'],
 ['can_view_reports','Ver relatórios'],['can_manage_backup','Backup'],
 ['can_view_session_data','Ver dados da sessão']
];

function htmlEscape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function el(id){return document.getElementById(id)}
function setMsg(msg, error=true){const x=el('authMessage'); if(x){x.textContent=msg||'';x.classList.toggle('error',error)}}
function loginIsVisible(){const gate=el('authGate');return !!gate&&!gate.classList.contains('hidden')}
// O indicador Online/Offline foi removido da tela de login.
function updateSyncBadge(){const b=document.getElementById('valleSyncBadge');if(b)b.remove()}
function connectionToast(message,type='info'){if(typeof window.toast==='function'){window.toast(message,type);return}const t=el('toast');if(!t)return;t.textContent=message;t.className=`toast ${type} show`;t.style.display='block';clearTimeout(connectionToast.timer);connectionToast.timer=setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.style.display='none',300)},4000)}
function whatsappLink(phone){const p=String(phone||'').replace(/\D/g,'');return p?`https://wa.me/${p}`:'#';}
function roleLabel(role){
 const map={admin:'Administrador',session:'Usuário de sessão',service:'Usuário de serviço'};
 return map[String(role||'').toLowerCase()]||'Usuário';
}
function ensureRoleBadge(info,role){
 if(!info)return;
 let badge=info.querySelector('.user-role-badge');
 if(!badge){badge=document.createElement('span');badge.className='user-role-badge';info.appendChild(badge)}
 badge.textContent=roleLabel(role);
}

function inject(){
 document.body.insertAdjacentHTML('afterbegin', `
 <section id="authGate" class="auth-gate">
  <div class="auth-card">
   <img src="icons/icon-valle.png" alt="VALLE" class="auth-logo">
   <h1>VALLE</h1><p>Entre para acessar sua conta</p>
   <form id="loginForm"><label>E-mail<input id="loginEmail" type="email" required autocomplete="username"></label>
   <label>Senha<input id="loginPassword" type="password" required autocomplete="current-password"></label>
   <button class="btn primary" type="submit">Entrar</button></form>
   <div id="authMessage" class="auth-message"></div>
   <a id="authWhatsapp" class="auth-whatsapp hidden" target="_blank" rel="noopener">FALAR COM O ADMINISTRADOR</a>
   <small class="auth-setup ${ValleCloud.configured?'hidden':''}">Configure o Supabase em <b>js/supabase-config.js</b>.</small>
  </div>
  
  <button id="authThemeBtn" class=" position-absolute bottom-0 end-0 mb-2 me-2" type="button" title="Alternar tema" aria-label="Alternar tema">
    <i class="bi bi-moon-stars-fill"></i>
  </button>
 </section>
 <section id="managementPanel" class="management-panel hidden">
   <header class="management-top"><div><img src="icons/icon-valle.png"><div><h1>VALLE</h1><p id="managementSubtitle"></p></div></div><div class="management-top-actions"><div class="management-user-menu"><button type="button" class="management-user-trigger" id="managementUserTrigger" aria-expanded="false"><span class="management-trigger-avatar">U</span><span class="management-trigger-copy"><strong id="managementUserName">Usuário</strong><small id="managementUserPanelLabel">Painel</small></span><span class="dashboard-user-chevron" aria-hidden="true">⌄</span></button><div class="management-user-dropdown hidden" id="managementUserDropdown"><div class="dashboard-user-info"><strong id="managementUserDropdownName">Usuário</strong><small id="managementUserDropdownEmail"></small></div><button type="button" id="managementThemeBtn" class="user-theme-menu-btn">🌙 Modo escuro</button><button type="button" id="logoutBtn" class="user-logout-menu-btn">↪ Sair</button></div></div></div></header>
   <main class="management-content"><section class="management-card"><div class="management-head"><div><h2 id="managementTitle">Usuários</h2><p id="managementHelp"></p></div><button id="newManagedUserBtn" class="btn primary">NOVO USUÁRIO</button></div><div id="managedUsers"></div></section><section id="auditPanel" class="management-card hidden"><div class="management-head"><div><h2>Auditoria dos usuários de serviço</h2><p>Histórico permanente de criações, edições, exclusões, pagamentos e quitações.</p></div><button id="refreshAuditBtn" class="btn btn-outline-primary"><i class="bi bi-arrow-clockwise"></i> ATUALIZAR</button></div><div class="audit-filters"><div class="audit-search"><i class="bi bi-search"></i><input id="auditSearch" type="search" placeholder="Buscar usuário, cliente, vale ou ação..."></div><select id="auditUserFilter"><option value="">Todos os usuários</option></select><select id="auditModuleFilter"><option value="">Todos os módulos</option><option>CLIENTES</option><option>VALES</option><option>PAGAMENTOS</option><option>USUARIOS</option><option>SISTEMA</option></select><select id="auditActionFilter"><option value="">Todas as ações</option></select><input id="auditDateFrom" type="date" title="Data inicial"><input id="auditDateTo" type="date" title="Data final"><button id="clearAuditFilters" class="btn btn-outline-secondary">LIMPAR</button></div><div id="auditSummary" class="audit-summary"></div><div id="auditLogs"></div><div class="text-center mt-3"><button id="loadMoreAudit" class="btn btn-outline-primary hidden">CARREGAR MAIS</button></div></section></main>
 </section>
 <div id="userModal" class="user-modal hidden"><div class="user-modal-card"><button class="modal-x" id="closeUserModal">×</button><h2 id="userModalTitle">Novo usuário</h2>
 <form id="userForm"><input id="managedId" type="hidden"><label>Nome<input id="managedName" required></label><label>E-mail<input id="managedEmail" type="email" required></label>
 <label id="managedPasswordLabel">Senha inicial<input id="managedPassword" type="password" minlength="6"></label>
 <label id="managedValidityWrap">Validade da sessão<input id="managedValidity" type="date"></label>
 <label id="managedWhatsappWrap">WhatsApp do administrador<input id="managedWhatsapp" inputmode="tel" placeholder="Ex: 5594999999999"></label>
 <fieldset id="serviceFinancialBox" class="service-financial-box"><legend>Configuração financeira individual</legend>
  <label for="managedInterestPercent">Juros configurável (%)<input id="managedInterestPercent" type="number" inputmode="decimal" min="0" step="0.01" value="30" placeholder="Ex: 30"></label>
  <small>Este percentual será usado somente por este usuário de serviço.</small>
 </fieldset>
 <label class="check-line" for="managedActive">
  <input id="managedActive" type="checkbox" checked>
  <span class="active-check" aria-hidden="true">✓</span>
  <span class="active-copy"><strong>Usuário ativo</strong><small>Usuário poderá acessar o sistema normalmente.</small></span>
 </label>
 <fieldset id="permissionsBox" class="permissions-box"><legend>Permissões do usuário de serviço</legend>${PERMS.map(([k,n])=>`<label><input type="checkbox" data-perm="${k}" checked> ${n}</label>`).join('')}</fieldset>
 <div class="modal-actions"><button type="button" id="cancelUserModal" class="btn light">CANCELAR</button><button class="btn primary" type="submit">SALVAR</button></div></form></div></div>`);
}



function themeStorageKey(profile){
 return profile?.id ? `valle_theme_user_${profile.id}` : 'valle_theme_guest';
}
function updateThemeButtons(theme){
 const dark=theme==='dark';
 const labels=[['dashboardThemeBtn',dark?'Modo claro':'Modo escuro'],['managementThemeBtn',dark?'Modo claro':'Modo escuro']];
 labels.forEach(([id,text])=>{const b=el(id);if(b)b.textContent=text});
 const a=el('authThemeBtn');
 if(a){a.innerHTML=dark?'<i class="bi bi-sun-fill"></i>':'<i class="bi bi-moon-stars-fill"></i>';a.title=dark?'Mudar para modo claro':'Mudar para modo escuro';a.setAttribute('aria-label',a.title);}
}
function applyUserTheme(theme,profile=null){
 const value=theme==='dark'?'dark':'light';
 window.VALLE_ACTIVE_THEME=value;
 document.body.classList.toggle('dark',value==='dark');
 try{localStorage.setItem(themeStorageKey(profile),value)}catch(_){}
 updateThemeButtons(value);
 if(window.applyTheme) window.applyTheme();
 return value;
}
async function persistUserTheme(theme){
 const profile=ValleCloud.profile;
 const value=applyUserTheme(theme,profile);
 if(profile){
  try{await ValleCloud.setMyTheme(value)}catch(err){console.error('Não foi possível salvar o tema do usuário:',err)}
 }
 return value;
}
async function toggleUserTheme(){
 return persistUserTheme(document.body.classList.contains('dark')?'light':'dark');
}
async function activateProfileTheme(profile){
 let theme=profile?.user_theme;
 if(theme!=='dark'&&theme!=='light'){
  try{theme=localStorage.getItem(themeStorageKey(profile))}catch(_){}
 }
 return applyUserTheme(theme==='dark'?'dark':'light',profile);
}
window.ValleUserTheme={apply:applyUserTheme,toggle:toggleUserTheme,activate:activateProfileTheme};
 document.addEventListener('click',e=>{if(e.target?.id==='refreshAuditBtn')renderAuditLogs()});
 document.addEventListener('input',e=>{if(['auditSearch','auditUserFilter','auditModuleFilter','auditActionFilter','auditDateFrom','auditDateTo'].includes(e.target?.id)){auditPageSize=50;drawAuditLogs()}});
 document.addEventListener('change',e=>{if(['auditUserFilter','auditModuleFilter','auditActionFilter','auditDateFrom','auditDateTo'].includes(e.target?.id)){auditPageSize=50;drawAuditLogs()}});
 document.addEventListener('click',e=>{if(e.target?.id==='clearAuditFilters'){['auditSearch','auditUserFilter','auditModuleFilter','auditActionFilter','auditDateFrom','auditDateTo'].forEach(id=>{if(el(id))el(id).value=''});auditPageSize=50;drawAuditLogs()}if(e.target?.id==='loadMoreAudit'){auditPageSize+=50;drawAuditLogs()}});

function setupDashboardUserMenu(profile){
 const name=String(profile?.name||profile?.email||'Usuário').trim();
 const email=String(profile?.email||'').trim();
 const nameEl=el('dashboardUserName');
 const dropName=el('dashboardUserDropdownName');
 const dropEmail=el('dashboardUserDropdownEmail');
 if(nameEl) nameEl.textContent=name;
 if(dropName) dropName.textContent=name;
 if(dropEmail) dropEmail.textContent=email;
 const info=dropName?.closest('.dashboard-user-info');
 if(info){info.dataset.initial=(name.charAt(0)||'U').toUpperCase();info.querySelector('.user-role-badge')?.remove()}
 const trigger=el('dashboardUserTrigger');
 const mobile=el('dashboardUserMobile');
 const initial=(name.charAt(0)||'U').toUpperCase();
 if(trigger){const avatar=trigger.querySelector('.management-trigger-avatar');if(avatar)avatar.textContent=initial}
 if(mobile)mobile.textContent=initial;
 const dropdown=el('dashboardUserDropdown');
 const logout=el('dashboardLogoutBtn');
 const themeBtn=el('dashboardThemeBtn');
 // Mantém o menu fora do cabeçalho/section para evitar deslocamento por overflow,
 // transformações e grids responsivos do Dashboard.
 if(dropdown && dropdown.parentElement!==document.body) document.body.appendChild(dropdown);
 const positionDashboardMenu=source=>{
   if(!dropdown||!source) return;
   const rect=source.getBoundingClientRect?.();
   if(!rect) return;
   const menuWidth=Math.min(224,window.innerWidth-24);
   const menuHeight=dropdown.offsetHeight||224;
   const left=Math.max(12,Math.min(window.innerWidth-menuWidth-12,rect.right-menuWidth));
   const isMobile=window.innerWidth<760;
   const roomBelow=window.innerHeight-rect.bottom-12;
   // No celular, o card do menu deve abrir sempre logo abaixo do botão.
   // No desktop, mantém o ajuste automático quando não houver espaço abaixo.
   const top=isMobile ? rect.bottom+8 : (roomBelow>=menuHeight ? rect.bottom+8 : Math.max(12,rect.top-menuHeight-8));
   dropdown.style.setProperty('max-height',isMobile ? Math.max(140,window.innerHeight-top-12)+'px' : 'none','important');
   dropdown.style.setProperty('overflow-y',isMobile ? 'auto' : 'visible','important');
   dropdown.style.setProperty('position','fixed','important');
   dropdown.style.setProperty('left',left+'px','important');
   dropdown.style.setProperty('right','auto','important');
   dropdown.style.setProperty('top',top+'px','important');
   dropdown.style.setProperty('bottom','auto','important');
   dropdown.style.setProperty('transform','none','important');
   dropdown.style.setProperty('z-index','2147483000','important');
 };
 const toggle=ev=>{
   ev?.stopPropagation();
   if(!dropdown) return;
   const opening=dropdown.classList.contains('hidden');
   dropdown.classList.toggle('hidden',!opening);
   trigger?.setAttribute('aria-expanded',String(opening));
   mobile?.setAttribute('aria-expanded',String(opening));
   if(opening){
     const source=ev?.currentTarget || (window.innerWidth<760?mobile:trigger) || trigger || mobile;
     requestAnimationFrame(()=>positionDashboardMenu(source));
   }
 };
 if(trigger && !trigger.dataset.bound){trigger.dataset.bound='1';trigger.addEventListener('click',toggle)}
 if(mobile && !mobile.dataset.bound){mobile.dataset.bound='1';mobile.addEventListener('click',toggle)}
 if(!document.documentElement.dataset.dashboardMenuViewportBound){
   document.documentElement.dataset.dashboardMenuViewportBound='1';
   const refresh=()=>{
     if(!dropdown||dropdown.classList.contains('hidden')) return;
     const source=window.innerWidth<760?(mobile||trigger):(trigger||mobile);
     positionDashboardMenu(source);
   };
   window.addEventListener('resize',refresh,{passive:true});
   window.addEventListener('orientationchange',refresh,{passive:true});
   window.addEventListener('scroll',refresh,{passive:true,capture:true});
 }
 if(themeBtn && !themeBtn.dataset.bound){themeBtn.dataset.bound='1';themeBtn.addEventListener('click',async ev=>{ev.stopPropagation();await toggleUserTheme()})}
 if(logout && !logout.dataset.bound){logout.dataset.bound='1';logout.addEventListener('click',async()=>{await ValleCloud.signOut();location.reload()})}
 updateThemeButtons(window.VALLE_ACTIVE_THEME||'light');
 if(!document.documentElement.dataset.userMenuBound){
   document.documentElement.dataset.userMenuBound='1';
   document.addEventListener('click',ev=>{
     if(dropdown && !dropdown.classList.contains('hidden') && !ev.target.closest('.dashboard-user-menu') && !ev.target.closest('#dashboardUserMobile')){
       dropdown.classList.add('hidden');
       trigger?.setAttribute('aria-expanded','false');
       mobile?.setAttribute('aria-expanded','false');
     }
   });
 }
}



function setupManagementUserMenu(profile){
 const name=String(profile?.name||profile?.email||'Usuário').trim();
 const email=String(profile?.email||'').trim();
 ['managementUserName','managementUserDropdownName'].forEach(id=>{const x=el(id);if(x)x.textContent=name});
 const emailEl=el('managementUserDropdownEmail');if(emailEl)emailEl.textContent=email;
 const panelLabel=el('managementUserPanelLabel');
 if(panelLabel)panelLabel.textContent=profile?.role==='admin'?'Painel administrativo':'Painel de sessão';
 const info=el('managementUserDropdownName')?.closest('.dashboard-user-info');
 if(info){info.dataset.initial=(name.charAt(0)||'U').toUpperCase();info.querySelector('.user-role-badge')?.remove()}
 const trigger=el('managementUserTrigger');
 const initial=(name.charAt(0)||'U').toUpperCase();
 if(trigger){const avatar=trigger.querySelector('span:first-child');if(avatar)avatar.textContent=initial}
 const dropdown=el('managementUserDropdown');
 const themeBtn=el('managementThemeBtn');
 const logout=el('logoutBtn');
 // Mantém o menu fora dos cards para que sempre abra por cima do conteúdo.
 if(dropdown && dropdown.parentElement!==document.body) document.body.appendChild(dropdown);
 const positionDropdown=()=>{
  if(!dropdown||!trigger)return;
  const rect=trigger.getBoundingClientRect();
  const mobile=window.matchMedia('(max-width:720px)').matches;
  const menuWidth=Math.min(mobile?216:Math.max(280,rect.width),window.innerWidth-24);
  // No celular, usa um card compacto e alinha a borda direita exatamente com o botão.
  // O mesmo posicionamento é aplicado aos painéis Administrador e Sessão.
  const preferredLeft=rect.right-menuWidth;
  const left=Math.max(12,Math.min(window.innerWidth-menuWidth-12,preferredLeft));
  const top=rect.bottom+(mobile?8:10);
  dropdown.style.setProperty('position','fixed','important');
  dropdown.style.setProperty('width',menuWidth+'px','important');
  dropdown.style.setProperty('max-width','calc(100vw - 24px)','important');
  dropdown.style.setProperty('left',left+'px','important');
  dropdown.style.setProperty('right','auto','important');
  dropdown.style.setProperty('top',top+'px','important');
  dropdown.style.setProperty('bottom','auto','important');
  dropdown.style.setProperty('transform','none','important');
  dropdown.style.setProperty('z-index','2147483000','important');
};
 const toggle=ev=>{ev?.stopPropagation();if(!dropdown)return;const opening=dropdown.classList.contains('hidden');dropdown.classList.toggle('hidden',!opening);trigger?.setAttribute('aria-expanded',String(opening));if(opening)positionDropdown();};
 if(trigger&&!trigger.dataset.bound){trigger.dataset.bound='1';trigger.addEventListener('click',toggle)}
 if(themeBtn&&!themeBtn.dataset.bound){themeBtn.dataset.bound='1';themeBtn.addEventListener('click',async ev=>{ev.stopPropagation();await toggleUserTheme()})}
 if(logout&&!logout.dataset.bound){logout.dataset.bound='1';logout.addEventListener('click',async()=>{await ValleCloud.signOut();location.reload()})}
 updateThemeButtons(window.VALLE_ACTIVE_THEME||'light');
 if(!document.documentElement.dataset.managementMenuBound){
  document.documentElement.dataset.managementMenuBound='1';
  document.addEventListener('click',ev=>{if(dropdown&&!dropdown.classList.contains('hidden')&&!trigger?.contains(ev.target)&&!dropdown.contains(ev.target)){dropdown.classList.add('hidden');trigger?.setAttribute('aria-expanded','false')}});window.addEventListener('resize',()=>{if(dropdown&&!dropdown.classList.contains('hidden'))positionDropdown()});window.addEventListener('scroll',()=>{if(dropdown&&!dropdown.classList.contains('hidden'))positionDropdown()},{passive:true});
 }
}

function mountSessionSettings(){
 const section=el('configuracoes');
 const content=document.querySelector('.management-content');
 if(!section||!content)return;
 section.classList.add('session-settings-panel','active');
 section.style.display='block';
 content.appendChild(section);
 const title=section.querySelector('.config-card h2');
 if(title) title.textContent='⚙️ Configurações da sessão';
 const help=section.querySelector('.backup-help');
 if(help) help.textContent='As configurações e backups desta sessão são compartilhados com todos os usuários de serviço vinculados.';
}
function hideServiceSettingsTab(){
 const tab=document.querySelector('.tab[data-screen="configuracoes"]');
 if(tab) tab.style.display='none';
}
async function loadSharedWorkspaceForSession(profile){
 installSaveHook();
 const snapshot=await ValleCloud.loadWorkspaceSnapshot();
 let current=snapshot?.data||null;
 if(current&&window.normalizeDb){
   current=window.replaceValleDatabase?window.replaceValleDatabase(current):normalizeDb(current);
 }else{
   const theme=document.body.classList.contains('dark')?'dark':'light';
   current={settings:{theme,seq:1,capitalInvestido:0,percentualJuros50:50,taxaAtrasoDiario:0,tipoTaxaAtrasoDiario:'percentual'},clientes:[],vales:[]};
   if(window.replaceValleDatabase)current=window.replaceValleDatabase(current);
   await ValleCloud.saveWorkspace(current);
 }
 window.db=current;
 try{localStorage.setItem('emprestimos_pro_v2',JSON.stringify(current));localStorage.setItem('valle_db_owner_session',profile.id)}catch(_){}
 if(window.renderAll)renderAll();
 mountSessionSettings();
}
function applyServiceFinancialSettings(settings){
 const p=settings||{};
 window.VALLE_SERVICE_FINANCIAL_SETTINGS={
  interest_percent:Number(p.interest_percent??30),
  late_fee_type:p.late_fee_type==='reais'?'reais':'percentual',
  late_fee_value:Number(p.late_fee_value||0)
 };
 const current=window.getValleDatabase?window.getValleDatabase():window.db;
 if(current?.settings){
  current.settings.percentualJuros50=window.VALLE_SERVICE_FINANCIAL_SETTINGS.interest_percent;
  current.settings.taxaAtrasoDiario=window.VALLE_SERVICE_FINANCIAL_SETTINGS.late_fee_value;
  current.settings.tipoTaxaAtrasoDiario=window.VALLE_SERVICE_FINANCIAL_SETTINGS.late_fee_type;
  window.db=current;
  try{localStorage.setItem('percentualJuros50',String(current.settings.percentualJuros50));}catch(_){}
 }
}

async function showRole(profile){
 const app=document.querySelector('.app'); const gate=el('authGate'); const panel=el('managementPanel');
 gate.classList.add('hidden');
 updateSyncBadge();
 await activateProfileTheme(profile);
 if(profile.role==='service'){
   hideServiceSettingsTab();
   panel.classList.add('hidden'); app.classList.remove('hidden');
   setupDashboardUserMenu(profile);
   installSaveHook();
   const snapshot=await ValleCloud.loadWorkspaceSnapshot();
   const remote=snapshot?.data||null;
   if(remote && window.normalizeDb){
     const loaded = window.replaceValleDatabase ? window.replaceValleDatabase(remote) : normalizeDb(remote);
     window.db = loaded;
     lastAppliedWorkspaceAt=snapshot.updated_at||null;
     try{
       localStorage.setItem('emprestimos_pro_v2',JSON.stringify(loaded));
       localStorage.setItem('valle_db_owner_session',profile.session_user_id||'');
     }catch(_){}
   } else {
     // Sessão nova: nunca reaproveita dados locais pertencentes a outra sessão.
     let owner='';
     try{owner=localStorage.getItem('valle_db_owner_session')||''}catch(_){}
     let current;
     if(owner && owner===profile.session_user_id){
       current=window.getValleDatabase ? window.getValleDatabase() : window.db;
     }else{
       const theme=document.body.classList.contains('dark')?'dark':'light';
       current={settings:{theme,seq:1,capitalInvestido:0,percentualJuros50:50,taxaAtrasoDiario:0,tipoTaxaAtrasoDiario:'percentual'},clientes:[],vales:[]};
       if(window.replaceValleDatabase) current=window.replaceValleDatabase(current);
       window.db=current;
       try{
         localStorage.setItem('emprestimos_pro_v2',JSON.stringify(current));
         localStorage.setItem('valle_db_owner_session',profile.session_user_id||'');
       }catch(_){}
     }
     await ValleCloud.saveWorkspace(current);
     lastAppliedWorkspaceAt=ValleCloud.lastSyncedAt||null;
   }
   const perms=await ValleCloud.loadMyPermissions();
   applyServiceFinancialSettings(perms);
   applyPermissions(perms);
   if(window.renderAll) renderAll();
   installContinuousCloudSync();
 } else {
   app.classList.add('hidden'); panel.classList.remove('hidden');
   setupManagementUserMenu(profile);
   el('managementSubtitle').textContent=profile.role==='admin'?'Painel do administrador':'Painel do usuário de sessão';
   el('managementTitle').textContent=profile.role==='admin'?'Usuários de sessão':'Usuários de serviço';
   el('managementHelp').textContent=profile.role==='admin'?'Crie usuários de sessão, defina a validade e ative ou bloqueie o acesso.':'Crie usuários de serviço, defina permissões e ative ou bloqueie o acesso.';
   el('newManagedUserBtn').textContent=profile.role==='admin'?'NOVO USUÁRIO DE SESSÃO':'NOVO USUÁRIO DE SERVIÇO';
   await renderUsers();
   if(profile.role==='session') await loadSharedWorkspaceForSession(profile);
 }
}

let saveHooked=false;
let continuousSyncInstalled=false;
let lastAppliedWorkspaceAt=null;
function currentValleDatabase(){
 return window.getValleDatabase ? window.getValleDatabase() : window.db;
}
function installSaveHook(){
 if(saveHooked || typeof window.save!=='function') return;
 const original=window.save;
 window.save=function(){
   const r=original.apply(this,arguments);
   try{ValleCloud.queueWorkspace(currentValleDatabase())}catch(_){}
   return r;
 };
 saveHooked=true;
}
function installContinuousCloudSync(){
 if(continuousSyncInstalled) return;
 continuousSyncInstalled=true;
 window.addEventListener('valle-cloud-sync',ev=>{
   if(ev.detail?.state==='synced'&&ev.detail?.lastSyncedAt)lastAppliedWorkspaceAt=ev.detail.lastSyncedAt;
 });
 // Atualiza periodicamente a tela com mudanças feitas por outro usuário de
 // serviço da mesma sessão. Não envia o banco às cegas, evitando sobrescrever
 // alterações mais novas de outro dispositivo.
 setInterval(async()=>{
   if(ValleCloud.profile?.role!=='service'||!ValleCloud.isOnline())return;
   try{
     const snapshot=await ValleCloud.loadWorkspaceSnapshot();
     if(!snapshot?.data||!snapshot.updated_at)return;
     if(lastAppliedWorkspaceAt && snapshot.updated_at<=lastAppliedWorkspaceAt)return;
     lastAppliedWorkspaceAt=snapshot.updated_at;
     if(snapshot.updated_by===ValleCloud.profile.id)return;
     const loaded=window.replaceValleDatabase?window.replaceValleDatabase(snapshot.data):snapshot.data;
     window.db=loaded;
     applyServiceFinancialSettings(await ValleCloud.loadMyPermissions());
     try{
       localStorage.setItem('emprestimos_pro_v2',JSON.stringify(loaded));
       localStorage.setItem('valle_db_owner_session',ValleCloud.profile.session_user_id||'');
     }catch(_){}
     if(window.renderAll)renderAll();
   }catch(e){console.warn('Não foi possível atualizar os dados compartilhados da sessão:',e)}
 },10000);
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='hidden' && ValleCloud.profile?.role==='service'){
     ValleCloud.flushWorkspace(currentValleDatabase());
   }
 });
 window.addEventListener('pagehide',()=>{
   if(ValleCloud.profile?.role==='service') ValleCloud.flushWorkspace(currentValleDatabase());
 });
}

function applyPermissions(p){
 const map={
  can_view_dashboard:'dashboard',can_create_vale:'emprestimo',can_create_client:'clientes',can_view_history:'historico',can_view_reports:'relatorios'
 };
 Object.entries(map).forEach(([key,screen])=>{if(p[key]===false){document.querySelectorAll(`[data-screen="${screen}"]`).forEach(x=>x.classList.add('permission-hidden'));document.getElementById(screen)?.classList.add('permission-hidden')}});
 window.VALLE_PERMISSIONS=p;
}

function auditActionMeta(action){
 const map={CRIAR_CLIENTE:['success','bi-person-plus','Cliente criado'],ATUALIZAR_CLIENTE:['primary','bi-pencil-square','Cliente atualizado'],EXCLUIR_CLIENTE:['danger','bi-person-x','Cliente excluído'],CRIAR_VALE:['success','bi-file-earmark-plus','Vale criado'],ATUALIZAR_VALE:['primary','bi-pencil-square','Vale atualizado'],EXCLUIR_VALE:['danger','bi-trash','Vale excluído'],QUITAR_VALE:['success','bi-check-circle','Vale quitado'],PAGAMENTO_PARCIAL:['warning','bi-pie-chart','Pagamento parcial'],PAGAMENTO_JUROS:['info','bi-cash-coin','Pagamento de juros'],NAO_PAGOU:['secondary','bi-clock-history','Não pagou'],LISTA_NEGRA:['danger','bi-shield-exclamation','Lista negra']};
 return map[action]||['secondary','bi-activity',String(action||'Ação').replaceAll('_',' ')];
}
function auditFormatValue(v){if(v===null||v===undefined||v==='')return '—';if(typeof v==='boolean')return v?'Sim':'Não';if(typeof v==='number')return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v);return String(v)}
function auditChangesHtml(x){const changes=x.changes||x.details?.changes||{};const entries=Object.entries(changes);if(!entries.length)return '<p class="audit-no-changes">Nenhuma alteração de campo registrada.</p>';return `<div class="audit-changes">${entries.map(([key,v])=>`<div><strong>${htmlEscape(v?.label||key)}</strong><span><del>${htmlEscape(auditFormatValue(v?.anterior))}</del><i class="bi bi-arrow-right"></i><ins>${htmlEscape(auditFormatValue(v?.novo))}</ins></span></div>`).join('')}</div>`}
function openAuditDetails(id){const x=(window.__valleAuditLogs||[]).find(v=>String(v.id||v.signature)===String(id));if(!x)return;const m=auditActionMeta(x.action);let modal=el('auditDetailModal');if(!modal){document.body.insertAdjacentHTML('beforeend','<div id="auditDetailModal" class="audit-detail-modal hidden"><div class="audit-detail-card"><button id="closeAuditDetail" class="modal-x">×</button><div id="auditDetailContent"></div></div></div>');modal=el('auditDetailModal');el('closeAuditDetail').onclick=()=>modal.classList.add('hidden');modal.onclick=e=>{if(e.target===modal)modal.classList.add('hidden')}}
 el('auditDetailContent').innerHTML=`<div class="audit-detail-head"><span class="badge text-bg-${m[0]}"><i class="bi ${m[1]}"></i> ${htmlEscape(m[2])}</span><h3>${htmlEscape(x.title||m[2])}</h3><p>${htmlEscape(x.description||'')}</p></div><dl class="audit-detail-grid"><div><dt>REALIZADO POR</dt><dd>${htmlEscape(x.actor_name||'')}<small>${htmlEscape(roleLabel(x.actor_role))}</small></dd></div><div><dt>DATA E HORA</dt><dd>${new Date(x.created_at).toLocaleString('pt-BR')}</dd></div><div><dt>REGISTRO</dt><dd>${htmlEscape(x.vale_number?`Vale #${x.vale_number}`:(x.client_name||x.entity_id||'—'))}</dd></div><div><dt>MÓDULO</dt><dd>${htmlEscape(x.module||x.entity_type||'SISTEMA')}</dd></div></dl><h4>ALTERAÇÕES</h4>${auditChangesHtml(x)}<div class="audit-signature"><i class="bi bi-shield-check"></i><div><strong>Assinatura eletrônica</strong><code>${htmlEscape(x.signature||x.details?.assinatura?.signedAt||'Não disponível')}</code></div></div>`;
 modal.classList.remove('hidden');
}
let auditPageSize=50;
function applyAuditFilters(){const all=window.__valleAuditLogs||[];const q=(el('auditSearch')?.value||'').trim().toLowerCase();const user=el('auditUserFilter')?.value||'';const module=el('auditModuleFilter')?.value||'';const action=el('auditActionFilter')?.value||'';const from=el('auditDateFrom')?.value||'';const to=el('auditDateTo')?.value||'';return all.filter(x=>{const text=[x.actor_name,x.title,x.description,x.client_name,x.vale_number,x.entity_id,x.action].join(' ').toLowerCase();const day=String(x.created_at||'').slice(0,10);return(!q||text.includes(q))&&(!user||x.actor_user_id===user)&&(!module||x.module===module)&&(!action||x.action===action)&&(!from||day>=from)&&(!to||day<=to)}).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))}
function drawAuditLogs(){const box=el('auditLogs');if(!box)return;const filtered=applyAuditFilters();const visible=filtered.slice(0,auditPageSize);el('auditSummary').textContent=`${filtered.length} registro${filtered.length===1?'':'s'} encontrado${filtered.length===1?'':'s'} · mais recentes primeiro`;el('loadMoreAudit')?.classList.toggle('hidden',visible.length>=filtered.length);box.innerHTML=visible.length?`<div class="audit-timeline">${visible.map(x=>{const m=auditActionMeta(x.action);return `<article class="audit-item border-start border-4 border-${m[0]}"><div class="audit-icon text-bg-${m[0]}"><i class="bi ${m[1]}"></i></div><div class="audit-item-main"><div class="audit-item-top"><div><span class="badge text-bg-${m[0]}">${htmlEscape(m[2])}</span><h3>${htmlEscape(x.title||m[2])}</h3></div><time>${new Date(x.created_at).toLocaleDateString('pt-BR')}<small>${new Date(x.created_at).toLocaleTimeString('pt-BR')}</small></time></div><p>${htmlEscape(x.description||'')}</p><div class="audit-item-meta"><span><i class="bi bi-person"></i>${htmlEscape(x.actor_name||'')}</span>${x.client_name?`<span><i class="bi bi-person-vcard"></i>${htmlEscape(x.client_name)}</span>`:''}${x.vale_number?`<span><i class="bi bi-receipt"></i>Vale #${htmlEscape(x.vale_number)}</span>`:''}</div><button class="btn btn-sm btn-outline-${m[0]}" data-audit-detail="${htmlEscape(String(x.id||x.signature))}">VER DETALHES</button></div></article>`}).join('')}</div>`:'<div class="empty-users">Nenhum registro encontrado com os filtros informados.</div>';box.querySelectorAll('[data-audit-detail]').forEach(b=>b.onclick=()=>openAuditDetails(b.dataset.auditDetail))}
async function renderAuditLogs(){
 const panel=el('auditPanel'),box=el('auditLogs'); if(!panel||ValleCloud.profile?.role!=='session')return; panel.classList.remove('hidden'); box.innerHTML='<p>Carregando logs...</p>';
 try{const logs=await ValleCloud.listAuditLogs(1000);window.__valleAuditLogs=logs||[];const users=[...new Map(logs.map(x=>[x.actor_user_id,x.actor_name])).entries()];const actions=[...new Set(logs.map(x=>x.action).filter(Boolean))].sort();el('auditUserFilter').innerHTML='<option value="">Todos os usuários</option>'+users.map(([id,n])=>`<option value="${htmlEscape(id)}">${htmlEscape(n)}</option>`).join('');el('auditActionFilter').innerHTML='<option value="">Todas as ações</option>'+actions.map(a=>`<option value="${htmlEscape(a)}">${htmlEscape(a.replaceAll('_',' '))}</option>`).join('');auditPageSize=50;drawAuditLogs()}catch(e){box.innerHTML=`<div class="auth-message error">${htmlEscape(e.message)}</div>`}
}
async function renderUsers(){
 const box=el('managedUsers'); box.innerHTML='<p>Carregando...</p>';
 try{
  const users=await ValleCloud.listManagedUsers();
  if(!users.length){box.innerHTML='<div class="empty-users">Nenhum usuário cadastrado.</div>';return;}
  const permissionMap={};
  if(ValleCloud.profile?.role==='session'){
   await Promise.all(users.map(async u=>{permissionMap[u.id]=await ValleCloud.getPermissions(u.id)}));
  }
  box.innerHTML=users.map(u=>userCard(u,[],permissionMap[u.id])).join('');
  box.querySelectorAll('[data-edit-user]').forEach(b=>b.onclick=()=>openEdit(b.dataset.editUser,users));
  box.querySelectorAll('[data-toggle-user]').forEach(b=>b.onclick=()=>toggleUser(b.dataset.toggleUser,b.dataset.active!=='true'));
  box.querySelectorAll('[data-delete-user]').forEach(b=>b.onclick=()=>deleteManagedUser(b.dataset.deleteUser,users));
  renderAuditLogs();
 }catch(e){box.innerHTML=`<div class="auth-message error">${htmlEscape(e.message)}</div>`}
}
function userCard(u,children,financial){
 const expired=u.role==='session'&&u.valid_until&&u.valid_until<new Date().toISOString().slice(0,10);
 return `<article class="user-card ${!u.active||expired?'blocked':''}"><div class="user-main"><div class="user-avatar">${htmlEscape((u.name||'?')[0])}</div><div><h3>${htmlEscape(u.name)}</h3><p>${htmlEscape(u.email||'')} · ${u.role==='session'?'SESSÃO':'SERVIÇO'}</p>${u.role==='session'?`<small>Validade: ${u.valid_until?new Date(u.valid_until+'T00:00:00').toLocaleDateString('pt-BR'):'sem validade'} ${expired?'· VENCIDA':''}</small>`:`<small class="service-interest-label">Juros configurável: ${Number(financial?.interest_percent??30).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</small>`}</div></div><div class="user-actions"><span class="status-pill ${u.active&&!expired?'on':'off'}">${u.active&&!expired?'ATIVO':'BLOQUEADO'}</span><button class="btn light" data-edit-user="${u.id}">EDITAR</button><button class="btn ${u.active?'danger':'success'}" data-toggle-user="${u.id}" data-active="${u.active}">${u.active?'BLOQUEAR':'ATIVAR'}</button><button class="btn delete-user-btn" data-delete-user="${u.id}" title="Excluir usuário">🗑️ EXCLUIR</button></div>${children.length?`<div class="hierarchy-children"><b>Usuários de serviço</b>${children.map(c=>`<div><span>${htmlEscape(c.name)} <small>${htmlEscape(c.email||'')}</small></span><em class="${c.active?'on':'off'}">${c.active?'ATIVO':'BLOQUEADO'}</em></div>`).join('')}</div>`:''}</article>`;
}

function configureManagedForm(role, editing=false){
 const isAdmin=ValleCloud.profile.role==='admin';
 const isSession=ValleCloud.profile.role==='session';
 const validity=el('managedValidityWrap');
 const whatsapp=el('managedWhatsappWrap');
 const perms=el('permissionsBox');
 const financial=el('serviceFinancialBox');
 // Validade e WhatsApp pertencem somente ao usuário de sessão criado pelo ADM.
 validity.classList.toggle('hidden',!isAdmin);
 whatsapp.classList.toggle('hidden',!isAdmin);
 validity.style.display=isAdmin?'':'none';
 whatsapp.style.display=isAdmin?'':'none';
 perms.classList.toggle('hidden',!isSession);
 perms.style.display=isSession?'':'none';
 financial.classList.toggle('hidden',!isSession);
 financial.style.display=isSession?'':'none';
 if(!isAdmin){el('managedValidity').value='';el('managedWhatsapp').value='';}
 // O ADM, ao editar, administra apenas validade/status. Dados de identidade ficam protegidos.
 el('managedName').disabled=isAdmin&&editing;
 el('managedEmail').disabled=editing;
 el('managedPasswordLabel').classList.toggle('hidden',editing);
}
function openNew(){
 el('userForm').reset(); el('managedId').value=''; el('managedActive').checked=true; el('managedInterestPercent').value='30';
 const admin=ValleCloud.profile.role==='admin';
 el('userModalTitle').textContent=admin?'Novo usuário de sessão':'Novo usuário de serviço';
 document.querySelector('#userForm .btn.primary').textContent='Salvar';
 configureManagedForm(admin?'session':'service',false);
 el('userModal').classList.remove('hidden');
}
async function openEdit(id,users){
 const u=users.find(x=>x.id===id); if(!u)return;
 const callerRole=ValleCloud.profile.role;
 if((callerRole==='admin'&&u.role!=='session')||(callerRole==='session'&&u.role!=='service')){
  toast('Você não tem permissão para administrar este tipo de usuário.', 'warn'); return;
 }
 el('managedId').value=u.id;el('managedName').value=u.name||'';el('managedEmail').value=u.email||'';el('managedPassword').value='';el('managedValidity').value=u.valid_until||'';el('managedWhatsapp').value=u.admin_whatsapp||'';el('managedActive').checked=!!u.active;
 el('userModalTitle').textContent=callerRole==='admin'?'Administrar usuário de sessão':'Administrar usuário de serviço';
 document.querySelector('#userForm .btn.primary').textContent='Atualizar';
 configureManagedForm(u.role,true);
 if(u.role==='service'){
  const p=await ValleCloud.getPermissions(u.id);
  document.querySelectorAll('[data-perm]').forEach(x=>x.checked=p[x.dataset.perm]!==false);
  el('managedInterestPercent').value=String(Number(p.interest_percent??30));
 }
 el('userModal').classList.remove('hidden');
}
function closeModal(){
 el('userModal').classList.add('hidden');
 el('managedName').disabled=false;el('managedEmail').disabled=false;el('managedPasswordLabel').classList.remove('hidden');
}
async function toggleUser(id,active){try{await ValleCloud.invokeManage('update',{userId:id,active});await renderUsers()}catch(e){toast(e.message || 'Erro ao realizar a operação.', 'error')}}

async function deleteManagedUser(id,users){
 const user=users.find(x=>x.id===id); if(!user)return;
 const isSession=user.role==='session';
 const message=isSession
  ? `Excluir permanentemente o usuário de sessão "${user.name}"? Todos os usuários de serviço, permissões e dados vinculados a essa sessão também serão apagados. Esta ação não pode ser desfeita.`
  : `Excluir permanentemente o usuário de serviço "${user.name}"? As permissões e os dados vinculados a ele também serão apagados. Esta ação não pode ser desfeita.`;
 const ok=window.appConfirm
  ? await appConfirm(message,{title:isSession?'Excluir sessão e hierarquia?':'Excluir usuário de serviço?',icon:'🗑️',confirmText:'Excluir',cancelText:'Cancelar'})
  : confirm(message);
 if(!ok)return;
 try{
  await ValleCloud.invokeManage('delete',{userId:id});
  await renderUsers();
 }catch(e){toast(e.message || 'Erro ao realizar a operação.', 'error')}
}

async function saveManaged(e){
 e.preventDefault();
 const id=el('managedId').value;
 const callerRole=ValleCloud.profile.role;
 const role=callerRole==='admin'?'session':'service';
 const payload={
  userId:id||undefined,
  role,
  active:el('managedActive').checked
 };
 if(!id){
  payload.name=el('managedName').value.trim();
  payload.email=el('managedEmail').value.trim();
  payload.password=el('managedPassword').value;
 }
 if(callerRole==='admin'){
  payload.validUntil=el('managedValidity').value||null;
  payload.adminWhatsapp=el('managedWhatsapp').value.trim()||null;
 } else {
  // Usuário de sessão pode manter o nome do usuário de serviço atualizado.
  payload.name=el('managedName').value.trim();
  payload.interestPercent=Math.max(0,Number(String(el('managedInterestPercent').value||'30').replace(',','.'))||0);
 }
 if(callerRole==='session') payload.interestPercent=Math.max(0,Number(String(el('managedInterestPercent').value||'30').replace(',','.'))||0);
 try{
  const result=await ValleCloud.invokeManage(id?'update':'create',payload); const uid=id||result.userId;
  if(callerRole==='session'){
   const perms={interest_percent:payload.interestPercent};document.querySelectorAll('[data-perm]').forEach(x=>perms[x.dataset.perm]=x.checked);
   await ValleCloud.savePermissions(uid,perms);
  }
  closeModal(); await renderUsers();
 }catch(err){toast(err.message || 'Erro ao realizar a operação.', 'error')}
}
function setupManagementTheme(){
 let theme='light';
 try{theme=localStorage.getItem('valle_theme_guest')||'light'}catch(_){}
 applyUserTheme(theme,null);
 const a=el('authThemeBtn');
 if(a&&!a.dataset.bound){a.dataset.bound='1';a.onclick=()=>{
  const next=document.body.classList.contains('dark')?'light':'dark';
  applyUserTheme(next,null);
 }}
}

async function boot(){
 inject(); setupManagementTheme(); document.querySelector('.app').classList.add('hidden');
 updateSyncBadge({state:ValleCloud.syncState,online:ValleCloud.isOnline()});
 window.addEventListener('valle-cloud-sync',e=>updateSyncBadge(e.detail||{}));
 window.addEventListener('online',()=>{updateSyncBadge({state:'syncing',online:true});connectionToast('Internet conectada. Sincronizando alterações com o Supabase.','success')});
 window.addEventListener('offline',()=>{updateSyncBadge({state:'offline',online:false});connectionToast('Internet desconectada. As alterações serão salvas neste aparelho.','warn')});
 el('loginForm').onsubmit=async e=>{e.preventDefault();setMsg('Entrando...',false);el('authWhatsapp').classList.add('hidden');try{const p=await ValleCloud.signIn(el('loginEmail').value,el('loginPassword').value);setMsg('');await showRole(p)}catch(err){setMsg(err.message);if(err.whatsapp){const a=el('authWhatsapp');a.href=whatsappLink(err.whatsapp);a.classList.remove('hidden')}}};
 el('logoutBtn').onclick=async()=>{await ValleCloud.signOut();location.reload()};el('newManagedUserBtn').onclick=openNew;el('closeUserModal').onclick=closeModal;el('cancelUserModal').onclick=closeModal;el('userForm').onsubmit=saveManaged;
 try{const p=await ValleCloud.restoreSession();if(p?.blocked){setMsg(p.reason);if(p.whatsapp){const a=el('authWhatsapp');a.href=whatsappLink(p.whatsapp);a.classList.remove('hidden')}}else if(p)await showRole(p)}catch(e){setMsg(e.message)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
