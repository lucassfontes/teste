/**
 * DASHBOARD
 * Funções de apoio para cálculos financeiros do painel.
 */

function renderDashboard(){
  let emp=0,rec=0,recebido=0,aberto=0,atrasados=0;
  dados.vales.forEach(v=>{emp+=v.valor;rec+=v.total;if(v.status==='PAGO')recebido+=Math.max(0, Number(v.total||0)-Number(v.valor||0));else aberto+=v.total;if(statusVale(v)==='atrasado')atrasados++;});
  $('dashEmprestado').textContent=moeda(emp);$('dashReceber').textContent=moeda(rec);$('dashRecebido').textContent=moeda(recebido);$('dashAberto').textContent=moeda(aberto);$('dashClientes').textContent=dados.clientes.length;$('dashAtrasados').textContent=atrasados;
  const hoje=new Date(dataInput(new Date())+'T00:00:00');
  const proximos=dados.vales.filter(v=>v.status!=='PAGO').map(v=>({...v,diasAte:Math.round((new Date(v.dataFinal+'T00:00:00')-hoje)/86400000)})).filter(v=>v.diasAte<=7).sort((a,b)=>a.dataFinal.localeCompare(b.dataFinal)).slice(0,8);
  $('listaVencimentos').innerHTML=proximos.length?proximos.map(v=>`<div class="item"><div class="item-top"><h3>${htmlEsc(v.cliente)}</h3><span class="status ${statusVale(v)}">${v.diasAte<0?'ATRASADO':v.diasAte===0?'HOJE':v.diasAte+' DIAS'}</span></div><p>TOTAL: <b>${moeda(v.total)}</b><br>VENCIMENTO: ${dataBR(v.dataFinal)}</p></div>`).join(''):'<div class="ajuda">NENHUM VENCIMENTO PRÓXIMO.</div>';
}
