/* VERSAO DO SISTEMA */
const versao = document.getElementById("versao_sytem")

versao.innerHTML = 'Versão-3.4.6'
/**
 * ARQUIVO PRINCIPAL DO VALLE
 * ------------------------------------------------
 * Este arquivo controla todo o funcionamento do sistema:
 * - banco de dados local usando localStorage;
 * - cadastro, edição e exclusão de clientes;
 * - cadastro, edição, impressão e envio de VALLES;
 * - cálculo do dashboard financeiro;
 * - geração de PDF;
 * - backup/restauração;
 * - modo escuro e navegação entre abas.
 *
 * ATENÇÃO: o sistema funciona 100% no navegador.
 * Os dados ficam salvos no localStorage do aparelho/navegador.
 */

// Chave principal onde todo o banco do sistema é salvo no localStorage.
const LS = 'emprestimos_pro_v2';

// Configurações financeiras salvas também em chaves separadas no localStorage,
// para você poder alterar direto pelo console se quiser.
const LS_CAPITAL_INVESTIDO = 'capitalInvestido';
const LS_PERCENTUAL_JUROS_50 = 'percentualJuros50';
const LS_TAXA_ATRASO_DIARIO = 'taxaAtrasoDiario';
const LS_TIPO_TAXA_ATRASO_DIARIO = 'tipoTaxaAtrasoDiario';

// Objeto principal em memória. Tudo que aparece na tela vem daqui.
var db = load();
// `var` expõe o banco em window.db para a sincronização com o Supabase.
window.db = db;
// Quando está editando um vale, guarda aqui o ID dele. Se for null, é vale novo.
let editLoanId = null;
let clientFormSnapshot = '';
let clientModalForceClose = false;
let loanFormSnapshot = '';
// Atalho para buscar elementos HTML pelo ID. Exemplo: $('loanValor').
const $ = (id) => document.getElementById(id);


/**
 * Modal global de mensagens/confirmacoes.
 * Substitui confirm() do navegador e fica acima de todos os outros modais.
 */
function ensureMessageModal() {
  let wrap = document.getElementById('globalMessageModal');
  if (wrap) return wrap;
  wrap = document.createElement('div');
  wrap.id = 'globalMessageModal';
  wrap.className = 'global-message-modal hidden';
  wrap.innerHTML = `
    <div class="global-message-backdrop"></div>
    <div class="global-message-card" role="dialog" aria-modal="true" aria-labelledby="globalMessageTitle">
      <div class="global-message-icon" id="globalMessageIcon">⚠️</div>
      <h3 id="globalMessageTitle">Confirmar ação</h3>
      <p id="globalMessageText"></p>
      <div class="global-message-actions">
        <button type="button" class="global-message-btn cancel" id="globalMessageCancel">Cancelar</button>
        <button type="button" class="global-message-btn confirm" id="globalMessageConfirm">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  return wrap;
}

function appConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const wrap = ensureMessageModal();
    const title = document.getElementById('globalMessageTitle');
    const text = document.getElementById('globalMessageText');
    const icon = document.getElementById('globalMessageIcon');
    const btnCancel = document.getElementById('globalMessageCancel');
    const btnConfirm = document.getElementById('globalMessageConfirm');

    title.textContent = options.title || 'Confirmar ação';
    text.textContent = message || '';
    icon.textContent = options.icon || '⚠️';
    btnCancel.textContent = options.cancelText || 'Cancelar';
    btnConfirm.textContent = options.confirmText || 'Confirmar';

    function close(result) {
      wrap.classList.add('hidden');
      document.removeEventListener('keydown', onKey);
      btnCancel.onclick = null;
      btnConfirm.onclick = null;
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    }

    btnCancel.onclick = () => close(false);
    btnConfirm.onclick = () => close(true);
    document.addEventListener('keydown', onKey);
    wrap.classList.remove('hidden');
    setTimeout(() => btnCancel.focus(), 30);
  });
}

function appAlert(message, options = {}) {
  return appConfirm(message, { title: options.title || 'Aviso', icon: options.icon || 'ℹ️', confirmText: 'OK', cancelText: 'Fechar' });
}

/**
 * Cria a estrutura padrão do banco local quando o sistema é aberto pela primeira vez ou quando os dados são apagados.
 */
function seed() {
  return { settings: { theme: 'light', seq: 1, capitalInvestido: 0, percentualJuros50: 50, taxaAtrasoDiario: 0, tipoTaxaAtrasoDiario: 'percentual' }, clientes: [], vales: [] };
}

/**
 * Carrega os dados salvos no localStorage e normaliza a estrutura para evitar erros com versões antigas.
 */
function load() {
  try {
    return normalizeDb(JSON.parse(localStorage.getItem(LS)) || seed(), true);
  } catch (e) {
    return seed();
  }
}

/**
 * Corrige, completa e migra os dados do sistema. Garante que clientes, vales e configurações tenham sempre o formato esperado.
 */
function normalizeDb(obj, usarChavesSeparadas = false) {
  const base = seed();
  obj = obj && typeof obj === 'object' ? obj : base;
  obj.settings = { ...base.settings, ...(obj.settings || {}) };
  obj.settings.seq = Number(obj.settings.seq || 1);

  // Migração: se existir a configuração antiga, mantém o valor.
  if (obj.settings.percentualJuros50 === undefined && obj.settings.percentualJuros !== undefined) {
    obj.settings.percentualJuros50 = obj.settings.percentualJuros;
  }

  // Prioridade:
  // 1) valores separados do localStorage, se existirem;
  // 2) valores dentro do backup/db.settings;
  // 3) padrão do sistema.
  const capitalLS = usarChavesSeparadas ? localStorage.getItem(LS_CAPITAL_INVESTIDO) : null;
  const juros50LS = usarChavesSeparadas ? localStorage.getItem(LS_PERCENTUAL_JUROS_50) : null;
  const taxaAtrasoLS = usarChavesSeparadas ? localStorage.getItem(LS_TAXA_ATRASO_DIARIO) : null;
  const tipoTaxaAtrasoLS = usarChavesSeparadas ? localStorage.getItem(LS_TIPO_TAXA_ATRASO_DIARIO) : null;

  obj.settings.capitalInvestido = capitalLS !== null
    ? Number(capitalLS || 0)
    : Number(obj.settings.capitalInvestido || 0);

  obj.settings.percentualJuros50 = juros50LS !== null
    ? Number(juros50LS || 50)
    : Number(obj.settings.percentualJuros50 || 50);

  obj.settings.taxaAtrasoDiario = taxaAtrasoLS !== null
    ? Number(taxaAtrasoLS || 0)
    : Number(obj.settings.taxaAtrasoDiario || 0);

  obj.settings.tipoTaxaAtrasoDiario = (tipoTaxaAtrasoLS || obj.settings.tipoTaxaAtrasoDiario || 'percentual') === 'reais'
    ? 'reais'
    : 'percentual';

  // Evita valor inválido.
  if (Number.isNaN(obj.settings.capitalInvestido)) obj.settings.capitalInvestido = 0;
  if (Number.isNaN(obj.settings.percentualJuros50)) obj.settings.percentualJuros50 = 50;
  if (Number.isNaN(obj.settings.taxaAtrasoDiario)) obj.settings.taxaAtrasoDiario = 0;

  // Mantém compatibilidade com versões antigas do backup.
  delete obj.settings.percentualJuros;
  obj.clientes = Array.isArray(obj.clientes) ? obj.clientes : [];
  obj.vales = Array.isArray(obj.vales) ? obj.vales : [];

  obj.clientes = obj.clientes.map((c) => {
    if (typeof c === 'string') c = { nome: c };
    return {
      id: c.id || ('C' + Date.now() + Math.random().toString(16).slice(2)),
      nome: upper(c.nome || c.name || ''),
      telefone: phoneMask(c.telefone || c.phone || ''),
      cpf: cpfMask(c.cpf || ''),
      obs: upper(c.obs || c.observacao || ''),
      jurosPadrao: Number(c.jurosPadrao ?? c.interest_percent ?? 30),
      tipoTaxaAtrasoDiario: c.tipoTaxaAtrasoDiario === 'reais' || c.late_fee_type === 'reais' ? 'reais' : 'percentual',
      taxaAtrasoDiario: Number(c.taxaAtrasoDiario ?? c.late_fee_value ?? 0),
      vip: !!c.vip
    };
  }).filter(c => c.nome);

  obj.vales = obj.vales.map((v) => ({
    id: v.id || ('V' + Date.now() + Math.random().toString(16).slice(2)),
    numero: Number(v.numero || 0),
    clienteId: v.clienteId || '',
    cliente: upper(v.cliente || ''),
    telefone: phoneMask(v.telefone || ''),
    cpf: cpfMask(v.cpf || ''),
    valor: Number(v.valor || 0),
    juros: Number(v.juros || 0),
    tipoTaxaAtrasoDiario: v.tipoTaxaAtrasoDiario === 'reais' ? 'reais' : 'percentual',
    taxaAtrasoDiario: Number(v.taxaAtrasoDiario || 0),
    total: Number(v.total || 0),
    valorOriginal: Number(v.valorOriginal ?? v.valor ?? 0),
    totalOriginal: Number(v.totalOriginal ?? v.total ?? 0),
    dataInicial: v.dataInicial || '',
    dataFinal: v.dataFinal || '',
    observacao: upper(v.observacao || ''),
    status: v.status === 'PAGO' ? 'PAGO' : 'ABERTO',
    jurosRecebidos: Number(v.jurosRecebidos || 0),
    parcialRecebido: Number(v.parcialRecebido || 0),
    principalRecebido: Number(v.principalRecebido || 0),
    listaNegra: !!v.listaNegra,
    criadoEm: v.criadoEm || new Date().toISOString(),
    editadoEm: v.editadoEm || ''
  })).filter(v => v.cliente);

  const maiorNumero = obj.vales.reduce((m, v) => Math.max(m, Number(v.numero || 0)), 0);
  obj.vales.forEach(v => {
    if (!v.numero) v.numero = ++obj.settings.seq;
  });
  obj.settings.seq = Math.max(Number(obj.settings.seq || 1), maiorNumero + 1);
  return obj;
}

// Ponte segura usada pelo módulo Supabase para carregar/substituir todo o banco.
window.getValleDatabase = function () { return db; };
window.replaceValleDatabase = function (obj) {
  db = normalizeDb(obj || seed());
  window.db = db;
  return db;
};

/**
 * Salva o banco principal no localStorage e também salva capital investido e percentual de juros em chaves separadas.
 */
function save() {
  db = normalizeDb(db);
  window.db = db;
  localStorage.setItem(LS, JSON.stringify(db));
  localStorage.setItem(LS_CAPITAL_INVESTIDO, String(Number(db.settings.capitalInvestido || 0)));
  localStorage.setItem(LS_PERCENTUAL_JUROS_50, String(Number(db.settings.percentualJuros50 || 50)));
  localStorage.setItem(LS_TAXA_ATRASO_DIARIO, String(Number(db.settings.taxaAtrasoDiario || 0)));
  localStorage.setItem(LS_TIPO_TAXA_ATRASO_DIARIO, String(db.settings.tipoTaxaAtrasoDiario || 'percentual'));
  saveAutoBackup();
  updateAutoBackupInfo();
}

function saveAutoBackup() {
  try {
    // Só grava backup automático quando existem dados úteis.
    // Assim, APAGAR TUDO não sobrescreve o último backup bom com um banco vazio.
    const temDados = Array.isArray(db.clientes) && db.clientes.length || Array.isArray(db.vales) && db.vales.length;
    if (!temDados) return;
    localStorage.setItem('emprestimos_auto_backup_v3', JSON.stringify({criadoEm:new Date().toISOString(), db}));
  } catch (_) {}
}

function updateAutoBackupInfo() {
  try {
    const el = $('autoBackupInfo');
    if (!el) return;
    const raw = localStorage.getItem('emprestimos_auto_backup_v3');
    if (!raw) { el.textContent = 'Último backup automático: nenhum encontrado neste navegador.'; return; }
    const obj = JSON.parse(raw);
    const d = obj && obj.criadoEm ? new Date(obj.criadoEm) : null;
    el.textContent = d && !isNaN(d)
      ? `Último backup automático: ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`
      : 'Último backup automático: encontrado, mas sem data.';
  } catch (_) {
    const el = $('autoBackupInfo');
    if (el) el.textContent = 'Último backup automático: inválido.';
  }
}


/**
 * Escapa textos antes de inserir no HTML, evitando quebra de layout e problemas com caracteres especiais.
 */
function h(s) {
  return String(s ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

/**
 * Mostra uma mensagem rápida na parte inferior da tela para avisar o usuário sobre ações e erros.
 */
function toast(msg, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;

  const original = String(msg || '').trim();
  if (!original) return;

  const key = original.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mensagens = {
    'CLIENTE SALVO': 'Cliente salvo com sucesso!',
    'CLIENTE ADICIONADO': 'Cliente salvo com sucesso!',
    'CLIENTE ATUALIZADO': 'Cliente atualizado com sucesso!',
    'CLIENTE ALTERADO': 'Cliente atualizado com sucesso!',
    'CLIENTE EXCLUIDO': 'Cliente excluído com sucesso!',
    'VALE SALVO': 'Vale criado com sucesso!',
    'VALLE SALVO': 'Vale criado com sucesso!',
    'VALE SALVO NO HISTORICO': 'Vale criado com sucesso!',
    'VALE CRIADO': 'Vale criado com sucesso!',
    'VALE ALTERADO': 'Vale atualizado com sucesso!',
    'ALTERACOES SALVAS': 'Vale atualizado com sucesso!',
    'VALE ATUALIZADO': 'Vale atualizado com sucesso!',
    'VALE EXCLUIDO': 'Vale excluído com sucesso!',
    'PAGAMENTO PARCIAL REGISTRADO': 'Pagamento parcial registrado com sucesso!',
    'VALE MARCADO COMO QUITADO': 'Vale quitado com sucesso!',
    'VALE QUITADO': 'Vale quitado com sucesso!',
    'CONFIGURACAO SALVA': 'Configurações salvas com sucesso!',
    'PDF BAIXADO. ABRA O ARQUIVO PARA IMPRIMIR': 'PDF gerado com sucesso!',
    'PDF ABERTO. USE IMPRIMIR NO NAVEGADOR': 'PDF gerado com sucesso!',
    'BACKUP RESTAURADO': 'Backup restaurado com sucesso!',
    'BACKUP AUTOMATICO RESTAURADO': 'Backup restaurado com sucesso!'
  };

  const texto = mensagens[key] || original;
  const lower = texto.toLowerCase();
  let kind = type || 'info';

  if (kind === 'info') {
    if (lower.includes('com sucesso') || lower.includes('salvo') || lower.includes('atualizado') || lower.includes('registrado') || lower.includes('restaurado') || lower.includes('adicionado') || lower.includes('quitado') || lower.includes('criado') || lower.includes('excluído')) {
      kind = 'success';
    } else if (lower.includes('erro') || lower.includes('inválido') || lower.includes('sem telefone') || lower.includes('não encontrado') || lower.includes('falha')) {
      kind = 'error';
    } else if (lower.includes('digite') || lower.includes('informe') || lower.includes('atenção') || lower.includes('cadastre') || lower.includes('já existe') || lower.includes('nenhuma alteração')) {
      kind = 'warn';
    }
  }

  const styles = {
    success: { variant: 'success', icon: 'bi-check-circle-fill' },
    error:   { variant: 'danger',  icon: 'bi-x-circle-fill' },
    warn:    { variant: 'warning', icon: 'bi-exclamation-triangle-fill' },
    info:    { variant: 'primary', icon: 'bi-info-circle-fill' },
    secondary: { variant: 'secondary', icon: 'bi-info-circle-fill' }
  };
  const selected = styles[kind] || styles.info;

  const alert = document.createElement('div');
  alert.className = `alert alert-${selected.variant} alert-dismissible fade show app-bootstrap-alert shadow-sm`;
  alert.setAttribute('role', 'alert');
  alert.innerHTML = `
    <div class="d-flex align-items-center gap-2">
      <i class="bi ${selected.icon} flex-shrink-0" aria-hidden="true"></i>
      <div class="flex-grow-1 app-bootstrap-alert-message"></div>
      <button type="button" class="btn-close flex-shrink-0" data-bs-dismiss="alert" aria-label="Fechar"></button>
    </div>`;
  alert.querySelector('.app-bootstrap-alert-message').textContent = texto;

  container.prepend(alert);
  requestAnimationFrame(() => alert.classList.add('app-alert-entered'));

  const remover = () => {
    if (!alert.isConnected) return;
    alert.classList.add('app-alert-leaving');
    alert.classList.remove('show');
    setTimeout(() => alert.remove(), 260);
  };

  const timer = setTimeout(remover, 3400);
  alert.addEventListener('closed.bs.alert', () => {
    clearTimeout(timer);
    alert.remove();
  }, { once: true });
}

/**
 * Converte texto para maiúsculas e remove espaços extras no começo/fim.
 */
function upper(s) { return String(s || '').toUpperCase().trim(); }
/**
 * Remove tudo que não for número. Usado em telefone, CPF e valores monetários.
 */
function onlyNum(s) { return String(s || '').replace(/\D/g, ''); }
/**
 * Converte um texto formatado como moeda em número. Exemplo: R$ 1.500,00 vira 1500.
 */
/**
 * Formata um número para moeda brasileira. Exemplo: 1500 vira R$ 1.500,00.
 */
function moneyNum(s) {
  // Aceita tanto valor já formatado (R$ 1.500,00) quanto digitação normal (1500, 1500,00 ou 1500.00).
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  let t = String(s || '').trim();
  if (!t) return 0;
  t = t.replace(/R\$|\s/g, '');

  const hasComma = t.includes(',');
  const hasDot = t.includes('.');

  if (hasComma && hasDot) {
    // Padrão brasileiro: 1.500,00
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // 1500,00
    t = t.replace(',', '.');
  } else if (hasDot) {
    const parts = t.split('.');
    const last = parts[parts.length - 1];
    // 1.500 ou 15.000 são milhares; 1500.50 é decimal.
    if (parts.length > 1 && last.length === 3 && parts.slice(0, -1).every(p => /^\d{1,3}$/.test(p))) {
      t = parts.join('');
    }
  }

  t = t.replace(/[^0-9.-]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
function money(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

/**
 * Máscara reutilizável para campos de moeda inseridos dinamicamente em modais.
 * Corrige erro que quebrava Pagamento Parcial/Edição do modal de recebimento.
 */
function maskMoneyInput(el) {
  if (!el) return;
  const cursorAtEnd = (el.selectionStart || 0) >= String(el.value || '').length;
  el.value = String(el.value || '').replace(/[^0-9,\.]/g, '');
  if (cursorAtEnd) {
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
  }
}

/**
 * Máscara reutilizável para campos de porcentagem inseridos dinamicamente em modais.
 */
function maskPercentInput(el) {
  if (!el) return;
  el.value = String(el.value || '').replace(/[^0-9,\.]/g, '');
}

function formatMoneyInput(el) {
  if (!el) return;
  el.value = money(moneyNum(el.value));
}

function formatPercentInput(el) {
  if (!el) return;
  el.value = String(taxaNum(el.value)).replace('.', ',') + '%';
}
/**
 * Converte uma data no formato do input HTML (AAAA-MM-DD) para o formato brasileiro (DD/MM/AAAA).
 */
function brDate(s) { if (!s) return '--/--/----'; const p = String(s).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '--/--/----'; }
/**
 * Converte um objeto Date do JavaScript para o formato usado em input type=date (AAAA-MM-DD).
 */
function inputDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
/**
 * Calcula a diferença em dias entre duas datas.
 */
function days(a, b) { if (!a || !b) return 0; return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
/**
 * Converte taxa de juros digitada com % ou vírgula para número. Exemplo: 30% vira 30.
 */
function taxaNum(s) { return parseFloat(String(s || '').replace('%', '').replace(',', '.')) || 0; }
/**
 * Aplica máscara de telefone brasileiro. Exemplo: 94991182247 vira (94) 99118-2247.
 */
function phoneMask(v) { const n = onlyNum(v).slice(0, 11); if (n.length <= 2) return n; if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`; if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`; return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`; }
/**
 * Aplica máscara de CPF. Exemplo: 12345678900 vira 123.456.789-00.
 */
function cpfMask(v) { const n = onlyNum(v).slice(0, 11); return n.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
/**
 * Aplica máscara de CEP. Mantido como utilitário caso você queira usar CEP no futuro.
 */
function cepMask(v) { const n = onlyNum(v).slice(0, 8); return n.replace(/(\d{5})(\d)/, '$1-$2'); }
/**
 * Prepara o número de telefone para abrir no WhatsApp. Adiciona o código 55 quando necessário.
 */
function whatsNumber(t) { let n = onlyNum(t); if (n.length === 10 || n.length === 11) n = '55' + n; return n; }
/**
 * Busca um cliente pelo nome em maiúsculas.
 */
function clienteByName(name) { const n = upper(name).replace(/\s+/g, ' '); return db.clientes.find(c => upper(c.nome).replace(/\s+/g, ' ') === n); }
/**
 * Busca um cliente pelo ID interno.
 */
function clienteById(id) { return db.clientes.find(c => c.id === id); }
/**
 * Retorna a situação visual de um vale: pago, atrasado ou aberto.
 */
function loanStatus(v) { if (v.status === 'PAGO') return 'pago'; const today = inputDate(new Date()); return v.dataFinal && v.dataFinal < today ? 'atrasado' : 'aberto'; }

/**
 * Calcula a taxa de atraso diário configurada.
 * - Porcentagem: aplica a taxa sobre o valor principal ainda em aberto por dia de atraso.
 * - Reais: soma um valor fixo em R$ por dia de atraso.
 * A taxa só entra em vales em aberto e vencidos.
 */
function dailyLateFee(v) {
  if (!v || String(v.status || '').toUpperCase() === 'PAGO') return 0;
  if (!v.dataFinal) return 0;
  const hoje = inputDate(new Date());
  if (v.dataFinal >= hoje) return 0;
  const diasAtraso = Math.max(0, days(v.dataFinal, hoje));
  const cliente = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
  const taxa = Math.max(0, Number(v.taxaAtrasoDiario ?? cliente.taxaAtrasoDiario ?? 0));
  if (!diasAtraso || !taxa) return 0;
  const tipoOriginal = v.tipoTaxaAtrasoDiario ?? cliente.tipoTaxaAtrasoDiario;
  const tipo = tipoOriginal === 'reais' ? 'reais' : 'percentual';
  if (tipo === 'reais') return diasAtraso * taxa;
  const base = Math.max(0, originalLoanValue(v) - Number(v.principalRecebido || 0));
  return base * (taxa / 100) * diasAtraso;
}

function lateFeeLabel(v = null) {
  const cliente = v ? (clienteById(v.clienteId) || clienteByName(v.cliente) || {}) : {};
  const taxa = Math.max(0, Number(v?.taxaAtrasoDiario ?? cliente.taxaAtrasoDiario ?? 0));
  const tipo = (v?.tipoTaxaAtrasoDiario ?? cliente.tipoTaxaAtrasoDiario) === 'reais' ? 'reais' : 'percentual';
  if (tipo === 'reais') return money(taxa) + ' / DIA';
  return String(taxa).replace('.', ',') + '% / DIA';
}

/**
 * Aplica o modo claro ou escuro na tela conforme a configuração salva.
 */
function applyTheme() {
  let theme = window.VALLE_ACTIVE_THEME;
  if (theme !== 'dark' && theme !== 'light') {
    try { theme = localStorage.getItem('valle_theme_guest'); } catch (_) {}
  }
  if (theme !== 'dark' && theme !== 'light') theme = db?.settings?.theme === 'dark' ? 'dark' : 'light';
  window.VALLE_ACTIVE_THEME = theme;
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('dark', isDark);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', isDark ? '#070b18' : '#f4f2ff');
  if ($('themeBtn')) $('themeBtn').textContent = isDark ? '☀️ MODO CLARO' : '🌙 MODO ESCURO';
}


/**
 * Troca a aba/tela visível do sistema e atualiza todos os dados renderizados.
 */
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if ($(id)) $(id).classList.add('active');

  // Atualiza o botão ativo do menu e, no celular, centraliza o botão selecionado na barra horizontal.
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
  const activeTab = document.querySelector(`.tab[data-screen="${id}"]`);
  if (activeTab && window.innerWidth <= 780) {
    activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  renderAll();
}



function getLoanFormState() {
  return JSON.stringify({
    id: editLoanId || '',
    cliente: $('loanCliente')?.value || '',
    valor: $('loanValor')?.value || '',
    juros: $('loanJuros')?.value || '',
    tipoTaxaAtrasoDiario: $('loanTipoTaxaDiaria')?.value || 'percentual',
    taxaAtrasoDiario: $('loanTaxaDiaria')?.value || '',
    dataInicial: $('loanInicio')?.value || '',
    dataFinal: $('loanFinal')?.value || '',
    observacao: $('loanObs')?.value || ''
  });
}

function markLoanFormClean() {
  loanFormSnapshot = getLoanFormState();
}

function loanFormHasChanges() {
  return getLoanFormState() !== loanFormSnapshot;
}

function ensureLoanUnsavedDialog() {
  let dialog = document.getElementById('loanUnsavedDialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'loanUnsavedDialog';
  dialog.className = 'client-unsaved-dialog d-none';
  dialog.innerHTML = `
    <div class="client-unsaved-backdrop"></div>
    <div class="client-unsaved-card" role="alertdialog" aria-modal="true" aria-labelledby="loanUnsavedTitle">
      <div class="client-unsaved-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
      <h3 id="loanUnsavedTitle">Alterações não salvas</h3>
      <p>Você modificou os dados do vale. O que deseja fazer?</p>
      <div class="client-unsaved-actions">
        <button type="button" class="btn btn-outline-light" data-loan-action="continue">
          <i class="bi bi-pencil-square"></i> Continuar editando
        </button>
        <button type="button" class="btn btn-outline-danger" data-loan-action="discard">
          <i class="bi bi-trash3"></i> Descartar
        </button>
        <button type="button" class="btn btn-primary" data-loan-action="save">
          <i class="bi bi-check2-circle"></i> Salvar e sair
        </button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  return dialog;
}

function askLoanUnsavedAction() {
  return new Promise((resolve) => {
    const dialog = ensureLoanUnsavedDialog();
    const buttons = dialog.querySelectorAll('[data-loan-action]');
    const finish = (action) => {
      dialog.classList.add('d-none');
      buttons.forEach(btn => btn.onclick = null);
      document.removeEventListener('keydown', onKey);
      resolve(action);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') finish('continue');
    };
    buttons.forEach(btn => btn.onclick = () => finish(btn.dataset.loanAction));
    document.addEventListener('keydown', onKey);
    dialog.classList.remove('d-none');
    setTimeout(() => dialog.querySelector('[data-loan-action="continue"]')?.focus(), 30);
  });
}

function updateLoanDailyRateUI() {
  const tipo = $('loanTipoTaxaDiaria')?.value === 'reais' ? 'reais' : 'percentual';
  const prefix = $('loanTaxaDiariaPrefix');
  if (prefix) prefix.textContent = tipo === 'reais' ? 'R$' : '%';
  const input = $('loanTaxaDiaria');
  if (input) input.placeholder = tipo === 'reais' ? '0,00' : '0%';
}

function updateClientDailyRateUI() {
  const tipo = $('cliTipoTaxaDiaria')?.value === 'reais' ? 'reais' : 'percentual';
  const prefix = $('cliTaxaDiariaPrefix');
  if (prefix) prefix.textContent = tipo === 'reais' ? 'R$' : '%';
  const input = $('cliTaxaDiaria');
  if (input) input.placeholder = tipo === 'reais' ? '0,00' : '0%';
}

function applyClientRatesToLoan() {
  // As taxas pertencem ao vale atual e não ao cadastro do cliente.
}

function syncLoanRatesFromSelectedClient() {
  // Mantido por compatibilidade; não altera as taxas do formulário.
}

/**
 * Limpa o formulário de novo VALLE e coloca as datas padrão: hoje e +30 dias.
 */
function clearLoan() {
  editLoanId = null;
  if ($('saveOnlyBtn')) $('saveOnlyBtn').innerHTML = '💾 Salvar';
  $('loanCliente').value = '';
  $('loanValor').value = '';
  const jurosPadrao = 30;
  $('loanJuros').value = String(jurosPadrao).replace('.', ',') + '%';
  if ($('loanTipoTaxaDiaria')) $('loanTipoTaxaDiaria').value = 'percentual';
  if ($('loanTaxaDiaria')) $('loanTaxaDiaria').value = '0%';
  updateLoanDailyRateUI();
  $('loanTotal').value = '';
  $('loanObs').value = '';
  const hoje = new Date();
  $('loanInicio').value = inputDate(hoje);
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + 30);
  $('loanFinal').value = inputDate(fim);
  calcLoan();
  markLoanFormClean();
}


function valleElectronicSignature(){
  const p=window.ValleCloud?.profile||{};
  const at=new Date().toISOString();
  return { userId:p.id||'local', userName:p.name||p.email||'USUÁRIO LOCAL', userEmail:p.email||'', role:p.role||'local', signedAt:at };
}
function valleAuditDiff(before,after){
  const ignored=new Set(['ultimaAssinaturaEletronica','assinaturaEletronica','editadoEm','criadoEm']);
  const labels={nome:'Nome',cliente:'Cliente',telefone:'Telefone',cpf:'CPF',obs:'Observação',observacao:'Observação',valor:'Valor emprestado',total:'Valor a receber',juros:'Taxa de juros',taxaAtrasoDiario:'Taxa de atraso diária',tipoTaxaAtrasoDiario:'Tipo da taxa de atraso',dataInicial:'Data inicial',dataFinal:'Data final',status:'Status',principalRecebido:'Principal recebido',jurosRecebidos:'Juros recebidos',parcialRecebido:'Pagamento parcial acumulado',listaNegra:'Lista negra'};
  const out={}; const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);
  keys.forEach(k=>{if(ignored.has(k))return;const a=before?.[k],b=after?.[k];if(JSON.stringify(a)!==JSON.stringify(b))out[k]={label:labels[k]||k,anterior:a??null,novo:b??null}});
  return out;
}
function valleAudit(action,type,record,extra={}){
  try{
    const names={CRIAR_CLIENTE:['CLIENTES','Novo cliente criado'],ATUALIZAR_CLIENTE:['CLIENTES','Cliente atualizado'],EXCLUIR_CLIENTE:['CLIENTES','Cliente excluído'],CRIAR_VALE:['VALES','Novo vale criado'],ATUALIZAR_VALE:['VALES','Vale atualizado'],EXCLUIR_VALE:['VALES','Vale excluído'],QUITAR_VALE:['PAGAMENTOS','Vale quitado'],PAGAMENTO_PARCIAL:['PAGAMENTOS','Pagamento parcial registrado'],PAGAMENTO_JUROS:['PAGAMENTOS','Pagamento de juros registrado'],NAO_PAGOU:['PAGAMENTOS','Não pagamento registrado'],LISTA_NEGRA:['CLIENTES','Cliente adicionado à lista negra']};
    const key=String(action||'').toUpperCase(); const meta=names[key]||[String(type||'SISTEMA').toUpperCase(),'Ação registrada'];
    const before=extra.old_data||null,after=extra.new_data||record||null,changes=extra.changes||valleAuditDiff(before,after);
    const user=window.ValleCloud?.profile?.name||'Usuário'; const target=record?.numero?`Vale #${record.numero}`:(record?.nome||record?.cliente||record?.id||'registro');
    window.ValleCloud?.recordAudit?.(key,type,record?.id||'',{module:meta[0],title:extra.title||meta[1],description:extra.description||`${user}: ${meta[1]} — ${target}.`,client_name:record?.cliente||record?.nome||'',vale_number:record?.numero||null,old_data:before,new_data:after,changes,...extra});
  }catch(e){console.warn(e)}
}

/**
 * Calcula o total com juros e atualiza o badge de dias entre data inicial e final.
 */
function calcLoan() {
  const valor = moneyNum($('loanValor').value);
  const juros = taxaNum($('loanJuros').value);
  const total = Math.max(0, valor + (valor * juros / 100));
  $('loanTotal').value = money(total);
  $('diasBadge').textContent = days($('loanInicio').value, $('loanFinal').value) || 0;
}

/**
 * Lê os campos do formulário de VALLE e monta um objeto vale pronto para salvar.
 */
function currentLoan() {
  const nome = upper($('loanCliente').value);
  const c = clienteByName(nome);
  const old = editLoanId ? db.vales.find(v => v.id === editLoanId) : null;
  return {
    id: editLoanId || ('V' + Date.now()),
    numero: old ? old.numero : null,
    clienteId: c?.id || '',
    cliente: nome,
    telefone: c?.telefone || '',
    cpf: c?.cpf || '',
    valor: moneyNum($('loanValor').value),
    juros: taxaNum($('loanJuros').value),
    tipoTaxaAtrasoDiario: $('loanTipoTaxaDiaria')?.value === 'reais' ? 'reais' : 'percentual',
    taxaAtrasoDiario: $('loanTipoTaxaDiaria')?.value === 'reais' ? moneyNum($('loanTaxaDiaria')?.value || '0') : taxaNum($('loanTaxaDiaria')?.value || '0'),
    total: moneyNum($('loanTotal').value),
    valorOriginal: old?.valorOriginal ?? moneyNum($('loanValor').value),
    totalOriginal: old?.totalOriginal ?? moneyNum($('loanTotal').value),
    dataInicial: $('loanInicio').value,
    dataFinal: $('loanFinal').value,
    observacao: upper($('loanObs').value),
    status: old?.status || 'ABERTO',
    principalRecebido: Number(old?.principalRecebido || 0),
    jurosRecebidos: Number(old?.jurosRecebidos || 0),
    parcialRecebido: Number(old?.parcialRecebido || 0),
    criadoEm: old?.criadoEm || new Date().toISOString(),
    assinaturaEletronica: old?.assinaturaEletronica || valleElectronicSignature(),
    ultimaAssinaturaEletronica: valleElectronicSignature()
  };
}

/**
 * Valida se o vale possui cliente, valor e datas corretas antes de salvar.
 */
function validateLoan(v) {
  if (!v.cliente) return 'INFORME O CLIENTE';
  if (v.valor <= 0) return 'INFORME O VALOR';
  if (!v.dataInicial || !v.dataFinal) return 'INFORME AS DATAS';
  if (days(v.dataInicial, v.dataFinal) < 0) return 'DATA FINAL MENOR QUE A INICIAL';
  return '';
}

/**
 * Garante que o cliente informado no VALLE exista no cadastro. Se não existir, cria automaticamente.
 */
function ensureClientByLoan(v) {
  let c = clienteByName(v.cliente);
  if (!c) {
    c = { id: 'C' + Date.now(), nome: v.cliente, telefone: '', cpf: '', obs: '', criadoEm:new Date().toISOString(), assinaturaEletronica:valleElectronicSignature() };
    valleAudit('CRIAR_CLIENTE','cliente',c,{new_data:c,origem:'cadastro automático pelo vale'});
    db.clientes.push(c);
  }
  v.clienteId = c.id;
  return c;
}

/**
 * Salva um vale novo ou atualiza um vale em edição. Também atualiza cliente, histórico e localStorage.
 */
function saveLoan() {
  const v = currentLoan();
  const err = validateLoan(v);
  if (err) { toast(err); return null; }
  const c = ensureClientByLoan(v);
  v.telefone = c.telefone;
  v.cpf = c.cpf;

  if (editLoanId) {
    const i = db.vales.findIndex(x => x.id === editLoanId);
    if (i < 0) { toast('VALE NÃO ENCONTRADO'); return null; }
    const anterior = JSON.parse(JSON.stringify(db.vales[i]));
    db.vales[i] = { ...db.vales[i], ...v, valorOriginal: v.valor, totalOriginal: v.total, editadoEm: new Date().toISOString() };
    valleAudit('ATUALIZAR_VALE','vale',db.vales[i],{old_data:anterior,new_data:db.vales[i]});
    toast('VALE ALTERADO');
  } else {
    v.numero = db.settings.seq++;
    db.vales.unshift(v);
    valleAudit('CRIAR_VALE','vale',v,{new_data:v});
    toast('VALLE SALVO');
  }
  editLoanId = null;
  save();
  renderAll();
  return v;
}

/**
 * Salva o vale e abre a impressão.
 */
function savePrint() { const v = saveLoan(); if (v) { printLoan(v); clearLoan(); } }
/**
 * Salva o vale e inicia o compartilhamento do PDF pelo celular/navegador.
 */
async function saveSendPdf() { const v = saveLoan(); if (v) { await sharePdf(v); clearLoan(); } }
/**
 * Salva o vale sem imprimir e leva o usuário para o histórico.
 */
function saveOnly() { const v = saveLoan(); if (v) { clearLoan(); switchScreen('historico'); } }

/**
 * Cancela o cadastro/edição do vale, limpa o formulário e volta para o histórico.
 */
let loanLeavePromptOpen = false;

/**
 * Confirma a saída da aba Novo VALLE quando há dados alterados.
 * O destino só é aberto depois que o usuário salva ou descarta as alterações.
 */
async function confirmLoanBeforeLeave(afterLeave) {
  if (loanLeavePromptOpen) return false;

  if (!loanFormHasChanges()) {
    afterLeave?.();
    return true;
  }

  loanLeavePromptOpen = true;
  try {
    const action = await askLoanUnsavedAction();
    if (action === 'continue') return false;

    if (action === 'save') {
      const saved = saveLoan();
      if (!saved) return false;
    }

    clearLoan();
    afterLeave?.();
    return true;
  } finally {
    loanLeavePromptOpen = false;
  }
}

async function cancelLoan() {
  await confirmLoanBeforeLeave(() => switchScreen('historico'));
}

/**
 * Abre a aba Novo VALLE sempre limpa quando o usuário chama pelo menu Novo.
 * A edição usa editLoan(), então os dados editados continuam preservados.
 */
function openNewLoan() {
  clearLoan();
  switchScreen('emprestimo');
}

function getClientBootstrapModal() {
  const modal = $('clientModal');
  if (!modal || !window.bootstrap?.Modal) return null;
  return bootstrap.Modal.getOrCreateInstance(modal, {
    backdrop: 'static',
    keyboard: false,
    focus: true
  });
}


function getClientFormState() {
  return JSON.stringify({
    id: $('clienteId')?.value || '',
    nome: $('cliNome')?.value || '',
    telefone: $('cliTelefone')?.value || '',
    cpf: $('cliCpf')?.value || '',
    obs: $('cliObs')?.value || ''
  });
}

function markClientFormClean() {
  clientFormSnapshot = getClientFormState();
}

function clientFormHasChanges() {
  return getClientFormState() !== clientFormSnapshot;
}

function ensureClientUnsavedDialog() {
  let dialog = document.getElementById('clientUnsavedDialog');
  if (dialog) return dialog;
  dialog = document.createElement('div');
  dialog.id = 'clientUnsavedDialog';
  dialog.className = 'client-unsaved-dialog d-none';
  dialog.innerHTML = `
    <div class="client-unsaved-backdrop"></div>
    <div class="client-unsaved-card" role="alertdialog" aria-modal="true" aria-labelledby="clientUnsavedTitle">
      <div class="client-unsaved-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
      <h3 id="clientUnsavedTitle">Alterações não salvas</h3>
      <p>Você modificou o cadastro. O que deseja fazer?</p>
      <div class="client-unsaved-actions">
        <button type="button" class="btn btn-outline-light" data-client-action="continue">
          <i class="bi bi-pencil-square"></i> Continuar editando
        </button>
        <button type="button" class="btn btn-outline-danger" data-client-action="discard">
          <i class="bi bi-trash3"></i> Descartar
        </button>
        <button type="button" class="btn btn-primary" data-client-action="save">
          <i class="bi bi-check2-circle"></i> Salvar e sair
        </button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  return dialog;
}

function askClientUnsavedAction() {
  return new Promise((resolve) => {
    const dialog = ensureClientUnsavedDialog();
    const buttons = dialog.querySelectorAll('[data-client-action]');
    const finish = (action) => {
      dialog.classList.add('d-none');
      buttons.forEach(btn => btn.onclick = null);
      document.removeEventListener('keydown', onKey);
      resolve(action);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') finish('continue');
    };
    buttons.forEach(btn => btn.onclick = () => finish(btn.dataset.clientAction));
    document.addEventListener('keydown', onKey);
    dialog.classList.remove('d-none');
    setTimeout(() => dialog.querySelector('[data-client-action="continue"]')?.focus(), 30);
  });
}

async function cancelClientModal() {
  if (!clientFormHasChanges()) {
    closeClientModal(true);
    return;
  }
  const action = await askClientUnsavedAction();
  if (action === 'continue') return;
  if (action === 'save') {
    saveClient();
    return;
  }
  clientModalForceClose = true;
  closeClientModal(true);
}

function updateClientModalHeading(editing = false) {
  const title = $('clientModalTitle');
  const subtitle = document.querySelector('#clientModal .client-modal-subtitle');
  if (title) title.textContent = editing ? 'Editar cliente' : 'Cadastro de cliente';
  if (subtitle) subtitle.textContent = editing
    ? 'Atualize os dados do cliente selecionado.'
    : 'Preencha os dados para cadastrar um novo cliente.';
}

function openClientModal(editing = false) {
  const modal = $('clientModal');
  if (!modal) return;
  if (!editing) clearClient(false);
  updateClientModalHeading(editing);

  const bsModal = getClientBootstrapModal();
  if (bsModal) bsModal.show();
  else {
    modal.classList.add('show');
    modal.style.display = 'block';
    modal.removeAttribute('aria-hidden');
  }

  modal.addEventListener('shown.bs.modal', () => {
    markClientFormClean();
    $('cliNome')?.focus();
  }, { once: true });
  setTimeout(() => {
    markClientFormClean();
    $('cliNome')?.focus();
  }, 180);
}

function closeClientModal(clear = true) {
  const modal = $('clientModal');
  if (!modal) return;
  clientModalForceClose = true;
  const bsModal = getClientBootstrapModal();
  if (bsModal) bsModal.hide();
  else {
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  if (clear) clearClient(false);
  clientModalForceClose = false;
}

/**
 * Limpa o formulário de cadastro/edição de cliente.
 */
function clearClient(closeModal = false) {
  ['clienteId', 'cliNome', 'cliTelefone', 'cliCpf', 'cliObs'].forEach(id => $(id).value = '');
  if ($('saveClientBtn')) $('saveClientBtn').innerHTML = '<i class="bi bi-check2-circle"></i><span>Salvar</span>';
  updateClientModalHeading(false);
  markClientFormClean();
  if (closeModal) closeClientModal(false);
}


/**
 * Lê um arquivo selecionado e transforma em Base64. Mantido para futuras fotos/anexos.
 */
function readFileData(file) {
  return new Promise((res, rej) => {
    if (!file) return res('');
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/**
 * Salva um cliente novo ou edita um cliente existente. Também atualiza os vales ligados a esse cliente.
 */
function saveClient() {
  const id = $('clienteId').value || ('C' + Date.now());
  const c = {
    id,
    nome: upper($('cliNome').value),
    telefone: phoneMask($('cliTelefone').value),
    cpf: cpfMask($('cliCpf').value),
    obs: upper($('cliObs').value),
    vip: !!(clienteById(id)?.vip),
    criadoEm: clienteById(id)?.criadoEm || new Date().toISOString(),
    assinaturaEletronica: clienteById(id)?.assinaturaEletronica || valleElectronicSignature(),
    ultimaAssinaturaEletronica: valleElectronicSignature()
  };
  if (!c.nome) { toast('DIGITE O NOME'); return false; }
  const duplicated = db.clientes.find(x => x.nome === c.nome && x.id !== id);
  if (duplicated) { toast('JÁ EXISTE CLIENTE COM ESSE NOME'); return false; }
  const idx = db.clientes.findIndex(x => x.id === id);
  if (idx >= 0) {
    const anterior = JSON.parse(JSON.stringify(db.clientes[idx]));
    const oldName = db.clientes[idx].nome;
    db.clientes[idx] = c;
    db.vales.forEach(v => {
      if (v.clienteId === id || v.cliente === oldName) {
        v.clienteId = id; v.cliente = c.nome; v.telefone = c.telefone; v.cpf = c.cpf;
      }
    });
    valleAudit('ATUALIZAR_CLIENTE','cliente',c,{old_data:anterior,new_data:c});
    toast('CLIENTE ATUALIZADO');
  } else {
    db.clientes.push(c);
    valleAudit('CRIAR_CLIENTE','cliente',c,{new_data:c});
    toast('CLIENTE SALVO');
  }
  save();
  clearClient();
  renderAll();
  closeClientModal(false);
  return true;
}


/**
 * Carrega os dados de um cliente no formulário para edição.
 */
function editClient(id) {
  const c = clienteById(id);
  if (!c) return;
  switchScreen('clientes');
  $('clienteId').value = c.id;
  $('cliNome').value = c.nome;
  $('cliTelefone').value = c.telefone || '';
  $('cliCpf').value = c.cpf || '';
  $('cliObs').value = c.obs || '';
  if ($('saveClientBtn')) $('saveClientBtn').innerHTML = '<i class="bi bi-check2-circle"></i><span>Atualizar</span>';
  openClientModal(true);
}


/**
 * Usa um cliente cadastrado no formulário de novo VALLE.
 */
function useClient(id) {
  const c = clienteById(id);
  if (c) {
    $('loanCliente').value = c.nome;
    applyClientRatesToLoan(c);
  }
  switchScreen('emprestimo');
}

/**
 * Remove o cliente do cadastro, mantendo os vales antigos no histórico.
 */
async function deleteClient(id) {
  const ok = await appConfirm('OS VALES ANTIGOS CONTINUAM NO HISTÓRICO.', {
    title: 'Excluir cliente?',
    icon: '🗑️',
    confirmText: 'Excluir',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  const removido=db.clientes.find(c=>c.id===id);
  db.clientes = db.clientes.filter(c => c.id !== id);
  if(removido)valleAudit('EXCLUIR_CLIENTE','cliente',removido,{old_data:removido});
  save(); renderAll();
  toast('CLIENTE EXCLUÍDO');
}

/**
 * Carrega um vale do histórico no formulário de VALLE para edição.
 */
function editLoan(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  editLoanId = id;
  if ($('saveOnlyBtn')) $('saveOnlyBtn').innerHTML = '💾 Atualizar';
  $('loanCliente').value = v.cliente;
  $('loanValor').value = money(v.valor);
  $('loanJuros').value = String(v.juros).replace('.', ',') + '%';
  if ($('loanTipoTaxaDiaria')) $('loanTipoTaxaDiaria').value = v.tipoTaxaAtrasoDiario === 'reais' ? 'reais' : 'percentual';
  if ($('loanTaxaDiaria')) $('loanTaxaDiaria').value = v.tipoTaxaAtrasoDiario === 'reais' ? money(Number(v.taxaAtrasoDiario || 0)) : String(Number(v.taxaAtrasoDiario || 0)).replace('.', ',') + '%';
  updateLoanDailyRateUI();
  $('loanTotal').value = money(v.total);
  $('loanInicio').value = v.dataInicial;
  $('loanFinal').value = v.dataFinal;
  $('loanObs').value = v.observacao || '';
  calcLoan();
  markLoanFormClean();
  switchScreen('emprestimo');
  toast('EDITANDO VALE');
}

/**
 * Exclui um vale do histórico após confirmação.
 */
async function deleteLoan(id) {
  const ok = await appConfirm('Deseja realmente excluir este vale?', {
    title: 'Excluir vale?',
    icon: '🗑️',
    confirmText: 'Excluir',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  const removido=db.vales.find(v=>v.id===id);
  db.vales = db.vales.filter(v => v.id !== id);
  if(removido)valleAudit('EXCLUIR_VALE','vale',removido,{old_data:removido});
  save(); renderAll();
  toast('VALE EXCLUÍDO');
}
/**
 * Alterna o status do vale entre ABERTO e PAGO/RECEBIDO.
 */

function togglePaid(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  if (v.status === 'PAGO') {
    // Ao clicar em ABRIR no histórico, o vale volta a ficar EM ABERTO.
    // Assim o Dashboard desconta novamente do caixa/capital disponível o VALOR DO VALE
    // e também remove os juros que estavam aparecendo como recebidos.
    const valorDoVale = originalLoanValue(v);
    const totalDoVale = originalLoanTotal(v);

    v.valor = Math.max(0, valorDoVale);
    v.total = Math.max(0, totalDoVale);
    v.principalRecebido = 0;
    v.jurosRecebidos = 0;
    v.parcialRecebido = 0;
    v.status = 'ABERTO';
    v.ultimoRecebimento = 'REABERTO';

    save();
    renderAll();
    toast('VALE REABERTO: VALOR DESCONTADO DO DASHBOARD');
    return;
  }
  openReceiveModal(id);
}


/**
 * Botão ABRIR VALE no histórico: reabre somente vales quitados.
 * Se o vale já está aberto, apenas avisa para não confundir com Receber.
 */
function abrirValeHistorico(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  if (String(v.status || '').toUpperCase() !== 'PAGO') {
    toast('ESTE VALE JÁ ESTÁ EM ABERTO');
    return;
  }
  togglePaid(id);
}

function loanPrincipalBalance(v) {
  return Math.max(0, originalLoanValue(v) - Number(v.principalRecebido || 0));
}

function loanTotalBalance(v) {
  return Math.max(0, originalLoanTotal(v) - Number(v.parcialRecebido || 0) + dailyLateFee(v));
}

function loanInterest(v) {
  return Math.max(0, loanTotalBalance(v) - loanPrincipalBalance(v));
}

function originalLoanValue(v) {
  const saved = Number(v.valorOriginal);
  if (saved > 0) return saved;

  const atual = Number(v.valor || 0);
  const totalAtual = Number(v.total || 0);
  const totalOriginal = Number(v.totalOriginal);
  const juros = Number(v.juros || 0);

  // Recupera vales antigos em que o principal ficou 0 após pagamento parcial.
  // Ex.: valor atual 0, juros atual 30, taxa 30% => valor original 100.
  if (atual <= 0 && totalAtual > 0 && juros > 0) return totalAtual / (juros / 100);

  if (totalOriginal > 0 && juros > 0) return totalOriginal / (1 + (juros / 100));

  return Math.max(0, atual);
}

function originalLoanTotal(v) {
  const principalOriginal = originalLoanValue(v);
  const juros = Number(v.juros || 0);
  const calculado = principalOriginal + (principalOriginal * juros / 100);
  if (calculado > 0) return calculado;

  const saved = Number(v.totalOriginal);
  if (saved > 0) return saved;

  return Math.max(0, Number(v.total || 0));
}

function closeReceiveModal() {
  closePartialPaymentModal();
  const modal = $('receiveModal');
  if (!modal) return;
  if (window.bootstrap?.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(modal).hide();
  } else {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

function openReceiveModal(id, editing = false) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  if (Number(v.valorOriginal || 0) <= 0) v.valorOriginal = originalLoanValue(v);
  if (Number(v.totalOriginal || 0) <= 0) v.totalOriginal = originalLoanTotal(v);

  const modal = $('receiveModal');
  const body = $('receiveModalBody');
  if (!modal || !body) return;

  // O Bootstrap precisa do modal diretamente no body. Isso evita que containers
  // com transform/overflow coloquem o backdrop por cima ou cortem o conteúdo.
  if (modal.parentElement !== document.body) document.body.appendChild(modal);

  const numero = String(v.numero || '').padStart(4, '0');
  const cliente = h(v.cliente);
  const juros = loanInterest(v);

  body.innerHTML = `
    <div class="modal-header px-3 px-md-4 py-3">
      <div class="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
        <div class="receive-bs-icon flex-shrink-0" aria-hidden="true">
          <i class="bi bi-cash-coin"></i>
        </div>
        <div class="min-w-0 flex-grow-1">
          <div class="text-secondary small fw-bold mb-1">AÇÕES DE COBRANÇA</div>
          ${editing
            ? `<label class="visually-hidden" for="receiveEditCliente">Cliente</label><input id="receiveEditCliente" class="form-control form-control-lg fw-bold" value="${cliente}" autocomplete="off">`
            : `<h2 id="receiveModalTitle" class="h4 fw-bold mb-0 text-break">${cliente}</h2>`}
          <p class="text-secondary small mb-0 mt-1 d-none d-sm-block">Gerencie o recebimento e o status deste vale.</p>
        </div>
      </div>
      <div class="receive-bs-number text-center flex-shrink-0 ms-2">
        <small class="d-block text-secondary fw-bold">Nº DO VALE</small>
        <strong class="fs-5">#${numero}</strong>
      </div>
    </div>

    <div class="modal-body px-3 px-md-4 py-3 py-md-4">
      <div class="row g-3 mb-3">
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="receive-bs-info h-100">
            <div class="receive-bs-label"><i class="bi bi-calendar-event"></i><span>Vencimento</span></div>
            ${editing
              ? `<input id="receiveEditDataFinal" class="form-control" type="date" value="${h(v.dataFinal || '')}">`
              : `<strong class="receive-bs-value">${brDate(v.dataFinal)}</strong>`}
          </div>
        </div>
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="receive-bs-info h-100">
            <div class="receive-bs-label"><i class="bi bi-cash-stack"></i><span>Valor do vale</span></div>
            ${editing
              ? `<input id="receiveEditValor" class="form-control" type="text" inputmode="decimal" value="${money(originalLoanValue(v))}" oninput="maskMoneyInput(this);calcReceiveModalEdit()" onblur="formatMoneyInput(this);calcReceiveModalEdit()">`
              : `<strong class="receive-bs-value">${money(originalLoanValue(v))}</strong>`}
          </div>
        </div>
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="receive-bs-info h-100">
            <div class="receive-bs-label"><i class="bi bi-percent"></i><span>Porcentagem</span></div>
            ${editing
              ? `<input id="receiveEditJuros" class="form-control" type="text" inputmode="decimal" value="${String(v.juros || 0).replace('.', ',')}%" oninput="maskPercentInput(this);calcReceiveModalEdit()" onblur="formatPercentInput(this);calcReceiveModalEdit()">`
              : `<strong class="receive-bs-value">${String(v.juros || 0).replace('.', ',')}%</strong>`}
          </div>
        </div>
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="receive-bs-info h-100">
            <div class="receive-bs-label"><i class="bi bi-graph-up-arrow"></i><span>Juros a receber</span></div>
            <strong id="receiveEditJurosReceber" class="receive-bs-value">${money(juros)}</strong>
          </div>
        </div>
      </div>

      <div class="alert alert-info d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2 mb-3 py-3 px-3 px-md-4" role="status">
        <span class="fw-bold"><i class="bi bi-wallet2 me-2"></i>TOTAL A RECEBER</span>
        <strong id="receiveEditTotal" class="fs-3 lh-1 text-nowrap">${money(loanTotalBalance(v))}</strong>
      </div>

      <div class="receive-bs-observation p-3 p-md-4">
        <div class="receive-bs-label mb-2"><i class="bi bi-card-text"></i><span>Observação do vale</span></div>
        ${editing
          ? `<textarea id="receiveEditObs" class="form-control" rows="3" placeholder="Observação do vale...">${h(v.observacao || '')}</textarea>`
          : `<p class="mb-0 text-break">${h(v.observacao || 'NENHUMA').replace(/\n/g, '<br>')}</p>`}
      </div>
    </div>

    <div class="modal-footer d-block px-3 px-md-4 py-3">
      <div id="receiveActionsGrid" class="row row-cols-2 row-cols-lg-4 g-2 mb-3">
        <div class="col"><button type="button" class="btn btn-outline-success w-100" onclick="receiveQuitado('${v.id}')"><i class="bi bi-check-circle"></i><span>Quitado</span></button></div>
        <div class="col"><button type="button" class="btn btn-outline-secondary w-100" onclick="receiveSoJuros('${v.id}')"><i class="bi bi-percent"></i><span>Só juros</span></button></div>
        <div class="col"><button type="button" class="btn btn-outline-warning w-100" onclick="showReceiveParcialField('${v.id}')"><i class="bi bi-pie-chart"></i><span>Pg. parcial</span></button></div>
        <div class="col"><button type="button" class="btn btn-outline-danger w-100" onclick="receiveNaoPagou('${v.id}')"><i class="bi bi-x-circle"></i><span>Não pagou</span></button></div>
      </div>

      <div class="row g-2">
        <div class="col-12 col-md"><button id="receiveEditBtn" type="button" class="btn btn-outline-primary w-100" onclick="${editing ? `saveReceiveModalEdit('${v.id}')` : `openReceiveModal('${v.id}', true)`}"><i class="bi ${editing ? 'bi-floppy' : 'bi-pencil-square'}"></i><span>${editing ? 'Salvar alterações' : 'Editar'}</span></button></div>
        <div class="col-12 col-md"><button id="receiveCloseBtn" type="button" class="btn btn-outline-secondary w-100" onclick="closeReceiveModal()"><i class="bi bi-x-lg"></i><span>Fechar</span></button></div>
        <div class="col-12 col-md"><button id="receiveRemoveBtn" type="button" class="btn btn-outline-danger w-100" onclick="receiveRemover('${v.id}')"><i class="bi bi-trash3"></i><span>Remover registro</span></button></div>
      </div>
    </div>`

  // Elimina instâncias/backdrops antigos deixados por tentativas anteriores.
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('padding-right');
  document.body.style.removeProperty('overflow');

  if (window.bootstrap?.Modal) {
    const old = window.bootstrap.Modal.getInstance(modal);
    if (old) old.dispose();
    const instance = new window.bootstrap.Modal(modal, { backdrop: 'static', keyboard: false, focus: true });
    instance.show();
  } else {
    modal.classList.add('show');
    modal.style.display = 'block';
  }
}

function calcReceiveModalEdit() {
  const valor = moneyNum($('receiveEditValor')?.value || '0');
  const juros = taxaNum($('receiveEditJuros')?.value || '0');
  const jurosValor = Math.max(0, valor * juros / 100);
  const total = Math.max(0, valor + jurosValor);
  if ($('receiveEditJurosReceber')) $('receiveEditJurosReceber').textContent = money(jurosValor);
  if ($('receiveEditTotal')) $('receiveEditTotal').textContent = money(total);
}

function saveReceiveModalEdit(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;

  const cliente = upper($('receiveEditCliente')?.value || '');
  const valor = moneyNum($('receiveEditValor')?.value || '0');
  const juros = taxaNum($('receiveEditJuros')?.value || '0');
  const dataFinal = $('receiveEditDataFinal')?.value || '';
  const observacao = upper($('receiveEditObs')?.value || '');

  if (!cliente) { toast('INFORME O CLIENTE'); return; }
  if (valor <= 0) { toast('INFORME O VALOR'); return; }
  if (!dataFinal) { toast('INFORME O VENCIMENTO'); return; }

  const total = Math.max(0, valor + (valor * juros / 100));
  const c = clienteByName(cliente);

  v.cliente = cliente;
  v.clienteId = c?.id || v.clienteId || '';
  v.telefone = c?.telefone || v.telefone || '';
  v.cpf = c?.cpf || v.cpf || '';
  v.valor = valor;
  v.juros = juros;
  v.total = total;
  // Mantém o valor base atualizado para quando o botão ABRIR for usado no Histórico.
  v.valorOriginal = valor;
  v.totalOriginal = total;
  v.principalRecebido = 0;
  v.parcialRecebido = 0;
  v.jurosRecebidos = 0;
  v.dataFinal = dataFinal;
  v.observacao = observacao;
  v.editadoEm = new Date().toISOString();

  save();
  renderAll();
  toast('ALTERAÇÕES SALVAS');
  openReceiveModal(id, false);
}
function receiveQuitado(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  if (Number(v.valorOriginal || 0) <= 0) v.valorOriginal = originalLoanValue(v);
  if (Number(v.totalOriginal || 0) <= 0) v.totalOriginal = originalLoanTotal(v);
  const anterior=JSON.parse(JSON.stringify(v));
  v.status = 'PAGO';
  v.ultimoRecebimento = 'QUITADO';
  valleAudit('QUITAR_VALE','vale',v,{old_data:anterior,new_data:v});
  save(); closeReceiveModal(); renderAll(); toast('VALE MARCADO COMO QUITADO');
}

function addDaysToDate(dateStr, daysToAdd) {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (Number.isNaN(base.getTime())) return inputDate(new Date());
  base.setDate(base.getDate() + daysToAdd);
  return inputDate(base);
}

let partialPaymentValeId = null;

function showReceiveParcialField(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) {
    toast('VALE NÃO ENCONTRADO');
    return;
  }

  partialPaymentValeId = id;
  const receiveModalEl = $('receiveModal');

  // O Bootstrap mantém uma trava de foco no modal aberto. Por isso, fechamos
  // corretamente o modal de recebimento antes de abrir o pagamento parcial.
  // Sem isso, o campo e os botões do pagamento parcial podem não responder.
  if (window.bootstrap?.Modal && receiveModalEl) {
    const instance = window.bootstrap.Modal.getInstance(receiveModalEl);
    if (instance) {
      const abrirQuandoFechar = () => {
        receiveModalEl.removeEventListener('hidden.bs.modal', abrirQuandoFechar);
        openPartialPaymentModal(id);
      };
      receiveModalEl.addEventListener('hidden.bs.modal', abrirQuandoFechar, { once: true });
      instance.hide();
      return;
    }
  }

  closeReceiveModal();
  openPartialPaymentModal(id);
}

function openPartialPaymentModal(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  const modal = $('partialPaymentModal');
  const body = $('partialPaymentBody');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="partial-payment-head">
      <div>
        <small>PAGAMENTO PARCIAL</small>
        <h3>${h(v.cliente)}</h3>
      </div>
      <div class="partial-payment-total">
        <span>TOTAL ATUAL</span>
        <strong>${money(loanTotalBalance(v))}</strong>
      </div>
    </div>

    <div class="partial-payment-form">
      <label for="receiveParcialValor">VALOR RECEBIDO</label>
      <input id="receiveParcialValor" type="text" inputmode="decimal" placeholder="R$ 0,00" oninput="maskMoneyInput(this)" onblur="formatMoneyInput(this)">

      <label for="receiveParcialObs">OBSERVAÇÃO <span>(OPCIONAL)</span></label>
      <textarea id="receiveParcialObs" rows="3" placeholder="Ex: pagou uma parte hoje..."></textarea>
    </div>

    <div class="partial-payment-actions">
      <button type="button" class="btn btn-outline-secondary" onclick="cancelReceiveParcial()">
        <i class="bi bi-x-lg me-1"></i>CANCELAR
      </button>
      <button type="button" class="btn btn-success" onclick="receiveParcial('${v.id}')">
        <i class="bi bi-check2-circle me-1"></i>CONFIRMAR PAGAMENTO
      </button>
    </div>`;

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('partial-payment-open');
  setTimeout(() => $('receiveParcialValor')?.focus(), 80);
}

function cancelReceiveParcial() {
  const id = partialPaymentValeId;
  closePartialPaymentModal();
  if (id) setTimeout(() => openReceiveModal(id, false), 80);
}

function closePartialPaymentModal() {
  const modal = $('partialPaymentModal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('partial-payment-open');
}

function receiveSoJuros(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  if (Number(v.valorOriginal || 0) <= 0) v.valorOriginal = originalLoanValue(v);
  if (Number(v.totalOriginal || 0) <= 0) v.totalOriginal = originalLoanTotal(v);
  const juros = loanInterest(v);
  v.jurosRecebidos = Number(v.jurosRecebidos || 0) + juros;
  v.dataFinal = addDaysToDate(v.dataFinal, 30);
  v.ultimoRecebimento = 'SÓ JUROS';
  v.status = 'ABERTO';

  // Registra na OBS do Novo Vale quando for recebido somente o juros.
  // Formato: DATA - PAGO JUROS R$ VALOR | SÓ JUROS
  // Cada novo registro entra em uma nova linha.
  const dataPagamento = brDate(inputDate(new Date()));
  const novoRegistroObs = `${dataPagamento} - PAGO JUROS ${money(juros)} | SÓ JUROS`;
  const observacaoAtual = String(v.observacao || '').trim();
  v.observacao = observacaoAtual ? `${observacaoAtual}\n${novoRegistroObs}` : novoRegistroObs;

  valleAudit('PAGAMENTO_JUROS','vale',v,{new_data:v,valor_pago:juros});
  save(); closeReceiveModal(); renderAll(); toast('JUROS REGISTRADO E VENCIMENTO ADIADO POR MAIS 30 DIAS');
}

function receiveParcial(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  if (Number(v.valorOriginal || 0) <= 0) v.valorOriginal = originalLoanValue(v);
  if (Number(v.totalOriginal || 0) <= 0) v.totalOriginal = originalLoanTotal(v);

  const input = $('receiveParcialValor');
  const valorDigitado = moneyNum(input ? input.value : '0');
  if (!valorDigitado || valorDigitado <= 0) {
    toast('VALOR INVÁLIDO');
    if (input) input.focus();
    return;
  }

  const totalAtual = loanTotalBalance(v);
  const valorRecebido = Math.min(valorDigitado, totalAtual);
  const principalAtual = loanPrincipalBalance(v);
  const jurosAtual = Math.max(0, totalAtual - principalAtual);

  // REGRA DO PAGAMENTO PARCIAL:
  // 1º abate o valor emprestado/principal.
  // 2º somente depois abate o juros.
  const abatidoPrincipal = Math.min(valorRecebido, principalAtual);
  const restantePagamento = Math.max(0, valorRecebido - abatidoPrincipal);
  const abatidoJuros = Math.min(restantePagamento, jurosAtual);

  const novoPrincipal = Math.max(0, principalAtual - abatidoPrincipal);
  const novoJuros = Math.max(0, jurosAtual - abatidoJuros);

  const obs = upper($('receiveParcialObs')?.value || '');
  v.parcialRecebido = Number(v.parcialRecebido || 0) + valorRecebido;
  v.principalRecebido = Number(v.principalRecebido || 0) + abatidoPrincipal;
  v.jurosRecebidos = Number(v.jurosRecebidos || 0) + abatidoJuros;
  // Não altera o valor original do VALLE no vale/modal/novo vale.
  // O abatimento do principal aparece somente no Dashboard.
  v.valor = originalLoanValue(v);
  v.total = originalLoanTotal(v);
  v.ultimoRecebimento = 'PAGAMENTO PARCIAL';

  // Registra o pagamento parcial na OBS do vale, sempre em uma única linha.
  // Formato com observação do pagamento parcial:
  // DATA - PAGO R$ VALOR | OBSERVAÇÃO
  // Cada novo pagamento parcial entra abaixo do anterior.
  const dataPagamento = brDate(inputDate(new Date()));
  let novoRegistroObs = `${dataPagamento} - PAGO ${money(valorRecebido)}`;
  if (obs) novoRegistroObs += ` | ${obs}`;
  const observacaoAtual = String(v.observacao || '').trim();
  v.observacao = observacaoAtual ? `${observacaoAtual}\n${novoRegistroObs}` : novoRegistroObs;


  if (loanTotalBalance(v) <= 0) v.status = 'PAGO';
  else v.status = 'ABERTO';

  valleAudit('PAGAMENTO_PARCIAL','vale',v,{new_data:v,valor_pago:valorRecebido,saldo_anterior:totalAtual,saldo_novo:loanTotalBalance(v),description:`Pagamento parcial de ${money(valorRecebido)} no Vale #${v.numero||v.id}. Saldo: ${money(totalAtual)} → ${money(loanTotalBalance(v))}.`});
  save();
  closePartialPaymentModal();
  partialPaymentValeId = null;
  closeReceiveModal();
  renderAll();
  toast('PAGAMENTO PARCIAL REGISTRADO');
}

function receiveNaoPagou(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  v.status = 'ABERTO';
  v.ultimoRecebimento = 'NÃO PAGOU';
  valleAudit('NAO_PAGOU','vale',v,{new_data:v});
  save(); closeReceiveModal(); renderAll(); toast('VALE CONTINUA EM ABERTO');
}

function receiveListaNegra(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  v.listaNegra = true;
  const c = clienteById(v.clienteId) || clienteByName(v.cliente);
  if (c && !String(c.obs || '').includes('LISTA NEGRA')) c.obs = String(c.obs || '').trim() + (c.obs ? ' | ' : '') + 'LISTA NEGRA';
  valleAudit('LISTA_NEGRA','cliente',c||v,{new_data:c||v});
  save(); closeReceiveModal(); renderAll(); toast('CLIENTE ADICIONADO À LISTA NEGRA');
}

function receiveRemover(id) {
  closeReceiveModal();
  deleteLoan(id);
}

/**
 * Abre o discador do celular para ligar para o cliente.
 */
function callClient(id) { const c = clienteById(id); const n = whatsNumber(c?.telefone); if (!n) { toast('SEM TELEFONE'); return; } location.href = 'tel:+' + n; }
/**
 * Abre uma conversa do WhatsApp com o cliente.
 */
function openWhatsClient(id) { const c = clienteById(id); const n = whatsNumber(c?.telefone); if (!n) { toast('SEM TELEFONE'); return; } window.open(`https://wa.me/${n}`, '_blank'); }

/**
 * Abre a conversa do WhatsApp usando os dados do vale/notificação.
 */
function openWhatsLoan(id) {
  const v = db.vales.find(x => x.id === id);
  if (!v) return;
  const c = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
  const n = whatsNumber(v.telefone || c.telefone);
  if (!n) { toast('CLIENTE SEM TELEFONE'); return; }
  const msg = encodeURIComponent(`Olá ${v.cliente || ''}`.trim());
  window.open(`https://wa.me/${n}?text=${msg}`, '_blank');
}
/**
 * Cria o círculo com a primeira letra do nome do cliente.
 */
function avatar(c) { return `<div class="avatar">${h((c?.nome || '?').slice(0, 1))}</div>`; }


/**
 * Monta a lista de clientes na tela, aplicando a pesquisa digitada.
 */
function clienteStatsByIdSafe() {
  const map = {};
  (db.clientes || []).forEach(c => {
    if (!c.id) c.id = 'C' + Date.now() + Math.random().toString(16).slice(2);
    map[c.id] = {
      id: c.id,
      nome: c.nome || 'SEM NOME',
      telefone: c.telefone || '',
      cpf: c.cpf || '',
      obs: c.obs || '',
      vip: !!c.vip,
      qtd: 0,
      pagos: 0,
      abertos: 0,
      atrasados: 0,
      totalEmprestado: 0,
      abertoValor: 0,
      jurosRecebidos: 0,
      ultimoPagamento: '',
      maiorAtraso: 0
    };
  });

  const hoje = inputDate(new Date());
  (db.vales || []).forEach(v => {
    const c = clienteById(v.clienteId) || clienteByName(v.cliente);
    if (!c) return;
    const st = map[c.id];
    if (!st) return;
    st.qtd++;
    st.totalEmprestado += originalLoanValue(v);
    st.jurosRecebidos += Number(v.jurosRecebidos || 0);
    const pago = String(v.status || '').toUpperCase() === 'PAGO';
    if (pago) {
      st.pagos++;
      const obsDates = String(v.observacao || '').match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/g) || [];
      const last = obsDates.map(d => d.includes('/') ? d.split('/').reverse().join('-') : d).sort().pop() || String(v.editadoEm || v.dataFinal || '').slice(0,10);
      if (last && (!st.ultimoPagamento || last > st.ultimoPagamento)) st.ultimoPagamento = last;
    } else {
      st.abertos++;
      st.abertoValor += loanTotalBalance(v);
      const venc = String(v.dataFinal || '').slice(0,10);
      if (venc && venc < hoje) {
        st.atrasados++;
        st.maiorAtraso = Math.max(st.maiorAtraso, days(venc, hoje));
      }
    }
  });

  Object.values(map).forEach(st => {
    let score = 100;
    score -= st.atrasados * 35;
    score -= Math.min(25, Math.floor(st.maiorAtraso / 3) * 5);
    if (!st.qtd) score = 70;
    score = Math.max(0, Math.min(100, score));
    st.score = score;
    if (score >= 95 && st.atrasados === 0 && st.qtd > 0) { st.label = 'EXCELENTE PAGADOR'; st.classe = 'excelente'; st.stars = '★★★★★'; }
    else if (score >= 82) { st.label = 'BOM PAGADOR'; st.classe = 'bom'; st.stars = '★★★★☆'; }
    else if (score >= 65) { st.label = st.qtd ? 'REGULAR' : 'SEM HISTÓRICO'; st.classe = 'regular'; st.stars = st.qtd ? '★★★☆☆' : '☆☆☆☆☆'; }
    else if (score >= 45) { st.label = 'ATENÇÃO'; st.classe = 'atencao'; st.stars = '★★☆☆☆'; }
    else { st.label = 'ALTO RISCO'; st.classe = 'risco'; st.stars = '★☆☆☆☆'; }
  });
  return map;
}

/**
 * Monta a lista de clientes na tela, aplicando a pesquisa digitada.
 * Versão corrigida: usa somente clientes cadastrados para garantir que
 * os botões USAR, EDITAR, WHATSAPP, LIGAR, VIP e EXCLUIR funcionem.
 */
function renderClients() {
  const q = upper($('searchClientes')?.value || '').trim();
  const container = $('clientesContainer');
  if (!container) return;

  const stats = clienteStatsByIdSafe();
  const arr = (db.clientes || [])
    .map(c => ({...stats[c.id], ...c, ...(stats[c.id] || {})}))
    .filter(c => [c.nome, c.telefone, c.cpf, c.obs, c.label].join(' ').toUpperCase().includes(q))
    .sort((a,b) => Number(b.vip)-Number(a.vip) || Number(b.abertoValor||0)-Number(a.abertoValor||0) || String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));

  container.className = 'clientes-bootstrap-list';
  container.innerHTML = arr.length ? arr.map(c => {
    const id = String(c.id || '').replace(/'/g,"\\'");
    const scoreClass = c.classe || 'regular';
    const tel = c.telefone || 'SEM TELEFONE';
    const cpf = c.cpf || 'NÃO INFORMADO';
    const ultimoPg = c.ultimoPagamento ? brDate(c.ultimoPagamento) : 'SEM PAGAMENTO';
    const obs = c.obs || '';
    const inicial = h((c.nome || '?').trim().slice(0,1));
    const statusMap = {
      excelente: {badge:'success', icon:'bi-shield-check'},
      bom: {badge:'primary', icon:'bi-hand-thumbs-up'},
      regular: {badge:'warning', icon:'bi-dash-circle'},
      atencao: {badge:'warning', icon:'bi-exclamation-triangle'},
      risco: {badge:'danger', icon:'bi-exclamation-octagon'}
    };
    const status = statusMap[scoreClass] || statusMap.regular;
    return `
      <article class="card cliente-bs-card border-${status.badge} border-start border-4 shadow-sm">
        <div class="card-body p-3">
          <div class="d-flex flex-column flex-md-row align-items-md-start justify-content-between gap-2 pb-2 border-bottom">
            <div class="d-flex align-items-start gap-2 min-w-0">
              <div class="cliente-bs-avatar bg-primary-subtle text-primary border border-primary-subtle">${inicial}</div>
              <div class="min-w-0">
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <h3 class="h5 mb-0 text-break">${h(c.nome || 'SEM NOME')}</h3>
                  ${c.vip ? '<span class="badge text-bg-warning"><i class="bi bi-star-fill me-1"></i>VIP</span>' : ''}
                </div>
                <div class="cliente-bs-contact text-body-secondary mt-1 d-flex flex-wrap gap-2 gap-md-3">
                  <span><i class="bi bi-telephone me-1"></i>${h(tel)}</span>
                  <span><i class="bi bi-person-vcard me-1"></i>CPF: ${h(cpf)}</span>
                </div>
              </div>
            </div>
            <div class="cliente-bs-status badge text-bg-${status.badge} align-self-start">
              <i class="bi ${status.icon} me-1"></i>${h(c.label || 'SEM HISTÓRICO')}
            </div>
          </div>

          <div class="row g-2 py-2">
            <div class="col-6 col-xl-3"><div class="cliente-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-receipt me-1"></i>VALES</small><strong class="d-block mt-1">${Number(c.qtd || 0)}</strong></div></div>
            <div class="col-6 col-xl-3"><div class="cliente-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-cash-stack me-1"></i>TOTAL EMPRESTADO</small><strong class="d-block mt-1">${money(c.totalEmprestado || 0)}</strong></div></div>
            <div class="col-6 col-xl-3"><div class="cliente-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-wallet2 me-1"></i>EM ABERTO</small><strong class="d-block mt-1">${money(c.abertoValor || 0)}</strong></div></div>
            <div class="col-6 col-xl-3"><div class="cliente-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-calendar-check me-1"></i>ÚLTIMO PAGAMENTO</small><strong class="d-block mt-1">${h(ultimoPg)}</strong></div></div>
          </div>

          ${obs ? `<div class="alert alert-secondary py-2 px-3 mb-2"><i class="bi bi-journal-text me-2"></i>${h(obs)}</div>` : ''}

          <div class="d-flex flex-wrap justify-content-end gap-2 pt-0">
            <button type="button" class="btn btn-primary btn-sm" onclick="useClient('${id}')"><i class="bi bi-plus-circle"></i> USAR</button>
            <button type="button" class="btn btn-warning btn-sm" onclick="editClient('${id}')"><i class="bi bi-pencil-square"></i> EDITAR</button>
            <button type="button" class="btn btn-success btn-sm" onclick="openWhatsClient('${id}')"><i class="bi bi-whatsapp"></i> WHATSAPP</button>
            <button type="button" class="btn btn-info btn-sm text-white" onclick="callClient('${id}')"><i class="bi bi-telephone-fill"></i> LIGAR</button>
            <button type="button" class="btn btn-outline-warning btn-sm" onclick="toggleVipClient('${id}')"><i class="bi ${c.vip ? 'bi-star-fill' : 'bi-star'}"></i> VIP</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="deleteClient('${id}')"><i class="bi bi-trash3"></i> EXCLUIR</button>
          </div>
        </div>
      </article>`;
  }).join('') : '<div class="alert alert-secondary text-center mb-0"><i class="bi bi-people me-2"></i>NENHUM CLIENTE ENCONTRADO.</div>';
}



/**
 * Monta a lista do histórico de vales, com botões de editar, imprimir, PDF, WhatsApp, recebido e excluir.
 */
function renderHistory() {
  const q = upper($('searchHistorico')?.value || '');
  const statusFiltro = $('filtroHistoricoStatus') ? $('filtroHistoricoStatus').value : 'TODOS';
  const dataInicio = $('filtroHistoricoInicio') ? $('filtroHistoricoInicio').value : '';
  const dataFim = $('filtroHistoricoFim') ? $('filtroHistoricoFim').value : '';
  const container = $('historicoContainer');
  if (!container) return;

  const today = inputDate(new Date());

  function loanHistoryStatus(v) {
    const pago = String(v.status || '').toUpperCase() === 'PAGO';
    const diff = days(today, v.dataFinal);
    if (pago) return { cls: 'paid', badge: 'RECEBIDO', desc: 'vale quitado' };
    if (diff < 0) {
      const atraso = Math.abs(diff);
      return { cls: 'danger', badge: 'ATRASADO', desc: `${atraso} dia${atraso === 1 ? '' : 's'} de atraso` };
    }
    if (diff === 0) return { cls: 'today', badge: 'VENCE HOJE', desc: 'vence hoje' };
    if (diff === 1) return { cls: 'week', badge: 'PRÓXIMO', desc: 'vence amanhã' };
    return { cls: 'week', badge: 'PRÓXIMO', desc: `vence em ${diff} dias` };
  }

  function inDateRange(v) {
    if (!dataInicio && !dataFim) return true;
    const data = v.dataInicial || String(v.criadoEm || '').slice(0, 10) || v.dataFinal || '';
    const inicioOk = !dataInicio || (data && data >= dataInicio);
    const fimOk = !dataFim || (data && data <= dataFim);
    return inicioOk && fimOk;
  }

  let lista = [...db.vales].filter(v => {
    const c = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
    const st = loanHistoryStatus(v);
    const textoBusca = [
      v.cliente, v.telefone, c.telefone, v.cpf, c.cpf, v.observacao,
      `VALE ${String(v.numero || '').padStart(4, '0')}`,
      st.badge, st.desc
    ].join(' ').toUpperCase();

    const buscaOk = !q || textoBusca.includes(q);
    const statusOk = statusFiltro === 'TODOS'
      || (statusFiltro === 'PAGO' && String(v.status || '').toUpperCase() === 'PAGO')
      || (statusFiltro === 'ATRASADO' && String(v.status || '').toUpperCase() !== 'PAGO' && days(today, v.dataFinal) < 0)
      || (statusFiltro === 'ABERTO' && String(v.status || '').toUpperCase() !== 'PAGO');

    return buscaOk && statusOk && inDateRange(v);
  }).sort((a, b) => {
    const sa = loanHistoryStatus(a);
    const sb = loanHistoryStatus(b);
    const order = { danger: 0, today: 1, week: 2, paid: 3 };
    const oa = order[sa.cls] ?? 9;
    const ob = order[sb.cls] ?? 9;
    if (oa !== ob) return oa - ob;
    return String(a.dataFinal || '').localeCompare(String(b.dataFinal || '')) || String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR');
  });

  container.className = 'historico-loan-list';

  container.innerHTML = lista.length ? lista.map(v => {
    const c = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
    const st = loanHistoryStatus(v);
    const telefone = v.telefone || c.telefone || '';
    const numeroVale = String(v.numero || '').padStart(4, '0');
    const total = v35LoanTotal(v);
    const aberto = String(v.status || '').toUpperCase() === 'PAGO' ? 0 : v35LoanBalance(v);
    const obs = String(v.observacao || '').trim();
    const ultimaObs = obs ? obs.split(/\n+/).map(x => x.trim()).filter(Boolean).slice(-1)[0] : '';

    const statusMap = {
      paid: {badge:'success', icon:'bi-check-circle-fill'},
      danger: {badge:'danger', icon:'bi-exclamation-octagon-fill'},
      today: {badge:'warning', icon:'bi-alarm-fill'},
      week: {badge:'warning', icon:'bi-calendar-event-fill'}
    };
    const status = statusMap[st.cls] || statusMap.week;
    const inicial = h((v.cliente || '?').trim().slice(0,1));

    return `<article class="card historico-bs-card border-${status.badge} border-start border-4 shadow-sm">
      <div class="card-body p-3">
        <div class="d-flex flex-column flex-md-row align-items-md-start justify-content-between gap-2 pb-2 border-bottom">
          <div class="d-flex align-items-start gap-2 min-w-0">
            <div class="historico-bs-avatar bg-primary-subtle text-primary border border-primary-subtle">${inicial}</div>
            <div class="min-w-0">
              <h3 class="h5 mb-0 text-break">${h(v.cliente || 'CLIENTE')}</h3>
              <div class="historico-bs-contact text-body-secondary mt-1 d-flex flex-wrap gap-2 gap-md-3">
                <span><i class="bi bi-telephone me-1"></i>${h(telefone || 'SEM TELEFONE')}</span>
                <span><i class="bi bi-receipt me-1"></i>VALE #${h(numeroVale)}</span>
              </div>
            </div>
          </div>
          <div class="historico-bs-status badge text-bg-${status.badge} align-self-start">
            <i class="bi ${status.icon} me-1"></i>${h(st.badge)}
            <small class="d-block mt-1">${h(st.desc)}</small>
          </div>
        </div>

        <div class="row g-2 py-2">
          <div class="col-6 col-xl-3"><div class="historico-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-hash me-1"></i>Nº DO VALE</small><strong class="d-block mt-1">#${h(numeroVale)}</strong></div></div>
          <div class="col-6 col-xl-3"><div class="historico-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-calendar-check me-1"></i>VENCIMENTO</small><strong class="d-block mt-1">${brDate(v.dataFinal)}</strong></div></div>
          <div class="col-6 col-xl-3"><div class="historico-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-cash-stack me-1"></i>VALOR TOTAL</small><strong class="d-block mt-1">${money(total)}</strong></div></div>
          <div class="col-6 col-xl-3"><div class="historico-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-wallet2 me-1"></i>EM ABERTO</small><strong class="d-block mt-1">${money(aberto)}</strong></div></div>
        </div>

        ${ultimaObs ? `<div class="alert alert-secondary py-2 px-3 mb-2"><i class="bi bi-chat-left-text me-2"></i>${h(ultimaObs)}</div>` : ''}

        <div class="d-flex flex-wrap justify-content-end gap-2 pt-0 historico-bs-actions">
          <button type="button" class="btn btn-success btn-sm" onclick="openWhatsLoan('${v.id}')"><i class="bi bi-whatsapp"></i> WHATSAPP</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="downloadLoanPdf('${v.id}')"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="openReceiveModal('${v.id}')"><i class="bi bi-cash-coin"></i> RECEBER</button>
          <button type="button" class="btn btn-info btn-sm text-white" onclick="abrirValeHistorico('${v.id}')"><i class="bi bi-unlock"></i> ABRIR VALE</button>
          <button type="button" class="btn btn-warning btn-sm" onclick="editLoan('${v.id}')"><i class="bi bi-pencil-square"></i> EDITAR</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="deleteLoan('${v.id}')"><i class="bi bi-trash3"></i> EXCLUIR</button>
        </div>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state">Nenhum vale encontrado no histórico.</div>';
}

function openWhatsHistoryClient(key) {
  const c = (typeof v35ClienteStats === 'function' ? v35ClienteStats() : []).find(x => String(x.key).toUpperCase() === String(key).toUpperCase());
  const n = whatsNumber(c?.telefone || '');
  if (!n) { toast('CLIENTE SEM TELEFONE'); return; }
  window.open(`https://wa.me/${n}`, '_blank');
}

/**
 * Calcula e mostra todos os valores do Dashboard: caixa, emprestado, juros, recebido e vencimentos.
 */
function renderDashboard() {
  const vales = db.vales;
  const aberto = vales.filter(v => v.status !== 'PAGO');
  const pagos = vales.filter(v => v.status === 'PAGO');
  const today = inputDate(new Date());
  const week = new Date();
  week.setDate(week.getDate() + 7);
  const weekS = inputDate(week);

  const capitalInvestido = Number(db.settings.capitalInvestido || 0);
  const percentualJuros50 = Number(db.settings.percentualJuros50 || 50);

  // LÓGICA PRINCIPAL DO DASHBOARD:
  // Valor emprestado = soma somente dos vales EM ABERTO.
  // Caixa = capital investido - valor emprestado.
  // Total de juros = total a pagar - principal, somente dos vales em aberto.
  const valorEmprestado = aberto.reduce((s, v) => s + loanPrincipalBalance(v), 0);
  const totalJuros = aberto.reduce((s, v) => s + loanInterest(v), 0);
  // Juros configurável = percentual salvo aplicado em cima do VALOR EMPRESTADO EM ABERTO.
  // Exemplo: aberto R$100,00 e percentual 30% => juros configurável R$30,00.
  const jurosPercentual = valorEmprestado * (percentualJuros50 / 100);
  const totalComJuros = valorEmprestado + totalJuros;
  const totalComJurosPercentual = valorEmprestado + jurosPercentual;
  const valorEmCaixa = capitalInvestido - valorEmprestado;
  // Total recebido mostra apenas o JUROS dos vales pagos.
  // Exemplo: emprestou R$100 e recebeu R$130 => entra só R$30.
  const jurosRecebidosAvulsos = vales.reduce((s, v) => s + Number(v.jurosRecebidos || 0), 0);
  const totalRecebido = jurosRecebidosAvulsos + pagos.reduce((s, v) => {
    if (Number(v.jurosRecebidos || 0) > 0) return s;
    return s + Math.max(0, originalLoanTotal(v) - originalLoanValue(v));
  }, 0);
  const rentabilidade = capitalInvestido > 0 ? (totalJuros / capitalInvestido) * 100 : 0;

  // Mantém a aba Configuração sincronizada sem atrapalhar o usuário enquanto digita.
  if ($('configCapitalInvestido') && document.activeElement !== $('configCapitalInvestido')) $('configCapitalInvestido').value = money(capitalInvestido);
  if ($('configPercentualJuros') && document.activeElement !== $('configPercentualJuros')) $('configPercentualJuros').value = String(percentualJuros50).replace('.', ',') + '%';
  if ($('configTaxaAtrasoDiario') && document.activeElement !== $('configTaxaAtrasoDiario')) {
    const taxaAtraso = Number(db.settings.taxaAtrasoDiario || 0);
    $('configTaxaAtrasoDiario').value = db.settings.tipoTaxaAtrasoDiario === 'reais' ? money(taxaAtraso) : String(taxaAtraso).replace('.', ',') + '%';
  }
  if ($('configTipoTaxaAtrasoDiario') && document.activeElement !== $('configTipoTaxaAtrasoDiario')) $('configTipoTaxaAtrasoDiario').value = db.settings.tipoTaxaAtrasoDiario || 'percentual';

  // Atualiza os cards principais do Dashboard.
  if ($('dashCaixa')) $('dashCaixa').textContent = money(valorEmCaixa);
  if ($('dashInvestido')) $('dashInvestido').textContent = money(capitalInvestido);
  if ($('dashEmprestado')) $('dashEmprestado').textContent = money(valorEmprestado);
  if ($('dashReceber')) $('dashReceber').textContent = money(totalComJuros);
  if ($('dashTotalJuros')) $('dashTotalJuros').textContent = money(totalJuros);
  if ($('dashJurosPercentual')) $('dashJurosPercentual').textContent = money(jurosPercentual);
  if ($('dashTotalJurosPercentual')) $('dashTotalJurosPercentual').textContent = money(totalComJurosPercentual);
  if ($('dashRecebido')) $('dashRecebido').textContent = money(totalRecebido);
  if ($('dashClientes')) $('dashClientes').textContent = db.clientes.length;
  if ($('dashPctLabel')) $('dashPctLabel').textContent = String(percentualJuros50).replace('.', ',') + '%';
  if ($('dashAtualizacao')) {
    const agora = new Date();
    $('dashAtualizacao').textContent = `${brDate(inputDate(agora))} às ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  }

  // Contador da aba Notificações.
  const vencidosLista = aberto.filter(v => v.dataFinal < today);
  const hojeLista = aberto.filter(v => v.dataFinal === today);
  const semanaLista = aberto.filter(v => v.dataFinal >= today && v.dataFinal <= weekS);
  if ($('notifCount')) {
    const qtdNotif = vencidosLista.length + hojeLista.length + semanaLista.length;
    $('notifCount').textContent = qtdNotif > 99 ? '99+' : qtdNotif;
    $('notifCount').style.display = qtdNotif ? 'inline-flex' : 'none';
  }

  // Gráfico estilo rosca com a distribuição entre caixa, emprestado e a receber.
  if ($('capitalChart')) {
    const base = Math.max(capitalInvestido, valorEmprestado + totalComJuros, 1);
    const pctCaixa = Math.max(0, Math.min(100, (valorEmCaixa / base) * 100));
    const pctEmprestado = Math.max(0, Math.min(100, (valorEmprestado / base) * 100));
    const pctReceber = Math.max(0, Math.min(100, (totalComJuros / base) * 100));
    const totalGeral = Math.max(0, valorEmCaixa) + valorEmprestado + totalComJuros;
    const pctCaixaTotal = totalGeral > 0 ? (Math.max(0, valorEmCaixa) / totalGeral) * 100 : 0;
    const pctEmprestadoTotal = totalGeral > 0 ? (valorEmprestado / totalGeral) * 100 : 0;
    const pctReceberTotal = totalGeral > 0 ? (totalComJuros / totalGeral) * 100 : 0;

    $('capitalChart').innerHTML = `
      <div class="donut-pro-wrap">
        <div class="donut-pro" style="--caixa:${pctCaixaTotal};--emprestado:${pctEmprestadoTotal};--receber:${pctReceberTotal}">
          <div><span>Total geral</span><strong>${money(totalGeral)}</strong></div>
        </div>
        <div class="donut-legend-pro">
          <div><i class="leg-caixa"></i><span>Em caixa</span><strong>${money(valorEmCaixa)}</strong><em>${pctCaixa.toFixed(1).replace('.', ',')}%</em></div>
          <div><i class="leg-emprestado"></i><span>VALLE</span><strong>${money(valorEmprestado)}</strong><em>${pctEmprestado.toFixed(1).replace('.', ',')}%</em></div>
          <div><i class="leg-receber"></i><span>A receber c/ juros</span><strong>${money(totalComJuros)}</strong><em>${pctReceber.toFixed(1).replace('.', ',')}%</em></div>
          <div><i class="leg-capital"></i><span>Total do capital</span><strong>${money(capitalInvestido)}</strong><em>100%</em></div>
        </div>
      </div>`;
  }

  // Tabela dos últimos vales no Dashboard.
  if ($('ultimosVales')) {
    const ultimos = [...db.vales].sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''))).slice(0, 5);
    $('ultimosVales').innerHTML = ultimos.length ? `
      <div class="loan-row loan-head"><span>Cliente</span><span>Valor</span><span>Vencimento</span><span>Status</span></div>
      ${ultimos.map(v => {
        const st = loanStatus(v);
        const txt = v.status === 'PAGO' ? 'Pago' : st === 'atrasado' ? 'Atrasado' : (v.dataFinal === today ? 'Vence hoje' : 'Em aberto');
        const c = clienteById(v.clienteId) || clienteByName(v.cliente) || { nome: v.cliente };
        return `<div class="loan-row">
          <span class="loan-client">${avatar(c)}<b>${h(v.cliente)}</b><small>${h(v.telefone || c.telefone || '')}</small></span>
          <span>${money(v.valor)}</span>
          <span>${brDate(v.dataFinal)}</span>
          <span><em class="status ${st}">${txt}</em></span>
        </div>`;
      }).join('')}` : '<p class="empty-dashboard">Nenhum vale cadastrado ainda.</p>';
  }
}

/**
 * Salva o capital investido da sessão. O juros é configurado individualmente
 * no painel Administrar usuário de serviço.
 */
function saveDashboardConfig() {
  db.settings.capitalInvestido = moneyNum($('configCapitalInvestido')?.value || '0');
  save();
  renderAll();
  toast('CONFIGURAÇÃO SALVA');
}

/**
 * Calcula e mostra relatórios: cliente que mais pegou, maior devedor, total em aberto e recebido.
 */
function relClienteStats() {
  const today = inputDate(new Date());
  const map = {};
  db.vales.forEach(v => {
    const key = String(v.cliente || 'SEM NOME').trim().toUpperCase() || 'SEM NOME';
    const c = clienteById(v.clienteId) || clienteByName(v.cliente) || { nome: v.cliente, telefone: v.telefone, cpf: v.cpf };
    if (!map[key]) {
      map[key] = {
        key,
        nome: v.cliente || c.nome || 'SEM NOME',
        telefone: v.telefone || c.telefone || '',
        cpf: v.cpf || c.cpf || '',
        vales: [],
        qtd: 0,
        total: 0,
        aberto: 0,
        recebido: 0,
        jurosRecebidos: 0,
        atrasados: 0,
        pagos: 0,
        pagosAtrasados: 0,
        emDia: 0,
        ultimoVale: '',
        ultimaObs: ''
      };
    }
    const o = map[key];
    o.vales.push(v);
    o.qtd++;
    o.total += originalLoanTotal(v);
    o.jurosRecebidos += Number(v.jurosRecebidos || 0);
    const saldo = v.status === 'PAGO' ? 0 : loanTotalBalance(v);
    o.aberto += saldo;
    if (v.status === 'PAGO') {
      o.pagos++;
      o.recebido += originalLoanTotal(v);
      const dataPg = String(v.editadoEm || v.criadoEm || '').slice(0, 10);
      if (dataPg && v.dataFinal && dataPg > v.dataFinal) o.pagosAtrasados++;
      else o.emDia++;
    } else if (v.dataFinal && v.dataFinal < today) {
      o.atrasados++;
    }
    const dt = String(v.criadoEm || v.dataInicial || '');
    if (!o.ultimoVale || dt > o.ultimoVale) o.ultimoVale = dt;
    const obs = String(v.observacao || '').split(/\n+/).map(x => x.trim()).filter(Boolean).slice(-1)[0];
    if (obs) o.ultimaObs = obs;
  });

  return Object.values(map).map(o => {
    const base = Math.max(1, o.qtd);
    const taxaPago = Math.round((o.pagos / base) * 100);
    const taxaPontual = o.pagos ? Math.round(((o.pagos - o.pagosAtrasados) / o.pagos) * 100) : (o.atrasados ? 0 : 100);
    let score = 100;
    score -= o.atrasados * 30;
    score -= o.pagosAtrasados * 15;
    if (o.aberto > 0 && o.pagos === 0 && o.qtd >= 2) score -= 15;
    score = Math.max(0, Math.min(100, score));
    let classe = 'good', label = 'BOM PAGADOR', motivo = 'Histórico saudável e sem atraso relevante.';
    if (score < 55 || o.atrasados >= 2) {
      classe = 'bad'; label = 'CLIENTE DE RISCO'; motivo = 'Possui atraso aberto ou histórico ruim de pagamento.';
    } else if (score < 80 || o.atrasados === 1 || o.pagosAtrasados > 0) {
      classe = 'medium'; label = 'PAGADOR COM ATENÇÃO'; motivo = 'Tem atraso ou pagamento fora do prazo.';
    }
    return { ...o, taxaPago, taxaPontual, score, classe, label, motivo };
  }).sort((a, b) => b.aberto - a.aberto || b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function relBadgeClass(classe) {
  return classe === 'good' ? 'good' : classe === 'medium' ? 'medium' : 'bad';
}

/**
 * Calcula e mostra relatórios profissionais: carteira, ranking, risco e histórico por cliente.
 */
function renderReports() {
  if (!$('relDividas')) return;

  const aberto = db.vales.filter(v => v.status !== 'PAGO');
  const pagos = db.vales.filter(v => v.status === 'PAGO');
  const arrAll = relClienteStats();
  const q = upper($('relSearchCliente')?.value || '').trim();
  const arr = q ? arrAll.filter(x => [x.nome, x.telefone, x.cpf].join(' ').toUpperCase().includes(q)) : arrAll;

  const top = [...arrAll].sort((a, b) => b.qtd - a.qtd || b.total - a.total)[0];
  const dev = [...arrAll].sort((a, b) => b.aberto - a.aberto)[0];
  const totalAberto = aberto.reduce((s, v) => s + loanTotalBalance(v), 0);
  const jurosRecebidos = db.vales.reduce((s, v) => s + Number(v.jurosRecebidos || 0), 0);
  const recebido = pagos.reduce((s, v) => s + originalLoanTotal(v), 0) + jurosRecebidos;
  const risco = arrAll.filter(x => x.classe === 'bad' || x.atrasados > 0).length;

  if ($('relTopCliente')) $('relTopCliente').textContent = top ? `${top.nome} (${top.qtd})` : '-';
  if ($('relMaiorDevedor')) $('relMaiorDevedor').textContent = dev ? `${dev.nome} ${money(dev.aberto)}` : '-';
  if ($('relAberto')) $('relAberto').textContent = money(totalAberto);
  if ($('relRecebido')) $('relRecebido').textContent = money(recebido);
  if ($('relJurosRecebidos')) $('relJurosRecebidos').textContent = money(jurosRecebidos);
  if ($('relClientesRisco')) $('relClientesRisco').textContent = risco;

  $('relDividas').innerHTML = arr.length ? arr.map(x => {
    const iniciais = String(x.nome || 'C').trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
    const last = x.ultimoVale ? brDate(String(x.ultimoVale).slice(0,10)) : '-';
    const obs = x.ultimaObs ? h(x.ultimaObs) : 'SEM OBSERVAÇÃO.';
    return `<article class="rel-client-card ${relBadgeClass(x.classe)}">
      <div class="rel-client-main">
        <div class="rel-avatar">${h(iniciais || 'C')}</div>
        <div>
          <div class="rel-client-title"><h4>${h(x.nome)}</h4><span class="rel-score ${relBadgeClass(x.classe)}">${h(x.label)}</span></div>
          <p>${h(x.telefone || 'SEM TELEFONE')} ${x.cpf ? '• CPF ' + h(x.cpf) : ''}</p>
          <small>${h(x.motivo)}</small>
        </div>
      </div>
      <div class="rel-client-metrics">
        <div><span>Vales</span><strong>${x.qtd}</strong></div>
        <div><span>Aberto</span><strong>${money(x.aberto)}</strong></div>
        <div><span>Recebido</span><strong>${money(x.recebido + x.jurosRecebidos)}</strong></div>
        <div><span>Atrasados</span><strong>${x.atrasados}</strong></div>
        <div><span>Pontualidade</span><strong>${x.taxaPontual}%</strong></div>
        <div><span>Último vale</span><strong>${last}</strong></div>
      </div>
      <div class="rel-client-foot">
        <p>📝 ${obs}</p>
        <button type="button" onclick="openClientReport('${h(x.key)}')">VER HISTÓRICO</button>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state">Nenhum cliente encontrado no relatório.</div>';
}

function openClientReport(key) {
  const x = relClienteStats().find(c => c.key === String(key).toUpperCase());
  if (!x) return toast('CLIENTE NÃO ENCONTRADO');
  let modal = $('clientReportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'clientReportModal';
    modal.className = 'client-report-modal';
    document.body.appendChild(modal);
  }
  const rows = [...x.vales].sort((a,b)=>String(b.criadoEm || b.dataInicial || '').localeCompare(String(a.criadoEm || a.dataInicial || ''))).map(v => {
    const st = loanStatus(v);
    const txt = v.status === 'PAGO' ? 'PAGO' : st === 'atrasado' ? 'ATRASADO' : 'ABERTO';
    const saldo = v.status === 'PAGO' ? 0 : loanTotalBalance(v);
    const obsLines = String(v.observacao || '').split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const timeline = obsLines.length ? obsLines.map(l=>`<li>${h(l)}</li>`).join('') : '<li>SEM OBSERVAÇÃO.</li>';
    return `<div class="client-history-row ${st}">
      <div><b>VALE Nº ${String(v.numero).padStart(4,'0')}</b><span class="status ${st}">${txt}</span></div>
      <p>EMPRÉSTIMO: <strong>${money(originalLoanValue(v))}</strong> • TOTAL: <strong>${money(originalLoanTotal(v))}</strong> • SALDO: <strong>${money(saldo)}</strong></p>
      <p>INÍCIO: ${brDate(v.dataInicial)} • VENCIMENTO: ${brDate(v.dataFinal)} • JUROS: ${String(v.juros).replace('.', ',')}%</p>
      <ul>${timeline}</ul>
      <div class="client-history-actions">
        <button onclick="closeClientReport(); openReceiveModal('${v.id}')">RECEBER</button>
        <button onclick="closeClientReport(); openPdfPreviewById('${v.id}')">PDF</button>
        <button onclick="closeClientReport(); openWhatsLoan('${v.id}')">WHATSAPP</button>
      </div>
    </div>`;
  }).join('');
  modal.innerHTML = `<div class="client-report-card">
    <button class="client-report-close" onclick="closeClientReport()">×</button>
    <div class="client-report-head">
      <div><h2>${h(x.nome)}</h2><p>${h(x.telefone || 'SEM TELEFONE')} ${x.cpf ? '• CPF ' + h(x.cpf) : ''}</p></div>
      <span class="rel-score ${relBadgeClass(x.classe)}">${h(x.label)}</span>
    </div>
    <div class="client-report-summary">
      <div><span>Score</span><strong>${x.score}/100</strong></div>
      <div><span>Vales</span><strong>${x.qtd}</strong></div>
      <div><span>Em aberto</span><strong>${money(x.aberto)}</strong></div>
      <div><span>Recebido</span><strong>${money(x.recebido + x.jurosRecebidos)}</strong></div>
      <div><span>Atrasados</span><strong>${x.atrasados}</strong></div>
      <div><span>Pontualidade</span><strong>${x.taxaPontual}%</strong></div>
    </div>
    <h3>Histórico completo do cliente</h3>
    <div class="client-history-list">${rows}</div>
  </div>`;
  modal.classList.add('show');
}

function closeClientReport() {
  const modal = $('clientReportModal');
  if (modal) modal.classList.remove('show');
}

/**
 * Atualiza todas as áreas visuais do sistema de uma vez.
 */

/**
 * Monta a aba Notificações no estilo WhatsApp.
 * Ela mostra somente cobranças que precisam de atenção: atrasadas, vencendo hoje e próximas 7 dias.
 */
function renderNotifications() {
  if (!$('notificacoesContainer')) return;

  const today = inputDate(new Date());
  const abertos = db.vales.filter(v => v.status !== 'PAGO');
  const notificacoes = abertos
    .map(v => ({ ...v, diasRestantes: days(today, v.dataFinal) }))
    .filter(v => v.diasRestantes <= 7)
    .sort((a, b) => {
      if (a.diasRestantes !== b.diasRestantes) return a.diasRestantes - b.diasRestantes;
      return String(a.cliente).localeCompare(String(b.cliente));
    });

  const atrasados = notificacoes.filter(v => v.diasRestantes < 0);
  const hoje = notificacoes.filter(v => v.diasRestantes === 0);
  const semana = notificacoes.filter(v => v.diasRestantes > 0);
  if ($('notificacoesResumo')) {
    $('notificacoesResumo').innerHTML = notificacoes.length ? `
      <span class="notif-chip danger">🔴 ${atrasados.length} ATRASADO${atrasados.length === 1 ? '' : 'S'}</span>
      <span class="notif-chip warn">🟠 ${hoje.length} HOJE</span>
      <span class="notif-chip week">🟡 ${semana.length} PRÓXIMOS</span>` :
      '<span class="notif-chip ok">✅ NENHUMA COBRANÇA URGENTE</span>';
  }

  if ($('notifCount')) {
    $('notifCount').textContent = notificacoes.length > 99 ? '99+' : notificacoes.length;
    $('notifCount').style.display = notificacoes.length ? 'inline-flex' : 'none';
  }
  if ($('notifHeaderCount')) {
    $('notifHeaderCount').textContent = notificacoes.length > 99 ? '99+' : notificacoes.length;
    $('notifHeaderCount').style.display = notificacoes.length ? 'inline-flex' : 'none';
  }

  if (!notificacoes.length) {
    $('notificacoesContainer').innerHTML = `
      <div class="whatsapp-empty card">
        <div class="wa-icon">✅</div>
        <h3>Tudo certo por aqui</h3>
        <p>Não existem vales atrasados ou próximos do vencimento.</p>
      </div>`;
    return;
  }

  $('notificacoesContainer').innerHTML = notificacoes.map(v => {
    const c = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
    const dias = Number(v.diasRestantes || 0);
    const telefone = v.telefone || c.telefone || '';
    let alertaTxt = `VENCE EM ${dias} DIAS`;
    let statusClass = 'week';

    if (dias < 0) {
      const atraso = Math.abs(dias);
      alertaTxt = `ATRASADO • ${atraso} DIA${atraso === 1 ? '' : 'S'}`;
      statusClass = 'danger';
    } else if (dias === 0) {
      alertaTxt = 'VENCE HOJE';
      statusClass = 'today';
    } else if (dias === 1) {
      alertaTxt = 'VENCE AMANHÃ';
      statusClass = 'week';
    }

    const obs = String(v.observacao || '').trim();
    const ultimaObs = obs ? obs.split(/\n+/).map(x => x.trim()).filter(Boolean).slice(-1)[0] : 'SEM OBSERVAÇÃO.';
    const numeroVale = String(v.numero || '').padStart(4, '0');

    return `<div class="notif-line-card ${statusClass}">
      <div class="notif-line-head">
        <div class="notif-title-wrap">
          <span class="notif-main-icon">👤</span>
          <h3>${h(v.cliente)}</h3>
        </div>
        <span class="notif-status ${statusClass}"><span>⏱</span>${h(alertaTxt)}</span>
      </div>

      <div class="notif-info-row">
        <div class="notif-info-item vale"><span class="notif-info-icon">📄</span><div><b>VALE Nº ${h(numeroVale)}</b></div></div>
        <div class="notif-info-item"><span class="notif-info-icon money">💰</span><div><small>EMPRÉSTIMO</small><b>${money(v.valor)}</b></div></div>
        <div class="notif-info-item"><span class="notif-info-icon total">💵</span><div><small>TOTAL + ATRASO</small><b>${money(loanTotalBalance(v))}</b></div></div>
        <div class="notif-info-item"><span class="notif-info-icon date">🗓️</span><div><small>VENCIMENTO</small><b>${brDate(v.dataFinal)}</b></div></div>
      </div>

      <div class="notif-obs-line">
        <span>💬</span>
        <p>${h(ultimaObs)}</p>
      </div>

      <div class="notif-line-actions btn-group" role="group" aria-label="Ações da notificação">
        <button type="button" class="btn btn-success whats" onclick="openWhatsLoan('${v.id}')"><i class="bi bi-whatsapp"></i><span>WHATSAPP</span></button>
        <button type="button" class="btn btn-danger pdf" onclick="downloadLoanPdf('${v.id}')"><i class="bi bi-file-earmark-pdf-fill"></i><span>PDF</span></button>
        <button type="button" class="btn btn-primary receber" onclick="togglePaid('${v.id}')"><i class="bi bi-cash-coin"></i><span>RECEBER</span></button>
      </div>
    </div>`;
  }).join('');
}

function renderClientOptions() {
  const dl = $('clientesLista');
  if (!dl) return;
  const clientes = [...db.clientes].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  dl.innerHTML = clientes.map(c => `<option value="${h(c.nome)}">${h(c.telefone || c.cpf || '')}</option>`).join('');
}

function safeRender(fn, name) {
  try {
    if (typeof fn === 'function') fn();
  } catch (e) {
    console.error('Erro ao renderizar ' + name + ':', e);
  }
}

function renderAll() {
  const active = document.querySelector('.screen.active')?.id || 'dashboard';

  // Sempre atualiza o Dashboard primeiro para evitar tela inicial incompleta.
  safeRender(renderClientOptions, 'opções de clientes');
  safeRender(renderDashboard, 'dashboard');

  // Notificações atualizam contadores usados no menu e no Dashboard.
  safeRender(renderNotifications, 'notificações');

  // Renderiza a aba ativa imediatamente e adia telas pesadas que não estão abertas.
  if (active === 'clientes') safeRender(renderClients, 'clientes');
  if (active === 'historico') safeRender(renderHistory, 'histórico');
  if (active === 'relatorios') safeRender(renderReports, 'relatórios');
  if (active === 'calendario') safeRender(renderCalendario, 'calendário');

  const renderExtras = () => {
    if (active !== 'clientes') safeRender(renderClients, 'clientes');
    if (active !== 'historico') safeRender(renderHistory, 'histórico');
    if (active !== 'relatorios') safeRender(renderReports, 'relatórios');
    if (active !== 'calendario') safeRender(renderCalendario, 'calendário');
    safeRender(renderCobranca, 'cobrança');
    safeRender(renderGlobalSearchResults, 'busca global');
  };

  if (typeof requestIdleCallback === 'function') requestIdleCallback(renderExtras, { timeout: 300 });
  else setTimeout(renderExtras, 0);
}

/**
 * Limpa textos para colocar dentro do PDF manual sem quebrar a estrutura do arquivo.
 */
function pdfEscape(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

/** Retorna o usuário autenticado e o instante exato em que o PDF foi gerado. */
function pdfGeneratedByInfo() {
  const profile = window.ValleCloud?.profile || null;
  let cachedProfile = null;

  // Fallback para a sessão já salva localmente pelo próprio ValleCloud.
  if (!profile) {
    try {
      const authKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
      const authData = authKey ? JSON.parse(localStorage.getItem(authKey) || '{}') : null;
      const userId = authData?.user?.id || authData?.currentSession?.user?.id || '';
      if (userId) cachedProfile = JSON.parse(localStorage.getItem(`profile_${userId}`) || 'null');
    } catch (_) {}
  }

  const source = profile || cachedProfile || window.usuarioLogado || window.currentUser || {};
  const nome = String(
    source.name || source.nome || source.full_name || source.user_name ||
    source.email || 'USUARIO NAO IDENTIFICADO'
  ).trim();
  const agora = new Date();

  return {
    nome,
    data: agora.toLocaleDateString('pt-BR'),
    hora: agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
    texto: `Gerado por: ${nome} - ${agora.toLocaleDateString('pt-BR')} as ${agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`
  };
}
/**
 * Gera o PDF profissional do vale usando comandos internos do formato PDF.
 */
function makePdf(v) {
  const W = 595, H = 842, ops = [];
  const rgb = h => [0, 2, 4].map(i => parseInt(h.replace('#', '').slice(i, i + 2), 16) / 255).join(' ');
  const fill = h => ops.push(rgb(h) + ' rg');
  const stroke = h => ops.push(rgb(h) + ' RG');
  const txt = (t, x, y, s = 11, b = 0, color = '#111827') => {
    fill(color);
    ops.push(`BT /${b ? 'F2' : 'F1'} ${s} Tf ${x} ${y} Td (${pdfEscape(t)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2, color = '#111827', w = 1) => {
    stroke(color);
    ops.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const rect = (x, y, w, h, fillHex = null, strokeHex = '#111827', lw = 1) => {
    stroke(strokeHex);
    ops.push(`${lw} w`);
    if (fillHex) {
      fill(fillHex);
      ops.push(`${x} ${y} ${w} ${h} re B`);
    } else {
      ops.push(`${x} ${y} ${w} ${h} re S`);
    }
  };
  const dot = (x1, y1, x2, y2, color = '#9ca3af') => {
    stroke(color);
    ops.push(`1 w [2 4] 0 d ${x1} ${y1} m ${x2} ${y2} l S [] 0 d`);
  };
  const clean = t => String(t || '').toUpperCase();
  const prazo = days(v.dataInicial, v.dataFinal);
  const numero = String(v.numero || '').padStart(4, '0');
  const cliente = clean(v.cliente || 'NAO INFORMADO');
  const telefone = clean(v.telefone || 'NAO INFORMADO');
  const cpf = clean(v.cpf || 'NAO INFORMADO');
  const obs = clean(v.observacao || 'NENHUMA');

  // Fundo e moldura principal
  rect(28, 28, W - 56, H - 56, '#ffffff', '#d1d5db', 1.2);
  rect(42, 42, W - 84, H - 84, null, '#0f3b78', 1.4);

  // Cabeçalho
  txt('VALE', 62, 744, 56, 1, '#0b2f63');
  rect(260, 758, 112, 44, '#1d5fbf', '#1d5fbf', 1);
  txt(`${prazo} DIAS`, 282, 773, 19, 1, '#ffffff');
  txt('COMPROVANTE DE EMPRESTIMO', 64, 725, 16, 1, '#4b5563');
  txt('VALE No ' + numero, 438, 782, 12, 1, '#0b2f63');
  txt('CONFIANCA E COMPROMISSO', 405, 760, 9, 1, '#0b2f63');
  line(58, 707, W - 58, 707, '#0b2f63', 2);

  // Dados do cliente
  // O PDF puro não quebra texto sozinho. Por isso esta rotina calcula uma largura
  // conservadora, reduz a fonte e, se necessário, divide o nome em duas linhas.
  const textWidth = (texto, size) => String(texto || '').length * size * 0.72;

  const fitText = (texto, x, y, maxW, maxSize, minSize, bold = 1, color = '#111827') => {
    texto = String(texto || '');
    let size = maxSize;
    while (size > minSize && textWidth(texto, size) > maxW) size -= 1;
    txt(texto, x, y, size, bold, color);
  };

  const quebrarNomePdf = (texto, maxW, maxSize = 22, minSize = 13) => {
    texto = String(texto || 'NAO INFORMADO').replace(/\s+/g, ' ').trim();

    for (let size = maxSize; size >= minSize; size--) {
      if (textWidth(texto, size) <= maxW) return { linhas: [texto], size };
    }

    const palavras = texto.split(' ').filter(Boolean);
    for (let size = maxSize; size >= minSize; size--) {
      let melhor = null;
      let melhorLargura = Infinity;

      for (let i = 1; i < palavras.length; i++) {
        const l1 = palavras.slice(0, i).join(' ');
        const l2 = palavras.slice(i).join(' ');
        const largura = Math.max(textWidth(l1, size), textWidth(l2, size));

        if (largura < melhorLargura) {
          melhor = [l1, l2];
          melhorLargura = largura;
        }
      }

      if (melhor && melhorLargura <= maxW) return { linhas: melhor, size };
    }

    const meio = Math.ceil(palavras.length / 2);
    return { linhas: [palavras.slice(0, meio).join(' '), palavras.slice(meio).join(' ')], size: minSize };
  };

  txt('CLIENTE', 70, 665, 11, 1, '#0b2f63');

  const nomePdf = quebrarNomePdf(cliente, W - 140, 22, 13);
  nomePdf.linhas.forEach((linha, i) => {
    txt(linha, 70, 638 - (i * (nomePdf.size + 6)), nomePdf.size, 1, '#111827');
  });

  // Telefone e CPF descem de acordo com a quantidade de linhas do nome.
  const contatoY = 638 - (nomePdf.linhas.length * (nomePdf.size + 6)) - 8;

  txt('TELEFONE / WHATSAPP', 70, contatoY, 10, 1, '#166534');
  fitText(telefone || 'NAO INFORMADO', 70, contatoY - 17, 230, 15, 10, 1, '#111827');

  txt('CPF', 330, contatoY, 10, 1, '#64748b');
  fitText(cpf || 'NAO INFORMADO', 360, contatoY - 17, 160, 12, 9, 1, '#111827');

  const linhaSeparadoraY = contatoY - 37;
  dot(58, linhaSeparadoraY, W - 58, linhaSeparadoraY);

  // Cartões de valores descem automaticamente se o nome ocupar duas linhas.
  const cy = linhaSeparadoraY - 100, ch = 92;
  rect(62, cy, 150, ch, '#f0f7ff', '#93c5fd', 1);
  txt('VALOR DO', 82, cy + 61, 12, 1, '#0b3b78');
  txt('EMPRESTIMO', 82, cy + 44, 12, 1, '#0b3b78');
  dot(82, cy + 28, 192, cy + 28, '#6b7280');
  txt(money(v.valor), 82, cy + 13, 25, 1, '#0b3b78');

  rect(232, cy, 170, ch, '#f0fdf4', '#86efac', 1);
  txt('TOTAL A PAGAR', 254, cy + 55, 13, 1, '#166534');
  dot(254, cy + 28, 380, cy + 28, '#6b7280');
  txt(money(loanTotalBalance(v)), 254, cy + 13, 25, 1, '#166534');

  rect(422, cy, 112, ch, '#fffbeb', '#fde68a', 1);
  txt('TAXA DE', 446, cy + 61, 12, 1, '#854d0e');
  txt('JUROS', 446, cy + 44, 12, 1, '#854d0e');
  dot(446, cy + 28, 510, cy + 28, '#6b7280');
  txt(String(v.juros).replace('.', ',') + '%', 462, cy + 13, 24, 1, '#854d0e');

  // Status
  rect(62, 410, W - 124, 42, '#faf5ff', '#c084fc', 1);
  txt('STATUS', 84, 435, 11, 1, '#6b21a8');
  txt(v.status || 'ABERTO', 84, 416, 19, 1, '#6b21a8');

  // Datas
  rect(62, 330, W - 124, 58, '#f8fbff', '#bfdbfe', 1);
  txt('DATA INICIAL', 84, 362, 11, 1, '#0b3b78');
  txt(brDate(v.dataInicial), 84, 340, 20, 1, '#111827');
  line(W / 2, 340, W / 2, 374, '#94a3b8', .8);
  txt('DATA FINAL', 330, 362, 11, 1, '#0b3b78');
  txt(brDate(v.dataFinal), 330, 340, 20, 1, '#dc2626');

  // Observação
  rect(62, 220, W - 124, 86, '#ffffff', '#d1d5db', 1);
  txt('OBSERVACAO', 84, 284, 11, 1, '#4b5563');

  // Mantém as quebras de linha da observação no PDF.
  // Também corrige registros antigos que ficaram colados, exemplo:
  // "PAGO R$30,0004/07/2026" ou "PAGO R$50,00OBS".
  const prepararObsPdf = (valor, maxChars = 70, maxLines = 5) => {
    let texto = String(valor || 'NENHUMA')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .toUpperCase()
      .replace(/(R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})(?=\d{2}\/\d{2}\/\d{4}\s*-\s*PAGO)/g, '$1\n')
      .replace(/(PAGO\s+R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})(?=[A-Z])/g, '$1\n');

    const linhas = [];
    texto.split('\n').forEach(parte => {
      parte = parte.trim();
      if (!parte) {
        if (linhas.length && linhas[linhas.length - 1] !== '') linhas.push('');
        return;
      }
      while (parte.length > maxChars) {
        let corte = parte.lastIndexOf(' ', maxChars);
        if (corte < 22) corte = maxChars;
        linhas.push(parte.slice(0, corte).trim());
        parte = parte.slice(corte).trim();
      }
      linhas.push(parte);
    });
    return (linhas.length ? linhas : ['NENHUMA']).slice(0, maxLines);
  };

  const obsLinhas = prepararObsPdf(obs);
  obsLinhas.forEach((linha, i) => txt(linha || ' ', 84, 262 - (i * 14), 10, i === 0 ? 1 : 0, '#111827'));
  dot(84, 252, W - 86, 252);
  dot(84, 226, W - 86, 226);

  // Assinatura
  rect(62, 116, W - 124, 74, '#ffffff', '#d1d5db', 1);
  txt('ASSINATURA DO CLIENTE', 84, 166, 11, 1, '#4b5563');
  line(122, 132, W - 122, 132, '#111827', 1.1);

  // Rodapé: nome do usuário autenticado, data e hora, em uma única linha.
  line(58, 88, W - 58, 88, '#0b2f63', 2);
  const infoGeracaoPdf = pdfGeneratedByInfo();
  const textoGeracaoPdf = infoGeracaoPdf.texto;
  let tamanhoRodapePdf = 9;
  while (textWidth(textoGeracaoPdf, tamanhoRodapePdf) > (W - 164) && tamanhoRodapePdf > 6.5) tamanhoRodapePdf -= 0.25;
  txt(textoGeracaoPdf, 82, 62, tamanhoRodapePdf, 0, '#334155');
  txt('VALE No ' + numero, 418, 62, 13, 1, '#0b2f63');

  const stream = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n', pos = [0];
  objs.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i < pos.length; i++) pdf += String(pos[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Cria o nome do arquivo PDF com número do vale e nome do cliente.
 */
function pdfName(v) { return `VALE-${String(v.numero).padStart(4, '0')}-${pdfEscape(v.cliente).replace(/\s+/g, '-')}.pdf`; }
/**
 * Força o download de um arquivo Blob, usado para PDF e backup.
 */
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
/**
 * Abre uma pré-visualização do PDF antes de baixar.
 * Todos os botões PDF do sistema chamam esta função.
 */
let pdfPreviewUrl = null;
let pdfPreviewBlob = null;
let pdfPreviewName = '';

function updatePdfPreviewFit() {
  const body = document.querySelector('.pdf-preview-body');
  const page = document.getElementById('pdfPreviewPage');
  if (!body || !page) return;

  const isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  const availableW = Math.max(280, body.clientWidth - (isMobile ? 20 : 28));
  const finalW = isMobile ? availableW : Math.min(760, availableW);

  body.style.setProperty('display', 'flex', 'important');
  body.style.setProperty('justify-content', 'center', 'important');
  body.style.setProperty('align-items', 'flex-start', 'important');
  body.style.setProperty('overflow', 'auto', 'important');

  page.style.setProperty('width', finalW + 'px', 'important');
  page.style.setProperty('max-width', '100%', 'important');
  page.style.setProperty('height', 'auto', 'important');
  page.style.setProperty('margin-left', 'auto', 'important');
  page.style.setProperty('margin-right', 'auto', 'important');
  page.style.setProperty('position', 'relative', 'important');
  page.style.setProperty('left', 'auto', 'important');
  page.style.setProperty('transform', 'none', 'important');

  fitPdfPreviewValueTexts(page);
}

function fitPdfPreviewValueTexts(root) {
  const area = root || document;
  const canvas = fitPdfPreviewValueTexts._canvas || (fitPdfPreviewValueTexts._canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');

  area.querySelectorAll('.pdf-box strong[data-fit-value]').forEach(el => {
    const box = el.closest('.pdf-box');
    if (!box) return;

    const isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    const isSmallMobile = window.matchMedia && window.matchMedia('(max-width: 430px)').matches;
    const isTax = box.classList.contains('yellow');

    // Tamanho bonito: não fica pequeno demais, mas reduz quando o valor cresce.
    const maxSize = isTax ? (isSmallMobile ? 26 : isMobile ? 28 : 30) : (isSmallMobile ? 24 : isMobile ? 26 : 28);
    const minSize = isSmallMobile ? 13 : isMobile ? 14 : 15;

    el.style.setProperty('display', 'block', 'important');
    el.style.setProperty('width', '100%', 'important');
    el.style.setProperty('max-width', '100%', 'important');
    el.style.setProperty('white-space', 'nowrap', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('text-overflow', 'clip', 'important');
    el.style.setProperty('line-height', '1', 'important');
    el.style.setProperty('letter-spacing', '-0.02em', 'important');
    el.style.setProperty('text-align', 'center', 'important');

    const style = getComputedStyle(box);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const limit = Math.max(40, box.clientWidth - padLeft - padRight - 6);

    let size = maxSize;
    while (size > minSize) {
      ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
      if (ctx.measureText(el.textContent.trim()).width <= limit) break;
      size -= 0.5;
    }

    el.style.setProperty('font-size', size + 'px', 'important');
  });
}

function pdfPreviewMoney(value) {
  try { return money(Number(value || 0)); } catch (e) { return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`; }
}

function pdfPreviewDate(value) {
  try { return brDate(value); } catch (e) { return dataBR ? dataBR(value) : String(value || ''); }
}

function pdfPreviewSafe(value) {
  return String(value || '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

function buildPdfPreviewHtml(v) {
  const numero = String(v.numero || '').padStart(4, '0');
  const total = typeof loanTotalBalance === 'function' ? loanTotalBalance(v) : (Number(v.total || 0) || Number(v.valor || 0));
  const juros = String(v.juros || 0).replace('.', ',') + '%';
  const cliente = pdfPreviewSafe(v.cliente || 'CLIENTE');
  const tel = pdfPreviewSafe(v.telefone || v.whatsapp || 'NAO INFORMADO');
  const cpf = pdfPreviewSafe(v.cpf || 'NAO INFORMADO');
  const obs = pdfPreviewSafe((v.observacao || 'NENHUMA').toString().toUpperCase());
  const status = pdfPreviewSafe((v.status || 'ABERTO').toString().toUpperCase());

  return `
    <section class="pdf-html-page">
      <header class="pdf-html-top">
        <div>
          <div class="pdf-html-title">VALE</div>
          <div class="pdf-html-subtitle">COMPROVANTE DE EMPRÉSTIMO</div>
        </div>
        <div class="pdf-html-days">30 DIAS</div>
        <div class="pdf-html-num">VALE Nº ${numero}<br><span>CONFIANÇA E COMPROMISSO</span></div>
      </header>

      <div class="pdf-html-line"></div>

      <div class="pdf-html-client">
        <small>CLIENTE</small>
        <strong>${cliente}</strong>
      </div>

      <div class="pdf-html-two">
        <div><small>TELEFONE / WHATSAPP</small><strong>${tel}</strong></div>
        <div><small>CPF</small><strong>${cpf}</strong></div>
      </div>

      <div class="pdf-html-values">
        <div class="pdf-box blue"><small>VALOR DO<br>EMPRÉSTIMO</small><strong data-fit-value>${pdfPreviewMoney(v.valor)}</strong></div>
        <div class="pdf-box green"><small>TOTAL A PAGAR</small><strong data-fit-value>${pdfPreviewMoney(total)}</strong></div>
        <div class="pdf-box yellow"><small>TAXA DE<br>JUROS</small><strong data-fit-value>${juros}</strong></div>
      </div>

      <div class="pdf-html-status"><small>STATUS</small><strong>${status}</strong></div>

      <div class="pdf-html-dates">
        <div><small>DATA INICIAL</small><strong>${pdfPreviewDate(v.dataInicial)}</strong></div>
        <div><small>DATA FINAL</small><strong>${pdfPreviewDate(v.dataFinal)}</strong></div>
      </div>

      <div class="pdf-html-obs"><small>OBSERVAÇÃO</small><p>${obs}</p></div>
      <div class="pdf-html-sign"><small>ASSINATURA DO CLIENTE</small><div></div></div>

      <footer class="pdf-html-footer">
        <span>${pdfPreviewSafe(pdfGeneratedByInfo().texto)}</span>
        <strong>VALE Nº ${numero}</strong>
      </footer>
    </section>`;
}

window.addEventListener('resize', () => {
  const modal = document.getElementById('pdfPreviewOverlay');
  if (modal && modal.classList.contains('show')) updatePdfPreviewFit();
});

function ensurePdfPreviewModal() {
  let modal = document.getElementById('pdfPreviewOverlay');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'pdfPreviewOverlay';
  modal.className = 'pdf-preview-overlay';
  modal.innerHTML = `
    <div class="pdf-preview-modal card border-0 shadow-lg bootstrap-only-ui" role="dialog" aria-modal="true" aria-labelledby="pdfPreviewTitle">
      <div class="pdf-preview-head card-header d-flex align-items-center gap-3">
        <span class="pdf-preview-head-icon d-inline-flex align-items-center justify-content-center flex-shrink-0" aria-hidden="true">
          <i class="bi bi-file-earmark-pdf-fill"></i>
        </span>
        <div class="pdf-preview-head-copy flex-grow-1 min-w-0">
          <h3 id="pdfPreviewTitle" class="mb-1">PRÉ-VISUALIZAÇÃO DO VALE</h3>
          <small id="pdfPreviewSub">CONFIRA O DOCUMENTO ANTES DE BAIXAR OU IMPRIMIR</small>
        </div>
        <span class="badge pdf-preview-head-badge d-none d-sm-inline-flex align-items-center gap-2 rounded-pill">
          <i class="bi bi-receipt"></i> VALE
        </span>
        <button type="button" class="btn btn-outline-light pdf-preview-close d-inline-flex align-items-center justify-content-center" id="pdfPreviewCloseBtn" aria-label="Fechar">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="pdf-preview-body card-body">
        <div id="pdfPreviewPage" class="pdf-preview-page" aria-label="Pré-visualização visual do vale"></div>
        <iframe id="pdfPreviewFrame" class="pdf-preview-print-frame" title="Arquivo PDF para impressão"></iframe>
      </div>
      <div class="pdf-preview-actions card-footer d-flex justify-content-end gap-2 flex-wrap">
        <button type="button" class="btn btn-primary pdf-preview-print" id="pdfPreviewPrintBtn"><i class="bi bi-printer-fill me-1"></i>IMPRIMIR</button>
        <button type="button" class="btn btn-danger pdf-preview-download" id="pdfPreviewDownloadBtn"><i class="bi bi-file-earmark-arrow-down-fill me-1"></i>BAIXAR PDF</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => closePdfPreview();
  document.getElementById('pdfPreviewCloseBtn').onclick = close;
  document.getElementById('pdfPreviewDownloadBtn').onclick = () => {
    if (pdfPreviewBlob && pdfPreviewName) downloadBlob(pdfPreviewBlob, pdfPreviewName);
  };
  document.getElementById('pdfPreviewPrintBtn').onclick = () => {
    const frame = document.getElementById('pdfPreviewFrame');
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      if (pdfPreviewUrl) window.open(pdfPreviewUrl, '_blank');
    }
  };

  // Não fecha ao clicar fora: o usuário usa apenas os botões.
  return modal;
}

function closePdfPreview() {
  const modal = document.getElementById('pdfPreviewOverlay');
  const frame = document.getElementById('pdfPreviewFrame');
  if (modal) modal.classList.remove('show');
  const page = document.getElementById('pdfPreviewPage');
  if (page) page.innerHTML = '';
  if (frame) {
    frame.removeAttribute('src');
  }
  if (pdfPreviewUrl) {
    URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl = null;
  }
  pdfPreviewBlob = null;
  pdfPreviewName = '';
}

function openPdfPreview(v) {
  if (!v) return;
  const modal = ensurePdfPreviewModal();
  const frame = document.getElementById('pdfPreviewFrame');
  const page = document.getElementById('pdfPreviewPage');
  const sub = document.getElementById('pdfPreviewSub');

  if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
  pdfPreviewBlob = makePdf(v);
  pdfPreviewName = pdfName(v);
  pdfPreviewUrl = URL.createObjectURL(pdfPreviewBlob);

  if (sub) sub.textContent = `${String(v.numero).padStart(4, '0')} • ${v.cliente || 'CLIENTE'}`;
  if (page) {
    page.innerHTML = buildPdfPreviewHtml(v);
    requestAnimationFrame(() => fitPdfPreviewValueTexts(page));
  }

  // Mantém o PDF real carregado apenas para o botão imprimir.
  if (frame) frame.src = pdfPreviewUrl + '#toolbar=0&navpanes=0&scrollbar=0';

  modal.classList.add('show');
  requestAnimationFrame(updatePdfPreviewFit);
  setTimeout(updatePdfPreviewFit, 250);
}

/**
 * Abre a pré-visualização do PDF de um vale específico.
 */
function downloadLoanPdf(id) { const v = db.vales.find(x => x.id === id); if (v) openPdfPreview(v); }
function openPdfPreviewById(id) { return downloadLoanPdf(id); }
/**
 * Busca um vale pelo ID e chama a função de impressão.
 */
/**
 * Abre uma janela de impressão com o vale em formato imprimível.
 */
function printLoanById(id) { const v = db.vales.find(x => x.id === id); if (v) printLoan(v); }

function printLoan(v) {
  const w = window.open('', '_blank', 'width=420,height=650');
  if (!w) { toast('PERMITA POP-UPS PARA IMPRIMIR'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Vale</title><style>@page{size:A6;margin:8mm}*{box-sizing:border-box;font-family:Arial;text-transform:uppercase}body{margin:0}.vale{border:2px solid #111;border-radius:10px;padding:14px}.top{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}h1{font-size:38px;margin:0}.line{margin:10px 0}.rot{font-size:11px;font-weight:bold;color:#555}.val{font-size:18px;font-weight:bold;border-bottom:1px solid #999;padding:5px 0}.duo{display:grid;grid-template-columns:1fr 1fr;gap:12px}.obs{min-height:55px;white-space:pre-line}.ass{margin-top:34px;text-align:center;border-top:1px solid #111;padding-top:8px;font-weight:bold}</style></head><body onload="print();setTimeout(()=>close(),600)"><div class="vale"><div class="top"><h1>VALE</h1><b>${days(v.dataInicial, v.dataFinal)} DIAS</b></div><div class="line"><div class="rot">Cliente</div><div class="val">${h(v.cliente)}</div></div><div class="line"><div class="rot">CPF / Telefone</div><div class="val">${h((v.cpf || '') + ' ' + (v.telefone || ''))}</div></div><div class="duo"><div class="line"><div class="rot">Valor</div><div class="val">${money(v.valor)}</div></div><div class="line"><div class="rot">Total</div><div class="val">${money(loanTotalBalance(v))}</div></div></div><div class="duo"><div class="line"><div class="rot">Juros</div><div class="val">${String(v.juros).replace('.', ',')}%</div></div><div class="line"><div class="rot">Vale Nº</div><div class="val">${String(v.numero).padStart(4, '0')}</div></div></div><div class="duo"><div class="line"><div class="rot">Data inicial</div><div class="val">${brDate(v.dataInicial)}</div></div><div class="line"><div class="rot">Data final</div><div class="val">${brDate(v.dataFinal)}</div></div></div><div class="line"><div class="rot">Observação</div><div class="val obs">${h(v.observacao || 'NENHUMA')}</div></div><div class="ass">ASSINATURA DO CLIENTE</div></div></body></html>`);
  w.document.close();
}

/**
 * Gera o PDF e tenta compartilhar pelo recurso nativo do celular; se não der, baixa o PDF e abre WhatsApp.
 */
async function sharePdf(v) {
  const c = clienteByName(v.cliente);
  const fone = whatsNumber(v.telefone || c?.telefone);
  const blob = makePdf(v);
  const file = new File([blob], pdfName(v), { type: 'application/pdf' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'VALE DE EMPRÉSTIMO' });
      toast('ESCOLHA O WHATSAPP');
    } else {
      downloadBlob(blob, pdfName(v));
      if (fone) window.open(`https://wa.me/${fone}`, '_blank');
      toast('PDF BAIXADO. ANEXE NO WHATSAPP');
    }
  } catch (e) { toast('ENVIO CANCELADO'); }
}
/**
 * Compartilha o PDF de um vale existente no histórico.
 */
function sharePdfById(id) { const v = db.vales.find(x => x.id === id); if (v) sharePdf(v); }

/**
 * Baixa todos os dados do sistema em arquivo JSON.
 */
function backupJson() { downloadBlob(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), 'backup-valle-pro.json'); }
/**
 * Restaura os dados do sistema a partir de um arquivo JSON de backup.
 */
function restore(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { db = normalizeDb(JSON.parse(r.result)); save(); renderAll(); updateAutoBackupInfo(); toast('BACKUP RESTAURADO'); } catch (err) { toast('ARQUIVO INVÁLIDO'); } finally { e.target.value = ''; } };
  r.readAsText(f);
}
/**
 * Apaga todos os dados salvos após confirmação.
 */
async function wipe() {
  const ok = await appConfirm('Esta ação apaga clientes, vales e configurações salvas neste navegador.', {
    title: 'Apagar todos os dados?',
    icon: '⚠️',
    confirmText: 'Apagar',
    cancelText: 'Cancelar'
  });
  if (!ok) return;
  db = seed(); save(); clearLoan(); renderAll(); updateAutoBackupInfo();
}

/**
 * Inicializa o sistema: normaliza dados, aplica tema, configura eventos dos botões e renderiza a tela.
 */
function init() {
  db = normalizeDb(db); save(); applyTheme(); clearLoan(); renderAll();
  document.querySelectorAll('.tab').forEach(b => b.onclick = async (event) => {
    const targetScreen = b.dataset.screen;
    const activeScreen = document.querySelector('.screen.active')?.id;

    // Ao sair do Novo VALLE por qualquer aba, protege os dados não salvos.
    if (activeScreen === 'emprestimo' && targetScreen !== 'emprestimo') {
      event?.preventDefault();
      await confirmLoanBeforeLeave(() => {
        if (targetScreen === 'clientes') {
          clearClient();
          switchScreen('clientes');
        } else {
          switchScreen(targetScreen);
        }
      });
      return;
    }

    if (targetScreen === 'emprestimo') openNewLoan();
    else if (targetScreen === 'clientes') { clearClient(); switchScreen('clientes'); }
    else switchScreen(targetScreen);
  });

  // Clicar fora do card Novo VALLE também é tratado como tentativa de saída.
  document.addEventListener('click', async event => {
    if (document.querySelector('.screen.active')?.id !== 'emprestimo') return;
    if (!loanFormHasChanges() || loanLeavePromptOpen) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#emprestimo .loan-bootstrap-card')) return;
    if (target.closest('.tab, #loanUnsavedDialog, .client-unsaved-dialog')) return;

    event.preventDefault();
    event.stopPropagation();
    await confirmLoanBeforeLeave(() => switchScreen('historico'));
  }, true);
  if ($('themeBtn')) $('themeBtn').onclick = () => { window.ValleUserTheme?.toggle(); };
  if ($('configCapitalInvestido')) {
    $('configCapitalInvestido').onfocus = e => {
      const n = moneyNum(e.target.value);
      e.target.value = n ? String(n).replace('.', ',') : '';
      setTimeout(() => e.target.select(), 0);
    };
    $('configCapitalInvestido').oninput = e => {
      // Permite apagar e digitar livremente. A formatação só acontece ao sair do campo.
      e.target.value = e.target.value.replace(/[^0-9,\.]/g, '');
    };
    $('configCapitalInvestido').onblur = e => {
      e.target.value = money(moneyNum(e.target.value));
    };
  }
  if ($('configPercentualJuros')) $('configPercentualJuros').onblur = e => { e.target.value = String(taxaNum(e.target.value)).replace('.', ',') + '%'; };
  if ($('configTaxaAtrasoDiario')) $('configTaxaAtrasoDiario').onblur = e => {
    const tipo = $('configTipoTaxaAtrasoDiario')?.value === 'reais' ? 'reais' : 'percentual';
    e.target.value = tipo === 'reais' ? money(moneyNum(e.target.value)) : String(taxaNum(e.target.value)).replace('.', ',') + '%';
  };
  if ($('configTipoTaxaAtrasoDiario')) $('configTipoTaxaAtrasoDiario').onchange = () => {
    if (!$('configTaxaAtrasoDiario')) return;
    const tipo = $('configTipoTaxaAtrasoDiario').value === 'reais' ? 'reais' : 'percentual';
    $('configTaxaAtrasoDiario').value = tipo === 'reais' ? money(moneyNum($('configTaxaAtrasoDiario').value)) : String(taxaNum($('configTaxaAtrasoDiario').value)).replace('.', ',') + '%';
  };
  if ($('saveConfigBtn')) $('saveConfigBtn').onclick = saveDashboardConfig;
  $('loanValor').onfocus = e => {
    e.target.value = moneyNum(e.target.value) ? String(moneyNum(e.target.value)).replace('.', ',') : '';
    setTimeout(() => e.target.select(), 0);
  };
  $('loanValor').oninput = e => { e.target.value = e.target.value.replace(/[^0-9,\.]/g, ''); calcLoan(); };
  $('loanValor').onblur = e => { e.target.value = money(moneyNum(e.target.value)); calcLoan(); };
  $('loanJuros').oninput = calcLoan;
  $('loanJuros').onblur = e => { e.target.value = String(taxaNum(e.target.value)).replace('.', ',') + '%'; calcLoan(); };
  if ($('loanTipoTaxaDiaria')) $('loanTipoTaxaDiaria').onchange = () => {
    const tipo = $('loanTipoTaxaDiaria').value === 'reais' ? 'reais' : 'percentual';
    $('loanTaxaDiaria').value = tipo === 'reais' ? money(moneyNum($('loanTaxaDiaria').value)) : String(taxaNum($('loanTaxaDiaria').value)).replace('.', ',') + '%';
    updateLoanDailyRateUI();
  };
  if ($('loanTaxaDiaria')) $('loanTaxaDiaria').onblur = e => {
    const tipo = $('loanTipoTaxaDiaria')?.value === 'reais' ? 'reais' : 'percentual';
    e.target.value = tipo === 'reais' ? money(moneyNum(e.target.value)) : String(taxaNum(e.target.value)).replace('.', ',') + '%';
  };
  $('loanInicio').onchange = () => { const d = new Date($('loanInicio').value + 'T00:00:00'); if (!isNaN(d)) { d.setDate(d.getDate() + 30); $('loanFinal').value = inputDate(d); } calcLoan(); };
  $('loanFinal').onchange = calcLoan;
  ['loanCliente', 'loanObs', 'cliNome', 'cliObs'].forEach(id => $(id).oninput = e => { const p = e.target.selectionStart; e.target.value = String(e.target.value || '').toUpperCase(); try { e.target.setSelectionRange(p, p); } catch (_) {} });
  $('cliTelefone').oninput = e => e.target.value = phoneMask(e.target.value);
  $('cliCpf').oninput = e => e.target.value = cpfMask(e.target.value);
  if ($('savePrintBtn')) $('savePrintBtn').onclick = savePrint;
  if ($('sendPdfBtn')) $('sendPdfBtn').onclick = saveSendPdf;
  $('saveOnlyBtn').onclick = saveOnly;
  if ($('clearLoanBtn')) $('clearLoanBtn').onclick = clearLoan;
  if ($('cancelLoanBtn')) $('cancelLoanBtn').onclick = cancelLoan;
  $('saveClientBtn').onclick = saveClient;
  $('clearClientBtn').onclick = cancelClientModal;
  if ($('openClientModalBtn')) $('openClientModalBtn').onclick = () => openClientModal(false);
  if ($('clientModal')) {
    $('clientModal').addEventListener('hide.bs.modal', (event) => {
      if (!clientModalForceClose && clientFormHasChanges()) event.preventDefault();
    });
    $('clientModal').addEventListener('hidden.bs.modal', () => {
      clearClient(false);
      clientModalForceClose = false;
    });
  }
  $('searchClientes').oninput = renderClients;
  $('searchHistorico').oninput = renderHistory;
  if ($('filtroHistoricoStatus')) $('filtroHistoricoStatus').onchange = renderHistory;
  if ($('filtroHistoricoInicio')) $('filtroHistoricoInicio').onchange = renderHistory;
  if ($('filtroHistoricoFim')) $('filtroHistoricoFim').onchange = renderHistory;
  if ($('filtrarHistoricoBtn')) $('filtrarHistoricoBtn').onclick = renderHistory;
  if ($('limparHistoricoFiltrosBtn')) $('limparHistoricoFiltrosBtn').onclick = () => {
    if ($('filtroHistoricoStatus')) $('filtroHistoricoStatus').value = 'TODOS';
    if ($('filtroHistoricoInicio')) $('filtroHistoricoInicio').value = '';
    if ($('filtroHistoricoFim')) $('filtroHistoricoFim').value = '';
    if ($('searchHistorico')) $('searchHistorico').value = '';
    renderHistory();
  };
  $('backupJsonBtn').onclick = backupJson;
  $('restoreInput').onchange = restore;
  $('wipeBtn').onclick = wipe;
  if ($('restoreAutoBtn')) $('restoreAutoBtn').onclick = restoreAutoBackup;
  updateAutoBackupInfo();
  if ($('globalSearch')) $('globalSearch').oninput = renderGlobalSearchResults;
  document.querySelectorAll('.cobranca-filter').forEach(b => b.onclick = () => { document.querySelectorAll('.cobranca-filter').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderCobranca(); });
}


function receiveTimelineHtml(v) {
  const rows = [];
  if (v.criadoEm) rows.push({data: brDate(String(v.criadoEm).slice(0,10)), texto: 'VALE CRIADO'});
  String(v.observacao || '').split(/\n+/).map(x => x.trim()).filter(Boolean).forEach(l => {
    const m = l.match(/^(\d{2}\/\d{2}\/\d{4})\s*-\s*(.*)$/);
    rows.push({data: m ? m[1] : 'OBS', texto: m ? m[2] : l});
  });
  if (v.status === 'PAGO') rows.push({data: v.editadoEm ? brDate(String(v.editadoEm).slice(0,10)) : brDate(inputDate(new Date())), texto: 'VALE QUITADO'});
  return rows.length ? rows.slice(-6).map(r => `<div class="receive-timeline-row"><strong>${h(r.data)}</strong><p>${h(r.texto)}</p></div>`).join('') : '<p class="empty">SEM MOVIMENTAÇÕES.</p>';
}

/* =========================
   VALLE V3.0 - INTERFACE, FINANCEIRO E GESTÃO
   ========================= */
function getPaymentEvents() {
  const events = [];
  db.vales.forEach(v => {
    const obs = String(v.observacao || '');
    obs.split(/\n+/).map(x => x.trim()).filter(Boolean).forEach(line => {
      const m = line.match(/(\d{2}\/\d{2}\/\d{4}).*?(?:PAGO(?:\s+JUROS)?\s+)?R\$\s*([0-9\.]+,[0-9]{2})/i);
      if (m) {
        const iso = m[1].split('/').reverse().join('-');
        events.push({ valeId:v.id, cliente:v.cliente, data:iso, valor:moneyNum(m[2]), texto:line });
      }
    });
    if (v.status === 'PAGO' && !obs.includes('PAGO')) {
      const valor = Math.max(0, Number(v.jurosRecebidos || 0) || (originalLoanTotal(v) - originalLoanValue(v)));
      if (valor > 0) events.push({ valeId:v.id, cliente:v.cliente, data:String(v.editadoEm || v.criadoEm || '').slice(0,10) || inputDate(new Date()), valor, texto:'QUITADO' });
    }
  });
  return events.filter(e => e.data && e.valor > 0);
}
function sumPaymentsBetween(start, end) {
  return getPaymentEvents().filter(e => e.data >= start && e.data <= end).reduce((s,e)=>s+e.valor,0);
}
function statusInfo(v) {
  const d = days(inputDate(new Date()), v.dataFinal);
  if (d < 0) return { key:'danger', label:`ATRASADO • ${Math.abs(d)} DIA${Math.abs(d)===1?'':'S'}`, dias:d };
  if (d === 0) return { key:'today', label:'VENCE HOJE', dias:d };
  return { key:'week', label:d === 1 ? 'VENCE AMANHÃ' : `VENCE EM ${d} DIAS`, dias:d };
}
function lastObs(v) {
  const lines = String(v.observacao || '').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  return lines.length ? lines[lines.length-1] : 'SEM OBSERVAÇÃO.';
}
function renderV3Card(v, options = {}) {
  const info = statusInfo(v);
  const c = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
  const num = String(v.numero || '').padStart(4,'0');
  const tel = v.telefone || c.telefone || '';
  const clienteInicial = String(v.cliente || '?').trim().charAt(0).toUpperCase() || '?';
  const statusName = info.key === 'danger' ? 'ATRASADO' : info.key === 'today' ? 'HOJE' : 'PRÓXIMO';
  const statusDetail = info.key === 'danger'
    ? `${Math.abs(info.dias)} dia${Math.abs(info.dias) === 1 ? '' : 's'} de atraso`
    : info.key === 'today'
      ? 'Vence hoje'
      : `Vence em ${info.dias} dia${info.dias === 1 ? '' : 's'}`;
  const valueClass = info.key === 'danger' ? 'danger' : info.key === 'today' ? 'today' : 'week';

  return `<div class="v3-collect-card ${info.key}">
    <button class="v3-card-menu" type="button" aria-label="Mais opções">⋮</button>

    <div class="v3-notif-status-row">
      <span class="v3-status-pill ${info.key}">${h(statusName)}</span>
      <small>${h(statusDetail)}</small>
    </div>

    <div class="v3-notif-main-row">
      <div class="v3-notif-client">
        <h3>${h(v.cliente)}</h3>
        <p>📞 ${h(tel || 'SEM TELEFONE')}</p>
      </div>

      <div class="v3-notif-info">
        <small>Nº do Vale</small>
        <b>#${h(num)}</b>
      </div>
      <div class="v3-notif-info">
        <small>Vencimento</small>
        <b class="${valueClass}">${brDate(v.dataFinal)}</b>
      </div>
      <div class="v3-notif-info">
        <small>Valor Total</small>
        <b class="${valueClass}">${money(originalLoanTotal(v))}</b>
      </div>
      <div class="v3-notif-info">
        <small>Valor em Aberto</small>
        <b class="${valueClass}">${money(loanTotalBalance(v))}</b>
      </div>

      <div class="v3-card-actions">
        <button class="v3-whats" onclick="openWhatsLoan('${v.id}')">💬 WhatsApp</button>
        <button class="v3-pdf" onclick="downloadLoanPdf('${v.id}')">📄 PDF</button>
        <button class="v3-receber" onclick="openReceiveModal('${v.id}')">💵 Receber</button>
      </div>
    </div>
  </div>`;
}
function renderNotificationBootstrapCard(v) {
  const info = statusInfo(v);
  const c = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
  const num = String(v.numero || '').padStart(4,'0');
  const tel = v.telefone || c.telefone || '';
  const nomeCliente = String(v.cliente || c.nome || '').trim();
  const clienteInicial = (nomeCliente.charAt(0) || '?').toUpperCase();
  const statusName = info.key === 'danger' ? 'ATRASADO' : info.key === 'today' ? 'VENCE HOJE' : 'PRÓXIMO';
  const statusClass = info.key === 'danger' ? 'danger' : info.key === 'today' ? 'warning' : 'primary';
  const statusDetail = info.key === 'danger'
    ? `${Math.abs(info.dias)} dia${Math.abs(info.dias) === 1 ? '' : 's'} de atraso`
    : info.key === 'today'
      ? 'Vencimento hoje'
      : `Vence em ${info.dias} dia${info.dias === 1 ? '' : 's'}`;

  return `<article class="card notification-bootstrap-item border-${statusClass}" data-notification-vale-id="${h(String(v.id ?? v.numero ?? ''))}">
    <div class="card-body p-3 p-md-4">
      <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div class="d-flex align-items-start gap-2 min-w-0 notification-client-wrap">
          <div class="notification-client-icon" aria-label="Inicial do cliente">${h(clienteInicial)}</div>
          <div class="min-w-0 notification-client-text">
            <h3 class="h5 mb-1 notification-client-name">${h(v.cliente)}</h3>
            <p class="mb-0 text-secondary notification-client-phone"><i class="bi bi-telephone-fill me-1"></i>${h(tel || 'SEM TELEFONE')}</p>
          </div>
        </div>
        <span class="badge rounded-pill text-bg-${statusClass} notification-status-badge">${h(statusName)}</span>
      </div>

      <div class="alert notification-status-alert mb-3 py-2 px-3" role="status">
        <i class="bi bi-clock-history me-2"></i>${h(statusDetail)}
      </div>

      <div class="row g-3 notification-data-grid">
        <div class="col-6 col-lg-3">
          <div class="notification-data-box h-100">
            <small class="text-secondary d-block mb-1"><i class="bi bi-receipt me-1"></i>Nº DO VALE</small>
            <strong>#${h(num)}</strong>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="notification-data-box h-100">
            <small class="text-secondary d-block mb-1"><i class="bi bi-calendar-event me-1"></i>VENCIMENTO</small>
            <strong>${brDate(v.dataFinal)}</strong>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="notification-data-box h-100">
            <small class="text-secondary d-block mb-1"><i class="bi bi-cash-stack me-1"></i>VALOR TOTAL</small>
            <strong>${money(originalLoanTotal(v))}</strong>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="notification-data-box h-100">
            <small class="text-secondary d-block mb-1"><i class="bi bi-wallet2 me-1"></i>EM ABERTO</small>
            <strong>${money(loanTotalBalance(v))}</strong>
          </div>
        </div>
      </div>

      <div class="d-flex flex-wrap justify-content-end gap-2 mt-3 pt-3 notification-bootstrap-actions">
        <button type="button" class="btn btn-success" onclick="openWhatsLoan('${v.id}')"><i class="bi bi-whatsapp me-2"></i>WHATSAPP</button>
        <button type="button" class="btn btn-danger" onclick="downloadLoanPdf('${v.id}')"><i class="bi bi-file-earmark-pdf-fill me-2"></i>PDF</button>
        <button type="button" class="btn btn-primary" onclick="openReceiveModal('${v.id}')"><i class="bi bi-cash-coin me-2"></i>RECEBER</button>
      </div>
    </div>
  </article>`;
}

function renderCobranca() {
  if (!$('cobrancaContainer')) return;
  const active = document.querySelector('.cobranca-filter.active')?.dataset.cobranca || 'todos';
  const today = inputDate(new Date());
  const arr = db.vales.filter(v => v.status !== 'PAGO').map(v => ({...v, _info:statusInfo(v)})).filter(v => {
    if (active === 'atrasado') return v._info.dias < 0;
    if (active === 'hoje') return v._info.dias === 0;
    if (active === 'breve') return v._info.dias > 0 && v._info.dias <= 7;
    return v._info.dias <= 7;
  }).sort((a,b)=>a._info.dias-b._info.dias || String(a.cliente).localeCompare(String(b.cliente),'pt-BR'));
  $('cobrancaContainer').innerHTML = arr.length ? arr.map(v => renderV3Card(v)).join('') : '<div class="empty-state">✅ Nenhuma cobrança nesta categoria.</div>';
}
function renderCalendario() {
  if (!$('calendarioVencimentos')) return;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y,m,1); const last = new Date(y,m+1,0);
  const startPad = first.getDay();
  const abertos = db.vales.filter(v => v.status !== 'PAGO');
  let html = `<div class="v3-cal-head"><strong>${first.toLocaleString('pt-BR',{month:'long',year:'numeric'}).toUpperCase()}</strong><span>🔴 atrasado • 🟠 hoje • 🟡 próximo</span></div>`;
  html += '<div class="v3-cal-week"><b>DOM</b><b>SEG</b><b>TER</b><b>QUA</b><b>QUI</b><b>SEX</b><b>SÁB</b></div><div class="v3-cal-grid">';
  for(let i=0;i<startPad;i++) html += '<div class="v3-cal-day muted"></div>';
  for(let d=1; d<=last.getDate(); d++){
    const iso = inputDate(new Date(y,m,d));
    const list = abertos.filter(v => v.dataFinal === iso);
    const info = days(inputDate(new Date()), iso);
    const cls = info < 0 ? 'danger' : info === 0 ? 'today' : list.length ? 'week' : '';
    html += `<div class="v3-cal-day ${cls}"><strong>${d}</strong>${list.length?`<span>${list.length} vale${list.length>1?'s':''}</span>`:''}</div>`;
  }
  html += '</div>';
  $('calendarioVencimentos').innerHTML = html;
}
function renderGlobalSearchResults() {
  const box = $('globalSearchResults'); if (!box) return;
  const q = upper($('globalSearch')?.value || '');
  if (!q) { box.classList.remove('show'); box.innerHTML=''; return; }
  const clientes = db.clientes.filter(c => [c.nome,c.telefone,c.cpf,c.obs].join(' ').toUpperCase().includes(q)).slice(0,4);
  const vales = db.vales.filter(v => [v.cliente,v.telefone,v.cpf,v.observacao,String(v.numero)].join(' ').toUpperCase().includes(q)).slice(0,6);
  const rows = [
    ...clientes.map(c => `<button onclick="useClient('${c.id}');$('globalSearch').value='';renderGlobalSearchResults();">👤 ${h(c.nome)} <small>${h(c.telefone||'')}</small></button>`),
    ...vales.map(v => `<button onclick="openReceiveModal('${v.id}');$('globalSearch').value='';renderGlobalSearchResults();">📄 Vale #${String(v.numero).padStart(4,'0')} - ${h(v.cliente)} <small>${money(originalLoanValue(v))}</small></button>`)
  ];
  box.innerHTML = rows.length ? rows.join('') : '<p>Nenhum resultado.</p>';
  box.classList.add('show');
}
function toggleVipClient(id) {
  const c = clienteById(id); if (!c) return;
  c.vip = !c.vip;
  save(); renderAll(); toast(c.vip ? 'CLIENTE MARCADO COMO VIP' : 'VIP REMOVIDO');
}
function renderV3DashboardExtras() {
  const hoje = inputDate(new Date());
  const d7 = new Date(); d7.setDate(d7.getDate()-6);
  const inicioSemana = inputDate(d7);
  const inicioMes = hoje.slice(0,8)+'01';
  const aberto = db.vales.filter(v => v.status !== 'PAGO');
  const valorEmprestado = aberto.reduce((s,v)=>s+loanPrincipalBalance(v),0);
  const capital = Number(db.settings.capitalInvestido || 0);
  if ($('dashRecebidoHoje')) $('dashRecebidoHoje').textContent = money(sumPaymentsBetween(hoje, hoje));
  if ($('dashRecebidoSemana')) $('dashRecebidoSemana').textContent = money(sumPaymentsBetween(inicioSemana, hoje));
  if ($('dashRecebidoMes')) $('dashRecebidoMes').textContent = money(sumPaymentsBetween(inicioMes, hoje));
  if ($('dashCapitalDisponivel')) $('dashCapitalDisponivel').textContent = money(capital - valorEmprestado);
  if ($('rankingClientes')) {
    const map = {};
    db.vales.forEach(v => { map[v.cliente] = map[v.cliente] || {q:0,total:0,juros:0}; map[v.cliente].q++; map[v.cliente].total += originalLoanValue(v); map[v.cliente].juros += Number(v.jurosRecebidos||0); });
    const arr = Object.entries(map).map(([nome,o])=>({nome,...o})).sort((a,b)=>b.total-a.total).slice(0,5);
    $('rankingClientes').innerHTML = arr.length ? arr.map((x,i)=>`<div><span>${i+1}</span><b>${h(x.nome)}</b><em>${x.q} vales</em><strong>${money(x.total)}</strong></div>`).join('') : '<p>Sem dados.</p>';
  }
  if ($('historicoFinanceiro')) {
    const months = {};
    getPaymentEvents().forEach(e => { const k = e.data.slice(0,7); months[k] = (months[k]||0)+e.valor; });
    const arr = Object.entries(months).sort().slice(-6);
    const max = Math.max(1,...arr.map(x=>x[1]));
    $('historicoFinanceiro').innerHTML = arr.length ? arr.map(([k,v])=>`<div><span>${k.split('-').reverse().join('/')}</span><b style="height:${Math.max(8,(v/max)*70)}px"></b><strong>${money(v)}</strong></div>`).join('') : '<p>Sem recebimentos registrados.</p>';
  }
}
const renderDashboardBaseV3 = renderDashboard;
renderDashboard = function(){ renderDashboardBaseV3(); renderV3DashboardExtras(); };
let notificationActiveFilter = 'todos';
function setNotificationFilter(filter) {
  notificationActiveFilter = filter || 'todos';
  document.querySelectorAll('.notif-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.notifFilter === notificationActiveFilter);
  });
  renderNotifications();
}
const renderNotificationsBaseV3 = renderNotifications;
renderNotifications = function(){
  if (!$('notificacoesContainer')) return renderNotificationsBaseV3();

  const urgent = db.vales
    .filter(v => v.status !== 'PAGO')
    .map(v => ({...v, _info:statusInfo(v)}))
    .filter(v => v._info.dias <= 7)
    .sort((a,b)=>a._info.dias-b._info.dias || String(a.cliente).localeCompare(String(b.cliente),'pt-BR'));

  const atrasados = urgent.filter(v => v._info.dias < 0);
  const hoje = urgent.filter(v => v._info.dias === 0);
  const proximos = urgent.filter(v => v._info.dias > 0);

  if ($('notificacoesResumo')) {
    $('notificacoesResumo').innerHTML = '';
  }

  if ($('notifCount')) {
    $('notifCount').textContent = urgent.length > 99 ? '99+' : urgent.length;
    $('notifCount').style.display = urgent.length ? 'inline-flex' : 'none';
  }
  if ($('notifHeaderCount')) {
    $('notifHeaderCount').textContent = urgent.length > 99 ? '99+' : urgent.length;
    $('notifHeaderCount').style.display = urgent.length ? 'inline-flex' : 'none';
  }

  const filterCounts = {
    todos: urgent.length,
    atrasados: atrasados.length,
    hoje: hoje.length,
    proximos: proximos.length
  };
  const filterLabels = {
    todos: count => `${count} TODO${count === 1 ? '' : 'S'}`,
    atrasados: count => `${count} ATRASADO${count === 1 ? '' : 'S'}`,
    hoje: count => `${count} HOJE`,
    proximos: count => `${count} PRÓXIMO${count === 1 ? '' : 'S'}`
  };
  const filterIcons = {
    todos: 'bi-list-ul',
    atrasados: 'bi-exclamation-octagon-fill',
    hoje: 'bi-clock-fill',
    proximos: 'bi-calendar-check-fill'
  };
  document.querySelectorAll('.notif-filter-btn').forEach(btn => {
    const key = btn.dataset.notifFilter || 'todos';
    const count = filterCounts[key] || 0;
    btn.classList.toggle('active', key === notificationActiveFilter);
    const label = (filterLabels[key] || (c => `${c}`))(count);
    btn.innerHTML = `<i class="bi ${filterIcons[key] || 'bi-circle'}"></i><span>${label}</span>`;
  });

  const q = upper($('notificacoesSearch')?.value || '').trim();
  let list = urgent.filter(v => {
    if (notificationActiveFilter === 'atrasados') return v._info.dias < 0;
    if (notificationActiveFilter === 'hoje') return v._info.dias === 0;
    if (notificationActiveFilter === 'proximos') return v._info.dias > 0;
    return true;
  });

  if (q) {
    list = list.filter(v => {
      const txt = [v.cliente, v.telefone, v.cpf, v.observacao, String(v.numero).padStart(4,'0'), String(v.numero)]
        .join(' ')
        .toUpperCase();
      return txt.includes(q);
    });
  }

  const emptyMsg = q
    ? '🔍 Nenhuma notificação encontrada para essa pesquisa.'
    : '✅ Nenhuma cobrança nesta categoria.';

  $('notificacoesContainer').innerHTML = list.length
    ? list.map(v => renderNotificationBootstrapCard(v)).join('')
    : `<div class="empty-state">${emptyMsg}</div>`;
};
async function restoreAutoBackup() {
  const raw = localStorage.getItem('emprestimos_auto_backup_v3');
  if (!raw) { toast('NENHUM BACKUP AUTOMÁTICO ENCONTRADO'); return; }
  let payload;
  try { payload = JSON.parse(raw); } catch(e) { toast('BACKUP AUTOMÁTICO INVÁLIDO'); return; }
  if (!payload || !payload.db) { toast('BACKUP AUTOMÁTICO INVÁLIDO'); return; }
  const dataTxt = payload.criadoEm ? new Date(payload.criadoEm).toLocaleString('pt-BR') : 'sem data';
  const ok = await appConfirm(`Restaurar o último backup automático deste navegador?\n\nData do backup: ${dataTxt}`, {title:'Restaurar backup automático', icon:'♻️'});
  if (!ok) return;
  try { db = normalizeDb(payload.db); save(); renderAll(); updateAutoBackupInfo(); toast('BACKUP AUTOMÁTICO RESTAURADO'); } catch(e){ toast('BACKUP AUTOMÁTICO INVÁLIDO'); }
}

/* =========================================================
   CALENDÁRIO V3 - mês navegável + modal dos vales do dia
   ========================================================= */
let v3CalendarViewDate = new Date();

function calendarMonthStart(){
  return new Date(v3CalendarViewDate.getFullYear(), v3CalendarViewDate.getMonth(), 1);
}

function changeCalendarMonth(delta){
  v3CalendarViewDate = new Date(v3CalendarViewDate.getFullYear(), v3CalendarViewDate.getMonth() + Number(delta || 0), 1);
  renderCalendario();
}

function resetCalendarMonth(){
  v3CalendarViewDate = new Date();
  renderCalendario();
}

function calendarDayStatus(list, iso){
  if (!list.length) return '';
  const diff = days(inputDate(new Date()), iso);
  if (diff < 0) return 'danger';
  if (diff === 0) return 'today';
  return 'week';
}

function calendarDayLabel(iso){
  const diff = days(inputDate(new Date()), iso);
  if (diff < 0) return `${Math.abs(diff)} DIA${Math.abs(diff)===1?'':'S'} ATRASADO`;
  if (diff === 0) return 'VENCE HOJE';
  if (diff === 1) return 'VENCE AMANHÃ';
  return `VENCE EM ${diff} DIAS`;
}

function renderCalendario(){
  const root = $('calendarioVencimentos');
  if (!root) return;

  const current = calendarMonthStart();
  const y = current.getFullYear();
  const m = current.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const todayIso = inputDate(new Date());
  const abertos = db.vales.filter(v => v.status !== 'PAGO');
  const monthStart = inputDate(first);
  const monthEnd = inputDate(last);
  const monthVales = abertos.filter(v => v.dataFinal >= monthStart && v.dataFinal <= monthEnd);
  const monthTotal = monthVales.reduce((s,v)=>s+loanPrincipalBalance(v),0);
  const monthLate = monthVales.filter(v => v.dataFinal < todayIso).length;
  const monthToday = monthVales.filter(v => v.dataFinal === todayIso).length;
  const monthFuture = monthVales.filter(v => v.dataFinal > todayIso).length;

  let html = `
    <div class="v3-cal-toolbar">
      <button type="button" onclick="changeCalendarMonth(-1)">‹</button>
      <div>
        <strong>${first.toLocaleString('pt-BR',{month:'long',year:'numeric'}).toUpperCase()}</strong>
        <small>${monthVales.length} vale${monthVales.length===1?'':'s'} • ${money(monthTotal)} em aberto</small>
      </div>
      <button type="button" onclick="changeCalendarMonth(1)">›</button>
      <button type="button" class="today-btn" onclick="resetCalendarMonth()">HOJE</button>
    </div>
    <div class="v3-cal-week"><b>DOM</b><b>SEG</b><b>TER</b><b>QUA</b><b>QUI</b><b>SEX</b><b>SÁB</b></div>
    <div class="v3-cal-grid v3-cal-grid-pro">
  `;

  for (let i=0; i<first.getDay(); i++) html += '<div class="v3-cal-day muted"></div>';

  for (let d=1; d<=last.getDate(); d++){
    const iso = inputDate(new Date(y,m,d));
    const list = abertos.filter(v => v.dataFinal === iso)
      .sort((a,b)=>String(a.cliente).localeCompare(String(b.cliente),'pt-BR'));
    const status = calendarDayStatus(list, iso);
    const isToday = iso === todayIso ? ' is-today' : '';
    const firstNames = list.slice(0,3).map(v => `
      <em title="${h(v.cliente)}">${h(v.cliente)} <b>${money(loanPrincipalBalance(v))}</b></em>
    `).join('');
    const more = list.length > 3 ? `<small class="v3-cal-more">+${list.length - 3} outro${list.length - 3 === 1 ? '' : 's'}</small>` : '';
    const empty = list.length ? '' : '<small class="v3-cal-empty">—</small>';
    html += `
      <button type="button" class="v3-cal-day ${status}${isToday}" ${list.length ? `onclick="openCalendarDayModal('${iso}')"` : ''} ${list.length ? '' : 'disabled'}>
        <strong>${d}</strong>
        ${list.length ? `<span>${list.length} vale${list.length>1?'s':''}</span>` : ''}
        <div class="v3-cal-clients">${firstNames}${more}${empty}</div>
      </button>`;
  }
  html += '</div>';
  root.innerHTML = html;
  initCalendarSwipe(root);
}

function initCalendarSwipe(root){
  if (!root || root.dataset.swipeReady === '1') return;
  root.dataset.swipeReady = '1';

  let startX = 0;
  let startY = 0;
  let endX = 0;
  let endY = 0;
  let touching = false;

  root.addEventListener('touchstart', e => {
    if (!e.touches || e.touches.length !== 1) return;
    touching = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    endX = startX;
    endY = startY;
  }, { passive:true });

  root.addEventListener('touchmove', e => {
    if (!touching || !e.touches || e.touches.length !== 1) return;
    endX = e.touches[0].clientX;
    endY = e.touches[0].clientY;
  }, { passive:true });

  root.addEventListener('touchend', () => {
    if (!touching) return;
    touching = false;

    const dx = endX - startX;
    const dy = endY - startY;
    const horizontal = Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.35;
    if (!horizontal) return;

    if (dx < 0) {
      changeCalendarMonth(1);
      if (typeof showToast === 'function') showToast('Próximo mês', 'info');
    } else {
      changeCalendarMonth(-1);
      if (typeof showToast === 'function') showToast('Mês anterior', 'info');
    }
  }, { passive:true });
}

function ensureCalendarDayModal(){
  let modal = document.getElementById('calendarDayModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'calendarDayModal';
  modal.className = 'calendar-day-modal client-report-modal';
  modal.innerHTML = `
    <div class="calendar-day-card client-report-card v35-client-report-card" role="dialog" aria-modal="true" aria-labelledby="calendarDayTitle">
      <button type="button" class="calendar-day-close client-report-close btn btn-outline-primary" onclick="closeCalendarDayModal()" aria-label="Fechar"><i class="bi bi-x-lg"></i></button>
      <div class="calendar-day-head v35-report-head">
        <div class="v35-report-person">
          <div class="v35-report-avatar"><i class="bi bi-calendar3"></i></div>
          <div class="min-w-0">
            <h2 id="calendarDayTitle">Vales do dia</h2>
            <p id="calendarDaySub">Clientes com vencimento no dia selecionado</p>
          </div>
        </div>
      </div>
      <div class="border-top my-3"></div>
      <h3 class="v35-modal-section-title"><i class="bi bi-receipt me-2"></i>Vales com vencimento</h3>
      <div id="calendarDayList" class="calendar-day-list v35-history-list"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeCalendarDayModal(); });
  return modal;
}

function openCalendarDayModal(iso){
  const modal = ensureCalendarDayModal();
  const listBox = document.getElementById('calendarDayList');
  const title = document.getElementById('calendarDayTitle');
  const sub = document.getElementById('calendarDaySub');
  const list = db.vales
    .filter(v => v.status !== 'PAGO' && v.dataFinal === iso)
    .map(v => ({...v, _info:statusInfo(v)}))
    .sort((a,b)=>String(a.cliente).localeCompare(String(b.cliente),'pt-BR'));
  const total = list.reduce((s,v)=>s+loanPrincipalBalance(v),0);
  title.textContent = `Vales de ${brDate(iso)}`;
  sub.textContent = `${list.length} vale${list.length===1?'':'s'} • ${calendarDayLabel(iso)} • ${money(total)} em aberto`;
  listBox.innerHTML = list.length ? list.map(v => {
    const c = clienteById(v.clienteId) || clienteByName(v.cliente) || {};
    const tel = v.telefone || c.telefone || '';
    const num = String(v.numero || '').padStart(4,'0');
    const info = statusInfo(v);
    return `
      <article class="card calendar-vale-row v35-history-row ${info.key} border-${info.key === 'danger' ? 'danger' : (info.key === 'today' ? 'warning' : 'primary')} border-start border-4 shadow-sm">
        <div class="card-body">
          <header class="v35-vale-header calendar-vale-main">
            <div class="min-w-0">
              <h4><i class="bi bi-person-circle me-2"></i>${h(v.cliente)}</h4>
              <small><i class="bi bi-telephone me-1"></i>${h(tel || 'SEM TELEFONE')} <span class="mx-1">•</span> <i class="bi bi-receipt me-1"></i>VALE Nº ${num}</small>
            </div>
            <span class="badge rounded-pill calendar-vale-status ${info.key}">${h(info.label)}</span>
          </header>
          <div class="calendar-vale-money v35-modal-loan-metrics">
            <div class="v35-modal-stat"><small>VALOR EMPRESTADO</small><strong>${money(loanPrincipalBalance(v))}</strong></div>
            <div class="v35-modal-stat"><small>TOTAL + ATRASO</small><strong>${money(loanTotalBalance(v))}</strong></div>
          </div>
          <footer class="calendar-vale-actions v35-modal-history-actions">
            <button class="btn btn-success btn-sm" onclick="closeCalendarDayModal(); openWhatsLoan('${v.id}')"><i class="bi bi-whatsapp me-1"></i>WHATSAPP</button>
            <button class="btn btn-danger btn-sm" onclick="closeCalendarDayModal(); downloadLoanPdf('${v.id}')"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
            <button class="btn btn-primary btn-sm" onclick="closeCalendarDayModal(); openReceiveModal('${v.id}')"><i class="bi bi-cash-coin me-1"></i>RECEBER</button>
          </footer>
        </div>
      </article>`;
  }).join('') : '<div class="empty-state">Nenhum vale neste dia.</div>';
  modal.classList.add('show');
  document.body.classList.add('calendar-modal-open');
}

function closeCalendarDayModal(){
  const modal = document.getElementById('calendarDayModal');
  if (modal) modal.classList.remove('show');
  document.body.classList.remove('calendar-modal-open');
}


/* =========================================================
   DASHBOARD PREMIUM - visual profissional desktop/mobile
   ========================================================= */
function monthKeyFromDateSafe(dateStr){
  return String(dateStr || '').slice(0,7);
}
function premiumMonthLabel(key){
  const [y,m] = String(key).split('-');
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return meses[(Number(m)||1)-1] || key;
}
function premiumInitials(nome){
  const parts = String(nome || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}
function premiumStatusInfo(v){
  const today = inputDate(new Date());
  const d = days(today, v.dataFinal);
  if (v.status === 'PAGO') return {cls:'ok', txt:'Pago', dias:d};
  if (d < 0) return {cls:'danger', txt:`${Math.abs(d)} dia${Math.abs(d)===1?'':'s'} de atraso`, dias:d};
  if (d === 0) return {cls:'warn', txt:'Vence hoje', dias:d};
  return {cls:'week', txt:`Vence em ${d} dia${d===1?'':'s'}`, dias:d};
}
function premiumGetMonthSeries(){
  const now = new Date();
  const rows = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    rows.push({key, label: premiumMonthLabel(key), emprestado:0, recebido:0});
  }
  const map = Object.fromEntries(rows.map(r => [r.key, r]));
  db.vales.forEach(v => {
    const k = monthKeyFromDateSafe(v.criadoEm || v.dataInicial || v.dataFinal);
    if (map[k]) map[k].emprestado += originalLoanValue(v);
  });
  getPaymentEvents().forEach(e => {
    const k = monthKeyFromDateSafe(e.data);
    if (map[k]) map[k].recebido += e.valor;
  });
  return rows;
}
function renderPremiumLineChart(rows){
  const box = $('premiumLineChart');
  if (!box) return;
  const w = 620, h = 230, padL = 46, padR = 16, padT = 18, padB = 34;
  const max = Math.max(100, ...rows.flatMap(r => [r.emprestado, r.recebido]));
  const stepX = rows.length > 1 ? (w-padL-padR)/(rows.length-1) : 1;
  const y = val => padT + (h-padT-padB) * (1 - (val/max));
  const x = i => padL + i*stepX;
  const ptsBlue = rows.map((r,i)=>`${x(i)},${y(r.emprestado)}`).join(' ');
  const ptsGreen = rows.map((r,i)=>`${x(i)},${y(r.recebido)}`).join(' ');
  const areaBlue = `${padL},${h-padB} ${ptsBlue} ${w-padR},${h-padB}`;
  const areaGreen = `${padL},${h-padB} ${ptsGreen} ${w-padR},${h-padB}`;
  const grid = [0,.25,.5,.75,1].map(t=>{
    const yy = padT + (h-padT-padB)*t;
    const label = money(max*(1-t)).replace('R$','').trim();
    return `<line class="grid-line" x1="${padL}" y1="${yy}" x2="${w-padR}" y2="${yy}"/><text x="6" y="${yy+4}">${label}</text>`;
  }).join('');
  const labels = rows.map((r,i)=>`<text x="${x(i)-10}" y="${h-8}">${r.label}</text>`).join('');
  const points = rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.emprestado)}" r="4" fill="#2563eb"/><circle cx="${x(i)}" cy="${y(r.recebido)}" r="4" fill="#16a34a"/>`).join('');
  box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolução mensal">${grid}<polygon class="area-blue" points="${areaBlue}"/><polygon class="area-green" points="${areaGreen}"/><polyline class="line-blue" points="${ptsBlue}"/><polyline class="line-green" points="${ptsGreen}"/>${points}${labels}</svg>`;
}
function renderPremiumDonut(atrasados, hoje, proximos, emDia){
  const box = $('premiumDonut');
  if (!box) return;
  const total = Math.max(1, atrasados + hoje + proximos + emDia);
  const bad = (atrasados/total)*100;
  const today = bad + (hoje/total)*100;
  const week = today + (proximos/total)*100;
  box.innerHTML = `<div class="premium-donut" style="--bad:${bad}%;--today:${today}%;--week:${week}%"><div class="premium-donut-center"><div><strong>${total === 1 && !atrasados && !hoje && !proximos && !emDia ? 0 : total}</strong><small>Total</small></div></div></div>
  <div class="premium-donut-legend">
    <div><i style="background:#ef4444"></i><span>Atrasados</span><strong>${atrasados}</strong></div>
    <div><i style="background:#f97316"></i><span>Vencem hoje</span><strong>${hoje}</strong></div>
    <div><i style="background:#facc15"></i><span>Próximos 7 dias</span><strong>${proximos}</strong></div>
    <div><i style="background:#16a34a"></i><span>Em dia</span><strong>${emDia}</strong></div>
  </div>`;
}
function renderPremiumMiniCalendar(openVales){
  const box = $('premiumMiniCalendar');
  if (!box) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayStr = inputDate(now);
  const first = new Date(year, month, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const byDate = {};
  openVales.forEach(v => { (byDate[v.dataFinal] ||= []).push(v); });
  let html = `<div class="premium-panel-head"><button type="button" onclick="switchScreen('calendario')">‹</button><h3>${first.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).toUpperCase()}</h3><button type="button" onclick="switchScreen('calendario')">›</button></div>`;
  html += '<div class="premium-cal-head"><b>DOM</b><b>SEG</b><b>TER</b><b>QUA</b><b>QUI</b><b>SEX</b><b>SÁB</b></div><div class="premium-cal-grid">';
  for (let i=0;i<35;i++) {
    const d = new Date(start); d.setDate(start.getDate()+i);
    const ds = inputDate(d);
    const arr = byDate[ds] || [];
    let cls = d.getMonth() !== month ? 'muted' : '';
    if (ds === todayStr) cls += ' today';
    let dot = '';
    if (arr.length) {
      const st = premiumStatusInfo(arr[0]).cls;
      const color = st === 'danger' ? 'red' : st === 'warn' ? 'orange' : st === 'week' ? 'yellow' : 'green';
      dot = `<em class="dot ${color}">${arr.length}</em>`;
    }
    html += `<div class="premium-cal-day ${cls}">${d.getDate()}${dot}</div>`;
  }
  html += '</div>';
  box.innerHTML = html;
}
function renderPremiumClientList(id, list, empty){
  const box = $(id);
  if (!box) return;
  box.innerHTML = list.length ? list.map(v => {
    const info = premiumStatusInfo(v);
    const valor = v.status === 'PAGO' ? originalLoanTotal(v) : loanTotalBalance(v);
    return `<div class="premium-client-row ${info.cls}">
      <span class="premium-avatar ${info.cls}">${premiumInitials(v.cliente)}</span>
      <span><b>${h(v.cliente)}</b><small>${brDate(v.dataFinal)} • ${h(info.txt)}</small></span>
      <strong>${money(valor)}</strong>
    </div>`;
  }).join('') : `<p class="empty-dashboard">${empty}</p>`;
}
function renderPremiumDashboard(){
  if (!$('dashboard') || !$('premiumLineChart')) return;
  const today = inputDate(new Date());
  const week = new Date(); week.setDate(week.getDate()+7); const weekS = inputDate(week);
  const aberto = db.vales.filter(v => v.status !== 'PAGO');
  const pagos = db.vales.filter(v => v.status === 'PAGO');
  const valorEmprestado = aberto.reduce((s,v)=>s+loanPrincipalBalance(v),0);
  const totalJuros = aberto.reduce((s,v)=>s+loanInterest(v),0);
  const totalReceber = valorEmprestado + totalJuros;
  const jurosRecebidosAvulsos = db.vales.reduce((s, v) => s + Number(v.jurosRecebidos || 0), 0);
  const totalRecebido = jurosRecebidosAvulsos + pagos.reduce((s, v) => Number(v.jurosRecebidos || 0) > 0 ? s : s + Math.max(0, originalLoanTotal(v) - originalLoanValue(v)), 0);
  const atrasados = aberto.filter(v => v.dataFinal < today);
  const hoje = aberto.filter(v => v.dataFinal === today);
  const proximos = aberto.filter(v => v.dataFinal > today && v.dataFinal <= weekS);
  const emDia = aberto.filter(v => v.dataFinal > weekS);
  const q = upper($('dashboardBusca')?.value || '').trim();
  const filterText = v => [v.cliente, v.telefone, v.cpf, String(v.numero).padStart(4,'0'), String(v.numero)].join(' ').toUpperCase().includes(q);
  const atrasadosList = (q ? atrasados.filter(filterText) : atrasados).sort((a,b)=>String(a.dataFinal).localeCompare(String(b.dataFinal))).slice(0,5);
  const proximosList = (q ? [...hoje, ...proximos].filter(filterText) : [...hoje, ...proximos]).sort((a,b)=>String(a.dataFinal).localeCompare(String(b.dataFinal))).slice(0,5);

  if ($('dashDataHoje')) $('dashDataHoje').textContent = brDate(today);
  if ($('dashAtrasadosPremium')) $('dashAtrasadosPremium').textContent = atrasados.length;
  if ($('dashAtrasadosDelta')) $('dashAtrasadosDelta').textContent = `↗ ${atrasados.length}`;
  if ($('dashAtrasadosBadge')) $('dashAtrasadosBadge').textContent = atrasados.length;
  if ($('dashProximosBadge')) $('dashProximosBadge').textContent = hoje.length + proximos.length;
  if ($('dashNotifMini')) $('dashNotifMini').textContent = atrasados.length + hoje.length + proximos.length;
  if ($('dashNotifMini2')) $('dashNotifMini2').textContent = atrasados.length + hoje.length + proximos.length;
  if ($('dashResumoEmprestado')) $('dashResumoEmprestado').textContent = money(valorEmprestado);
  if ($('dashResumoRecebido')) $('dashResumoRecebido').textContent = money(totalRecebido);
  if ($('dashResumoAberto')) $('dashResumoAberto').textContent = money(totalReceber);
  if ($('dashResumoJuros')) $('dashResumoJuros').textContent = money(totalRecebido);
  if ($('dashLucroLiquido')) $('dashLucroLiquido').textContent = money(totalRecebido);

  renderPremiumLineChart(premiumGetMonthSeries());
  renderPremiumDonut(atrasados.length, hoje.length, proximos.length, emDia.length);
  renderPremiumMiniCalendar(aberto);
  renderPremiumClientList('premiumAtrasadosList', atrasadosList, 'Nenhum vale atrasado.');
  renderPremiumClientList('premiumProximosList', proximosList, 'Nenhum vale próximo.');
}
const renderDashboardPremiumPrevious = renderDashboard;
renderDashboard = function(){
  renderDashboardPremiumPrevious();
  renderPremiumDashboard();
};


/* =========================================================
   V3.5 - RELATÓRIOS PROFISSIONAIS + HISTÓRICO/ SCORE DO CLIENTE
   Correção estável: não depende do layout antigo da aba relatórios.
   ========================================================= */
function v35Num(n){ return Number(String(n ?? 0).replace(/[^0-9,.-]/g,'').replace(',', '.')) || 0; }
function v35Iso(d){ return String(d || '').slice(0,10); }
function v35Today(){ return inputDate(new Date()); }
function v35SafeMoney(n){ try { return money(n); } catch(e){ return 'R$ ' + v35Num(n).toFixed(2).replace('.', ','); } }
function v35Escape(x){ try { return h(x); } catch(e){ return String(x ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); } }
function v35LoanPrincipal(v){ try { return originalLoanValue(v); } catch(e){ return v35Num(v.valor); } }
function v35LoanTotal(v){ try { return originalLoanTotal(v); } catch(e){ return v35Num(v.total || v.valor); } }
function v35LoanBalance(v){ try { return loanTotalBalance(v); } catch(e){ return String(v.status).toUpperCase()==='PAGO' ? 0 : v35LoanTotal(v); } }
function v35PrincipalBalance(v){ try { return loanPrincipalBalance(v); } catch(e){ return String(v.status).toUpperCase()==='PAGO' ? 0 : v35LoanPrincipal(v); } }
function v35DateBr(d){ try { return brDate(d); } catch(e){ return v35Iso(d).split('-').reverse().join('/') || '-'; } }
function v35DaysBetween(a,b){
  const da = new Date(String(a||'').slice(0,10)+'T00:00:00');
  const dbb = new Date(String(b||'').slice(0,10)+'T00:00:00');
  if (isNaN(da) || isNaN(dbb)) return 0;
  return Math.round((dbb-da)/86400000);
}
function v35PaymentDate(v){
  const obs = String(v.observacao || '');
  const matches = [...obs.matchAll(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/g)].map(m=>m[1]);
  const dates = matches.map(d => d.includes('/') ? d.split('/').reverse().join('-') : d).sort();
  if (String(v.status).toUpperCase()==='PAGO') return dates.slice(-1)[0] || v35Iso(v.editadoEm || v.criadoEm || v.dataFinal);
  return dates.slice(-1)[0] || '';
}
function v35ClientKey(v){ return String(v.clienteId || v.cliente || '').trim().toUpperCase() || 'SEM-ID'; }
function v35FindClientForVale(v){ return clienteById(v.clienteId) || clienteByName(v.cliente) || {}; }
function v35ClienteStats(){
  const today = v35Today();
  const map = {};
  // inclui clientes cadastrados mesmo sem vale
  (db.clientes || []).forEach(c => {
    const key = String(c.id || c.nome || '').trim().toUpperCase() || 'CLIENTE';
    map[key] = {
      key, id:c.id || '', nome:c.nome || 'SEM NOME', telefone:c.telefone || '', cpf:c.cpf || '', obs:c.obs || '', vip:!!c.vip,
      vales:[], qtd:0, pagos:0, abertos:0, atrasados:0, pagosAtrasados:0, maiorAtraso:0,
      totalEmprestado:0, totalComJuros:0, abertoValor:0, principalAberto:0, recebido:0, jurosRecebidos:0,
      primeiroVale:'', ultimoVale:'', ultimoPagamento:'', ultimaObs:''
    };
  });
  (db.vales || []).forEach(v => {
    const c = v35FindClientForVale(v);
    const key = String(v.clienteId || c.id || v.cliente || '').trim().toUpperCase() || 'SEM-ID';
    if (!map[key]) map[key] = {
      key, id:v.clienteId || c.id || '', nome:v.cliente || c.nome || 'SEM NOME', telefone:v.telefone || c.telefone || '', cpf:v.cpf || c.cpf || '', obs:c.obs || '', vip:!!c.vip,
      vales:[], qtd:0, pagos:0, abertos:0, atrasados:0, pagosAtrasados:0, maiorAtraso:0,
      totalEmprestado:0, totalComJuros:0, abertoValor:0, principalAberto:0, recebido:0, jurosRecebidos:0,
      primeiroVale:'', ultimoVale:'', ultimoPagamento:'', ultimaObs:''
    };
    const o = map[key];
    o.nome = v.cliente || o.nome;
    o.telefone = v.telefone || o.telefone;
    o.cpf = v.cpf || o.cpf;
    o.vales.push(v); o.qtd++;
    const principal = v35LoanPrincipal(v);
    const total = v35LoanTotal(v);
    const jurosRec = v35Num(v.jurosRecebidos || 0);
    o.totalEmprestado += principal;
    o.totalComJuros += total;
    o.jurosRecebidos += jurosRec;
    const venc = v35Iso(v.dataFinal);
    const criado = v35Iso(v.criadoEm || v.dataInicial || venc);
    if (criado && (!o.primeiroVale || criado < o.primeiroVale)) o.primeiroVale = criado;
    if (criado && (!o.ultimoVale || criado > o.ultimoVale)) o.ultimoVale = criado;
    const pago = String(v.status).toUpperCase() === 'PAGO';
    const dataPg = v35PaymentDate(v);
    if (dataPg && (!o.ultimoPagamento || dataPg > o.ultimoPagamento)) o.ultimoPagamento = dataPg;
    if (pago) {
      o.pagos++;
      o.recebido += total + jurosRec;
      // Vale quitado deixa de ser considerado atraso ativo no relatório.
      // A data do pagamento continua registrada, mas não reduz o score nem
      // permanece no contador "Atrasos" do cliente.
    } else {
      o.abertos++;
      o.abertoValor += v35LoanBalance(v);
      o.principalAberto += v35PrincipalBalance(v);
      if (venc && venc < today) {
        o.atrasados++;
        o.maiorAtraso = Math.max(o.maiorAtraso, v35DaysBetween(venc, today));
      }
    }
    const obsLine = String(v.observacao || '').split(/\n+/).map(s=>s.trim()).filter(Boolean).slice(-1)[0];
    if (obsLine) o.ultimaObs = obsLine;
  });
  return Object.values(map).map(o => {
    // O contador de atrasos e o score consideram somente vales vencidos
    // que ainda não foram pagos. Ao quitar, o atraso é removido imediatamente.
    const totalAtrasos = o.atrasados;
    const taxaPago = o.qtd ? Math.round((o.pagos/o.qtd)*100) : 0;
    const pontual = o.atrasados ? 0 : 100;
    let score = 100;
    score -= o.atrasados * 32;
    score -= Math.min(25, Math.floor(o.maiorAtraso / 3) * 5);
    if (o.abertoValor > 0 && o.pagos === 0 && o.qtd >= 2) score -= 10;
    if (o.qtd === 0) score = 70;
    score = Math.max(0, Math.min(100, score));
    let label='EXCELENTE PAGADOR', classe='excelente', stars='★★★★★', desc='Cliente com histórico muito saudável.';
    if (score < 45 || o.atrasados >= 2) { label='ALTO RISCO'; classe='risco'; stars='★☆☆☆☆'; desc='Cliente com atraso relevante ou reincidência.'; }
    else if (score < 65) { label='ATENÇÃO'; classe='atencao'; stars='★★☆☆☆'; desc='Requer cuidado antes de novo VALLE.'; }
    else if (score < 82) { label='REGULAR'; classe='regular'; stars='★★★☆☆'; desc='Paga, mas apresenta atrasos ou inconsistência.'; }
    else if (score < 95 || totalAtrasos > 0) { label='BOM PAGADOR'; classe='bom'; stars='★★★★☆'; desc='Bom histórico, com atraso pequeno ou eventual.'; }
    return {...o, totalAtrasos, taxaPago, pontual, score, label, classe, stars, desc};
  }).sort((a,b)=> b.abertoValor-a.abertoValor || b.totalEmprestado-a.totalEmprestado || String(a.nome).localeCompare(String(b.nome),'pt-BR'));
}
function v35RelEnsureLayout(){
  const sec = $('relatorios'); if (!sec) return null;
  let root = $('v35Relatorios');
  if (!root) {
    sec.innerHTML = `<div id="v35Relatorios" class="v35-relatorios">
      <div class="card relatorios-bootstrap-card border-0 shadow-lg mb-3">
        <div class="card-header relatorios-page-header d-flex align-items-center gap-3 bg-transparent">
          <span class="relatorios-page-header-icon d-inline-flex align-items-center justify-content-center flex-shrink-0" aria-hidden="true">
            <i class="bi bi-bar-chart-fill"></i>
          </span>
          <div class="relatorios-page-header-copy flex-grow-1 min-w-0">
            <h2 class="card-title mb-1">RELATÓRIOS</h2>
            <p class="card-subtitle mb-0">FINANCEIRO, RANKING, HISTÓRICO DE CLIENTES E ANÁLISE AUTOMÁTICA DE PAGADOR</p>
          </div>
          <span class="badge relatorios-header-badge d-none d-sm-inline-flex align-items-center gap-2 rounded-pill">
            <i class="bi bi-file-earmark-bar-graph" aria-hidden="true"></i>
            RELATÓRIOS
          </span>
        </div>
      </div>
      <div class="v35-kpis">
        <article><span>💸 Em aberto</span><strong id="v35RelAberto">R$ 0,00</strong><small>Saldo total a receber</small></article>
        <article><span>💰 Recebido</span><strong id="v35RelRecebido">R$ 0,00</strong><small>Pagos + juros recebidos</small></article>
        <article><span>🟣 Juros recebidos</span><strong id="v35RelJuros">R$ 0,00</strong><small>Lucro registrado</small></article>
        <article><span>⚠️ Clientes de risco</span><strong id="v35RelRisco">0</strong><small>Atrasados ou score baixo</small></article>
      </div>
      <div class="v35-rel-panels">
        <section class="v35-panel"><h3>🏆 Ranking dos clientes</h3><div id="v35RankingClientes" class="v35-ranking"></div></section>
        <section class="v35-panel"><h3>📈 Saúde da carteira</h3><div id="v35SaudeCarteira" class="v35-health"></div></section>
      </div>
      <div class="v35-rel-filter"><input class="search" id="v35RelBusca" placeholder="🔍 PESQUISAR NO RELATÓRIO" oninput="renderReports()"><select id="v35RelFiltro" onchange="renderReports()"><option value="todos">TODOS</option><option value="excelente">EXCELENTE</option><option value="bom">BOM</option><option value="regular">REGULAR</option><option value="atencao">ATENÇÃO</option><option value="risco">RISCO</option><option value="atrasados">COM ATRASO</option></select></div>
      <div class="v35-client-title"><h3>👥 Histórico e score por cliente</h3><small>Clique em “ver histórico” para abrir a ficha completa.</small></div>
      <div id="v35ClientesRelatorio" class="v35-client-grid"></div>
    </div>`;
    root = $('v35Relatorios');
  }
  return root;
}
function renderReports(){
  if (!$('relatorios')) return;
  v35RelEnsureLayout();
  const stats = v35ClienteStats();
  const totalAberto = stats.reduce((s,x)=>s+x.abertoValor,0);
  const totalRecebido = stats.reduce((s,x)=>s+x.recebido,0);
  const juros = stats.reduce((s,x)=>s+x.jurosRecebidos,0);
  const risco = stats.filter(x=>x.classe==='risco' || x.atrasados>0).length;
  if ($('v35RelAberto')) $('v35RelAberto').textContent = v35SafeMoney(totalAberto);
  if ($('v35RelRecebido')) $('v35RelRecebido').textContent = v35SafeMoney(totalRecebido);
  if ($('v35RelJuros')) $('v35RelJuros').textContent = v35SafeMoney(juros);
  if ($('v35RelRisco')) $('v35RelRisco').textContent = risco;
  const top = [...stats].filter(x=>x.qtd>0).sort((a,b)=>b.totalEmprestado-a.totalEmprestado).slice(0,5);
  $('v35RankingClientes').innerHTML = top.length ? top.map((x,i)=>`<button onclick="openClientReport('${v35Escape(x.key)}')"><span>${i+1}</span><b>${v35Escape(x.nome)}</b><em>${x.qtd} vales</em><strong>${v35SafeMoney(x.totalEmprestado)}</strong></button>`).join('') : '<p class="empty-state">Sem clientes com VALLES.</p>';
  const qtd = Math.max(1, stats.filter(x=>x.qtd>0).length);
  const excelente = stats.filter(x=>['excelente','bom'].includes(x.classe)).length;
  const regular = stats.filter(x=>x.classe==='regular').length;
  const atencao = stats.filter(x=>['atencao','risco'].includes(x.classe)).length;
  $('v35SaudeCarteira').innerHTML = `<div><span>Bom pagador</span><b style="width:${Math.round((excelente/qtd)*100)}%"></b><strong>${excelente}</strong></div><div><span>Regular</span><b style="width:${Math.round((regular/qtd)*100)}%"></b><strong>${regular}</strong></div><div><span>Atenção/Risco</span><b style="width:${Math.round((atencao/qtd)*100)}%"></b><strong>${atencao}</strong></div>`;
  const q = String($('v35RelBusca')?.value || '').trim().toUpperCase();
  const filtro = $('v35RelFiltro')?.value || 'todos';
  let list = stats;
  if (filtro !== 'todos') list = list.filter(x => filtro === 'atrasados' ? x.atrasados > 0 : x.classe === filtro);
  if (q) list = list.filter(x => [x.nome,x.telefone,x.cpf,x.label,x.stars].join(' ').toUpperCase().includes(q));
  $('v35ClientesRelatorio').innerHTML = list.length ? list.map(x => {
    const initials = String(x.nome||'C').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
    const statusMap = {
      excelente: { color: 'success', icon: 'bi-patch-check-fill' },
      bom: { color: 'primary', icon: 'bi-hand-thumbs-up-fill', cssClass: 'relatorio-score-bom', borderColor: '#0d6efd' },
      regular: { color: 'warning', icon: 'bi-exclamation-circle-fill' },
      atencao: { color: 'warning', icon: 'bi-exclamation-triangle-fill' },
      risco: { color: 'danger', icon: 'bi-shield-fill-exclamation' }
    };
    const status = statusMap[x.classe] || statusMap.regular;
    const reportBorderColor = status.borderColor || `var(--bs-${status.color})`;
    const filledStars = Math.max(0, Math.min(5, (String(x.stars || '').match(/★/g) || []).length));
    const scoreStars = Array.from({length:5}, (_,i) => `<i class="bi ${i < filledStars ? 'bi-star-fill' : 'bi-star'}"></i>`).join('');
    return `<article class="card relatorio-bs-client-card border-${status.color} border-start border-4 shadow-sm" style="--rel-status-color:${reportBorderColor}">
      <div class="card-body">
        <div class="d-flex align-items-start gap-3 relatorio-bs-head">
          <div class="relatorio-bs-avatar bg-primary-subtle text-primary border border-primary-subtle flex-shrink-0">${v35Escape(initials||'C')}</div>
          <div class="flex-grow-1 min-w-0">
            <h4 class="mb-1 relatorio-cliente-nome">${v35Escape(x.nome)}</h4>
            <div class="text-body-secondary small d-flex flex-wrap gap-2 gap-md-3">
              <span><i class="bi bi-telephone me-1"></i>${v35Escape(x.telefone || 'SEM TELEFONE')}</span>
              <span><i class="bi bi-person-vcard me-1"></i>${x.cpf ? 'CPF: '+v35Escape(x.cpf) : 'CPF: NÃO INFORMADO'}</span>
            </div>
          </div>
          <span class="badge text-bg-${status.color} rounded-pill relatorio-bs-status ${status.cssClass || ''}" aria-label="${x.label}: ${filledStars} de 5 estrelas">
            <span class="relatorio-badge-stars">${scoreStars}</span>
            <span class="relatorio-badge-label">${x.label}</span>
          </span>
        </div>

        <div class="border-top my-3"></div>

        <div class="row g-2 relatorio-bs-metrics">
          <div class="col-6 col-xl-3"><div class="relatorio-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-receipt me-1"></i>VALES</small><strong class="d-block mt-1">${x.qtd}</strong></div></div>
          <div class="col-6 col-xl-3"><div class="relatorio-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-wallet2 me-1"></i>EM ABERTO</small><strong class="d-block mt-1">${v35SafeMoney(x.abertoValor)}</strong></div></div>
          <div class="col-6 col-xl-3"><div class="relatorio-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-exclamation-triangle me-1"></i>ATRASOS</small><strong class="d-block mt-1">${x.totalAtrasos}</strong></div></div>
          <div class="col-6 col-xl-3"><div class="relatorio-bs-stat h-100 border rounded-3 p-2"><small class="text-body-secondary d-block"><i class="bi bi-speedometer2 me-1"></i>SCORE</small><strong class="d-block mt-1">${x.score}/100</strong></div></div>
        </div>

        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 relatorio-bs-footer">
          <span class="text-body-secondary small"><i class="bi bi-calendar-check me-1"></i>Último vale: ${x.ultimoVale ? v35DateBr(x.ultimoVale) : '-'}</span>
          <button type="button" class="btn btn-primary btn-sm" onclick="openClientReport('${v35Escape(x.key)}')"><i class="bi bi-clock-history me-1"></i>VER HISTÓRICO</button>
        </div>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state">Nenhum cliente encontrado.</div>';
}
function openClientReport(key){
  const x = v35ClienteStats().find(c => String(c.key).toUpperCase() === String(key).toUpperCase());
  if (!x) return toast('CLIENTE NÃO ENCONTRADO');
  let modal = $('clientReportModal');
  if (!modal) { modal = document.createElement('div'); modal.id='clientReportModal'; modal.className='client-report-modal v35-client-modal'; document.body.appendChild(modal); }
  const rows = [...x.vales].sort((a,b)=>String(b.dataFinal||b.criadoEm||'').localeCompare(String(a.dataFinal||a.criadoEm||''))).map(v => {
    const pago = String(v.status).toUpperCase()==='PAGO';
    const venc = v35Iso(v.dataFinal); const today=v35Today();
    const cls = pago ? 'pago' : (venc && venc < today ? 'atrasado' : 'aberto');
    const saldo = pago ? 0 : v35LoanBalance(v);
    const obs = String(v.observacao || '').split(/\n+/).map(l=>l.trim()).filter(Boolean).slice(-4).map(l=>`<li>${v35Escape(l)}</li>`).join('') || '<li>SEM OBSERVAÇÃO.</li>';
    const statusTone = pago ? 'success' : (cls === 'atrasado' ? 'danger' : 'warning');
    const statusIcon = pago ? 'bi-check-circle-fill' : (cls === 'atrasado' ? 'bi-exclamation-triangle-fill' : 'bi-clock-fill');
    const principal = v35LoanPrincipal(v);
    const total = v35LoanTotal(v);
    const lucro = Math.max(0, total - principal);
    return `<article class="card v35-history-row ${cls} border-${statusTone} border-start border-4 shadow-sm">
      <div class="card-body">
        <header class="v35-vale-header">
          <h4><i class="bi bi-receipt me-2"></i>Vale Nº ${String(v.numero||'').padStart(4,'0')}</h4>
          <span class="badge text-bg-${statusTone} rounded-pill v35-vale-status"><i class="bi ${statusIcon} me-1"></i>${cls.toUpperCase()}</span>
        </header>
        <div class="v35-modal-loan-metrics">
          <div class="v35-modal-stat"><small>VALOR EMPRESTADO</small><strong>${v35SafeMoney(principal)}</strong></div>
          <div class="v35-modal-stat"><small>VALOR A RECEBER</small><strong>${v35SafeMoney(total)}</strong></div>
          <div class="v35-modal-stat"><small>LUCRO</small><strong>${v35SafeMoney(lucro)}</strong></div>
        </div>
        <div class="v35-modal-date-grid">
          <div class="v35-modal-date-card"><small><i class="bi bi-calendar-event me-1"></i>DATA INICIAL</small><strong>${v35DateBr(v.dataInicial)}</strong></div>
          <div class="v35-modal-date-card"><small><i class="bi bi-calendar-check me-1"></i>DATA FINAL</small><strong>${v35DateBr(v.dataFinal)}</strong></div>
        </div>
        <div class="v35-modal-notes-wrap"><small><i class="bi bi-chat-left-text me-1"></i>OBSERVAÇÃO</small><ul class="v35-modal-notes">${obs}</ul></div>
        <footer class="v35-modal-history-actions"><button class="btn btn-success btn-sm" onclick="closeClientReport();openWhatsLoan('${v.id}')"><i class="bi bi-whatsapp me-1"></i>WHATSAPP</button><button class="btn btn-danger btn-sm" onclick="closeClientReport();openPdfPreviewById('${v.id}')"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button><button class="btn btn-primary btn-sm" onclick="closeClientReport();openReceiveModal('${v.id}')"><i class="bi bi-cash-coin me-1"></i>RECEBER</button></footer>
      </div>
    </article>`;
  }).join('') || '<div class="empty-state">Cliente ainda não possui vales.</div>';
  const modalTone = x.classe === 'excelente' ? 'success' : (x.classe === 'bom' ? 'primary' : (x.classe === 'regular' ? 'warning' : 'danger'));
  const modalStars = Array.from({length:5}, (_,i) => `<i class="bi ${i < Math.max(0, Math.min(5, (String(x.stars||'').match(/★/g)||[]).length)) ? 'bi-star-fill' : 'bi-star'}"></i>`).join('');
  modal.innerHTML = `<div class="client-report-card v35-client-report-card" style="--v35-score-color:var(--bs-${modalTone})">
    <button class="client-report-close btn btn-outline-primary" onclick="closeClientReport()" aria-label="Fechar"><i class="bi bi-x-lg"></i></button>
    <div class="v35-report-head">
      <div class="v35-report-person"><div class="v35-report-avatar">${v35Escape((x.nome||'C').trim().split(/\s+/).slice(0,2).map(n=>n[0]||'').join('').toUpperCase())}</div><div class="min-w-0"><h2>${v35Escape(x.nome)}</h2><p><span><i class="bi bi-telephone me-1"></i>${v35Escape(x.telefone || 'SEM TELEFONE')}</span>${x.cpf ? `<span><i class="bi bi-person-vcard me-1"></i>CPF: ${v35Escape(x.cpf)}</span>` : ''}</p></div></div>
      <span class="v35-score-badge text-bg-${modalTone}"><span class="v35-modal-stars">${modalStars}</span><b>${x.label}</b></span>
    </div>
    <div class="border-top my-3"></div>
    <div class="v35-report-summary"><div><span><i class="bi bi-speedometer2 me-1"></i>Score</span><strong>${x.score}/100</strong></div><div><span><i class="bi bi-receipt me-1"></i>Vales</span><strong>${x.qtd}</strong></div><div><span><i class="bi bi-check-circle me-1"></i>Pagos</span><strong>${x.pagos}</strong></div><div><span><i class="bi bi-wallet2 me-1"></i>Em aberto</span><strong>${x.abertos}</strong></div><div><span><i class="bi bi-exclamation-triangle me-1"></i>Atrasos</span><strong>${x.totalAtrasos}</strong></div><div><span><i class="bi bi-hourglass-split me-1"></i>Maior atraso</span><strong>${x.maiorAtraso} dias</strong></div><div><span><i class="bi bi-cash-stack me-1"></i>VALLE</span><strong>${v35SafeMoney(x.totalEmprestado)}</strong></div><div><span><i class="bi bi-coin me-1"></i>Juros pagos</span><strong>${v35SafeMoney(x.jurosRecebidos)}</strong></div></div>
    <div class="v35-report-dates"><span><i class="bi bi-calendar-event me-1"></i>Primeiro VALLE: <b>${x.primeiroVale ? v35DateBr(x.primeiroVale) : '-'}</b></span><span><i class="bi bi-calendar-check me-1"></i>Último pagamento: <b>${x.ultimoPagamento ? v35DateBr(x.ultimoPagamento) : '-'}</b></span></div>
    <h3 class="v35-modal-section-title"><i class="bi bi-clock-history me-2"></i>Histórico completo</h3><div class="v35-history-list">${rows}</div>
  </div>`;
  modal.classList.add('show');
  document.body.classList.add('v35-history-modal-open');
}
function closeClientReport(){ const m=$('clientReportModal'); if(m) m.classList.remove('show'); document.body.classList.remove('v35-history-modal-open'); }
function v35ExportReportCsv(){
  const rows = [['Cliente','Telefone','CPF','Classificacao','Score','Vales','Pagos','Em aberto','Atrasos','Maior atraso','Total em VALLES','Saldo aberto','Juros recebidos']];
  v35ClienteStats().forEach(x=>rows.push([x.nome,x.telefone,x.cpf,x.label,x.score,x.qtd,x.pagos,x.abertos,x.totalAtrasos,x.maiorAtraso,x.totalEmprestado,x.abertoValor,x.jurosRecebidos]));
  const csv = rows.map(r=>r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='relatorio-clientes.csv'; a.click(); URL.revokeObjectURL(a.href);
}

/* =========================================================
   INICIALIZAÇÃO FINAL REVISADA
   ---------------------------------------------------------
   Roda somente uma vez e só depois que o HTML estiver pronto.
   Depois faz uma segunda renderização no próximo frame para
   garantir que o Dashboard, relatórios e modais carreguem
   completos já na primeira abertura do sistema.
   ========================================================= */
let __appStarted = false;
function startAppSafely() {
  if (__appStarted) return;
  __appStarted = true;
  try {
    init();
    const refresh = () => {
      try { renderAll(); } catch (_) {}
      try { renderPremiumDashboard(); } catch (_) {}
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(refresh);
      requestAnimationFrame(() => setTimeout(refresh, 60));
    } else {
      setTimeout(refresh, 60);
    }
  } catch (e) {
    console.error('Erro ao iniciar o sistema:', e);
    try { renderAll(); } catch (_) {}
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAppSafely, { once: true });
} else {
  startAppSafely();
}


// Corrige a altura visual do Safari no iPhone, incluindo barras e safe-area.
(function valleFixIOSViewport(){
  const update = () => {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--valle-vh', `${h * 0.01}px`);
  };
  update();
  window.addEventListener('resize', update, { passive:true });
  window.addEventListener('orientationchange', () => setTimeout(update, 120), { passive:true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', update, { passive:true });
})();

/* Navegação móvel: transforma a barra em carrossel e centraliza a aba selecionada. */
(function setupMobileTabsCarousel() {
  const centerTab = (tab, behavior = 'smooth') => {
    if (!tab || window.innerWidth > 780) return;
    const nav = tab.closest('.tabs');
    if (!nav) return;

    const targetLeft = tab.offsetLeft - ((nav.clientWidth - tab.offsetWidth) / 2);
    const maxLeft = Math.max(0, nav.scrollWidth - nav.clientWidth);
    nav.scrollTo({
      left: Math.max(0, Math.min(targetLeft, maxLeft)),
      behavior
    });
  };

  const initialize = () => {
    const nav = document.querySelector('.tabs');
    if (!nav || nav.dataset.carouselReady === 'true') return;
    nav.dataset.carouselReady = 'true';

    nav.addEventListener('click', event => {
      const tab = event.target.closest('.tab');
      if (!tab || !nav.contains(tab)) return;
      requestAnimationFrame(() => centerTab(tab));
    });

    window.addEventListener('resize', () => {
      const activeTab = nav.querySelector('.tab.active');
      requestAnimationFrame(() => centerTab(activeTab, 'auto'));
    }, { passive: true });

    requestAnimationFrame(() => centerTab(nav.querySelector('.tab.active'), 'auto'));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();

/* Navegação mobile por gesto e barra inferior que oculta/aparece conforme a rolagem. */
(function setupValleMobileGestures(){
  const MOBILE_MAX = 780;
  const SWIPE_MIN = 68;
  const screensOrder = [
    'dashboard',
    'notificacoes',
    'emprestimo',
    'clientes',
    'historico',
    'relatorios',
    'calendario'
  ];

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;
  let gestureBlocked = false;
  let lastScrollY = Math.max(0, window.scrollY);
  let scrollTicking = false;
  let screenTransitioning = false;

  const isMobile = () => window.innerWidth <= MOBILE_MAX;

  const isInteractiveTarget = target => Boolean(target?.closest(
    'input, textarea, select, button, a, label, [contenteditable="true"], ' +
    '.tabs, .modal, .dialog, .app-modal, .sheet, .table-wrap, [data-no-swipe]'
  ));

  const activeScreenId = () => {
    const active = document.querySelector('.screen.active');
    return active?.id || document.querySelector('.tab.active')?.dataset.screen || 'dashboard';
  };

  const animateScreenChange = async (direction, changeScreen) => {
    if (screenTransitioning) return;
    screenTransitioning = true;

    const root = document.documentElement;
    const directionClass = direction === 'next' ? 'valle-slide-next' : 'valle-slide-prev';
    root.classList.remove('valle-slide-next', 'valle-slide-prev');
    root.classList.add(directionClass);

    try {
      /*
       * O View Transitions API cria snapshots das duas telas e faz toda a
       * animação na camada de composição da GPU. Isso evita a piscada e o
       * travamento causado pelo renderAll() durante a troca de aba.
       */
      if (typeof document.startViewTransition === 'function') {
        const transition = document.startViewTransition(() => {
          changeScreen();
        });

        await transition.finished.catch(() => {});
        return;
      }

      /* Fallback para navegadores sem View Transitions: a nova tela entra e a
         antiga sai ao mesmo tempo, sem esperar uma animação terminar primeiro. */
      const outgoing = document.querySelector('.screen.active');
      const oldRect = outgoing?.getBoundingClientRect();
      let ghost = null;

      if (outgoing && oldRect && oldRect.width > 0 && oldRect.height > 0) {
        ghost = outgoing.cloneNode(true);
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, {
          position: 'fixed',
          left: `${oldRect.left}px`,
          top: `${oldRect.top}px`,
          width: `${oldRect.width}px`,
          height: `${oldRect.height}px`,
          margin: '0',
          zIndex: '99990',
          pointerEvents: 'none',
          overflow: 'hidden',
          display: 'block',
          contain: 'strict',
          willChange: 'transform',
          transform: 'translate3d(0,0,0)'
        });
        document.body.appendChild(ghost);
      }

      changeScreen();
      await new Promise(resolve => requestAnimationFrame(resolve));

      const incoming = document.querySelector('.screen.active');
      const enterFrom = direction === 'next' ? '100%' : '-100%';
      const exitTo = direction === 'next' ? '-30%' : '30%';
      const options = {
        duration: 420,
        easing: 'cubic-bezier(.32,.72,0,1)',
        fill: 'both'
      };

      const animations = [];
      if (incoming?.animate) {
        incoming.getAnimations().forEach(animation => animation.cancel());
        animations.push(incoming.animate([
          { transform: `translate3d(${enterFrom},0,0)` },
          { transform: 'translate3d(0,0,0)' }
        ], options).finished.catch(() => {}));
      }
      if (ghost?.animate) {
        animations.push(ghost.animate([
          { transform: 'translate3d(0,0,0)' },
          { transform: `translate3d(${exitTo},0,0)` }
        ], options).finished.catch(() => {}));
      }

      await Promise.all(animations);
      ghost?.remove();
    } finally {
      root.classList.remove('valle-slide-next', 'valle-slide-prev');
      screenTransitioning = false;
    }
  };

  const moveScreen = direction => {
    if (!isMobile()) return;
    const current = activeScreenId();
    const currentIndex = screensOrder.indexOf(current);
    if (currentIndex < 0) return;

    // Conforme solicitado: arrastar para a direita volta; para a esquerda avança.
    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= screensOrder.length) return;

    const targetId = screensOrder[targetIndex];
    const targetTab = document.querySelector(`.tab[data-screen="${targetId}"]`);
    if (!targetTab) return;

    animateScreenChange(direction, () => targetTab.click());
  };

  const onTouchStart = event => {
    if (!isMobile() || event.touches.length !== 1) return;
    gestureBlocked = isInteractiveTarget(event.target);
    if (gestureBlocked) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    tracking = true;
  };

  const onTouchEnd = event => {
    if (!tracking || gestureBlocked || !isMobile() || !event.changedTouches.length) {
      tracking = false;
      return;
    }

    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const elapsed = Date.now() - startTime;
    tracking = false;

    // Só aceita um gesto claramente horizontal e relativamente rápido.
    if (elapsed > 850 || Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    moveScreen(dx > 0 ? 'prev' : 'next');
  };

  const updateNavOnScroll = () => {
    scrollTicking = false;
    if (!isMobile()) {
      document.body.classList.remove('mobile-nav-hidden');
      lastScrollY = Math.max(0, window.scrollY);
      return;
    }

    const currentY = Math.max(0, window.scrollY);
    const delta = currentY - lastScrollY;

    if (currentY <= 18) {
      document.body.classList.remove('mobile-nav-hidden');
    } else if (delta > 7) {
      // Página descendo (dedo sobe): esconde.
      document.body.classList.add('mobile-nav-hidden');
    } else if (delta < -7) {
      // Página subindo (dedo desce): mostra.
      document.body.classList.remove('mobile-nav-hidden');
    }

    lastScrollY = currentY;
  };

  const onScroll = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateNavOnScroll);
  };

  document.addEventListener('touchstart', onTouchStart, { passive:true });
  document.addEventListener('touchend', onTouchEnd, { passive:true });
  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', () => {
    if (!isMobile()) document.body.classList.remove('mobile-nav-hidden');
  }, { passive:true });

  // Ao trocar de aba, garante que a barra reapareça e fique centralizada.
  document.addEventListener('click', event => {
    const tab = event.target.closest('.tab');
    if (!tab || !isMobile()) return;
    document.body.classList.remove('mobile-nav-hidden');
  });
})();


/* Abre diretamente a cobrança indicada por uma notificação push. */
(function setupPushNotificationDeepLink() {
  let handledKey = '';

  function getDeepLink() {
    const params = new URLSearchParams(window.location.search);
    return {
      screen: params.get('screen') || (window.location.hash === '#notificacoes' ? 'notificacoes' : ''),
      valeId: params.get('vale') || ''
    };
  }

  function cleanDeepLinkUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('screen');
    url.searchParams.delete('vale');
    url.hash = 'notificacoes';
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function openPushTarget(attempt = 0) {
    const target = getDeepLink();
    if (target.screen !== 'notificacoes') return;

    const key = `${target.screen}:${target.valeId}`;
    if (handledKey === key && attempt === 0) return;

    if (typeof window.switchScreen !== 'function' && typeof switchScreen !== 'function') {
      if (attempt < 20) setTimeout(() => openPushTarget(attempt + 1), 300);
      return;
    }

    try {
      switchScreen('notificacoes');
      notificationActiveFilter = 'hoje';
      document.querySelectorAll('.notif-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.notifFilter === 'hoje');
      });
      renderNotifications();
    } catch (_) {
      if (attempt < 20) setTimeout(() => openPushTarget(attempt + 1), 300);
      return;
    }

    if (!target.valeId) {
      handledKey = key;
      cleanDeepLinkUrl();
      return;
    }

    const selectorId = (window.CSS && CSS.escape) ? CSS.escape(target.valeId) : target.valeId.replace(/["\\]/g, '\\$&');
    const card = document.querySelector(`[data-notification-vale-id="${selectorId}"]`);
    if (!card) {
      if (attempt < 20) setTimeout(() => openPushTarget(attempt + 1), 300);
      return;
    }

    handledKey = key;
    card.classList.add('push-notification-target');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => card.classList.remove('push-notification-target'), 5000);
    cleanDeepLinkUrl();
  }

  window.addEventListener('load', () => setTimeout(() => openPushTarget(), 700));
  window.addEventListener('hashchange', () => setTimeout(() => openPushTarget(), 100));
  window.addEventListener('popstate', () => setTimeout(() => openPushTarget(), 100));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => openPushTarget(), 150);
  });
})();
