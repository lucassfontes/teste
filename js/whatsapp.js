/**
 * WHATSAPP
 * Funções de apoio para abrir conversas e compartilhar dados/PDF.
 */

async function enviarValeWhatsApp(v){
  const cad=encontrarCliente(v.cliente); const tel=v.telefone||(cad?cad.telefone:''); const fone=telefoneWhatsApp(tel);
  if(!fone){toast('CADASTRE O TELEFONE DO CLIENTE');return;}
  v.telefone=tel; const blob=criarPdfVale(v); const file=new File([blob],nomeArquivoPdf(v),{type:'application/pdf'});
  try{
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'VALE DE EMPRESTIMO'});toast('ESCOLHA O WHATSAPP E ENVIE O PDF');}
    else{baixarPdfVale(v);window.open(`https://wa.me/${fone}`,'_blank');toast('PDF BAIXADO. ANEXE NO WHATSAPP');}
  }catch(e){toast('ENVIO CANCELADO');}
}
function abrirWhatsAppPorTelefone(t,nome){const fone=telefoneWhatsApp(t);if(!fone){toast('CLIENTE SEM TELEFONE');return;}const texto=encodeURIComponent(`Olá ${nome||''}`.trim());window.open(`https://wa.me/${fone}?text=${texto}`,'_blank');}
function abrirWhatsAppCliente(id){const c=dados.clientes.find(x=>x.id===id);if(c)abrirWhatsAppPorTelefone(c.telefone,c.nome);}
function enviarValeAtualWhatsApp(){const v=novoVale(),erro=validarVale(v);if(erro){toast(erro);return;}salvarVale(v);renderTudo();toast('VALE SALVO NO HISTÓRICO');enviarValeWhatsApp(v);}
function enviarValeHistorico(id){const v=dados.vales.find(x=>x.id===id);if(v)enviarValeWhatsApp({...v});}
