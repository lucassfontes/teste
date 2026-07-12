/**
 * PDF
 * Funções de apoio para criação de PDF em versões modularizadas do sistema.
 */

function pdfTxt(t){return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function nomeArquivoPdf(v){return `VALLE-${pdfTxt(v.cliente||'CLIENTE').replace(/\s+/g,'-')}-${dataBR(v.dataFinal).replace(/\//g,'-')}.pdf`;}
function criarPdfVale(v){
  const W=420,H=595,ops=[]; const esc=pdfTxt;
  const rgb=hex=>{hex=hex.replace('#','');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).join(' ')};
  const fill=hex=>ops.push(rgb(hex)+' rg'), stroke=hex=>ops.push(rgb(hex)+' RG');
  const txt=(t,x,y,size=10,bold=false,hex='#111827')=>{fill(hex);ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`)};
  const line=(x1,y1,x2,y2,hex='#111827',w=1)=>{stroke(hex);ops.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`)};
  const rect=(x,y,w,h,fillHex=null,strokeHex='#111827',lw=1)=>{stroke(strokeHex);ops.push(`${lw} w`); if(fillHex){fill(fillHex);ops.push(`${x} ${y} ${w} ${h} re B`)}else ops.push(`${x} ${y} ${w} ${h} re S`)};
  const fitSize=(text,maxWidth,start=22,min=11)=>{
    const len=String(text||'').length || 1;
    const estimated=start*0.56*len;
    return Math.max(min, Math.min(start, Math.floor(start*(maxWidth/estimated))));
  };

  // Largura aproximada em Helvetica/Helvetica-Bold para ajustar valores no PDF.
  const textWidth=(text,size)=>{
    const t=String(text||'');
    let total=0;
    for(const ch of t){
      if('1Iil., '.includes(ch)) total+=0.32;
      else if('MW'.includes(ch)) total+=0.86;
      else if('R$%'.includes(ch)) total+=0.62;
      else total+=0.58;
    }
    return total*size;
  };
  const fitTextCenter=(text,x,y,maxWidth,start=20,min=11,hex='#111827')=>{
    let size=start;
    while(textWidth(text,size)>maxWidth && size>min) size-=0.5;
    const w=textWidth(text,size);
    txt(text,x+(maxWidth-w)/2,y,size,true,hex);
  };
  const labelCenter=(label,x,y,w,hex='#0b3a78')=>{
    const size=8;
    const labelW=textWidth(label,size);
    txt(label,x+(w-labelW)/2,y,size,true,hex);
  };
  const quebrarNomeCliente=(texto,maxWidth,startSize=20,minSize=11)=>{
    const nome=String(texto||'NAO INFORMADO').replace(/\s+/g,' ').trim().toUpperCase();
    const palavras=nome.split(' ').filter(Boolean);
    let size=startSize;

    // Primeiro tenta caber em uma linha, reduzindo a fonte.
    while(size>=minSize){
      if(textWidth(nome,size)<=maxWidth){
        return {linhas:[nome],size};
      }
      size--;
    }

    // Se não couber, divide em duas linhas procurando a quebra mais equilibrada.
    size=startSize;
    while(size>=minSize){
      let melhor=[nome,''];
      let melhorLargura=Infinity;
      for(let i=1;i<palavras.length;i++){
        const l1=palavras.slice(0,i).join(' ');
        const l2=palavras.slice(i).join(' ');
        const largura=Math.max(textWidth(l1,size),textWidth(l2,size));
        if(largura<melhorLargura){
          melhor=[l1,l2];
          melhorLargura=largura;
        }
      }
      if(melhorLargura<=maxWidth){
        return {linhas:melhor.filter(Boolean),size};
      }
      size--;
    }

    // Último recurso: quebra no meio das palavras, usando fonte mínima.
    const meio=Math.ceil(palavras.length/2);
    return {
      linhas:[palavras.slice(0,meio).join(' '), palavras.slice(meio).join(' ')].filter(Boolean),
      size:minSize
    };
  };
  const smallLabel=(label,x,y,hex='#0b3a78')=>txt(label,x,y,8,true,hex);
  const dashed=(x1,y,x2)=>{stroke('#9ca3af');ops.push(`0.8 w [3 5] 0 d ${x1} ${y} m ${x2} ${y} l S [] 0 d`)};

  // Moldura principal do vale
  rect(12,10,W-24,H-20,'#ffffff','#9ca3af',1);
  rect(22,20,W-44,H-40,null,'#0b3a78',1.4);

  // Cabeçalho
  txt('VALLE',38,H-66,42,true,'#0b3a78');
  rect(172,H-72,84,44,'#1d63c7','#1d63c7',1);
  txt(`${diasVale(v)} DIAS`,187,H-46,15,true,'#ffffff');
  txt(`VALLE No ${String(v.numero||v.id||'0000').replace(/\D/g,'').slice(-4).padStart(4,'0')}`,300,H-46,11,true,'#0b3a78');
  txt('CONFIANCA E COMPROMISSO',284,H-66,7,true,'#0b3a78');
  txt('COMPROVANTE DE EMPRESTIMO',38,H-84,13,true,'#4b5563');
  line(38,H-102,W-38,H-102,'#0b3a78',1.2);

  // Dados do cliente. O telefone fica embaixo do nome para não sobrepor.
  let y=H-142;
  smallLabel('CLIENTE',38,y);
  const nome=String(v.cliente||'NAO INFORMADO').toUpperCase();

  // Fonte do nome reduzida e dinâmica:
  // nomes curtos ficam com 20, nomes médios com 18,
  // nomes longos com 16 e nomes muito longos com 14.
  let nomeSize = 20;
  if(nome.length > 20) nomeSize = 18;
  if(nome.length > 35) nomeSize = 16;
  if(nome.length > 50) nomeSize = 14;

  // Quebra automática do nome: se for grande, divide em até duas linhas.
  const nomeQuebrado=quebrarNomeCliente(nome,344,nomeSize,11);
  nomeSize=nomeQuebrado.size;
  const nomeGap=nomeSize+5;

  nomeQuebrado.linhas.forEach((linha,idx)=>{
    txt(linha,38,y-22-(idx*nomeGap),nomeSize,true,'#111827');
  });

  // Telefone e CPF descem conforme a quantidade de linhas do nome.
  let infoY=y-22-(nomeQuebrado.linhas.length*nomeGap)-4;

  txt('TELEFONE / WHATSAPP',38,infoY,8,true,'#166534');
  txt(v.telefone||'NAO INFORMADO',38,infoY-15,11,true,'#111827');

  txt('CPF',210,infoY,8,true,'#64748b');
  txt(v.cpf||'NAO INFORMADO',238,infoY-15,9,true,'#111827');

  infoY-=38;
  dashed(38,infoY-8,W-38);

  // Cartões de valores - 3 caixas iguais, valor centralizado e fonte ajustável.
  y=infoY-72;
  const cardX=38, cardGap=8, cardW=(344-(cardGap*2))/3, cardH=72;

  rect(cardX,y,cardW,cardH,'#f0f7ff','#93c5fd',1);
  labelCenter('VALOR DO',cardX,y+48,cardW,'#0b3a78');
  labelCenter('EMPRESTIMO',cardX,y+34,cardW,'#0b3a78');
  fitTextCenter(moeda(v.valor),cardX+6,y+14,cardW-12,18,10,'#0b3a78');

  const card2X=cardX+cardW+cardGap;
  rect(card2X,y,cardW,cardH,'#ecfdf5','#86efac',1);
  labelCenter('TOTAL A PAGAR',card2X,y+43,cardW,'#166534');
  fitTextCenter(moeda(v.total),card2X+6,y+15,cardW-12,18,10,'#166534');

  const card3X=card2X+cardW+cardGap;
  rect(card3X,y,cardW,cardH,'#fffbeb','#fde68a',1);
  labelCenter('TAXA DE',card3X,y+48,cardW,'#92400e');
  labelCenter('JUROS',card3X,y+34,cardW,'#92400e');
  fitTextCenter(String(v.juros).replace('.',',')+'%',card3X+6,y+14,cardW-12,18,10,'#92400e');

  // Status
  y-=48;
  rect(38,y,344,34,'#faf5ff','#c084fc',1);
  smallLabel('STATUS',52,y+21,'#7e22ce');
  txt(v.status||'ABERTO',52,y+7,16,true,'#6b21a8');

  // Datas
  y-=58;
  rect(38,y,344,46,'#f8fbff','#bfdbfe',1);
  smallLabel('DATA INICIAL',55,y+29,'#0b3a78');
  txt(dataBR(v.dataInicial),55,y+11,13,true,'#111827');
  line(210,y+9,210,y+36,'#9ca3af',0.7);
  smallLabel('DATA FINAL',235,y+29,'#0b3a78');
  txt(dataBR(v.dataFinal),235,y+11,13,true,'#dc2626');

  // Observação
  y-=74;
  rect(38,y,344,54,'#ffffff','#d1d5db',0.9);
  txt('OBSERVACAO',54,y+38,8,true,'#64748b');

  // Mantém as quebras de linha da observação no PDF.
  // Também corrige registros antigos que ficaram colados, exemplo:
  // "PAGO R$30,0004/07/2026" ou "PAGO R$50,00OBS".
  const prepararObsPdf=(valor,maxChars=58,maxLines=4)=>{
    let texto=String(valor||'NENHUMA')
      .replace(/\r\n/g,'\n')
      .replace(/\r/g,'\n')
      .toUpperCase()
      .replace(/(R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})(?=\d{2}\/\d{2}\/\d{4}\s*-\s*PAGO)/g,'$1\n')
      .replace(/(PAGO\s+R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})(?=[A-Z])/g,'$1\n');

    const linhas=[];
    texto.split('\n').forEach(parte=>{
      parte=parte.trim();
      if(!parte){
        if(linhas.length && linhas[linhas.length-1] !== '') linhas.push('');
        return;
      }
      while(parte.length>maxChars){
        let corte=parte.lastIndexOf(' ',maxChars);
        if(corte<18)corte=maxChars;
        linhas.push(parte.slice(0,corte).trim());
        parte=parte.slice(corte).trim();
      }
      linhas.push(parte);
    });
    return (linhas.length?linhas:['NENHUMA']).slice(0,maxLines);
  };

  const obsLinhas=prepararObsPdf(v.observacao);
  obsLinhas.forEach((linha,i)=>txt(linha||' ',54,y+24-(i*10),7.5,i===0,'#111827'));
  dashed(54,y+12,366);
  dashed(54,y-4,366);

  // Assinatura
  y-=70;
  rect(38,y,344,54,'#ffffff','#d1d5db',0.9);
  txt('ASSINATURA DO CLIENTE',54,y+36,8,true,'#374151');
  line(76,y+10,344,y+10,'#111827',0.9);

  // Rodapé
  line(38,48,W-38,48,'#0b3a78',1.2);
  txt('Valle gerado pelo sistema de controle de clientes.',54,30,7,false,'#64748b');
  txt(`VALLE No ${String(v.numero||v.id||'0000').replace(/\D/g,'').slice(-4).padStart(4,'0')}`,312,30,10,true,'#0b3a78');

  const stream=ops.join('\n');
  const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n',pos=[0]; objs.forEach((o,i)=>{pos.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;}); const xref=pdf.length; pdf+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'; for(let i=1;i<pos.length;i++)pdf+=String(pos[i]).padStart(10,'0')+' 00000 n \n'; pdf+=`trailer << /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes=new Uint8Array(pdf.length); for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255; return new Blob([bytes],{type:'application/pdf'});
}
function baixarPdfVale(v){const blob=criarPdfVale(v);const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nomeArquivoPdf(v);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function imprimirVale(v){
  // Imprime exatamente o mesmo arquivo PDF gerado pelo sistema.
  // Não usa mais uma tela HTML separada, para o layout da impressão ficar igual ao PDF.
  const blob=criarPdfVale(v);
  const url=URL.createObjectURL(blob);
  const w=window.open(url,'_blank');
  if(!w){
    baixarPdfVale(v);
    if(typeof toast==='function')toast('PDF BAIXADO. ABRA O ARQUIVO PARA IMPRIMIR');
    setTimeout(()=>URL.revokeObjectURL(url),15000);
    return;
  }
  setTimeout(()=>{
    try{
      w.focus();
      w.print();
    }catch(e){
      if(typeof toast==='function')toast('PDF ABERTO. USE IMPRIMIR NO NAVEGADOR');
    }
  },1200);
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
