import React, { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";

// ============================================================================
// Configuracao da API Anthropic (chamada direta pelo navegador).
// A chave NUNCA vai para nenhum servidor nosso: fica apenas no localStorage do
// navegador do usuario e e enviada direto para api.anthropic.com.
// ============================================================================
var API = { key: "", model: "claude-sonnet-4-6", usarIA: true };

function carregarSettings() {
  try {
    var s = JSON.parse(localStorage.getItem("mpba:settings") || "{}");
    API.key = s.key || "";
    API.model = s.model || "claude-sonnet-4-6";
    API.usarIA = s.usarIA !== false;
  } catch (e) {}
  return { key: API.key, model: API.model, usarIA: API.usarIA };
}
function salvarSettings(s) {
  API.key = s.key || "";
  API.model = s.model || "claude-sonnet-4-6";
  API.usarIA = s.usarIA !== false;
  try { localStorage.setItem("mpba:settings", JSON.stringify({ key: API.key, model: API.model, usarIA: API.usarIA })); } catch (e) {}
}

// Storage helpers (localStorage no lugar do window.storage do runtime de artefatos)
async function sGet(key) {
  try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function sSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Comarcas
const COMARCAS = {
  prado:       { label: "Prado/BA",       email: "prado@mpba.mp.br",       promotoria: "Promotorias de Justica de Prado e Nova Vicosa" },
  nova_vicosa: { label: "Nova Vicosa/BA", email: "nova.vicosa@mpba.mp.br", promotoria: "Promotorias de Justica de Prado e Nova Vicosa" },
  alcobaca:    { label: "Alcobaca/BA",    email: "alcobaca@mpba.mp.br",    promotoria: "Promotoria de Justica de Alcobaca" },
};

const DEST_INICIAIS = [
  { id:"di01", comarca:"prado",       chave:"conselho tutelar", nome:"Conselho Tutelar de Prado",              email:"", tratamento:"Ao Ilustre Conselheiro Tutelar",          tipo:"institucional" },
  { id:"di02", comarca:"prado",       chave:"creas",            nome:"CREAS Prado/BA",                         email:"", tratamento:"Ao Coordenador do CREAS",                 tipo:"institucional" },
  { id:"di03", comarca:"prado",       chave:"cras",             nome:"CRAS Prado/BA",                          email:"", tratamento:"Ao Coordenador do CRAS",                  tipo:"institucional" },
  { id:"di04", comarca:"prado",       chave:"policia civil",    nome:"Delegacia de Policia Civil de Prado/BA", email:"", tratamento:"Ao Delegado de Policia",                  tipo:"institucional" },
  { id:"di05", comarca:"prado",       chave:"prefeitura",       nome:"Prefeitura Municipal de Prado/BA",       email:"", tratamento:"Ao Prefeito Municipal",                   tipo:"institucional" },
  { id:"di06", comarca:"prado",       chave:"secretaria saude", nome:"Secretaria de Saude de Prado/BA",        email:"", tratamento:"Ao Secretario Municipal de Saude",        tipo:"institucional" },
  { id:"di07", comarca:"prado",       chave:"hospital",         nome:"Hospital Municipal de Prado/BA",         email:"", tratamento:"Ao Diretor do Hospital Municipal",        tipo:"institucional" },
  { id:"di08", comarca:"nova_vicosa", chave:"conselho tutelar", nome:"Conselho Tutelar de Nova Vicosa",        email:"", tratamento:"Ao Ilustre Conselheiro Tutelar",          tipo:"institucional" },
  { id:"di09", comarca:"nova_vicosa", chave:"creas",            nome:"CREAS Nova Vicosa/BA",                   email:"", tratamento:"Ao Coordenador do CREAS",                 tipo:"institucional" },
  { id:"di10", comarca:"nova_vicosa", chave:"policia civil",    nome:"Delegacia de Policia Civil Nova Vicosa", email:"", tratamento:"Ao Delegado de Policia",                  tipo:"institucional" },
  { id:"di11", comarca:"nova_vicosa", chave:"prefeitura",       nome:"Prefeitura Municipal de Nova Vicosa/BA", email:"", tratamento:"Ao Prefeito Municipal",                   tipo:"institucional" },
  { id:"di12", comarca:"alcobaca",    chave:"conselho tutelar", nome:"Conselho Tutelar de Alcobaca",           email:"", tratamento:"Ao Ilustre Conselheiro Tutelar",          tipo:"institucional" },
  { id:"di13", comarca:"alcobaca",    chave:"policia civil",    nome:"Delegacia de Policia Civil de Alcobaca", email:"", tratamento:"Ao Delegado de Policia",                  tipo:"institucional" },
  { id:"di14", comarca:"alcobaca",    chave:"prefeitura",       nome:"Prefeitura Municipal de Alcobaca/BA",    email:"", tratamento:"Ao Prefeito Municipal",                   tipo:"institucional" },
];

const SERV_INICIAIS = [
  { id:"sv01", nome:"Rodrigo Ribeiro Secundino",    matricula:"355.757", comarca:"prado"       },
  { id:"sv02", nome:"Jose Jacques Barros Guarino",  matricula:"--",      comarca:"nova_vicosa" },
];

const TIPOS_PROC = ["PA", "IP", "NF", "IC", "PP", "TCO"];

function uid() { return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2); }

function encXml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function xmlPar(texto, opts) {
  var bold = opts && opts.bold ? true : false;
  var size = (opts && opts.size) ? opts.size : 20;
  var align = (opts && opts.align) ? opts.align : "both";
  var sb = (opts && opts.sb) ? opts.sb : 0;
  var sa = (opts && opts.sa) ? opts.sa : 0;
  var ind = (opts && opts.ind) ? opts.ind : 0;
  var jc = align === "center" ? "center" : align === "right" ? "right" : "both";
  var indTag = ind ? "<w:ind w:left=\"" + ind + "\"/>" : "";
  var bTag = bold ? "<w:b/>" : "";
  var sz = "<w:sz w:val=\"" + size + "\"/><w:szCs w:val=\"" + size + "\"/>";
  var sp = "<w:spacing w:before=\"" + sb + "\" w:after=\"" + sa + "\" w:line=\"360\" w:lineRule=\"auto\"/>";
  var font = "<w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:cs=\"Arial\"/>";
  return "<w:p><w:pPr><w:pStyle w:val=\"Standard\"/><w:autoSpaceDE w:val=\"0\"/>" + sp + indTag + "<w:jc w:val=\"" + jc + "\"/><w:rPr>" + font + bTag + sz + "</w:rPr></w:pPr><w:r><w:rPr>" + font + bTag + sz + "</w:rPr><w:t xml:space=\"preserve\">" + encXml(texto) + "</w:t></w:r></w:p>";
}

function xmlVazio() {
  return "<w:p><w:pPr><w:pStyle w:val=\"Standard\"/><w:autoSpaceDE w:val=\"0\"/><w:spacing w:line=\"360\" w:lineRule=\"auto\"/></w:pPr></w:p>";
}

function gerarBodyOficio(opts) {
  var dest = opts.destinatario;
  var itens = opts.itens;
  var numOficio = opts.numOficio;
  var data = opts.data;
  var promotoria = opts.promotoria;
  var cidade = opts.cidade;
  var x = "";
  x += xmlPar(dest.tratamento, { bold:true, size:22, align:"center", sa:60 });
  x += xmlPar(dest.nome, { size:20, align:"center", sa:120 });
  x += xmlVazio();
  x += xmlPar("OFICIO No " + numOficio, { bold:true, size:22, align:"center", sa:80 });
  x += xmlVazio();
  x += xmlPar(dest.tratamento.replace(/^Ao /,"") + ",", { size:20, sa:60 });
  x += xmlVazio();
  x += xmlPar("Cumprimentando-o cordialmente, o Promotor de Justica da " + promotoria + ", no uso de suas atribuicoes legais, solicita a Vossa Senhoria o atendimento das seguintes diligencias, em cumprimento aos despachos exarados nos procedimentos abaixo, cujas copias seguem em anexo:", { size:20, sa:80 });
  x += xmlVazio();
  for (var i = 0; i < itens.length; i++) {
    var item = itens[i];
    var font = "<w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:cs=\"Arial\"/>";
    x += "<w:p><w:pPr><w:pStyle w:val=\"Standard\"/><w:autoSpaceDE w:val=\"0\"/><w:spacing w:before=\"80\" w:after=\"80\" w:line=\"360\" w:lineRule=\"auto\"/><w:ind w:left=\"720\" w:hanging=\"360\"/><w:jc w:val=\"both\"/></w:pPr>";
    x += "<w:r><w:rPr>" + font + "<w:b/><w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/></w:rPr><w:t xml:space=\"preserve\">" + (i+1) + ". " + encXml(item.numProc) + " (" + encXml(item.tipo) + "): </w:t></w:r>";
    x += "<w:r><w:rPr>" + font + "<w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/></w:rPr><w:t xml:space=\"preserve\">" + encXml(item.teor) + "</w:t></w:r></w:p>";
  }
  x += xmlVazio();
  x += xmlPar("Prazo para resposta: 15 (quinze) dias uteis, nos termos do art. 26, par. 3., da Lei no 8.625/1993.", { size:20, sa:80 });
  x += xmlVazio();
  x += xmlPar("Atenciosamente,", { size:20, align:"center", sa:80 });
  x += xmlPar(cidade + "/BA, " + data + ".", { size:20, align:"center", sa:240 });
  x += xmlPar("REMI CESAR FARIAS DOS SANTOS JUNIOR", { bold:true, size:20, align:"center" });
  x += xmlPar("Promotor de Justica Substituto", { size:20, align:"center" });
  x += xmlPar(promotoria, { size:20, align:"center" });
  return x;
}

function gerarBodyCertidao(opts) {
  var numProc = opts.numProc;
  var tipo = opts.tipo;
  var expedicoes = opts.expedicoes;
  var data = opts.data;
  var nomeServ = opts.nomeServ;
  var matServ = opts.matServ;
  var promotoria = opts.promotoria;
  var cidade = opts.cidade;
  var x = "";
  x += xmlPar(numProc, { bold:true, size:24, align:"center", sa:60 });
  x += xmlVazio();
  x += xmlPar("CERTIDAO DE EXPEDICAO", { bold:true, size:22, align:"center", sa:80 });
  x += xmlVazio();
  x += xmlPar("Certifico que, em " + data + ", foram expedidos os oficios abaixo em cumprimento ao despacho exarado nos presentes autos do " + tipo + ", dando-se notificacao aos seguintes destinatarios:", { size:20, sa:80 });
  x += xmlVazio();
  for (var i = 0; i < expedicoes.length; i++) {
    var font = "<w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:cs=\"Arial\"/>";
    x += "<w:p><w:pPr><w:pStyle w:val=\"Standard\"/><w:autoSpaceDE w:val=\"0\"/><w:spacing w:before=\"60\" w:after=\"60\" w:line=\"360\" w:lineRule=\"auto\"/><w:ind w:left=\"720\" w:hanging=\"360\"/><w:jc w:val=\"both\"/></w:pPr>";
    x += "<w:r><w:rPr>" + font + "<w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/></w:rPr><w:t xml:space=\"preserve\">" + (i+1) + ". " + encXml(expedicoes[i].nome) + " -- Oficio no " + encXml(expedicoes[i].numOficio) + "</w:t></w:r></w:p>";
  }
  x += xmlVazio();
  x += xmlPar("Para constar, lavro a presente certidao.", { size:20, sa:80 });
  x += xmlVazio();
  x += xmlPar(cidade + "/BA, " + data + ".", { size:20, align:"center", sa:240 });
  x += xmlPar(nomeServ.toUpperCase(), { bold:true, size:20, align:"center" });
  x += xmlPar("Servidor(a) - Matricula no " + matServ, { size:20, align:"center" });
  x += xmlPar(promotoria, { size:20, align:"center" });
  return x;
}

// Carrega a casca timbrada (.docx oficial do MPBA) embutida no app como asset.
async function carregarCasca() {
  var resp = await fetch(import.meta.env.BASE_URL + "casca.docx");
  if (!resp.ok) throw new Error("Nao foi possivel carregar o modelo timbrado (casca.docx). HTTP " + resp.status);
  return await resp.arrayBuffer();
}

// Monta o .docx final injetando o corpo gerado no lugar do corpo da casca timbrada,
// preservando cabecalho/rodape com o timbre oficial.
async function montarDocx(bodyXml, cascaBytes) {
  // slice(0) clona o ArrayBuffer para permitir reutilizar a casca varias vezes.
  var zip = await JSZip.loadAsync(cascaBytes.slice(0));
  var docXml = await zip.file("word/document.xml").async("string");
  var newDoc = docXml.replace(/<w:body>[\s\S]*?<w:sectPr/, "<w:body>\n" + bodyXml + "\n<w:sectPr");
  zip.file("word/document.xml", newDoc);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function gerarEml(opts) {
  var dest = opts.dest;
  var numOficio = opts.numOficio;
  var promotoriaEmail = opts.promotoriaEmail;
  var data = opts.data;
  var promotoria = opts.promotoria;
  var assunto = "Oficio no " + numOficio + " - " + promotoria;
  var corpo = "<p>" + dest.tratamento.replace(/^Ao /,"") + ",</p><p>Encaminhamos em anexo o <strong>Oficio no " + numOficio + "</strong>, expedido pela " + promotoria + ", com diligencias a serem cumpridas. Seguem tambem os despachos originais de cada procedimento.</p><p><strong>Prazo: 15 (quinze) dias uteis.</strong></p><p>Atenciosamente,<br><strong>REMI CESAR FARIAS DOS SANTOS JUNIOR</strong><br>Promotor de Justica Substituto<br>" + promotoria + "<br>" + data + "</p>";
  var bd = "boundary_" + Date.now();
  var eml = "MIME-Version: 1.0\r\nFrom: " + promotoriaEmail + "\r\n" + (dest.email ? "To: " + dest.email + "\r\n" : "") + "Subject: " + assunto + "\r\nContent-Type: multipart/mixed; boundary=\"" + bd + "\"\r\n\r\n--" + bd + "\r\nContent-Type: text/html; charset=utf-8\r\n\r\n" + corpo + "\r\n\r\n--" + bd + "--\r\n";
  return { eml: eml, assunto: assunto };
}

// ====================== Chamadas a API Anthropic ======================
function anthropicHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": API.key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function callClaude(prompt) {
  if (!API.key) throw new Error("Chave da API Anthropic nao configurada.");
  var r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify({ model: API.model, max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
  });
  var d = await r.json();
  if (d.error) throw new Error("API erro: " + (d.error.message || JSON.stringify(d.error)));
  if (!d.content || !d.content[0]) throw new Error("API sem conteudo. HTTP: " + r.status);
  return d.content[0].text;
}

async function callClaudeComPDF(b64, prompt) {
  if (!API.key) throw new Error("Chave da API Anthropic nao configurada.");
  var r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify({
      model: API.model,
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: prompt }
        ]
      }]
    })
  });
  var d = await r.json();
  if (d.error) throw new Error("API erro: " + (d.error.message || JSON.stringify(d.error)));
  if (!d.content || !d.content[0]) throw new Error("API sem conteudo. HTTP: " + r.status);
  return d.content[0].text;
}

// Le arquivo como base64 (para PDFs) ou texto puro
function lerArquivoBase64(file) {
  return new Promise(function(resolve) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result.split(",")[1]); };
    reader.readAsDataURL(file);
  });
}

function lerArquivoTexto(file) {
  return new Promise(function(resolve) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.readAsText(file);
  });
}

// Extrai JSON de forma robusta mesmo com texto extra ao redor
function extrairJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch(e1) {}
  var limpo = raw.replace(/```json/g,"").replace(/```/g,"").trim();
  try { return JSON.parse(limpo); } catch(e2) {}
  var m1 = limpo.match(/\{[\s\S]*\}/);
  if (m1) { try { return JSON.parse(m1[0]); } catch(e3) {} }
  var m2 = limpo.match(/\[[\s\S]*\]/);
  if (m2) { try { return JSON.parse(m2[0]); } catch(e4) {} }
  throw new Error("Nao foi possivel extrair JSON da resposta: " + raw.slice(0,200));
}

async function extrairDespacho(file) {
  var prompt = 'Leia este despacho ministerial e extraia: 1) numero do procedimento (PA, IP, NF, IC etc), 2) tipo (PA/IP/NF/IC/PP/TCO), 3) TODOS os orgaos/pessoas para quem foi determinado oficiar, notificar ou requisitar (ex: Conselho Tutelar, CREAS, Policia Civil, Prefeitura, nome de pessoa), 4) resumo do que foi determinado. Retorne SOMENTE este JSON sem explicacoes nem markdown: {"numProc":"numero","tipo":"PA","destinatarios":["orgao1","orgao2"],"teor":"resumo"}. Se nao encontrar destinatarios claros, coloque ["Destinatario a identificar"].';
  var raw = "";
  try {
    if (file.name.match(/\.pdf$/i)) {
      var b64 = await lerArquivoBase64(file);
      raw = await callClaudeComPDF(b64, prompt);
    } else {
      var texto = await lerArquivoTexto(file);
      raw = await callClaude(prompt + "\n\nTEXTO:\n" + texto.slice(0, 6000));
    }
    return extrairJSON(raw);
  } catch(e) {
    var numDoNome = file.name.replace(/\.pdf$/i,"").replace(/\s*\(\d+\)$/,"").trim();
    return { numProc: numDoNome || "Sem numero", tipo: "PA", destinatarios: ["Destinatario a identificar"], teor: "Verificar manualmente - processamento automatico falhou", _falhou: true };
  }
}

async function extrairPessoaFisica(arquivoDespacho, arquivoProcedimento) {
  var prompt = "Identifique pessoas fisicas destinatarias de diligencias neste despacho e procedimento. Retorne SOMENTE JSON array sem markdown:\n[{\"nome\":\"nome completo\",\"email\":\"email ou null\",\"cpf\":\"cpf ou null\",\"telefone\":\"tel ou null\",\"qualificacao\":\"denunciante/testemunha/investigado\",\"tratamento\":\"A Senhor(a) [nome]\"}]\nRetorne [] se nao encontrar ninguem.";
  var raw;
  if (arquivoProcedimento && arquivoProcedimento.name.match(/\.pdf$/i)) {
    var b64 = await lerArquivoBase64(arquivoProcedimento);
    raw = await callClaudeComPDF(b64, prompt);
  } else if (arquivoDespacho && arquivoDespacho.name.match(/\.pdf$/i)) {
    var b64b = await lerArquivoBase64(arquivoDespacho);
    raw = await callClaudeComPDF(b64b, prompt);
  } else {
    var texto = arquivoProcedimento ? await lerArquivoTexto(arquivoProcedimento) : "";
    raw = await callClaude(prompt + "\n\nPROCEDIMENTO:\n" + texto.slice(0,6000));
  }
  return extrairJSON(raw);
}

// Mantido para compatibilidade
function lerArquivo(file) {
  return lerArquivoTexto(file);
}

// Estilos
var C = {
  azul: "#0a2440",
  verde: "#1a7a3a",
  cinza: "#f0f4f8",
  card: { background:"white", borderRadius:12, padding:20, boxShadow:"0 2px 12px rgba(0,0,0,0.08)", marginBottom:14 },
  input: { width:"100%", padding:"8px 10px", border:"1px solid #ddd", borderRadius:6, fontSize:13, boxSizing:"border-box" },
  label: { display:"block", fontSize:12, color:"#555", marginBottom:4, fontWeight:"bold" },
};
function btn(cor, extra) {
  return Object.assign({ background: cor || C.azul, color:"white", border:"none", padding:"9px 18px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:"bold" }, extra || {});
}
function btnOut(extra) {
  return Object.assign({ background:"white", border:"1px solid #ddd", padding:"9px 14px", borderRadius:8, fontSize:13, cursor:"pointer" }, extra || {});
}

// Modal generico
function Modal(props) {
  return (
    React.createElement("div", { style:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 } },
      React.createElement("div", { style:{ background:"white", borderRadius:12, padding:24, width:"100%", maxWidth:460, maxHeight:"90vh", overflowY:"auto" } },
        props.children
      )
    )
  );
}

export default function App() {
  var [screen, setScreen] = useState("loading");
  var [comarca, setComarca] = useState("prado");
  var [destDB, setDestDB] = useState([]);
  var [servDB, setServDB] = useState([]);
  var [servAtual, setServAtual] = useState(null);
  var [step, setStep] = useState("config");
  var [cfg, setCfg] = useState({ numInicial:"", data: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"}) });
  var [fila, setFila] = useState([]);
  var [pendentes, setPendentes] = useState([]);
  var [resultado, setResultado] = useState(null);
  var [progresso, setProgresso] = useState({ msg:"", atual:0, total:0 });
  var [cascaBytes, setCascaBytes] = useState(null);
  var [modalDest, setModalDest] = useState(null);
  var [modalServ, setModalServ] = useState(null);
  var [modalManual, setModalManual] = useState(null);
  var [settings, setSettings] = useState({ key:"", model:"claude-sonnet-4-6", usarIA:true });
  var [showSettings, setShowSettings] = useState(false);
  var fileRef = useRef();

  useEffect(function() {
    (async function() {
      setSettings(carregarSettings());
      var dSaved = await sGet("mpba:dest");
      var sSaved = await sGet("mpba:serv");
      var cSaved = await sGet("mpba:comarca");
      var dList = dSaved || DEST_INICIAIS;
      var sList = sSaved || SERV_INICIAIS;
      var c = cSaved || "prado";
      setDestDB(dList);
      setServDB(sList);
      setComarca(c);
      setServAtual(sList.find(function(s) { return s.comarca === c; }) || sList[0] || null);
      // Pre-carrega a casca timbrada (nao bloqueia se falhar; tenta de novo na geracao)
      try { var bytes = await carregarCasca(); setCascaBytes(bytes); } catch(e) { console.warn(e); }
      setScreen("main");
    })();
  }, []);

  async function salvarDest(lista) { setDestDB(lista); await sSet("mpba:dest", lista); }
  async function salvarServ(lista) { setServDB(lista); await sSet("mpba:serv", lista); }

  function mudarComarca(c) {
    setComarca(c);
    sSet("mpba:comarca", c);
    setServAtual(servDB.find(function(s) { return s.comarca === c; }) || servDB[0] || null);
    setCfg(function(p) { return Object.assign({}, p, { email: COMARCAS[c].email }); });
  }

  function resolverDest(texto) {
    var lower = String(texto).toLowerCase();
    var lista = destDB.filter(function(d) { return d.comarca === comarca || d.comarca === "todos"; });
    for (var i = 0; i < lista.length; i++) {
      var d = lista[i];
      if (lower.indexOf(d.chave) !== -1 || lower.indexOf(d.nome.toLowerCase()) !== -1) return Object.assign({}, d);
    }
    return null;
  }

  var adicionarArquivos = useCallback(function(files) {
    var novos = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f.name.match(/\.(pdf|txt)$/i)) continue;
      novos.push({ id:uid(), nome:f.name, file:f, status:"pendente", dados:null, destResolvidos:[], destNaoResolvidos:[], erro:"", manual:null });
    }
    setFila(function(p) { return p.concat(novos); });
    setStep("fila");
  }, []);

  async function processarFila() {
    if (!cfg.numInicial) { alert("Informe o numero inicial do oficio."); return; }
    if (!servAtual) { alert("Selecione um servidor."); return; }
    if (settings.usarIA && !settings.key) {
      var ok = confirm("Nenhuma chave da API Anthropic foi configurada, entao a extracao automatica nao vai funcionar. Os despachos sem dados preenchidos manualmente entrarao na etapa de revisao manual. Deseja continuar?");
      if (!ok) { setShowSettings(true); return; }
    }
    setStep("processando");
    var processados = fila.slice();
    var naoResolvidosGlobal = [];
    for (var i = 0; i < processados.length; i++) {
      var d = processados[i];
      setProgresso({ msg: "Analisando: " + d.nome, atual: i+1, total: processados.length });
      try {
        var dados;
        if (d.manual && d.manual.numProc) {
          // Dados preenchidos manualmente tem prioridade sobre a IA
          dados = { numProc: d.manual.numProc, tipo: d.manual.tipo || "PA", teor: d.manual.teor || "", destinatarios: d.manual.destinatarios || [] };
        } else if (settings.usarIA && settings.key) {
          dados = await extrairDespacho(d.file);
        } else {
          // Sem IA e sem manual: estrutura minima a partir do nome -> cai na revisao manual
          var numDoNome = d.nome.replace(/\.(pdf|txt)$/i,"").replace(/\s*\(\d+\)$/,"").trim();
          dados = { numProc: numDoNome || "Sem numero", tipo: "PA", destinatarios: ["Destinatario a identificar"], teor: "Preencher manualmente" };
        }
        var resolvidos = [];
        var naoResolvidos = [];
        var dests = dados.destinatarios || [];
        for (var j = 0; j < dests.length; j++) {
          var r = resolverDest(dests[j]);
          if (r) resolvidos.push(r);
          else naoResolvidos.push({ id:uid(), textoOriginal:dests[j], arquivoDespacho:d.nome, despachoFile:d.file });
        }
        processados[i] = Object.assign({}, d, { dados:dados, destResolvidos:resolvidos, destNaoResolvidos:naoResolvidos, status:"ok" });
        naoResolvidosGlobal = naoResolvidosGlobal.concat(naoResolvidos);
      } catch(e) {
        processados[i] = Object.assign({}, d, { status:"erro", erro: String(e) });
      }
    }
    setFila(processados);
    if (naoResolvidosGlobal.length > 0) {
      setPendentes(naoResolvidosGlobal);
      setStep("resolucao");
    } else {
      finalizarProcessamento(processados);
    }
  }

  function finalizarProcessamento(processados) {
    var numInicial = parseInt(cfg.numInicial);
    var ano = new Date().getFullYear();
    var porDest = {};
    processados.filter(function(d) { return d.status === "ok"; }).forEach(function(d) {
      d.destResolvidos.forEach(function(dest) {
        var key = dest.id || dest.chave || dest.nome;
        if (!porDest[key]) porDest[key] = { dest:dest, itens:[] };
        porDest[key].itens.push({ numProc:d.dados.numProc, tipo:d.dados.tipo, teor:d.dados.teor, arquivo:d.nome });
      });
    });
    var grupos = Object.values(porDest);
    grupos.forEach(function(g, i) { g.numOficio = String(numInicial + i).padStart(3,"0") + "/" + ano; });
    var certsPorProc = {};
    processados.filter(function(d) { return d.status === "ok"; }).forEach(function(d) {
      var key = d.dados.numProc;
      if (!certsPorProc[key]) certsPorProc[key] = { numProc:key, tipo:d.dados.tipo, exps:[] };
      d.destResolvidos.forEach(function(dest) {
        var g = grupos.find(function(g) { return (g.dest.id||g.dest.chave||g.dest.nome) === (dest.id||dest.chave||dest.nome); });
        if (g) certsPorProc[key].exps.push({ nome:dest.nome, numOficio:g.numOficio });
      });
    });
    setResultado({ grupos:grupos, certs:Object.values(certsPorProc) });
    setStep("resultado");
  }

  async function gerarArquivos() {
    var bytes = cascaBytes;
    if (!bytes) { try { bytes = await carregarCasca(); if (bytes) setCascaBytes(bytes); } catch(e) {} }
    var comarcaData = COMARCAS[comarca];
    var cidade = comarcaData.label.split("/")[0];
    var promotoria = comarcaData.promotoria;
    var arquivos = [];
    var grupos = resultado.grupos;
    var certs = resultado.certs;
    for (var i = 0; i < grupos.length; i++) {
      var g = grupos[i];
      setProgresso({ msg:"Gerando oficio " + (i+1) + "/" + grupos.length, atual:i+1, total:grupos.length+certs.length });
      var nomeSafe = g.dest.nome.replace(/[^a-zA-Z0-9]/g,"_").slice(0,25);
      var nomeDocx = "Oficio_" + g.numOficio.replace("/","_") + "_" + nomeSafe + ".docx";
      if (bytes) {
        try {
          var blob = await montarDocx(gerarBodyOficio({ destinatario:g.dest, itens:g.itens, numOficio:g.numOficio, data:cfg.data, promotoria:promotoria, cidade:cidade }), bytes);
          arquivos.push({ nome:nomeDocx, blob:blob, tipo:"oficio" });
        } catch(e) { console.error(e); }
      }
      var emlData = gerarEml({ dest:g.dest, numOficio:g.numOficio, promotoriaEmail:COMARCAS[comarca].email, data:cfg.data, promotoria:promotoria });
      arquivos.push({ nome:"Email_" + g.numOficio.replace("/","_") + "_" + nomeSafe + ".eml", blob:new Blob([emlData.eml],{type:"message/rfc822"}), tipo:"eml" });
    }
    for (var k = 0; k < certs.length; k++) {
      var cert = certs[k];
      setProgresso({ msg:"Gerando certidao " + (k+1) + "/" + certs.length, atual:grupos.length+k+1, total:grupos.length+certs.length });
      if (bytes) {
        try {
          var blobC = await montarDocx(gerarBodyCertidao({ numProc:cert.numProc, tipo:cert.tipo, expedicoes:cert.exps, data:cfg.data, nomeServ:servAtual.nome, matServ:servAtual.matricula, promotoria:promotoria, cidade:cidade }), bytes);
          var nomeSafeCert = cert.numProc.replace(/[^a-zA-Z0-9]/g,"_").slice(0,40);
          arquivos.push({ nome:"Certidao_" + nomeSafeCert + ".docx", blob:blobC, tipo:"certidao" });
        } catch(e) {}
      }
    }
    var ck = "CHECKLIST - " + COMARCAS[comarca].label + " - " + cfg.data + "\nServidor: " + servAtual.nome + " (Mat. " + servAtual.matricula + ")\n" + "=".repeat(50) + "\n\n";
    grupos.forEach(function(g, i) {
      ck += (i+1) + ". Oficio no " + g.numOficio + " -> " + g.dest.nome + "\n   Email: " + (g.dest.email || "CADASTRAR") + "\n   Anexar: docx + " + g.itens.map(function(x){return x.arquivo;}).join(", ") + "\n\n";
    });
    arquivos.push({ nome:"0_CHECKLIST.txt", blob:new Blob([ck],{type:"text/plain"}), tipo:"checklist" });
    return arquivos;
  }

  async function baixarZip() {
    if (!resultado) return;
    if (!cascaBytes) { alert("O modelo timbrado ainda nao foi carregado. Aguarde alguns segundos e tente novamente."); return; }
    setProgresso({ msg:"Preparando...", atual:0, total:1 });
    var zip = new JSZip();
    var p1 = zip.folder("1_oficios"), p2 = zip.folder("2_certidoes"), p3 = zip.folder("3_emails_outlook");
    var arquivos = await gerarArquivos();
    for (var i = 0; i < arquivos.length; i++) {
      var arq = arquivos[i];
      var buf = await arq.blob.arrayBuffer();
      if (arq.tipo === "oficio") p1.file(arq.nome, buf);
      else if (arq.tipo === "certidao") p2.file(arq.nome, buf);
      else if (arq.tipo === "eml") p3.file(arq.nome, buf);
      else zip.file(arq.nome, buf);
    }
    p3.file("LEIA-ME.txt", "Abrir .eml com duplo clique -> Outlook abre preenchido -> Anexar docx + PDFs -> Enviar.");
    setProgresso({ msg:"Empacotando ZIP...", atual:1, total:1 });
    var blobZip = await zip.generateAsync({ type:"blob" });
    var url = URL.createObjectURL(blobZip);
    var a = document.createElement("a");
    a.href = url;
    a.download = "Expedicao_" + comarca + "_" + new Date().toISOString().slice(0,10) + ".zip";
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    setProgresso({ msg:"", atual:0, total:0 });
  }

  if (screen === "loading") return React.createElement("div", { style:{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"Arial" } }, "Carregando...");

  var settingsModal = showSettings && React.createElement(ModalSettings, {
    settings: settings,
    onClose: function(){ setShowSettings(false); },
    onSave: function(s){ salvarSettings(s); setSettings({ key:s.key, model:s.model, usarIA:s.usarIA }); setShowSettings(false); }
  });

  // Tela banco destinatarios
  if (screen === "banco") {
    var filtrados = destDB.filter(function(d) { return d.comarca === comarca || d.comarca === "todos"; });
    return React.createElement("div", { style:{ fontFamily:"Arial", minHeight:"100vh", background:C.cinza } },
      React.createElement(Header, { screen, setScreen, comarca, mudarComarca, onSettings:function(){setShowSettings(true);} }),
      settingsModal,
      React.createElement("div", { style:{ maxWidth:820, margin:"0 auto", padding:"20px 14px" } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 } },
          React.createElement("h2", { style:{ margin:0, color:C.azul, fontSize:16 } }, "Banco de Destinatarios - " + COMARCAS[comarca].label),
          React.createElement("button", { style:btn(C.verde), onClick:function() { setModalDest({ dest:{ id:uid(), comarca:comarca, chave:"", nome:"", email:"", tratamento:"", tipo:"institucional" }, isNew:true }); } }, "+ Novo")
        ),
        filtrados.length === 0 && React.createElement("div", { style:Object.assign({}, C.card, { textAlign:"center", color:"#888", padding:32 }) }, "Nenhum destinatario cadastrado para " + COMARCAS[comarca].label + ". Clique em + Novo para comecar."),
        filtrados.map(function(d) {
          return React.createElement("div", { key:d.id, style:Object.assign({}, C.card, { display:"flex", alignItems:"center", gap:10, padding:"12px 16px" }) },
            React.createElement("div", { style:{ flex:1 } },
              React.createElement("div", { style:{ fontSize:14, fontWeight:"bold", color:"#222" } }, d.nome),
              React.createElement("div", { style:{ fontSize:12, color: d.email ? C.verde : "#c66", marginTop:2 } }, d.email || "Email nao cadastrado"),
              d.tipo === "pessoa_fisica" && d.cpf && React.createElement("div", { style:{ fontSize:11, color:"#888" } }, "CPF: " + d.cpf)
            ),
            React.createElement("span", { style:{ background:"#e8f0fe", color:C.azul, padding:"2px 8px", borderRadius:10, fontSize:11 } }, d.chave),
            React.createElement("button", { style:btn(C.azul, { padding:"4px 10px", fontSize:11 }), onClick:function() { setModalDest({ dest:Object.assign({},d), isNew:false }); } }, "Editar"),
            React.createElement("button", { style:btn("#c00", { padding:"4px 10px", fontSize:11 }), onClick:async function() { if (confirm("Remover " + d.nome + "?")) { await salvarDest(destDB.filter(function(x){return x.id!==d.id;})); } } }, "X")
          );
        }),
        modalDest && React.createElement(ModalDest, { dest:modalDest.dest, isNew:modalDest.isNew, comarca:comarca, onClose:function(){setModalDest(null);}, onSave:async function(upd){ if(modalDest.isNew){await salvarDest(destDB.concat([upd]));}else{await salvarDest(destDB.map(function(x){return x.id===upd.id?upd:x;}));} setModalDest(null); } })
      )
    );
  }

  // Tela servidores
  if (screen === "servidores") {
    return React.createElement("div", { style:{ fontFamily:"Arial", minHeight:"100vh", background:C.cinza } },
      React.createElement(Header, { screen, setScreen, comarca, mudarComarca, onSettings:function(){setShowSettings(true);} }),
      settingsModal,
      React.createElement("div", { style:{ maxWidth:820, margin:"0 auto", padding:"20px 14px" } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 } },
          React.createElement("h2", { style:{ margin:0, color:C.azul, fontSize:16 } }, "Servidores Responsaveis"),
          React.createElement("button", { style:btn(C.verde), onClick:function(){ setModalServ({ srv:{ id:uid(), nome:"", matricula:"", comarca:comarca }, isNew:true }); } }, "+ Novo")
        ),
        React.createElement("div", { style:C.card },
          servDB.length === 0 && React.createElement("div", { style:{ textAlign:"center", color:"#888", padding:24 } }, "Nenhum servidor cadastrado."),
          servDB.map(function(s) {
            return React.createElement("div", { key:s.id, style:{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid #f5f5f5" } },
              React.createElement("div", { style:{ flex:1 } },
                React.createElement("div", { style:{ fontSize:14, fontWeight:"bold" } }, s.nome),
                React.createElement("div", { style:{ fontSize:12, color:"#888" } }, "Mat. " + s.matricula + " - " + (COMARCAS[s.comarca] ? COMARCAS[s.comarca].label : s.comarca))
              ),
              servAtual && servAtual.id === s.id && React.createElement("span", { style:{ background:"#dff0d8", color:C.verde, padding:"2px 8px", borderRadius:10, fontSize:11 } }, "Ativo"),
              React.createElement("button", { style:btn(C.azul, { padding:"4px 10px", fontSize:11 }), onClick:function(){ setServAtual(s); sSet("mpba:comarca", s.comarca); setComarca(s.comarca); } }, "Selecionar"),
              React.createElement("button", { style:btn("#555", { padding:"4px 10px", fontSize:11 }), onClick:function(){ setModalServ({ srv:Object.assign({},s), isNew:false }); } }, "Editar"),
              React.createElement("button", { style:btn("#c00", { padding:"4px 10px", fontSize:11 }), onClick:async function(){ if(confirm("Remover " + s.nome + "?")){ var nova=servDB.filter(function(x){return x.id!==s.id;}); await salvarServ(nova); if(servAtual&&servAtual.id===s.id)setServAtual(nova[0]||null); } } }, "X")
            );
          })
        ),
        modalServ && React.createElement(ModalServ, { srv:modalServ.srv, isNew:modalServ.isNew, onClose:function(){setModalServ(null);}, onSave:async function(upd){ if(modalServ.isNew){await salvarServ(servDB.concat([upd]));}else{var nova=servDB.map(function(x){return x.id===upd.id?upd:x;});await salvarServ(nova);if(servAtual&&servAtual.id===upd.id)setServAtual(upd);}setModalServ(null); } })
      )
    );
  }

  // Tela principal
  var erros = fila.filter(function(d){ return d.status==="erro"||d.status==="sem_destinatario"; });
  var steps = ["config","fila","processando","resultado"];
  var stepLabels = ["Configurar","Fila","Processar","Resultado"];

  return React.createElement("div", { style:{ fontFamily:"Arial", minHeight:"100vh", background:C.cinza } },
    React.createElement(Header, { screen, setScreen, comarca, mudarComarca, steps, stepLabels, step, onSettings:function(){setShowSettings(true);} }),
    settingsModal,
    React.createElement("div", { style:{ maxWidth:820, margin:"0 auto", padding:"20px 14px" } },

      // Aviso casca/chave
      !cascaBytes && step === "config" && React.createElement("div", { style:{ background:"#fff3cd", border:"1px solid #ffe08a", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#7a5c00" } }, "Carregando o modelo timbrado oficial..."),
      settings.usarIA && !settings.key && step === "config" && React.createElement("div", { style:{ background:"#e8f0fe", border:"1px solid #b9d4ff", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.azul, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 } },
        React.createElement("span", null, "Extracao por IA ativada, mas sem chave da API Anthropic configurada. Sem ela, os despachos cairao na revisao manual."),
        React.createElement("button", { style:btn(C.azul,{padding:"5px 10px",fontSize:11}), onClick:function(){setShowSettings(true);} }, "Configurar chave")
      ),

      // CONFIG
      step === "config" && React.createElement("div", { style:C.card },
        React.createElement("h2", { style:{ margin:"0 0 18px", color:C.azul, fontSize:16 } }, "Configuracoes da Expedicao"),
        React.createElement("div", { style:{ marginBottom:16 } },
          React.createElement("label", { style:C.label }, "Comarca"),
          React.createElement("div", { style:{ display:"flex", gap:8 } },
            Object.entries(COMARCAS).map(function(entry) {
              var k = entry[0]; var v = entry[1];
              return React.createElement("button", { key:k, onClick:function(){mudarComarca(k);}, style:{ flex:1, padding:"9px 6px", borderRadius:8, border:"2px solid " + (comarca===k?C.azul:"#ddd"), background:comarca===k?C.azul:"white", color:comarca===k?"white":"#333", cursor:"pointer", fontSize:12, fontWeight:comarca===k?"bold":"normal" } }, v.label);
            })
          )
        ),
        React.createElement("div", { style:{ background:"#f8f9ff", borderRadius:8, padding:12, marginBottom:16, fontSize:13 } },
          React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
            React.createElement("span", null, "Servidor: ", React.createElement("strong", null, servAtual ? servAtual.nome + " (Mat. " + servAtual.matricula + ")" : "Nenhum selecionado")),
            React.createElement("button", { style:btn(C.azul, { padding:"4px 10px", fontSize:11 }), onClick:function(){setScreen("servidores");} }, "Gerenciar")
          ),
          React.createElement("div", { style:{ marginTop:4 } }, "Promotoria: ", React.createElement("strong", null, COMARCAS[comarca].promotoria))
        ),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 } },
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Numero inicial do oficio *"), React.createElement("input", { style:C.input, value:cfg.numInicial, onChange:function(e){setCfg(function(p){return Object.assign({},p,{numInicial:e.target.value});});}, placeholder:"Ex: 145" })),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Data de expedicao"), React.createElement("input", { style:C.input, value:cfg.data, onChange:function(e){setCfg(function(p){return Object.assign({},p,{data:e.target.value});});} }))
        ),
        React.createElement("div", { style:{ marginTop:16 } },
          React.createElement("button", { style:btn(), onClick:function(){setStep("fila");} }, "Proximo: Adicionar Despachos ->")
        )
      ),

      // FILA
      step === "fila" && React.createElement("div", null,
        React.createElement("div", {
          onDrop:function(e){e.preventDefault();adicionarArquivos(Array.from(e.dataTransfer.files));},
          onDragOver:function(e){e.preventDefault();},
          onClick:function(){fileRef.current&&fileRef.current.click();},
          style:{ border:"2px dashed #4a90d9", borderRadius:12, padding:32, textAlign:"center", cursor:"pointer", background:"white", marginBottom:14 }
        },
          React.createElement("div", { style:{ fontSize:32, marginBottom:8 } }, "[ PDF ]"),
          React.createElement("div", { style:{ fontSize:15, color:C.azul, fontWeight:"bold" } }, "Arraste os PDFs dos despachos aqui"),
          React.createElement("div", { style:{ fontSize:12, color:"#999", marginTop:4 } }, "ou clique para selecionar (.pdf ou .txt)"),
          React.createElement("input", { ref:fileRef, type:"file", multiple:true, accept:".pdf,.txt", style:{ display:"none" }, onChange:function(e){adicionarArquivos(Array.from(e.target.files));} })
        ),
        fila.length > 0 && React.createElement("div", { style:C.card },
          React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 } },
            React.createElement("h3", { style:{ margin:0, color:C.azul, fontSize:14 } }, "Fila (" + fila.length + " arquivo" + (fila.length!==1?"s":"") + ")"),
            React.createElement("button", { style:btn("#c00",{padding:"4px 10px",fontSize:12}), onClick:function(){setFila([]);} }, "Limpar")
          ),
          !settings.usarIA && React.createElement("div", { style:{ fontSize:12, color:"#7a5c00", background:"#fffbeb", border:"1px solid #f5e090", borderRadius:6, padding:"8px 10px", marginBottom:10 } }, "Modo manual: clique em 'Editar dados' em cada despacho para informar processo, tipo, teor e destinatarios."),
          fila.map(function(d) {
            var temManual = d.manual && d.manual.numProc;
            return React.createElement("div", { key:d.id, style:{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f5f5f5" } },
              React.createElement("div", { style:{ flex:1 } },
                React.createElement("div", { style:{ fontSize:13, fontWeight:"bold" } }, d.nome),
                React.createElement("div", { style:{ fontSize:11, color: temManual ? C.verde : "#999" } }, temManual ? ("Manual: " + d.manual.numProc + " (" + (d.manual.tipo||"PA") + ")") : (settings.usarIA ? "Extracao via IA" : "Aguardando preenchimento manual"))
              ),
              React.createElement("button", { style:btn(C.azul,{padding:"4px 10px",fontSize:11}), onClick:function(){ setModalManual({ item:d }); } }, temManual ? "Editar dados" : "Preencher manual"),
              React.createElement("button", { style:{ background:"none", border:"none", color:"#c00", cursor:"pointer", fontSize:15 }, onClick:function(){setFila(function(p){return p.filter(function(x){return x.id!==d.id;});});} }, "X")
            );
          })
        ),
        React.createElement("div", { style:{ display:"flex", gap:10 } },
          React.createElement("button", { style:btnOut(), onClick:function(){setStep("config");} }, "<- Configuracoes"),
          fila.length > 0 && React.createElement("button", { style:Object.assign({},btn(),{flex:1,fontSize:14,padding:"12px 20px"}), onClick:processarFila }, "Processar " + fila.length + " despacho" + (fila.length!==1?"s":"") + " e gerar oficios")
        ),
        modalManual && React.createElement(ModalManual, {
          item: modalManual.item,
          destDB: destDB,
          comarca: comarca,
          onClose: function(){ setModalManual(null); },
          onSave: function(manual){
            setFila(function(p){ return p.map(function(x){ return x.id===modalManual.item.id ? Object.assign({},x,{manual:manual}) : x; }); });
            setModalManual(null);
          }
        })
      ),

      // PROCESSANDO
      step === "processando" && React.createElement("div", { style:Object.assign({},C.card,{textAlign:"center",padding:48}) },
        React.createElement("div", { style:{ fontSize:40, marginBottom:14 } }, "[ ... ]"),
        React.createElement("h2", { style:{ color:C.azul, marginBottom:8 } }, "Processando despachos..."),
        React.createElement("div", { style:{ color:"#666", marginBottom:20, fontSize:14 } }, progresso.msg),
        progresso.total > 0 && React.createElement("div", null,
          React.createElement("div", { style:{ background:"#f0f4f8", borderRadius:8, height:10, overflow:"hidden", marginBottom:6 } },
            React.createElement("div", { style:{ background:C.azul, height:"100%", width:(progresso.atual/progresso.total*100)+"%", transition:"width .3s", borderRadius:8 } })
          ),
          React.createElement("div", { style:{ fontSize:12, color:"#999" } }, progresso.atual + " de " + progresso.total)
        )
      ),

      // RESOLUCAO
      step === "resolucao" && React.createElement(TelaResolucao, {
        pendentes:pendentes,
        comarca:comarca,
        lerArquivo:lerArquivo,
        extrairPessoaFisica:extrairPessoaFisica,
        salvarDest:salvarDest,
        destDB:destDB,
        usarIA: settings.usarIA && !!settings.key,
        onConfirmar:async function(extras) {
          var novosParaSalvar = extras.filter(function(r){ return r.salvar && r.nome; });
          if (novosParaSalvar.length > 0) {
            var novaLista = destDB.concat(novosParaSalvar.map(function(r){ return { id:uid(), comarca:comarca, chave:r.chave||r.nome.toLowerCase().slice(0,20), nome:r.nome, email:r.email||"", tratamento:r.tratamento||"A " + r.nome, tipo:"pessoa_fisica", cpf:r.cpf||null, telefone:r.telefone||null }; }));
            await salvarDest(novaLista);
          }
          var filaAtualizada = fila.map(function(d) {
            var extrasDoArquivo = extras.filter(function(r){ return r.arquivoDespacho === d.nome && r.nome; });
            if (extrasDoArquivo.length === 0) return d;
            return Object.assign({}, d, { destResolvidos: d.destResolvidos.concat(extrasDoArquivo.map(function(r){ return { id:uid(), nome:r.nome, email:r.email||"", tratamento:r.tratamento||"A " + r.nome, chave:r.chave||r.nome.toLowerCase().slice(0,20) }; })) });
          });
          setFila(filaAtualizada);
          finalizarProcessamento(filaAtualizada);
        },
        onPular:function(){ finalizarProcessamento(fila); }
      }),

      // RESULTADO
      step === "resultado" && resultado && React.createElement("div", null,
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 } },
          [["Oficios", resultado.grupos.length],["Certidoes", resultado.certs.length],["Problemas", erros.length]].map(function(item) {
            return React.createElement("div", { key:item[0], style:Object.assign({},C.card,{padding:16,textAlign:"center",marginBottom:0,borderLeft:item[0]==="Problemas"&&item[1]>0?"4px solid #e74":"none"}) },
              React.createElement("div", { style:{ fontSize:28, fontWeight:"bold", color:item[0]==="Problemas"&&item[1]>0?"#e74":C.azul } }, item[1]),
              React.createElement("div", { style:{ fontSize:12, color:"#888" } }, item[0])
            );
          })
        ),
        erros.length > 0 && React.createElement("div", { style:Object.assign({},C.card,{border:"1px solid #fcc",background:"#fff8f8"}) },
          React.createElement("h3", { style:{ margin:"0 0 8px", color:"#c00", fontSize:13 } }, "Arquivos com problema:"),
          erros.map(function(d){ return React.createElement("div", { key:d.id, style:{ fontSize:12, color:"#a00" } }, "- " + d.nome + ": " + (d.status==="sem_destinatario"?"Nenhum destinatario encontrado":d.erro)); })
        ),
        React.createElement("div", { style:C.card },
          React.createElement("h3", { style:{ margin:"0 0 12px", color:C.azul, fontSize:14 } }, "Oficios Consolidados"),
          resultado.grupos.map(function(g, i) {
            return React.createElement("div", { key:i, style:{ border:"1px solid #e8f0fe", borderRadius:8, padding:12, marginBottom:10 } },
              React.createElement("div", { style:{ fontWeight:"bold", color:C.azul, fontSize:14 } }, "Oficio no " + g.numOficio + " - " + g.dest.nome),
              React.createElement("div", { style:{ fontSize:12, marginTop:3, color: g.dest.email ? C.verde : "#c66" } }, g.dest.email ? "Email: " + g.dest.email : "Email nao cadastrado - preencher antes de enviar"),
              React.createElement("div", { style:{ marginTop:8, paddingTop:8, borderTop:"1px solid #f5f5f5" } },
                g.itens.map(function(item, j) {
                  return React.createElement("div", { key:j, style:{ fontSize:11, color:"#555", padding:"2px 0" } }, "[+] " + item.numProc + " (" + item.tipo + ") - " + item.teor.slice(0,80) + (item.teor.length>80?"...":""));
                })
              ),
              React.createElement("div", { style:{ marginTop:8, fontSize:11, color:C.azul, background:"#f0f4ff", padding:"6px 10px", borderRadius:6 } }, "Anexar ao email: docx do oficio + " + g.itens.map(function(x){return x.arquivo;}).join(", "))
            );
          })
        ),
        React.createElement("div", { style:C.card },
          React.createElement("h3", { style:{ margin:"0 0 10px", color:C.azul, fontSize:14 } }, "Certidoes de Expedicao"),
          React.createElement("div", { style:{ fontSize:12, color:"#666", marginBottom:10 } }, "Juntar aos autos apos expedicao."),
          resultado.certs.map(function(cert, i) {
            return React.createElement("div", { key:i, style:{ border:"1px solid #dff0d8", borderRadius:8, padding:12, marginBottom:8, background:"#fafff5" } },
              React.createElement("div", { style:{ fontWeight:"bold", color:"#2d5a1b", fontSize:13 } }, cert.numProc + " (" + cert.tipo + ")"),
              cert.exps.map(function(exp, j) { return React.createElement("div", { key:j, style:{ fontSize:11, color:"#444" } }, (j+1) + ". " + exp.nome + " -- Oficio no " + exp.numOficio); })
            );
          })
        ),
        React.createElement("div", { style:Object.assign({},C.card,{background:"white",border:"1px solid #ddd"}) },
          React.createElement("h3", { style:{ margin:"0 0 14px", color:C.azul, fontSize:14 } }, "Baixar os arquivos gerados"),
          React.createElement("div", { style:{ border:"2px solid #4a90d9", borderRadius:10, padding:16, textAlign:"center" } },
            React.createElement("div", { style:{ fontSize:28, marginBottom:8 } }, "[ZIP]"),
            React.createElement("div", { style:{ fontWeight:"bold", color:C.azul, fontSize:14, marginBottom:6 } }, "Baixar pacote ZIP"),
            React.createElement("div", { style:{ fontSize:12, color:"#666", marginBottom:12 } }, "Um .zip com os oficios (.docx timbrado), certidoes, e-mails (.eml para Outlook) e um checklist. Extraia e abra no Word/Outlook."),
            React.createElement("button", { style:Object.assign({},btn("#4a90d9"),{minWidth:200}), onClick:baixarZip }, "Baixar ZIP")
          ),
          progresso.msg && React.createElement("div", { style:{ marginTop:12, background:"#e8f0fe", borderRadius:8, padding:10, textAlign:"center", fontSize:13, color:C.azul } }, progresso.msg + (progresso.total>0?" ("+progresso.atual+"/"+progresso.total+")":""))
        ),
        React.createElement("button", { style:btnOut(), onClick:function(){ setStep("fila"); setResultado(null); } }, "<- Nova expedicao")
      )
    )
  );
}

function Header(props) {
  var screen = props.screen; var setScreen = props.setScreen; var comarca = props.comarca; var mudarComarca = props.mudarComarca;
  var steps = props.steps; var stepLabels = props.stepLabels; var step = props.step; var onSettings = props.onSettings;
  return React.createElement("div", { style:{ background:"linear-gradient(135deg,#0a2440 0%,#1a3a5c 100%)", color:"white", padding:"16px 20px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" } },
    React.createElement("div", null,
      React.createElement("div", { style:{ fontWeight:"bold", fontSize:16 } }, "MPBA - Expedicao Consolidada de Oficios"),
      React.createElement("div", { style:{ fontSize:11, opacity:.7 } }, "Promotorias de Justica")
    ),
    React.createElement("div", { style:{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" } },
      screen === "main" && steps && steps.map(function(s, i) {
        return React.createElement("div", { key:s, style:{ padding:"3px 10px", borderRadius:20, fontSize:11, background:step===s?"rgba(255,255,255,.25)":"rgba(255,255,255,.08)", color:step===s?"white":"rgba(255,255,255,.4)", fontWeight:step===s?"bold":"normal" } }, stepLabels[i]);
      }),
      React.createElement("button", { onClick:function(){setScreen(screen==="banco"?"main":"banco");}, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Destinatarios"),
      React.createElement("button", { onClick:function(){setScreen(screen==="servidores"?"main":"servidores");}, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Servidores"),
      onSettings && React.createElement("button", { onClick:onSettings, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Config")
    )
  );
}

function ModalSettings(props) {
  var [form, setForm] = useState({ key: props.settings.key || "", model: props.settings.model || "claude-sonnet-4-6", usarIA: props.settings.usarIA !== false });
  function f(k, v) { setForm(function(p){ return Object.assign({},p,{[k]:v}); }); }
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 6px", color:C.azul } }, "Configuracoes"),
    React.createElement("p", { style:{ margin:"0 0 16px", fontSize:12, color:"#777" } }, "A chave da API e usada apenas neste navegador (localStorage) e enviada direto para a Anthropic. Nao trafega por nenhum servidor intermediario."),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8 } },
        React.createElement("input", { type:"checkbox", id:"usarIA", checked:form.usarIA, onChange:function(e){f("usarIA",e.target.checked);} }),
        React.createElement("label", { htmlFor:"usarIA", style:{ fontSize:13, color:"#333", cursor:"pointer", fontWeight:"bold" } }, "Usar extracao automatica por IA (Claude)")
      ),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Chave da API Anthropic (sk-ant-...)"), React.createElement("input", { style:C.input, type:"password", value:form.key, onChange:function(e){f("key",e.target.value);}, placeholder:"sk-ant-...", autoComplete:"off" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Modelo"), React.createElement("select", { style:C.input, value:form.model, onChange:function(e){f("model",e.target.value);} },
        React.createElement("option", { value:"claude-sonnet-4-6" }, "claude-sonnet-4-6 (recomendado)"),
        React.createElement("option", { value:"claude-opus-4-8" }, "claude-opus-4-8 (mais preciso)"),
        React.createElement("option", { value:"claude-haiku-4-5-20251001" }, "claude-haiku-4-5 (mais rapido/barato)")
      ))
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:18 } },
      React.createElement("button", { style:btnOut({flex:1}), onClick:props.onClose }, "Cancelar"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ props.onSave(form); } }, "Salvar")
    )
  );
}

function ModalManual(props) {
  var item = props.item;
  var destDB = props.destDB;
  var comarca = props.comarca;
  var lista = destDB.filter(function(d){ return d.comarca === comarca || d.comarca === "todos"; });
  var m = item.manual || {};
  var [numProc, setNumProc] = useState(m.numProc || "");
  var [tipo, setTipo] = useState(m.tipo || "PA");
  var [teor, setTeor] = useState(m.teor || "");
  var [sel, setSel] = useState((m.destinatarios || []).filter(function(t){ return lista.some(function(d){ return d.chave===t; }); }));
  var [livre, setLivre] = useState((m.destinatarios || []).filter(function(t){ return !lista.some(function(d){ return d.chave===t; }); }).join(", "));

  function toggle(chave) {
    setSel(function(prev){ return prev.indexOf(chave)!==-1 ? prev.filter(function(x){return x!==chave;}) : prev.concat([chave]); });
  }
  function salvar() {
    if (!numProc.trim()) { alert("Informe o numero do procedimento."); return; }
    var livres = livre.split(",").map(function(s){return s.trim();}).filter(Boolean);
    var dests = sel.concat(livres);
    if (dests.length === 0) dests = ["Destinatario a identificar"];
    props.onSave({ numProc:numProc.trim(), tipo:tipo, teor:teor.trim(), destinatarios:dests });
  }
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 4px", color:C.azul } }, "Dados do despacho"),
    React.createElement("p", { style:{ margin:"0 0 14px", fontSize:12, color:"#777" } }, item.nome),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 } },
        React.createElement("div", null, React.createElement("label", { style:C.label }, "Numero do procedimento *"), React.createElement("input", { style:C.input, value:numProc, onChange:function(e){setNumProc(e.target.value);}, placeholder:"Ex: 003.9.000123/2025" })),
        React.createElement("div", null, React.createElement("label", { style:C.label }, "Tipo"), React.createElement("select", { style:C.input, value:tipo, onChange:function(e){setTipo(e.target.value);} }, TIPOS_PROC.map(function(t){ return React.createElement("option", { key:t, value:t }, t); })))
      ),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Teor / diligencia"), React.createElement("textarea", { style:Object.assign({},C.input,{minHeight:64,resize:"vertical"}), value:teor, onChange:function(e){setTeor(e.target.value);}, placeholder:"Resumo do que foi determinado oficiar/requisitar" })),
      React.createElement("div", null,
        React.createElement("label", { style:C.label }, "Destinatarios (banco da comarca)"),
        lista.length === 0 && React.createElement("div", { style:{ fontSize:12, color:"#999" } }, "Nenhum destinatario no banco desta comarca."),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, maxHeight:160, overflowY:"auto" } },
          lista.map(function(d){
            return React.createElement("label", { key:d.id, style:{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#333", cursor:"pointer", padding:"2px 0" } },
              React.createElement("input", { type:"checkbox", checked:sel.indexOf(d.chave)!==-1, onChange:function(){toggle(d.chave);} }),
              d.nome
            );
          })
        )
      ),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Outros destinatarios (separados por virgula)"), React.createElement("input", { style:C.input, value:livre, onChange:function(e){setLivre(e.target.value);}, placeholder:"Ex: conselho tutelar, nome de pessoa" }))
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:18 } },
      React.createElement("button", { style:btnOut({flex:1}), onClick:props.onClose }, "Cancelar"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:salvar }, "Salvar dados")
    )
  );
}

function ModalDest(props) {
  var dest = props.dest; var isNew = props.isNew; var comarca = props.comarca; var onClose = props.onClose; var onSave = props.onSave;
  var [form, setForm] = useState(Object.assign({}, dest));
  function f(k, v) { setForm(function(p){ return Object.assign({},p,{[k]:v}); }); }
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 18px", color:"#0a2440" } }, isNew ? "Novo Destinatario" : "Editar Destinatario"),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Tipo"), React.createElement("select", { value:form.tipo, onChange:function(e){f("tipo",e.target.value);}, style:C.input }, React.createElement("option", { value:"institucional" }, "Institucional (orgao/entidade)"), React.createElement("option", { value:"pessoa_fisica" }, "Pessoa Fisica"))),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Nome completo *"), React.createElement("input", { style:C.input, value:form.nome, onChange:function(e){f("nome",e.target.value);}, placeholder:"Ex: Conselho Tutelar de Prado" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Palavra-chave *"), React.createElement("input", { style:C.input, value:form.chave, onChange:function(e){f("chave",e.target.value);}, placeholder:"Como aparece no despacho (ex: conselho tutelar)" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Email"), React.createElement("input", { style:C.input, value:form.email||"", onChange:function(e){f("email",e.target.value);}, placeholder:"email@dominio.gov.br" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Tratamento no oficio"), React.createElement("input", { style:C.input, value:form.tratamento||"", onChange:function(e){f("tratamento",e.target.value);}, placeholder:"Ex: Ao Delegado de Policia" })),
      form.tipo === "pessoa_fisica" && React.createElement("div", null, React.createElement("label", { style:C.label }, "CPF"), React.createElement("input", { style:C.input, value:form.cpf||"", onChange:function(e){f("cpf",e.target.value);} })),
      form.tipo === "pessoa_fisica" && React.createElement("div", null, React.createElement("label", { style:C.label }, "Telefone"), React.createElement("input", { style:C.input, value:form.telefone||"", onChange:function(e){f("telefone",e.target.value);} })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Comarca"), React.createElement("select", { value:form.comarca||comarca, onChange:function(e){f("comarca",e.target.value);}, style:C.input }, React.createElement("option", { value:"prado" }, "Prado/BA"), React.createElement("option", { value:"nova_vicosa" }, "Nova Vicosa/BA"), React.createElement("option", { value:"alcobaca" }, "Alcobaca/BA"), React.createElement("option", { value:"todos" }, "Todas")))
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:18 } },
      React.createElement("button", { style:btnOut({flex:1}), onClick:onClose }, "Cancelar"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ if(!form.nome||!form.chave){alert("Preencha Nome e Palavra-chave.");return;} onSave(form); } }, "Salvar")
    )
  );
}

function ModalServ(props) {
  var srv = props.srv; var isNew = props.isNew; var onClose = props.onClose; var onSave = props.onSave;
  var [form, setForm] = useState(Object.assign({}, srv));
  function f(k, v) { setForm(function(p){ return Object.assign({},p,{[k]:v}); }); }
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 18px", color:"#0a2440" } }, isNew ? "Novo Servidor" : "Editar Servidor"),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Nome completo *"), React.createElement("input", { style:C.input, value:form.nome, onChange:function(e){f("nome",e.target.value);}, placeholder:"Ex: Rodrigo Ribeiro Secundino" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Matricula *"), React.createElement("input", { style:C.input, value:form.matricula, onChange:function(e){f("matricula",e.target.value);}, placeholder:"Ex: 355.757" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Comarca principal"), React.createElement("select", { value:form.comarca, onChange:function(e){f("comarca",e.target.value);}, style:C.input }, React.createElement("option", { value:"prado" }, "Prado/BA"), React.createElement("option", { value:"nova_vicosa" }, "Nova Vicosa/BA"), React.createElement("option", { value:"alcobaca" }, "Alcobaca/BA")))
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:18 } },
      React.createElement("button", { style:btnOut({flex:1}), onClick:onClose }, "Cancelar"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ if(!form.nome||!form.matricula){alert("Preencha nome e matricula.");return;} onSave(form); } }, "Salvar")
    )
  );
}

function TelaResolucao(props) {
  var pendentes = props.pendentes; var comarca = props.comarca; var lerArquivo = props.lerArquivo;
  var extrairPessoaFisica = props.extrairPessoaFisica; var onConfirmar = props.onConfirmar; var onPular = props.onPular;
  var usarIA = props.usarIA;
  var [itens, setItens] = useState(pendentes.map(function(p){ return Object.assign({},p,{modo:"manual",salvar:true,carregando:false,procFile:null,form:{nome:"",email:"",cpf:"",telefone:"",tratamento:"",chave:"",tipo:"pessoa_fisica"}}); }));
  function atualizar(id, upd) { setItens(function(prev){ return prev.map(function(x){ return x.id===id?Object.assign({},x,upd):x; }); }); }
  async function extrairComIA(item) {
    if (!item.procFile) { alert("Selecione o PDF do procedimento."); return; }
    atualizar(item.id, { carregando:true });
    try {
      var resultado = await extrairPessoaFisica(item.despachoFile, item.procFile);
      if (resultado && resultado.length > 0) {
        var pf = resultado[0];
        atualizar(item.id, { carregando:false, form:{ nome:pf.nome||"", email:pf.email||"", cpf:pf.cpf||"", telefone:pf.telefone||"", tratamento:pf.tratamento||"A " + (pf.nome||""), chave:(pf.nome||"").toLowerCase().slice(0,20), tipo:"pessoa_fisica" } });
      } else {
        alert("Nenhuma pessoa fisica encontrada para: " + item.textoOriginal);
        atualizar(item.id, { carregando:false });
      }
    } catch(e) { alert("Erro: " + e); atualizar(item.id, { carregando:false }); }
  }
  return React.createElement("div", null,
    React.createElement("div", { style:{ background:"#fffbeb", border:"1px solid #f5e090", borderRadius:12, padding:16, marginBottom:14 } },
      React.createElement("h3", { style:{ margin:"0 0 6px", color:"#7a5c00", fontSize:14 } }, pendentes.length + " destinatario" + (pendentes.length!==1?"s":"") + " nao encontrado" + (pendentes.length!==1?"s":"") + " no banco"),
      React.createElement("p", { style:{ margin:0, fontSize:12, color:"#665500" } }, "Para cada item, preencha os dados manualmente" + (usarIA ? " ou use IA para extrair do procedimento." : "."))
    ),
    itens.map(function(item, idx) {
      return React.createElement("div", { key:item.id, style:Object.assign({},C.card) },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 } },
          React.createElement("div", null,
            React.createElement("div", { style:{ fontWeight:"bold", color:"#0a2440", fontSize:14 } }, (idx+1) + ". \"" + item.textoOriginal + "\""),
            React.createElement("div", { style:{ fontSize:12, color:"#888", marginTop:2 } }, "Arquivo: " + item.arquivoDespacho)
          ),
          usarIA && React.createElement("div", { style:{ display:"flex", gap:6 } },
            React.createElement("button", { style:btn(item.modo==="manual"?"#0a2440":"#999",{padding:"4px 10px",fontSize:11}), onClick:function(){atualizar(item.id,{modo:"manual"});} }, "Manual"),
            React.createElement("button", { style:btn(item.modo==="ia"?"#7c3aed":"#999",{padding:"4px 10px",fontSize:11}), onClick:function(){atualizar(item.id,{modo:"ia"});} }, "Extrair com IA")
          )
        ),
        usarIA && item.modo === "ia" && React.createElement("div", { style:{ background:"#f5f0ff", borderRadius:8, padding:12, marginBottom:12 } },
          React.createElement("div", { style:{ fontSize:12, color:"#5b21b6", marginBottom:8 } }, "Selecione o PDF do procedimento completo:"),
          React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
            React.createElement("label", { style:Object.assign({},btn("#7c3aed",{padding:"6px 12px",fontSize:12,cursor:"pointer"})) },
              item.procFile ? item.procFile.name : "Selecionar procedimento",
              React.createElement("input", { type:"file", accept:".pdf,.txt", style:{ display:"none" }, onChange:function(e){ if(e.target.files[0]) atualizar(item.id,{procFile:e.target.files[0]}); } })
            ),
            React.createElement("button", { style:btn(item.procFile&&!item.carregando?C.verde:"#ccc",{padding:"6px 12px",fontSize:12}), disabled:!item.procFile||item.carregando, onClick:function(){extrairComIA(item);} }, item.carregando ? "Extraindo..." : "Extrair")
          )
        ),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 } },
          [["Nome completo *","nome",""],["Email","email","email@dominio.com"],["CPF","cpf",""],["Telefone","telefone",""],["Tratamento no oficio","tratamento","A Senhor(a) Nome"],["Palavra-chave","chave","como aparece no despacho"]].map(function(field) {
            return React.createElement("div", { key:field[1] },
              React.createElement("label", { style:C.label }, field[0]),
              React.createElement("input", { style:C.input, value:item.form[field[1]]||"", onChange:function(e){ atualizar(item.id,{form:Object.assign({},item.form,{[field[1]]:e.target.value})}); }, placeholder:field[2] })
            );
          }),
          React.createElement("div", { style:{ gridColumn:"1/-1", display:"flex", alignItems:"center", gap:8 } },
            React.createElement("input", { type:"checkbox", id:"salvar_"+item.id, checked:item.salvar, onChange:function(e){atualizar(item.id,{salvar:e.target.checked});} }),
            React.createElement("label", { htmlFor:"salvar_"+item.id, style:{ fontSize:13, color:"#555", cursor:"pointer" } }, "Salvar no banco para uso futuro")
          )
        )
      );
    }),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:8 } },
      React.createElement("button", { style:btnOut(), onClick:onPular }, "Pular e gerar assim mesmo"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ onConfirmar(itens.map(function(x){ return Object.assign({},x.form,{salvar:x.salvar,arquivoDespacho:x.arquivoDespacho}); })); } }, "Confirmar e gerar oficios")
    )
  );
}
