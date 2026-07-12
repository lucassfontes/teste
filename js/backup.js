/**
 * BACKUP
 * Funções de apoio para exportar e restaurar JSON.
 */

function baixarBackup(){const blob=new Blob([JSON.stringify(dados,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='backup-valle.json';a.click();URL.revokeObjectURL(a.href);}
function restaurarBackup(ev){const file=ev.target.files[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{const obj=JSON.parse(r.result);if(!obj.clientes||!obj.vales)throw Error();dados=obj;normalizarDados();salvar();iniciar();toast('BACKUP RESTAURADO');}catch(e){toast('ARQUIVO INVÁLIDO');}};r.readAsText(file);}
function exportarCSV(){const linhas=[['CLIENTE','TELEFONE','VALOR','JUROS','TOTAL','DATA INICIAL','DATA FINAL','STATUS','OBSERVACAO']];dados.vales.forEach(v=>linhas.push([v.cliente,v.telefone||'',moeda(v.valor),String(v.juros).replace('.',',')+'%',moeda(v.total),dataBR(v.dataInicial),dataBR(v.dataFinal),v.status,v.observacao||'']));const csv=linhas.map(l=>l.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='valle.csv';a.click();URL.revokeObjectURL(a.href);}
async function limparTudo(){const ok=window.appConfirm?await appConfirm('Esta ação apaga todos os dados salvos.',{title:'Apagar todos os dados?',icon:'⚠️',confirmText:'Apagar',cancelText:'Cancelar'}):confirm('APAGAR TODOS OS DADOS?');if(ok){dados={clientes:[],vales:[],tema:dados.tema};salvar();iniciar();}}
