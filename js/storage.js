/**
 * ARMAZENAMENTO LOCAL
 * Funções de apoio para salvar e carregar dados no localStorage.
 */

const LS='sistema_emprestimos_v4';
let dados=JSON.parse(localStorage.getItem(LS)||'{}');
let editandoId=null;
function normalizarDados(){
  if(!dados.clientes)dados.clientes=[{id:'C1',nome:'LUCAS FONTES',telefone:'',cpf:'',endereco:''},{id:'C2',nome:'RUAN CARLOS',telefone:'',cpf:'',endereco:''},{id:'C3',nome:'MARIA SILVA',telefone:'',cpf:'',endereco:''}];
  if(!dados.vales)dados.vales=[];
  dados.clientes=dados.clientes.map(c=>typeof c==='string'?{id:'C'+Date.now()+Math.random().toString(16).slice(2),nome:c.toUpperCase(),telefone:'',cpf:'',endereco:''}:{id:c.id||('C'+Date.now()+Math.random().toString(16).slice(2)),nome:String(c.nome||c.name||'').toUpperCase(),telefone:String(c.telefone||c.phone||''),cpf:String(c.cpf||''),endereco:String(c.endereco||'').toUpperCase()}).filter(c=>c.nome);
  dados.vales=dados.vales.map(v=>({...v,cliente:String(v.cliente||'').toUpperCase(),telefone:String(v.telefone||''),cpf:String(v.cpf||''),endereco:String(v.endereco||'').toUpperCase(),status:v.status||'ABERTO'}));
  if(!dados.tema)dados.tema='claro';
}
function salvar(){normalizarDados();localStorage.setItem(LS,JSON.stringify(dados));}
function encontrarCliente(nome){nome=String(nome||'').toUpperCase();return dados.clientes.find(c=>c.nome===nome)||null;}
function garantirCliente(nome,telefone='',cpf='',endereco=''){nome=String(nome||'').trim().toUpperCase();if(!nome)return null;let c=encontrarCliente(nome);if(!c){c={id:'C'+Date.now()+Math.random().toString(16).slice(2),nome,telefone,cpf,endereco};dados.clientes.push(c);}else{if(telefone)c.telefone=telefone;if(cpf)c.cpf=cpf;if(endereco)c.endereco=endereco;}return c;}
