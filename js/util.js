/**
 * UTILITÁRIOS GERAIS
 * Funções auxiliares de formatação usadas por versões separadas do projeto.
 */

const $=id=>document.getElementById(id);
function toast(t){const e=$('toast');e.textContent=t;e.style.display='block';setTimeout(()=>e.style.display='none',2300);}
function moedaNumero(str){return Number(String(str||'').replace(/\D/g,''))/100;}
function moeda(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function taxaNumero(){return parseFloat(String($('juros').value||'').replace(',','.').replace('%',''))||0;}
function dataInput(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dataBR(t){if(!t)return'--/--/----';const p=t.split('-');return `${p[2]}/${p[1]}/${p[0]}`;}
function diasEntreDatas(i,f){if(!i||!f)return 0;return Math.round((new Date(f+'T00:00:00')-new Date(i+'T00:00:00'))/86400000);}
function diasEntre(){return diasEntreDatas($('dataInicial').value,$('dataFinal').value);}
function diasVale(v){return diasEntreDatas(v.dataInicial,v.dataFinal);}
function apenasNumeros(t){return String(t||'').replace(/\D/g,'');}
function maiusculo(el){const i=el.selectionStart,f=el.selectionEnd;el.value=el.value.toUpperCase();try{el.setSelectionRange(i,f)}catch(e){}}
function maskTelefone(el){let n=apenasNumeros(el.value).slice(0,11);if(n.length<=2)el.value=n;else if(n.length<=6)el.value=`(${n.slice(0,2)}) ${n.slice(2)}`;else if(n.length<=10)el.value=`(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;else el.value=`(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;}
function maskCPF(el){let n=apenasNumeros(el.value).slice(0,11);if(n.length<=3)el.value=n;else if(n.length<=6)el.value=`${n.slice(0,3)}.${n.slice(3)}`;else if(n.length<=9)el.value=`${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6)}`;else el.value=`${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}`;}
function telefoneWhatsApp(t){let n=apenasNumeros(t);if(!n)return'';if(n.length===10||n.length===11)n='55'+n;return n;}
function htmlEsc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
