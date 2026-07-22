(() => {
  'use strict';

  const ICONS = new Map([
    ['🏠','bi-house-door-fill'],['🔔','bi-bell-fill'],['💰','bi-cash-stack'],['👤','bi-person-fill'],['👥','bi-people-fill'],
    ['📜','bi-clock-history'],['📊','bi-bar-chart-line-fill'],['📅','bi-calendar-event-fill'],['🗓️','bi-calendar3'],['🔎','bi-search'],['🔍','bi-search'],
    ['💵','bi-cash-stack'],['🏦','bi-bank2'],['📈','bi-graph-up-arrow'],['💲','bi-currency-dollar'],['🧾','bi-receipt-cutoff'],
    ['✅','bi-check-circle-fill'],['💼','bi-briefcase-fill'],['📂','bi-folder-fill'],['✨','bi-stars'],['📝','bi-journal-text'],
    ['📱','bi-phone-fill'],['🪪','bi-person-vcard-fill'],['✖️','bi-x-lg'],['✖','bi-x-lg'],['💾','bi-floppy-fill'],
    ['⚙️','bi-gear-fill'],['📥','bi-box-arrow-in-down'],['♻️','bi-arrow-repeat'],['🗑️','bi-trash-fill'],['🗑','bi-trash-fill'],
    ['✏️','bi-pencil-square'],['➕','bi-plus-circle-fill'],['🚪','bi-box-arrow-right'],['↪','bi-box-arrow-right'],['🌙','bi-moon-stars-fill'],
    ['☀️','bi-sun-fill'],['☀','bi-sun-fill'],['📄','bi-file-earmark-text-fill'],['📤','bi-box-arrow-up'],['📦','bi-box-seam-fill'],
    ['📌','bi-pin-angle-fill'],['📍','bi-geo-alt-fill'],['⚠️','bi-exclamation-triangle-fill'],['❌','bi-x-circle-fill'],
    ['✔️','bi-check-circle-fill'],['✔','bi-check-circle-fill'],['✓','bi-check-lg'],['📞','bi-telephone-fill'],['💬','bi-chat-dots-fill'],
    ['🔒','bi-lock-fill'],['🔓','bi-unlock-fill'],['👁️','bi-eye-fill'],['👁','bi-eye-fill'],['📧','bi-envelope-fill'],
    ['🔴','bi-circle-fill text-danger'],['🟠','bi-circle-fill text-warning'],['🟡','bi-circle-fill text-warning'],['🟢','bi-whatsapp'],
    ['⭐','bi-star-fill'],['☆','bi-star'],['％','bi-percent'],['%','bi-percent']
  ]);

  const emojiPattern = [...ICONS.keys()].sort((a,b)=>b.length-a.length)
    .map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const emojiRegex = new RegExp(`(${emojiPattern})`,'g');

  function iconElement(symbol){
    const icon=document.createElement('i');
    icon.className=`bi ${ICONS.get(symbol)}`;
    icon.setAttribute('aria-hidden','true');
    return icon;
  }

  function replaceTextNode(node){
    if(!node.nodeValue) return;
    emojiRegex.lastIndex=0;
    if(!emojiRegex.test(node.nodeValue)) return;
    emojiRegex.lastIndex=0;
    const text=node.nodeValue;
    const frag=document.createDocumentFragment();
    let last=0;
    text.replace(emojiRegex,(match,_g,index)=>{
      if(index>last) frag.append(text.slice(last,index));
      frag.append(iconElement(match));
      last=index+match.length;
      return match;
    });
    if(last<text.length) frag.append(text.slice(last));
    node.replaceWith(frag);
  }

  function replaceIcons(root=document.body){
    if(!root) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const p=node.parentElement;
      if(!p||p.closest('script,style,textarea,option,.bi')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceTextNode);
  }

  function buttonVariant(el){
    if(el.classList.contains('danger')||el.classList.contains('excluir')||el.classList.contains('delete-user-btn')) return 'btn-danger';
    if(el.classList.contains('success')||el.classList.contains('receber')||el.classList.contains('whats')) return 'btn-success';
    if(el.classList.contains('warning')||el.classList.contains('editar')) return 'btn-warning';
    if(el.classList.contains('light')||el.classList.contains('cancel')||el.classList.contains('pdf')) return 'btn-outline-secondary';
    if(el.classList.contains('primary')||el.classList.contains('usar')||el.classList.contains('abrir')) return 'btn-primary';
    return 'btn-outline-primary';
  }

  function bootstrapize(root=document){
    const q=(s)=>root.querySelectorAll?root.querySelectorAll(s):[];

    q('button, a[role="button"], label.filebtn').forEach(el=>{
      if(el.closest('.tab, .premium-kpi, .v3-calendar')) return;
      el.classList.add('btn');
      if(![...el.classList].some(c=>/^btn-(primary|secondary|success|danger|warning|info|light|dark|outline-)/.test(c))) el.classList.add(buttonVariant(el));
      if(el.tagName!=='BUTTON') el.setAttribute('role','button');
    });

    q('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="color"]), textarea')
      .forEach(el=>el.classList.add('form-control'));
    q('select').forEach(el=>el.classList.add('form-select'));
    q('input[type="checkbox"],input[type="radio"]').forEach(el=>el.classList.add('form-check-input'));
    q('input[type="range"]').forEach(el=>el.classList.add('form-range'));

    q('.card,.premium-panel,.premium-kpi,.rel-kpi,.user-card,.receive-card,.partial-payment-card,.management-card,.auth-card')
      .forEach(el=>el.classList.add('card','border-0','shadow-sm'));
    q('.card > h2,.premium-panel-head,.section-head,.rel-head').forEach(el=>el.classList.add('card-header','bg-transparent','border-0'));

    q('table').forEach(table=>{
      table.classList.add('table','table-hover','align-middle','mb-0');
      if(!table.parentElement?.classList.contains('table-responsive')){
        const wrap=document.createElement('div'); wrap.className='table-responsive';
        table.parentNode.insertBefore(wrap,table); wrap.appendChild(table);
      }
    });

    q('.actions,.user-actions,.premium-top-actions,.management-top-actions,.backup-actions,.config-actions')
      .forEach(el=>el.classList.add('d-flex','flex-wrap','gap-2','align-items-center'));

    q('.tabs').forEach(nav=>nav.classList.add('nav','nav-pills','nav-fill','gap-2'));
    q('.tabs .tab').forEach(btn=>{
      btn.classList.add('nav-link','d-flex','flex-column','align-items-center','justify-content-center','gap-1');
      btn.classList.toggle('active',btn.classList.contains('active'));
    });

    q('.dashboard-user-dropdown,.management-user-dropdown').forEach(menu=>{
      menu.classList.add('dropdown-menu','dropdown-menu-end','p-3','shadow','border-0');
      if(!menu.classList.contains('hidden')) menu.classList.add('show');
    });

    q('.status-pill,.badge,.notif-count,.notif-chip').forEach(el=>el.classList.add('badge','rounded-pill'));
    q('.toast').forEach(el=>el.classList.add('toast','align-items-center','border-0'));
    q('.field').forEach(el=>el.classList.add('form-label','w-100'));
    q('.form-grid,.config-grid').forEach(el=>el.classList.add('row','g-3'));
  }

  function syncDropdownVisibility(root=document){
    root.querySelectorAll?.('.dashboard-user-dropdown,.management-user-dropdown').forEach(menu=>{
      menu.classList.toggle('show',!menu.classList.contains('hidden'));
    });
  }

  function enhance(root=document){
    const scope=root===document?document:root;
    replaceIcons(root===document?document.body:root);
    bootstrapize(scope);
    syncDropdownVisibility(scope);
  }

  function syncBootstrapTheme(){
    const loading=document.documentElement.classList.contains('valle-loading-active');
    document.documentElement.setAttribute('data-bs-theme',loading?'dark':(document.body.classList.contains('dark')?'dark':'light'));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('bootstrap-only-ui');
    syncBootstrapTheme();
    enhance(document);

    const observer=new MutationObserver(mutations=>{
      for(const m of mutations){
        if(m.type==='attributes'&&m.target===document.body&&m.attributeName==='class'){
          syncBootstrapTheme();
        }
        m.addedNodes.forEach(node=>{
          if(node.nodeType===Node.ELEMENT_NODE) enhance(node);
          else if(node.nodeType===Node.TEXT_NODE) replaceTextNode(node);
        });
        if(m.target?.nodeType===Node.ELEMENT_NODE) syncDropdownVisibility(document);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  });
})();

/* VALLE standardização visual global — abas, botões, cards, modais e painéis */
(() => {
  'use strict';

  const iconByText = [
    [/salvar/i,'bi-floppy-fill'],[/atualizar/i,'bi-arrow-repeat'],[/cancelar/i,'bi-x-lg'],[/limpar/i,'bi-eraser-fill'],
    [/excluir|apagar/i,'bi-trash3-fill'],[/editar/i,'bi-pencil-square'],[/receber/i,'bi-cash-coin'],[/imprimir/i,'bi-printer-fill'],
    [/pdf/i,'bi-file-earmark-pdf-fill'],[/whatsapp|enviar/i,'bi-whatsapp'],[/backup|baixar/i,'bi-download'],[/restaurar/i,'bi-upload'],
    [/novo|adicionar|criar/i,'bi-plus-lg'],[/filtrar/i,'bi-funnel-fill'],[/abrir|ver todos|ver completo/i,'bi-arrow-up-right-square'],
    [/sair/i,'bi-box-arrow-right'],[/modo escuro/i,'bi-moon-stars-fill'],[/modo claro/i,'bi-sun-fill']
  ];

  function addButtonIcon(button){
    if(!button || button.dataset.valleIconReady === '1' || button.querySelector(':scope > .bi')) return;
    const text=(button.textContent||'').trim();
    const found=iconByText.find(([rx])=>rx.test(text));
    if(found){
      const icon=document.createElement('i');
      icon.className=`bi ${found[1]} me-2`;
      icon.setAttribute('aria-hidden','true');
      button.prepend(icon);
    }
    button.dataset.valleIconReady='1';
  }

  function ensureNotificationTitle(){
    // A aba já possui um único sino no cabeçalho. Apenas mantém o contador sincronizado,
    // sem criar um segundo ícone dentro do título.
    const title=document.querySelector('#notificacoes .section-head h2');
    if(title && title.textContent.trim()!=='Notificações') title.textContent='Notificações';

    document.querySelectorAll('#notificacoes .valle-notification-icon').forEach(el=>el.remove());

    const source=document.getElementById('notifCount');
    const target=document.getElementById('notifHeaderCount');
    if(source && target){
      const value=(source.textContent||'0').trim();
      if(target.textContent!==value) target.textContent=value;
      target.style.display=(value && value!=='0')?'inline-flex':'none';
    }
  }

  function standardize(root=document){
    const q=(selector)=>root.querySelectorAll?root.querySelectorAll(selector):[];
    q('main > .screen').forEach(screen=>screen.classList.add('valle-screen-shell'));
    q('main > .screen > .card, main > .screen > .historico-card, main > .screen > .relatorios-card, main > .screen > .calendario-card').forEach(card=>card.classList.add('valle-page-card'));
    q('.section-head, .rel-head, .historico-header, .premium-panel-head').forEach(head=>head.classList.add('valle-section-heading'));
    q('.section-head h2, .rel-head h2, .historico-header h2').forEach(title=>title.classList.add('valle-section-title'));
    q('.btn, button:not(.tab)').forEach(addButtonIcon);
    q('.notif-filter-controls').forEach(el=>el.classList.add('valle-segmented-control'));
    q('.notif-filter-btn').forEach(el=>el.classList.add('btn','btn-sm'));
    q('.notifications-list, .list.cards, .rel-client-list').forEach(el=>el.classList.add('valle-content-list'));
    q('.receive-card, .partial-payment-card, .modal-content, .user-modal, .management-modal-content').forEach(el=>el.classList.add('valle-modal-card'));
    q('.receive-modal, .partial-payment-modal, .modal, .user-modal-overlay').forEach(el=>el.classList.add('valle-modal-layer'));
    ensureNotificationTitle();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    standardize(document);
    let scheduled=false;
    const observer=new MutationObserver((mutations)=>{
      const relevant=mutations.some(m=>m.type==='childList' || (m.type==='characterData' && m.target.parentElement?.id==='notifCount'));
      if(!relevant || scheduled) return;
      scheduled=true;
      requestAnimationFrame(()=>{ scheduled=false; standardize(document); });
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  });
})();
