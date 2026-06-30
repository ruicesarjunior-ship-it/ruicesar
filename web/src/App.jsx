import React, { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ============================================================================
// Configuracao da API Anthropic (chamada direta pelo navegador).
// A chave fica apenas no localStorage do navegador e vai direto para a Anthropic.
// ============================================================================
var API = { key: "", model: "claude-sonnet-4-6", usarIA: true, promotor: "Rui César Farias dos Santos Júnior" };

function carregarSettings() {
  try {
    var s = JSON.parse(localStorage.getItem("mpba:settings") || "{}");
    API.key = s.key || "";
    API.model = s.model || "claude-sonnet-4-6";
    API.usarIA = s.usarIA !== false;
    API.promotor = s.promotor || "Rui César Farias dos Santos Júnior";
  } catch (e) {}
  return { key: API.key, model: API.model, usarIA: API.usarIA, promotor: API.promotor };
}
function salvarSettings(s) {
  API.key = s.key || "";
  API.model = s.model || "claude-sonnet-4-6";
  API.usarIA = s.usarIA !== false;
  API.promotor = s.promotor || "Rui César Farias dos Santos Júnior";
  try { localStorage.setItem("mpba:settings", JSON.stringify({ key: API.key, model: API.model, usarIA: API.usarIA, promotor: API.promotor })); } catch (e) {}
}

// Storage helpers (localStorage)
async function sGet(key) {
  try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function sSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Comarcas. promotoriaCidade = sede da promotoria responsavel (Alcobaca pertence a
// promotoria de Prado); promotoria/secretaria seguem essa sede. cidade = a comarca
// em si (usada nos rotulos e na classificacao dos destinatarios).
const SECRETARIA_PRADO = ["Secretaria Processual e Administrativa – PJ Prado", "Rua Presidente Kennedy, n/s, Centro – Prado/BA", "CEP.: 45.980-000, Telefones: (73) 3298-1993"];
const COMARCAS = {
  prado:       { label: "Prado/BA",       cidade: "Prado",       promotoriaCidade: "Prado",       email: "prado@mpba.mp.br",      promotoria: "Promotoria de Justiça de Prado",       secretaria: SECRETARIA_PRADO },
  nova_vicosa: { label: "Nova Viçosa/BA", cidade: "Nova Viçosa", promotoriaCidade: "Nova Viçosa", email: "novavicosa@mpba.mp.br", promotoria: "Promotoria de Justiça de Nova Viçosa", secretaria: ["Secretaria Processual e Administrativa – PJ Nova Viçosa"] },
  alcobaca:    { label: "Alcobaça/BA",    cidade: "Alcobaça",    promotoriaCidade: "Prado",       email: "prado@mpba.mp.br",      promotoria: "Promotoria de Justiça de Prado",       secretaria: SECRETARIA_PRADO },
};

// Tipo do procedimento por extenso (para o cabecalho da certidao)
var TIPO_EXTENSO = { NF:"Notícia de Fato", PA:"Procedimento Administrativo", IC:"Inquérito Civil", PP:"Procedimento Preparatório", IP:"Inquérito Policial", TCO:"Termo Circunstanciado de Ocorrência" };

// Destinatarios iniciais (campos: vocativo, nomeAutoridade, nome=orgao, endereco, cepCidade, email)
const DEST_INICIAIS = [
  { id:"di01", comarca:"prado",       chave:"conselho tutelar", nome:"Conselho Tutelar de Prado",              vocativo:"Ao Ilustre Conselho Tutelar",     nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di02", comarca:"prado",       chave:"creas",            nome:"CREAS de Prado",                         vocativo:"Ao Coordenador do CREAS",         nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di03", comarca:"prado",       chave:"cras",             nome:"CRAS de Prado",                          vocativo:"Ao Coordenador do CRAS",          nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di04", comarca:"prado",       chave:"policia civil",    nome:"Delegacia de Polícia Civil de Prado",    vocativo:"A Sua Senhoria o Senhor",         nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di05", comarca:"prado",       chave:"prefeitura",       nome:"Prefeitura Municipal de Prado",          vocativo:"A Sua Excelência o Senhor",       nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di06", comarca:"prado",       chave:"secretaria saude", nome:"Secretaria Municipal de Saúde de Prado", vocativo:"A Sua Excelência o Senhor",       nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di07", comarca:"prado",       chave:"hospital",         nome:"Hospital Municipal de Prado",            vocativo:"Ao Diretor do Hospital Municipal", nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di08", comarca:"nova_vicosa", chave:"conselho tutelar", nome:"Conselho Tutelar de Nova Viçosa",        vocativo:"Ao Ilustre Conselho Tutelar",     nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di09", comarca:"nova_vicosa", chave:"creas",            nome:"CREAS de Nova Viçosa",                   vocativo:"Ao Coordenador do CREAS",         nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di10", comarca:"nova_vicosa", chave:"policia civil",    nome:"Delegacia de Polícia Civil de Nova Viçosa", vocativo:"A Sua Senhoria o Senhor",      nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di11", comarca:"nova_vicosa", chave:"prefeitura",       nome:"Prefeitura Municipal de Nova Viçosa",     vocativo:"A Sua Excelência o Senhor",       nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di12", comarca:"alcobaca",    chave:"conselho tutelar", nome:"Conselho Tutelar de Alcobaça",           vocativo:"Ao Ilustre Conselho Tutelar",     nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di13", comarca:"alcobaca",    chave:"policia civil",    nome:"Delegacia de Polícia Civil de Alcobaça", vocativo:"A Sua Senhoria o Senhor",         nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
  { id:"di14", comarca:"alcobaca",    chave:"prefeitura",       nome:"Prefeitura Municipal de Alcobaça",       vocativo:"A Sua Excelência o Senhor",       nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" },
];

const SERV_INICIAIS = [
  { id:"sv01", nome:"Rodrigo Ribeiro Secundino",   matricula:"355.757", cargo:"Assistente Técnico Administrativo", comarca:"prado"       },
  { id:"sv02", nome:"Jose Jacques Barros Guarino", matricula:"--",      cargo:"Assistente Técnico Administrativo", comarca:"nova_vicosa" },
];

const TIPOS_PROC = ["PA", "IP", "NF", "IC", "PP", "TCO"];

function uid() { return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2); }

// Migra um destinatario salvo no formato antigo (tratamento) para o novo (vocativo + campos)
function migrarDest(d) {
  return Object.assign({ vocativo:"", nomeAutoridade:"", endereco:"", cepCidade:"", email:"" }, d, {
    vocativo: d.vocativo || d.tratamento || "",
  });
}

function encXml(s) {
  return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Paragrafo do corpo do .docx. Padrao: Times New Roman, sz 22 (=11pt), espacamento simples.
function xmlPar(texto, opts) {
  opts = opts || {};
  var bold = !!opts.bold;
  var size = opts.size || 22;
  var align = opts.align || "both";
  var sb = opts.sb || 0;
  var sa = opts.sa || 0;
  var firstLine = opts.firstLine || 0;
  var font = opts.font || "Times New Roman";
  var jc = align === "center" ? "center" : align === "right" ? "right" : align === "left" ? "left" : "both";
  var indTag = firstLine ? "<w:ind w:firstLine=\"" + firstLine + "\"/>" : "";
  var bTag = bold ? "<w:b/>" : "";
  var sz = "<w:sz w:val=\"" + size + "\"/><w:szCs w:val=\"" + size + "\"/>";
  var sp = "<w:spacing w:before=\"" + sb + "\" w:after=\"" + sa + "\"/>";
  var fontTag = "<w:rFonts w:ascii=\"" + font + "\" w:hAnsi=\"" + font + "\" w:cs=\"" + font + "\"/>";
  return "<w:p><w:pPr><w:pStyle w:val=\"Standard\"/>" + sp + indTag + "<w:jc w:val=\"" + jc + "\"/><w:rPr>" + fontTag + bTag + sz + "</w:rPr></w:pPr><w:r><w:rPr>" + fontTag + bTag + sz + "</w:rPr><w:t xml:space=\"preserve\">" + encXml(texto) + "</w:t></w:r></w:p>";
}

function xmlVazio() {
  return "<w:p><w:pPr><w:pStyle w:val=\"Standard\"/></w:pPr></w:p>";
}

// Item numerado de diligencia (referencia em negrito + teor + prazo proprio)
function xmlItemDiligencia(n, numProc, tipo, teor, prazo) {
  var font = "<w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\" w:cs=\"Times New Roman\"/>";
  var x = "<w:p><w:pPr><w:pStyle w:val=\"Standard\"/><w:spacing w:before=\"40\" w:after=\"40\"/><w:ind w:left=\"720\" w:hanging=\"360\"/><w:jc w:val=\"both\"/></w:pPr>";
  x += "<w:r><w:rPr>" + font + "<w:b/><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr><w:t xml:space=\"preserve\">" + n + ". Referência " + encXml(numProc) + (tipo ? " (" + encXml(tipo) + ")" : "") + ": </w:t></w:r>";
  x += "<w:r><w:rPr>" + font + "<w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr><w:t xml:space=\"preserve\">" + encXml(teor) + ". </w:t></w:r>";
  x += "<w:r><w:rPr>" + font + "<w:b/><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr><w:t xml:space=\"preserve\">Prazo de resposta: " + encXml(prazo || "15 (quinze) dias") + ".</w:t></w:r></w:p>";
  return x;
}

// Corpo do oficio no formato do modelo MPBA (com juntada de varios procedimentos)
function gerarBodyOficio(o) {
  var d = o.dest;
  var itens = o.itens;            // [{numProc, tipo, teor}]
  var numOficio = o.numOficio;
  var assunto = o.assunto;
  var promotor = o.promotor;
  var promotoriaCidade = o.promotoriaCidade;  // cidade da comarca (do promotor)
  var emailResp = o.emailResp;
  var servNome = o.servNome;
  var servCargo = o.servCargo;
  var x = "";

  x += xmlPar("Ofício nº " + numOficio, { size:22 });
  x += xmlPar("(Na resposta, favor fazer referência ao nº acima)", { size:18 });
  x += xmlVazio();
  x += xmlPar(promotoriaCidade + ", data da assinatura eletrônica.", { size:22, align:"right" });
  x += xmlVazio();

  // Bloco do destinatario
  if (d.vocativo) x += xmlPar(d.vocativo, { size:22, align:"left" });
  if (d.nomeAutoridade) x += xmlPar(d.nomeAutoridade, { size:22, align:"left", bold:true });
  x += xmlPar(d.nome, { size:22, align:"left" });
  if (d.endereco) x += xmlPar(d.endereco, { size:22, align:"left" });
  if (d.cepCidade) x += xmlPar(d.cepCidade, { size:22, align:"left" });
  x += xmlVazio();

  x += xmlPar("Assunto: " + (assunto || "Solicita providências."), { size:22 });
  var refs = itens.map(function(i){ return i.numProc; }).join("; ");
  x += xmlPar("Referência: " + refs + ".", { size:22 });
  x += xmlVazio();

  if (itens.length === 1) {
    x += xmlPar("Cumprimentando-o cordialmente e de ordem do Excelentíssimo Senhor Doutor " + promotor + ", Promotor de Justiça de " + promotoriaCidade + ", sirvo-me do presente para solicitar " + itens[0].teor + ", no prazo de " + (itens[0].prazo || "15 (quinze) dias") + ".", { size:22, firstLine:708 });
  } else {
    x += xmlPar("Cumprimentando-o cordialmente e de ordem do Excelentíssimo Senhor Doutor " + promotor + ", Promotor de Justiça de " + promotoriaCidade + ", sirvo-me do presente para solicitar o atendimento das diligências abaixo relacionadas, observado, para cada uma, o respectivo prazo de resposta:", { size:22, firstLine:708 });
    x += xmlVazio();
    for (var i = 0; i < itens.length; i++) {
      x += xmlItemDiligencia(i+1, itens[i].numProc, itens[i].tipo, itens[i].teor, itens[i].prazo);
    }
  }
  x += xmlVazio();
  x += xmlPar("A resposta deverá ser encaminhada para o endereço eletrônico " + emailResp, { size:22 });
  x += xmlVazio();
  x += xmlPar("Respeitosamente,", { size:22 });
  x += xmlVazio();
  x += xmlPar("(assinado eletronicamente)", { size:22, align:"center" });
  x += xmlPar(servNome, { size:22, align:"center" });
  x += xmlPar(servCargo, { size:22, align:"center" });
  return x;
}

// Certidao de cumprimento de despacho (juntada aos autos), nos modelos do MPBA.
// tipoCertidao: "encaminhamento" | "reiteracao" | "prazo_vencido".
// Os IDs MP (despacho, oficio, comprovacao de e-mail) so existem apos a juntada
// no sistema, por isso saem como "ID MP ______" para o servidor preencher.
function gerarBodyCertidao(o) {
  var numProc = o.numProc;
  var tipoProc = o.tipo;
  var tipoCert = o.tipoCertidao || "encaminhamento";
  var exps = o.expedicoes || [];
  var data = o.data;
  var cidade = o.cidade;
  var secretaria = o.secretaria || [];
  var nomeServ = o.nomeServ;
  var cargoServ = o.cargoServ;
  var matServ = o.matServ;
  var prazoMax = o.prazoMax || "30 (trinta) dias";
  var x = "";

  // Cabecalho da Secretaria (a direita), abaixo do timbre
  secretaria.forEach(function(l){ x += xmlPar(l, { size:18, align:"right" }); });
  if (secretaria.length) x += xmlVazio();

  x += xmlPar((TIPO_EXTENSO[tipoProc] || "Procedimento") + " nº " + numProc, { size:22, align:"center" });
  x += xmlPar("CERTIDÃO", { bold:true, size:22, align:"center", sa:120 });

  var plural = exps.length !== 1;
  var verbo = (tipoCert === "reiteracao")
    ? (plural ? "reiterei os seguintes ofícios" : "reiterei o seguinte ofício")
    : (plural ? "encaminhei os seguintes ofícios" : "encaminhei o seguinte ofício");
  x += xmlPar("CERTIFICO que, em cumprimento ao despacho ministerial acostado ao ID MP ______, " + verbo + ":", { size:22, firstLine:708, sa:80 });

  for (var i = 0; i < exps.length; i++) {
    x += xmlPar("Ofício nº " + exps[i].numOficio + " (ID MP ______), destinado a " + exps[i].nome + ", conforme comprovação de envio e entrega de e-mail, ID MP ______ e ______.", { size:22, firstLine:708, sa:40 });
  }
  x += xmlVazio();

  if (tipoCert === "prazo_vencido") {
    x += xmlPar("Certifico, ainda, que o prazo máximo para resposta é de " + prazoMax + ".", { size:22, firstLine:708, sa:60 });
    x += xmlPar("Certifico, por fim, que o presente Documento se encontra com prazo de conclusão vencido, conforme informação contida no cabeçalho do visualizador do IDEA.", { size:22, firstLine:708, sa:60 });
    x += xmlPar("Por fim, faço concluso os presentes autos ao(à) Promotor(a) de Justiça para as providências cabíveis.", { size:22, firstLine:708, sa:60 });
  } else {
    x += xmlPar("Assim, remeto os autos ao Armário Virtual da Secretaria Processual e Administrativa a fim de aguardar o transcurso do prazo assinalado para resposta aos ofícios.", { size:22, firstLine:708, sa:60 });
  }
  x += xmlPar("O referido é verdade e dou fé.", { size:22, firstLine:708, sa:200 });

  x += xmlPar(cidade + "/BA, data da assinatura eletrônica.", { size:22, align:"center", sa:200 });
  x += xmlPar(nomeServ, { size:22, align:"center" });
  x += xmlPar(cargoServ, { size:22, align:"center" });
  if (matServ && matServ !== "--") x += xmlPar("Mat. " + matServ, { size:22, align:"center" });
  return x;
}

// Carrega a casca timbrada embutida no app
async function carregarCasca() {
  var resp = await fetch(import.meta.env.BASE_URL + "casca.docx");
  if (!resp.ok) throw new Error("Não foi possível carregar o modelo timbrado (casca.docx). HTTP " + resp.status);
  return await resp.arrayBuffer();
}

// Extrai o paragrafo do timbre (imagem flutuante ancorada) do corpo da casca,
// para reinseri-lo no topo do corpo gerado (senao a imagem seria apagada).
function extrairTimbrePar(docXml) {
  var s = docXml.indexOf("<w:drawing");
  if (s === -1) return "";
  var fim = docXml.indexOf("</w:drawing>", s);
  if (fim === -1) return "";
  var drawing = docXml.slice(s, fim + "</w:drawing>".length);
  // Ancora o timbre no canto superior ESQUERDO da PÁGINA (e não da coluna/margem),
  // para que ocupe a folha inteira da esquerda à direita, na sua altura padrão.
  drawing = drawing
    .replace(/(<wp:positionH\b[^>]*\brelativeFrom=")[^"]*(")/, "$1page$2")
    .replace(/(<wp:positionV\b[^>]*\brelativeFrom=")[^"]*(")/, "$1page$2")
    .replace(/(<wp:positionH\b[\s\S]*?<wp:posOffset>)[^<]*(<\/wp:posOffset>)/, function(_, a, b){ return a + "0" + b; })
    .replace(/(<wp:positionV\b[\s\S]*?<wp:posOffset>)[^<]*(<\/wp:posOffset>)/, function(_, a, b){ return a + "0" + b; });
  return "<w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr>" + drawing + "</w:r></w:p>";
}

async function montarDocx(bodyXml, cascaBytes) {
  var zip = await JSZip.loadAsync(cascaBytes.slice(0));
  var docXml = await zip.file("word/document.xml").async("string");
  var timbre = extrairTimbrePar(docXml);
  var newDoc = docXml.replace(/<w:body>[\s\S]*?<w:sectPr/, "<w:body>\n" + timbre + bodyXml + "\n<w:sectPr");
  zip.file("word/document.xml", newDoc);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function gerarEml(o) {
  var d = o.dest;
  var numOficio = o.numOficio;
  var promotoriaEmail = o.promotoriaEmail;
  var promotoria = o.promotoria;   // especifica da comarca (ex.: "Promotoria de Justiça de Prado")
  var servNome = o.servNome;
  var servCargo = o.servCargo;
  var assunto = "Ofício nº " + numOficio + " - " + promotoria;
  var corpo = "<p>" + (d.vocativo || "Prezado(a)") + ",</p>"
    + "<p>Encaminhamos em anexo o <strong>Ofício nº " + numOficio + "</strong>, expedido pela " + promotoria + ", com diligências a serem cumpridas. Seguem também as cópias dos respectivos procedimentos.</p>"
    + "<p><strong>Os prazos de resposta estão indicados no próprio ofício, podendo variar conforme cada procedimento.</strong> Solicitamos a observância do prazo correspondente a cada diligência.</p>"
    + "<p>Respeitosamente,<br>(assinado eletronicamente)<br><strong>" + servNome + "</strong><br>" + servCargo + "<br>" + promotoria + "</p>";
  var bd = "boundary_" + Date.now();
  var eml = "MIME-Version: 1.0\r\nFrom: " + promotoriaEmail + "\r\n" + (d.email ? "To: " + d.email + "\r\n" : "") + "Subject: " + assunto + "\r\nContent-Type: multipart/mixed; boundary=\"" + bd + "\"\r\n\r\n--" + bd + "\r\nContent-Type: text/html; charset=utf-8\r\n\r\n" + corpo + "\r\n\r\n--" + bd + "--\r\n";
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

async function anthropicMessages(opts) {
  if (!API.key) throw new Error("Chave da API Anthropic não configurada. Vá em Config e cole sua chave sk-ant-...");
  // Tempo-limite proprio (alem do AbortController externo), para nunca ficar travado.
  var ctrl = new AbortController();
  var to = setTimeout(function(){ ctrl.abort(); }, opts.timeoutMs || 240000);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", function(){ ctrl.abort(); });
  }
  var r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders(),
      body: JSON.stringify({ model: API.model, max_tokens: opts.max_tokens || 4000, messages: [{ role: "user", content: opts.content }] }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") {
      if (opts.signal && opts.signal.aborted) throw new Error("Processamento cancelado.");
      throw new Error("A IA demorou demais para responder e o tempo esgotou. Dicas: envie menos PDFs por vez (ou um procedimento por vez), confira sua conexão e a chave da API, e tente de novo.");
    }
    throw new Error("Falha de conexão com a API da Anthropic. Verifique a internet e a chave (Config). Detalhe: " + (e && e.message ? e.message : e));
  } finally {
    clearTimeout(to);
  }
  var d;
  try { d = await r.json(); } catch (e) { throw new Error("Resposta inválida da API (HTTP " + r.status + ")."); }
  if (d.error) throw new Error("API erro: " + (d.error.message || JSON.stringify(d.error)));
  if (!d.content || !d.content[0]) throw new Error("API sem conteúdo (HTTP " + r.status + ").");
  return d.content.filter(function(b){ return b.type === "text"; }).map(function(b){ return b.text; }).join("\n");
}

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

// Extrai o texto de um PDF no navegador (pdf.js). Retorna "" se nao houver camada de texto.
async function extrairTextoPDF(file) {
  var buf = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  var texto = "";
  var maxPag = Math.min(pdf.numPages, 400);
  for (var p = 1; p <= maxPag; p++) {
    var page = await pdf.getPage(p);
    var content = await page.getTextContent();
    texto += content.items.map(function(it){ return it.str; }).join(" ") + "\n";
  }
  return texto.trim();
}

// Recorta texto grande preservando INÍCIO (capa/nº do procedimento) e FIM (despachos
// mais recentes — o último despacho costuma estar no fim do procedimento).
function recortarTexto(t, lim) {
  t = t || "";
  if (t.length <= lim) return t;
  var ini = Math.floor(lim * 0.30);
  var fim = lim - ini;
  return t.slice(0, ini) + "\n\n[...trecho intermediário omitido por tamanho...]\n\n" + t.slice(t.length - fim);
}

function extrairJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch(e1) {}
  var limpo = raw.replace(/```json/g,"").replace(/```/g,"").trim();
  try { return JSON.parse(limpo); } catch(e2) {}
  var m2 = limpo.match(/\[[\s\S]*\]/);
  if (m2) { try { return JSON.parse(m2[0]); } catch(e4) {} }
  var m1 = limpo.match(/\{[\s\S]*\}/);
  if (m1) { try { return JSON.parse(m1[0]); } catch(e3) {} }
  throw new Error("Não foi possível interpretar a resposta da IA: " + raw.slice(0,200));
}

var PROMPT_EXTRACAO =
"Você é assistente de uma Promotoria de Justiça do Ministério Público da Bahia. " +
"Recebe um ou mais arquivos que podem ser DESPACHOS isolados e/ou PROCEDIMENTOS ADMINISTRATIVOS INTEIROS (com vários despachos ao longo das páginas).\n\n" +
"Tarefa: AGRUPE o conteúdo por NÚMERO DE PROCEDIMENTO (ex.: 201.9.551584/2025, 003.9.000123/2025). Para CADA procedimento:\n" +
"1) Localize o ÚLTIMO despacho (o mais recente do Promotor). Se ele apenas remeter a despacho anterior (ex.: \"reitere-se\", \"cumpra-se o despacho anterior\", \"conforme despacho de fls. X\", \"renove-se\"), SIGA a cadeia de remissões e considere os comandos efetivamente determinados a cumprir.\n" +
"2) Identifique CADA DILIGÊNCIA determinada. Uma diligência = UM destinatário + o que se determinou SOLICITAR/REQUISITAR ÀQUELE destinatário especificamente.\n\n" +
"REGRA CRÍTICA DE ATRIBUIÇÃO (leia com atenção):\n" +
"- O teor de cada diligência deve corresponder EXATAMENTE ao que o despacho mandou pedir ÀQUELE destinatário. NUNCA repita o mesmo teor para destinatários diferentes e NUNCA misture o comando de um destinatário no de outro.\n" +
"- Use a natureza do pedido para conferir o destinatário correto. Exemplos de pistas: boletim de ocorrência (BO), inquérito policial, situação processual de investigado, registro de ocorrência => DELEGACIA DE POLÍCIA. Relatório psicossocial/acompanhamento de família, medidas de proteção a criança/adolescente => CONSELHO TUTELAR. Acompanhamento socioassistencial, CRAS/CREAS, visita domiciliar social, idoso/vulnerável => CREAS ou CRAS. Atendimento/prontuário médico => SECRETARIA DE SAÚDE/HOSPITAL.\n" +
"- Se o despacho determinar VÁRIAS coisas ao MESMO destinatário, junte tudo em um único teor para aquele destinatário.\n" +
"- Se um pedido não indicar destinatário claro, use orgao \"Destinatário a identificar\".\n" +
"- PESSOAS FÍSICAS: se a diligência for dirigida a uma PESSOA (vítima, denunciante, requerente, investigado, testemunha, representante, munícipe), INCLUA-A normalmente como uma diligência. Coloque o nome da pessoa em orgao (e também em nomeAutoridade); se o nome não constar, use orgao \"Usuário/pessoa a identificar\" e descreva no teor de quem se trata (ex.: \"a vítima mencionada às fls. X\"). NÃO invente nome, endereço, CPF nem e-mail.\n\n" +
"Para cada diligência forneça:\n" +
"- orgao (instituição destinatária), vocativo (ex.: \"A Sua Excelência o Senhor\", \"A Sua Senhoria o Senhor\", \"Ao Ilustre Conselho Tutelar\", \"Ao Coordenador do CREAS\"), nomeAutoridade (nome da pessoa, se houver), endereco, cepCidade, email (o que estiver disponível; vazio se não houver);\n" +
"- assunto: sintético, poucas palavras (ex.: \"Solicita informações.\", \"Requisita documentos.\");\n" +
"- teor: frase objetiva que completa \"sirvo-me do presente para solicitar ___\" (ex.: \"informações sobre o andamento do BO nº 220187/2026 e a situação processual do investigado\"). NÃO inclua o prazo no teor.\n" +
"- prazo: o prazo de resposta determinado no despacho PARA AQUELE destinatário, por extenso no formato número + (extenso) + dias (ex.: \"15 (quinze) dias\", \"10 (dez) dias\", \"5 (cinco) dias úteis\"). Se o despacho não indicar prazo, use \"15 (quinze) dias\".\n\n" +
"tipo do procedimento: PA, IP, NF, IC, PP ou TCO.\n" +
"tipoCertidao do procedimento (qual certidão de cumprimento será lavrada): \"encaminhamento\" (expedição/encaminhamento normal dos ofícios) | \"reiteracao\" (o despacho determina REITERAR ofícios — \"reitere-se\", \"renove-se\", ou reiteração por ausência de resposta) | \"prazo_vencido\" (o procedimento está com prazo de conclusão vencido / determina-se providência por prazo vencido). Em dúvida, use \"encaminhamento\".\n\n" +
"Responda SOMENTE com um array JSON, sem markdown e sem explicações, no formato:\n" +
"[{\"numProc\":\"...\",\"tipo\":\"NF\",\"tipoCertidao\":\"encaminhamento\",\"diligencias\":[{\"orgao\":\"...\",\"vocativo\":\"...\",\"nomeAutoridade\":\"\",\"endereco\":\"\",\"cepCidade\":\"\",\"email\":\"\",\"assunto\":\"...\",\"teor\":\"...\",\"prazo\":\"15 (quinze) dias\"}]}]\n" +
"Se um procedimento não tiver diligência clara, use \"diligencias\":[{\"orgao\":\"Destinatário a identificar\",\"assunto\":\"\",\"teor\":\"\",\"prazo\":\"15 (quinze) dias\"}].";

// Envia todos os arquivos numa unica chamada e retorna o array de procedimentos.
async function extrairProcedimentos(files, onProgresso, signal) {
  var content = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (onProgresso) onProgresso("Lendo " + f.name + " (" + (i+1) + "/" + files.length + ")");
    var texto = "";
    if (/\.pdf$/i.test(f.name)) {
      try { texto = await extrairTextoPDF(f); } catch (e) { texto = ""; }
      if (texto && texto.replace(/\s/g, "").length > 40) {
        content.push({ type:"text", text:"===== ARQUIVO: " + f.name + " =====\n" + recortarTexto(texto, 90000) });
      } else {
        // PDF escaneado/sem texto -> envia como documento (imagem)
        var b64 = await lerArquivoBase64(f);
        content.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:b64 } });
        content.push({ type:"text", text:"(o arquivo PDF acima chama-se: " + f.name + ")" });
      }
    } else {
      var t = await lerArquivoTexto(f);
      content.push({ type:"text", text:"===== ARQUIVO: " + f.name + " =====\n" + recortarTexto(t, 90000) });
    }
  }
  content.push({ type:"text", text: PROMPT_EXTRACAO });
  if (onProgresso) onProgresso("IA analisando os documentos... (pode levar 1 a 2 minutos)");
  var raw = await anthropicMessages({ max_tokens: 8000, content: content, signal: signal, timeoutMs: 240000 });
  var arr = extrairJSON(raw);
  if (!Array.isArray(arr)) arr = [arr];
  return arr;
}

// Estilos UI
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

function Modal(props) {
  return (
    React.createElement("div", { style:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 } },
      React.createElement("div", { style:{ background:"white", borderRadius:12, padding:24, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" } },
        props.children
      )
    )
  );
}

function normChave(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g,"").trim(); }

// ---- Importacao de destinatarios via CSV ----
// Parser de uma linha CSV ciente de aspas (separador configuravel; aspas duplas escapam ").
function parseLinhaCSV(line, delim) {
  var out = [], cur = "", inq = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inq) {
      if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else inq = false; }
      else cur += c;
    } else {
      if (c === '"') inq = true;
      else if (c === delim) { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Aceita ; ou , como separador. Colunas: Nome/Cargo; Instituicao/Orgao; Endereco; E-mail; [Referencia]
function parseCSVDestinatarios(text) {
  var linhas = String(text || "").replace(/\r/g, "").split("\n").filter(function(l){ return l.trim().length; });
  if (linhas.length === 0) return [];
  var delim = (linhas[0].split(";").length >= linhas[0].split(",").length) ? ";" : ",";
  var rows = linhas.map(function(l){ return parseLinhaCSV(l, delim); });
  // remove cabecalho se detectado
  var h = ((rows[0][0]||"") + " " + (rows[0][1]||"")).toLowerCase();
  if (h.indexOf("instit") !== -1 || h.indexOf("rgao") !== -1 || h.indexOf("orgao") !== -1 || (h.indexOf("nome") !== -1 && h.indexOf("mail") !== -1)) rows.shift();
  return rows.map(function(c){
    return { nomeCargo:(c[0]||"").trim(), orgao:(c[1]||"").trim(), endereco:(c[2]||"").trim(), email:(c[3]||"").trim() };
  }).filter(function(r){ return r.orgao; });
}

function comarcaPorNome(nome) {
  var n = normChave(nome);
  if (n.indexOf("nova vicosa") !== -1) return "nova_vicosa";
  if (n.indexOf("alcobaca") !== -1) return "alcobaca";
  if (n.indexOf("prado") !== -1) return "prado";
  return "todos";
}

// Separa "Rua X, n\u00ba Y, Bairro, 00000-000 Cidade - BA" em endereco + cepCidade.
function splitEndereco(addr) {
  addr = (addr || "").trim();
  if (!addr) return { endereco:"", cepCidade:"" };
  var m = addr.match(/^(.*?)[,\s\u2013-]*((?:CEP[:\s]*)?\d{2}\.?\d{3}-?\d{3}.*)$/i);
  if (m) return { endereco: m[1].replace(/[,\s\u2013-]+$/,"").trim(), cepCidade: m[2].replace(/^[,\s]+/,"").trim() };
  return { endereco: addr, cepCidade:"" };
}

export default function App() {
  var [screen, setScreen] = useState("loading");
  var [comarca, setComarca] = useState("prado");
  var [destDB, setDestDB] = useState([]);
  var [servDB, setServDB] = useState([]);
  var [servAtual, setServAtual] = useState(null);
  var [step, setStep] = useState("config");
  var [cfg, setCfg] = useState({ numInicial:"", ano: String(new Date().getFullYear()), data: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"}) });
  var [fila, setFila] = useState([]);
  var [procs, setProcs] = useState([]);
  var [pendentes, setPendentes] = useState([]);
  var [resultado, setResultado] = useState(null);
  var [progresso, setProgresso] = useState({ msg:"", atual:0, total:0 });
  var [erroProc, setErroProc] = useState("");
  var [cascaBytes, setCascaBytes] = useState(null);
  var [modalDest, setModalDest] = useState(null);
  var [modalServ, setModalServ] = useState(null);
  var [modalManual, setModalManual] = useState(null);
  var [modalImport, setModalImport] = useState(false);
  var [settings, setSettings] = useState({ key:"", model:"claude-sonnet-4-6", usarIA:true, promotor:"Rui César Farias dos Santos Júnior" });
  var [showSettings, setShowSettings] = useState(false);
  var fileRef = useRef();
  var abortRef = useRef(null);

  useEffect(function() {
    (async function() {
      setSettings(carregarSettings());
      var dSaved = await sGet("mpba:dest");
      var sSaved = await sGet("mpba:serv");
      var cSaved = await sGet("mpba:comarca");
      var dList = (dSaved || DEST_INICIAIS).map(migrarDest);
      var sList = (sSaved || SERV_INICIAIS).map(function(s){ return Object.assign({ cargo:"" }, s); });
      var c = cSaved || "prado";
      setDestDB(dList);
      setServDB(sList);
      setComarca(c);
      setServAtual(sList.find(function(s) { return s.comarca === c; }) || sList[0] || null);
      try { var bytes = await carregarCasca(); setCascaBytes(bytes); } catch(e) { console.warn(e); }
      setScreen("main");
    })();
  }, []);

  async function salvarDest(lista) { setDestDB(lista); await sSet("mpba:dest", lista); }
  async function salvarServ(lista) { setServDB(lista); await sSet("mpba:serv", lista); }

  // Importa destinatarios a partir de linhas {nomeCargo,orgao,endereco,email}.
  // Evita duplicar pelo nome do orgao (ja existente no banco).
  async function importarDestinatarios(rows) {
    var existentes = {};
    destDB.forEach(function(d){ existentes[normChave(d.nome)] = 1; });
    var add = [], dup = 0;
    rows.forEach(function(r){
      var k = normChave(r.orgao);
      if (!k || existentes[k]) { dup++; return; }
      existentes[k] = 1;
      var sp = splitEndereco(r.endereco);
      add.push({ id:uid(), comarca:comarcaPorNome(r.orgao), chave:normChave(r.orgao).slice(0,40), nome:r.orgao, vocativo:"", nomeAutoridade:r.nomeCargo||"", endereco:sp.endereco, cepCidade:sp.cepCidade, email:r.email||"", tipo:"institucional" });
    });
    if (add.length) await salvarDest(destDB.concat(add));
    return { add:add.length, dup:dup };
  }

  async function importarListaPrado() {
    try {
      var resp = await fetch(import.meta.env.BASE_URL + "destinatarios_prado.csv");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var txt = await resp.text();
      var rows = parseCSVDestinatarios(txt);
      var res = await importarDestinatarios(rows);
      alert("Importação concluída: " + res.add + " adicionados" + (res.dup ? ", " + res.dup + " já existiam (ignorados)." : "."));
    } catch (e) {
      alert("Não foi possível importar a lista: " + (e && e.message ? e.message : e));
    }
  }

  function mudarComarca(c) {
    setComarca(c);
    sSet("mpba:comarca", c);
    setServAtual(servDB.find(function(s) { return s.comarca === c; }) || servDB[0] || null);
  }

  // Resolve um destinatario (objeto da IA {orgao,...} ou string) contra o banco da comarca.
  function resolverDest(item) {
    var texto = typeof item === "string" ? item : (item.orgao || item.nome || "");
    var lower = normChave(texto);
    var lista = destDB.filter(function(d) { return d.comarca === comarca || d.comarca === "todos"; });
    var achado = null;
    for (var i = 0; i < lista.length; i++) {
      var d = lista[i];
      if (lower && (lower.indexOf(normChave(d.chave)) !== -1 || normChave(d.nome).indexOf(lower) !== -1 || lower.indexOf(normChave(d.nome)) !== -1)) { achado = d; break; }
    }
    var ia = typeof item === "object" ? item : {};
    if (achado) {
      // mescla: prefere dado do banco; complementa com o que a IA achou
      return {
        id: achado.id,
        chave: achado.chave,
        nome: achado.nome,
        vocativo: achado.vocativo || ia.vocativo || "",
        nomeAutoridade: achado.nomeAutoridade || ia.nomeAutoridade || "",
        endereco: achado.endereco || ia.endereco || "",
        cepCidade: achado.cepCidade || ia.cepCidade || "",
        email: achado.email || ia.email || "",
      };
    }
    return null;
  }

  var adicionarArquivos = useCallback(function(files) {
    var novos = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f.name.match(/\.(pdf|txt)$/i)) continue;
      novos.push({ id:uid(), nome:f.name, file:f, manual:null });
    }
    setFila(function(p) { return p.concat(novos); });
    setStep("fila");
  }, []);

  // Aplica os procedimentos brutos -> achata em diligencias (destinatario + teor proprios)
  // -> resolve cada destinatario contra o banco -> separa as pendentes.
  function aplicarProcedimentos(brutos) {
    var resolvidas = [];
    var pendentesLocal = [];
    brutos.forEach(function(b) {
      var numProc = b.numProc || "Sem número";
      var tipo = b.tipo || "PA";
      var tipoCertidao = b.tipoCertidao || "encaminhamento";
      // compatibilidade: aceita formato antigo (destinatarios + teor unico) e novo (diligencias)
      var dils = b.diligencias;
      if (!dils) {
        dils = (b.destinatarios || []).map(function(dst){
          var o = typeof dst === "object" ? dst : { orgao: String(dst) };
          return Object.assign({}, o, { assunto: b.assunto || "", teor: b.teor || "" });
        });
      }
      dils.forEach(function(dil) {
        var r = resolverDest(dil);
        var base = { numProc:numProc, tipo:tipo, tipoCertidao:tipoCertidao, assunto:dil.assunto || "", teor:dil.teor || "", prazo:dil.prazo || "15 (quinze) dias" };
        if (r) resolvidas.push(Object.assign(base, { dest:r }));
        else pendentesLocal.push(Object.assign({ id:uid(), textoOriginal: dil.orgao || "Destinatário", ia:dil }, base));
      });
    });
    setProcs(resolvidas);
    if (pendentesLocal.length > 0) {
      setPendentes(pendentesLocal);
      setStep("resolucao");
    } else {
      finalizar(resolvidas);
    }
  }

  function cancelarProcessamento() {
    if (abortRef.current) { try { abortRef.current.abort(); } catch(e) {} }
    abortRef.current = null;
    setProgresso({ msg:"", atual:0, total:0 });
    setErroProc("Processamento cancelado.");
    setStep("fila");
  }

  async function processarFila() {
    if (!cfg.numInicial) { alert("Informe o número inicial do ofício."); return; }
    if (!servAtual) { alert("Selecione um servidor responsável."); return; }
    setErroProc("");
    setStep("processando");

    // 1) procedimentos preenchidos manualmente -> uma diligencia por destinatario (mesmo teor)
    var manualProcs = [];
    fila.forEach(function(f) {
      if (f.manual && f.manual.numProc) {
        manualProcs.push({ numProc:f.manual.numProc, tipo:f.manual.tipo || "PA", tipoCertidao:f.manual.tipoCertidao || "encaminhamento", diligencias:(f.manual.destinatarios || []).map(function(t){ return { orgao:t, assunto:f.manual.assunto || "", teor:f.manual.teor || "", prazo:f.manual.prazo || "15 (quinze) dias" }; }) });
      }
    });
    var arquivosIA = fila.filter(function(f){ return !(f.manual && f.manual.numProc); }).map(function(f){ return f.file; });

    var ctrl = new AbortController();
    abortRef.current = ctrl;
    var brutos = manualProcs.slice();
    try {
      if (arquivosIA.length > 0) {
        if (settings.usarIA && settings.key) {
          setProgresso({ msg:"Preparando documentos...", atual:0, total:0 });
          var extraidos = await extrairProcedimentos(arquivosIA, function(msg){ setProgresso({ msg:msg, atual:0, total:0 }); }, ctrl.signal);
          brutos = brutos.concat(extraidos);
        } else {
          // sem IA: cria procedimentos vazios a partir do nome do arquivo (para preenchimento manual)
          arquivosIA.forEach(function(f) {
            var numDoNome = f.name.replace(/\.(pdf|txt)$/i,"").replace(/\s*\(\d+\)$/,"").trim();
            brutos.push({ numProc:numDoNome || "Sem número", tipo:"PA", diligencias:[{ orgao:"Destinatário a identificar", assunto:"", teor:"" }] });
          });
        }
      }
      if (brutos.length === 0) { setErroProc("Nenhum procedimento foi identificado."); setStep("fila"); return; }
      aplicarProcedimentos(brutos);
    } catch (e) {
      setErroProc(String(e && e.message ? e.message : e));
      setStep("fila");
    } finally {
      abortRef.current = null;
    }
  }

  // Consolida as diligencias por destinatario (juntada) e gera oficios + certidoes.
  // Cada diligencia ja carrega o SEU teor especifico daquele destinatario.
  function finalizar(diligencias) {
    var numInicial = parseInt(cfg.numInicial, 10);
    var ano = cfg.ano || String(new Date().getFullYear());
    function destKey(d) { return d.id || normChave(d.nome); }
    var porDest = {};
    diligencias.forEach(function(d) {
      var key = destKey(d.dest);
      if (!porDest[key]) porDest[key] = { dest:d.dest, itens:[], assuntos:[] };
      porDest[key].itens.push({ numProc:d.numProc, tipo:d.tipo, teor:d.teor, prazo:d.prazo });
      if (d.assunto && porDest[key].assuntos.indexOf(d.assunto) === -1) porDest[key].assuntos.push(d.assunto);
    });
    var grupos = Object.keys(porDest).map(function(k){ return porDest[k]; });
    grupos.forEach(function(g, i) {
      g.numOficio = String(numInicial + i).padStart(3,"0") + "." + ano;
      g.assunto = g.assuntos.join("; ");
    });
    // certidoes por procedimento
    var certsPorProc = {};
    diligencias.forEach(function(d) {
      if (!certsPorProc[d.numProc]) certsPorProc[d.numProc] = { numProc:d.numProc, tipo:d.tipo, tipoCertidao:d.tipoCertidao || "encaminhamento", prazoMax:d.prazo || "15 (quinze) dias", exps:[] };
      var g = grupos.find(function(g){ return destKey(g.dest) === destKey(d.dest); });
      if (g && !certsPorProc[d.numProc].exps.some(function(e){ return e.numOficio === g.numOficio; })) {
        certsPorProc[d.numProc].exps.push({ nome:d.dest.nome, numOficio:g.numOficio });
      }
    });
    setResultado({ grupos:grupos, certs:Object.keys(certsPorProc).map(function(k){ return certsPorProc[k]; }) });
    setStep("resultado");
  }

  async function gerarArquivos() {
    var bytes = cascaBytes;
    if (!bytes) { try { bytes = await carregarCasca(); if (bytes) setCascaBytes(bytes); } catch(e) {} }
    var comarcaData = COMARCAS[comarca];
    var cidade = comarcaData.promotoriaCidade || comarcaData.cidade;  // sede da promotoria (Alcobaça -> Prado)
    var promotoria = comarcaData.promotoria;
    var secretaria = comarcaData.secretaria || [];
    var emailResp = comarcaData.email;
    var promotor = settings.promotor || "Rui César Farias dos Santos Júnior";
    var servNome = servAtual.nome;
    var servCargo = servAtual.cargo || "Servidor(a)";
    var arquivos = [];
    var grupos = resultado.grupos;
    var certs = resultado.certs;
    for (var i = 0; i < grupos.length; i++) {
      var g = grupos[i];
      setProgresso({ msg:"Gerando ofício " + (i+1) + "/" + grupos.length, atual:i+1, total:grupos.length+certs.length });
      var nomeSafe = g.dest.nome.replace(/[^a-zA-Z0-9]/g,"_").slice(0,28);
      var nomeDocx = "Oficio_" + g.numOficio.replace(/[^0-9.]/g,"_") + "_" + nomeSafe + ".docx";
      if (bytes) {
        try {
          var blob = await montarDocx(gerarBodyOficio({ dest:g.dest, itens:g.itens, numOficio:g.numOficio, assunto:g.assunto, promotor:promotor, promotoriaCidade:cidade, emailResp:emailResp, servNome:servNome, servCargo:servCargo }), bytes);
          arquivos.push({ nome:nomeDocx, blob:blob, tipo:"oficio", procs:g.itens.map(function(x){ return x.numProc; }) });
        } catch(e) { console.error(e); }
      }
      var emlData = gerarEml({ dest:g.dest, numOficio:g.numOficio, promotoriaEmail:emailResp, promotoria:promotoria, servNome:servNome, servCargo:servCargo });
      arquivos.push({ nome:"Email_" + g.numOficio.replace(/[^0-9.]/g,"_") + "_" + nomeSafe + ".eml", blob:new Blob([emlData.eml],{type:"message/rfc822"}), tipo:"eml" });
    }
    for (var k = 0; k < certs.length; k++) {
      var cert = certs[k];
      setProgresso({ msg:"Gerando certidão " + (k+1) + "/" + certs.length, atual:grupos.length+k+1, total:grupos.length+certs.length });
      if (bytes) {
        try {
          var blobC = await montarDocx(gerarBodyCertidao({ numProc:cert.numProc, tipo:cert.tipo, tipoCertidao:cert.tipoCertidao, prazoMax:cert.prazoMax, expedicoes:cert.exps, data:cfg.data, nomeServ:servNome, cargoServ:servCargo, matServ:servAtual.matricula, secretaria:secretaria, cidade:cidade }), bytes);
          var nomeSafeCert = cert.numProc.replace(/[^a-zA-Z0-9]/g,"_").slice(0,40);
          arquivos.push({ nome:"Certidao_" + nomeSafeCert + ".docx", blob:blobC, tipo:"certidao", proc:cert.numProc });
        } catch(e) {}
      }
    }
    var ck = "CHECKLIST - " + comarcaData.label + " - " + cfg.data + "\nServidor: " + servNome + " (" + servCargo + (servAtual.matricula && servAtual.matricula !== "--" ? ", Mat. " + servAtual.matricula : "") + ")\n" + "=".repeat(50) + "\n\n";
    grupos.forEach(function(g, i) {
      ck += (i+1) + ". Ofício nº " + g.numOficio + " -> " + g.dest.nome + "\n   Email: " + (g.dest.email || "CADASTRAR") + "\n   Referência: " + g.itens.map(function(x){return x.numProc;}).join("; ") + "\n\n";
    });
    arquivos.push({ nome:"0_CHECKLIST.txt", blob:new Blob([ck],{type:"text/plain"}), tipo:"checklist" });
    return arquivos;
  }

  async function baixarZip() {
    if (!resultado) return;
    if (!cascaBytes) { alert("O modelo timbrado ainda não foi carregado. Aguarde alguns segundos e tente novamente."); return; }
    setProgresso({ msg:"Preparando...", atual:0, total:1 });
    var zip = new JSZip();
    var p1 = zip.folder("1_oficios"), p2 = zip.folder("2_certidoes"), p3 = zip.folder("3_emails_outlook");
    // Subpastas por procedimento (para o servidor juntar nos autos): cada pasta
    // recebe copias de TODOS os oficios que citam aquele procedimento + a certidao.
    var pProc = p1.folder("por_procedimento");
    function safeNum(n){ return String(n).replace(/[^0-9A-Za-z.]/g,"_"); }
    var arquivos = await gerarArquivos();
    for (var i = 0; i < arquivos.length; i++) {
      var arq = arquivos[i];
      var buf = await arq.blob.arrayBuffer();
      if (arq.tipo === "oficio") {
        p1.file(arq.nome, buf);
        (arq.procs || []).forEach(function(np){ pProc.folder(safeNum(np)).file(arq.nome, buf); });
      }
      else if (arq.tipo === "certidao") {
        p2.file(arq.nome, buf);
        if (arq.proc) pProc.folder(safeNum(arq.proc)).file(arq.nome, buf);
      }
      else if (arq.tipo === "eml") p3.file(arq.nome, buf);
      else zip.file(arq.nome, buf);
    }
    pProc.file("LEIA-ME.txt", "Cada subpasta tem o numero de um procedimento e contem copias de TODOS os oficios que o citam (mais a certidao), para juntar nos respectivos autos. Os oficios para envio estao na pasta 1_oficios (um por destinatario).");
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
    onSave: function(s){ salvarSettings(s); setSettings({ key:s.key, model:s.model, usarIA:s.usarIA, promotor:s.promotor }); setShowSettings(false); }
  });

  // Tela banco destinatarios
  if (screen === "banco") {
    var filtrados = destDB.filter(function(d) { return d.comarca === comarca || d.comarca === "todos"; });
    return React.createElement("div", { style:{ fontFamily:"Arial", minHeight:"100vh", background:C.cinza } },
      React.createElement(Header, { screen, setScreen, comarca, mudarComarca, onSettings:function(){setShowSettings(true);} }),
      settingsModal,
      React.createElement("div", { style:{ maxWidth:820, margin:"0 auto", padding:"20px 14px" } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 } },
          React.createElement("h2", { style:{ margin:0, color:C.azul, fontSize:15 } }, "Banco de Destinatários - " + COMARCAS[comarca].label),
          React.createElement("div", { style:{ display:"flex", gap:6, flexWrap:"wrap" } },
            React.createElement("button", { style:btn("#4a90d9",{fontSize:12,padding:"7px 10px"}), onClick:importarListaPrado }, "Importar lista Prado"),
            React.createElement("button", { style:btn("#555",{fontSize:12,padding:"7px 10px"}), onClick:function(){ setModalImport(true); } }, "Importar CSV"),
            React.createElement("button", { style:btn(C.verde,{fontSize:12,padding:"7px 10px"}), onClick:function() { setModalDest({ dest:{ id:uid(), comarca:comarca, chave:"", nome:"", vocativo:"", nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" }, isNew:true }); } }, "+ Novo")
          )
        ),
        React.createElement("div", { style:{ fontSize:11, color:"#888", marginBottom:10 } }, "Mostrando os desta comarca + os marcados como \"Todas\". Itens de Prado/Alcobaça/Nova Viçosa são classificados automaticamente; órgãos estaduais/federais ficam em \"Todas\"."),
        modalImport && React.createElement(ModalImport, { onClose:function(){ setModalImport(false); }, onImport:async function(txt){ var rows=parseCSVDestinatarios(txt); if(rows.length===0){ alert("Nenhuma linha válida encontrada. Verifique o formato."); return; } var res=await importarDestinatarios(rows); setModalImport(false); alert("Importação concluída: " + res.add + " adicionados" + (res.dup?", " + res.dup + " já existiam.":".")); } }),
        filtrados.length === 0 && React.createElement("div", { style:Object.assign({}, C.card, { textAlign:"center", color:"#888", padding:32 }) }, "Nenhum destinatário cadastrado para " + COMARCAS[comarca].label + "."),
        filtrados.map(function(d) {
          return React.createElement("div", { key:d.id, style:Object.assign({}, C.card, { display:"flex", alignItems:"center", gap:10, padding:"12px 16px" }) },
            React.createElement("div", { style:{ flex:1 } },
              React.createElement("div", { style:{ fontSize:14, fontWeight:"bold", color:"#222" } }, d.nome),
              React.createElement("div", { style:{ fontSize:12, color: d.email ? C.verde : "#c66", marginTop:2 } }, d.email || "Email não cadastrado"),
              (d.endereco || d.cepCidade) && React.createElement("div", { style:{ fontSize:11, color:"#888" } }, [d.endereco, d.cepCidade].filter(Boolean).join(" - "))
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
          React.createElement("h2", { style:{ margin:0, color:C.azul, fontSize:16 } }, "Servidores Responsáveis"),
          React.createElement("button", { style:btn(C.verde), onClick:function(){ setModalServ({ srv:{ id:uid(), nome:"", matricula:"", cargo:"Assistente Técnico Administrativo", comarca:comarca }, isNew:true }); } }, "+ Novo")
        ),
        React.createElement("div", { style:C.card },
          servDB.length === 0 && React.createElement("div", { style:{ textAlign:"center", color:"#888", padding:24 } }, "Nenhum servidor cadastrado."),
          servDB.map(function(s) {
            return React.createElement("div", { key:s.id, style:{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid #f5f5f5" } },
              React.createElement("div", { style:{ flex:1 } },
                React.createElement("div", { style:{ fontSize:14, fontWeight:"bold" } }, s.nome),
                React.createElement("div", { style:{ fontSize:12, color:"#888" } }, (s.cargo || "Servidor(a)") + " - Mat. " + s.matricula + " - " + (COMARCAS[s.comarca] ? COMARCAS[s.comarca].label : s.comarca))
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

  var steps = ["config","fila","processando","resultado"];
  var stepLabels = ["Configurar","Arquivos","Processar","Resultado"];

  return React.createElement("div", { style:{ fontFamily:"Arial", minHeight:"100vh", background:C.cinza } },
    React.createElement(Header, { screen, setScreen, comarca, mudarComarca, steps, stepLabels, step, onSettings:function(){setShowSettings(true);} }),
    settingsModal,
    React.createElement("div", { style:{ maxWidth:820, margin:"0 auto", padding:"20px 14px" } },

      !cascaBytes && step === "config" && React.createElement("div", { style:{ background:"#fff3cd", border:"1px solid #ffe08a", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#7a5c00" } }, "Carregando o modelo timbrado oficial..."),
      settings.usarIA && !settings.key && step === "config" && React.createElement("div", { style:{ background:"#e8f0fe", border:"1px solid #b9d4ff", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.azul, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 } },
        React.createElement("span", null, "Extração por IA ativada, mas sem chave da API. Configure a chave ou use o preenchimento manual."),
        React.createElement("button", { style:btn(C.azul,{padding:"5px 10px",fontSize:11}), onClick:function(){setShowSettings(true);} }, "Configurar")
      ),

      // CONFIG
      step === "config" && React.createElement("div", { style:C.card },
        React.createElement("h2", { style:{ margin:"0 0 18px", color:C.azul, fontSize:16 } }, "Configurações da Expedição"),
        React.createElement("div", { style:{ marginBottom:16 } },
          React.createElement("label", { style:C.label }, "Comarca"),
          React.createElement("div", { style:{ display:"flex", gap:8 } },
            Object.keys(COMARCAS).map(function(k) {
              var v = COMARCAS[k];
              return React.createElement("button", { key:k, onClick:function(){mudarComarca(k);}, style:{ flex:1, padding:"9px 6px", borderRadius:8, border:"2px solid " + (comarca===k?C.azul:"#ddd"), background:comarca===k?C.azul:"white", color:comarca===k?"white":"#333", cursor:"pointer", fontSize:12, fontWeight:comarca===k?"bold":"normal" } }, v.label);
            })
          )
        ),
        React.createElement("div", { style:{ background:"#f8f9ff", borderRadius:8, padding:12, marginBottom:16, fontSize:13 } },
          React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
            React.createElement("span", null, "Servidor: ", React.createElement("strong", null, servAtual ? servAtual.nome + " (" + (servAtual.cargo||"Servidor(a)") + ")" : "Nenhum selecionado")),
            React.createElement("button", { style:btn(C.azul, { padding:"4px 10px", fontSize:11 }), onClick:function(){setScreen("servidores");} }, "Gerenciar")
          ),
          React.createElement("div", { style:{ marginTop:4 } }, "Promotor: ", React.createElement("strong", null, settings.promotor)),
          React.createElement("div", { style:{ marginTop:4 } }, "Promotoria: ", React.createElement("strong", null, COMARCAS[comarca].promotoria))
        ),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 } },
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Nº inicial do ofício *"), React.createElement("input", { style:C.input, value:cfg.numInicial, onChange:function(e){setCfg(function(p){return Object.assign({},p,{numInicial:e.target.value});});}, placeholder:"Ex: 95" })),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Ano"), React.createElement("input", { style:C.input, value:cfg.ano, onChange:function(e){setCfg(function(p){return Object.assign({},p,{ano:e.target.value});});} })),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Data (certidão)"), React.createElement("input", { style:C.input, value:cfg.data, onChange:function(e){setCfg(function(p){return Object.assign({},p,{data:e.target.value});});} }))
        ),
        React.createElement("div", { style:{ fontSize:11, color:"#888", marginTop:6 } }, "O ofício sai numerado como, ex.: 095." + cfg.ano + " e datado como \"data da assinatura eletrônica\"."),
        React.createElement("div", { style:{ marginTop:16 } },
          React.createElement("button", { style:btn(), onClick:function(){setStep("fila");} }, "Próximo: Adicionar Despachos / Procedimentos ->")
        )
      ),

      // FILA
      step === "fila" && React.createElement("div", null,
        erroProc && React.createElement("div", { style:{ background:"#fff8f8", border:"1px solid #fcc", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#a00" } }, "Erro: " + erroProc),
        React.createElement("div", {
          onDrop:function(e){e.preventDefault();adicionarArquivos(Array.from(e.dataTransfer.files));},
          onDragOver:function(e){e.preventDefault();},
          onClick:function(){fileRef.current&&fileRef.current.click();},
          style:{ border:"2px dashed #4a90d9", borderRadius:12, padding:28, textAlign:"center", cursor:"pointer", background:"white", marginBottom:14 }
        },
          React.createElement("div", { style:{ fontSize:30, marginBottom:8 } }, "[ PDF ]"),
          React.createElement("div", { style:{ fontSize:15, color:C.azul, fontWeight:"bold" } }, "Arraste os PDFs aqui"),
          React.createElement("div", { style:{ fontSize:12, color:"#777", marginTop:6, lineHeight:1.5 } }, "Pode incluir: despachos isolados, procedimento(s) inteiro(s), juntos ou separados.", React.createElement("br"), "A IA agrupa por número de procedimento e usa o último despacho (seguindo \"reitere-se / cumpra-se o anterior\")."),
          React.createElement("input", { ref:fileRef, type:"file", multiple:true, accept:".pdf,.txt", style:{ display:"none" }, onChange:function(e){adicionarArquivos(Array.from(e.target.files));} })
        ),
        fila.length > 0 && React.createElement("div", { style:C.card },
          React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 } },
            React.createElement("h3", { style:{ margin:0, color:C.azul, fontSize:14 } }, "Arquivos (" + fila.length + ")"),
            React.createElement("button", { style:btn("#c00",{padding:"4px 10px",fontSize:12}), onClick:function(){setFila([]);} }, "Limpar")
          ),
          !settings.usarIA && React.createElement("div", { style:{ fontSize:12, color:"#7a5c00", background:"#fffbeb", border:"1px solid #f5e090", borderRadius:6, padding:"8px 10px", marginBottom:10 } }, "Modo manual: clique em 'Dados' em cada arquivo para informar procedimento, tipo, assunto, teor e destinatários."),
          fila.map(function(d) {
            var temManual = d.manual && d.manual.numProc;
            return React.createElement("div", { key:d.id, style:{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f5f5f5" } },
              React.createElement("div", { style:{ flex:1 } },
                React.createElement("div", { style:{ fontSize:13, fontWeight:"bold" } }, d.nome),
                React.createElement("div", { style:{ fontSize:11, color: temManual ? C.verde : "#999" } }, temManual ? ("Manual: " + d.manual.numProc + " (" + (d.manual.tipo||"PA") + ")") : (settings.usarIA ? "Extração via IA" : "Aguardando preenchimento manual"))
              ),
              React.createElement("button", { style:btn(C.azul,{padding:"4px 10px",fontSize:11}), onClick:function(){ setModalManual({ item:d }); } }, temManual ? "Editar dados" : "Dados (manual)"),
              React.createElement("button", { style:{ background:"none", border:"none", color:"#c00", cursor:"pointer", fontSize:15 }, onClick:function(){setFila(function(p){return p.filter(function(x){return x.id!==d.id;});});} }, "X")
            );
          })
        ),
        React.createElement("div", { style:{ display:"flex", gap:10 } },
          React.createElement("button", { style:btnOut(), onClick:function(){setStep("config");} }, "<- Configurações"),
          fila.length > 0 && React.createElement("button", { style:Object.assign({},btn(),{flex:1,fontSize:14,padding:"12px 20px"}), onClick:processarFila }, "Processar e gerar ofícios")
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
      step === "processando" && React.createElement(TelaProcessando, { msg:progresso.msg, onCancel:cancelarProcessamento }),

      // RESOLUCAO
      step === "resolucao" && React.createElement(TelaResolucao, {
        pendentes:pendentes,
        onConfirmar:function(extras) {
          // salva no banco os marcados
          var novosParaSalvar = extras.filter(function(r){ return r.salvar && r.nome; });
          if (novosParaSalvar.length > 0) {
            var vistos = {};
            var unicos = novosParaSalvar.filter(function(r){ var k=normChave(r.nome); if(vistos[k]) return false; vistos[k]=1; return true; });
            var novaLista = destDB.concat(unicos.map(function(r){ return { id:uid(), comarca:comarca, chave:r.chave||normChave(r.nome).slice(0,24), nome:r.nome, vocativo:r.vocativo||"", nomeAutoridade:r.nomeAutoridade||"", endereco:r.endereco||"", cepCidade:r.cepCidade||"", email:r.email||"", tipo:"institucional" }; }));
            salvarDest(novaLista);
          }
          // cada pendente vira uma diligencia resolvida (mantendo seu proprio teor/prazo/tipo de certidao)
          var novasDilig = extras.filter(function(r){ return r.nome; }).map(function(r){
            return { numProc:r.numProc, tipo:r.tipo, tipoCertidao:r.tipoCertidao||"encaminhamento", assunto:r.assunto||"", teor:r.teor||"", prazo:r.prazo||"15 (quinze) dias", dest:{ nome:r.nome, vocativo:r.vocativo||"", nomeAutoridade:r.nomeAutoridade||"", endereco:r.endereco||"", cepCidade:r.cepCidade||"", email:r.email||"", chave:r.chave||normChave(r.nome).slice(0,24) } };
          });
          var todas = procs.concat(novasDilig);
          setProcs(todas);
          finalizar(todas);
        },
        onPular:function(){ finalizar(procs); }
      }),

      // RESULTADO
      step === "resultado" && resultado && React.createElement("div", null,
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 } },
          [["Ofícios", resultado.grupos.length],["Certidões", resultado.certs.length],["Diligências", procs.length]].map(function(item) {
            return React.createElement("div", { key:item[0], style:Object.assign({},C.card,{padding:16,textAlign:"center",marginBottom:0}) },
              React.createElement("div", { style:{ fontSize:28, fontWeight:"bold", color:C.azul } }, item[1]),
              React.createElement("div", { style:{ fontSize:12, color:"#888" } }, item[0])
            );
          })
        ),
        React.createElement("div", { style:C.card },
          React.createElement("h3", { style:{ margin:"0 0 12px", color:C.azul, fontSize:14 } }, "Ofícios (com juntada por destinatário)"),
          resultado.grupos.map(function(g, i) {
            return React.createElement("div", { key:i, style:{ border:"1px solid #e8f0fe", borderRadius:8, padding:12, marginBottom:10 } },
              React.createElement("div", { style:{ fontWeight:"bold", color:C.azul, fontSize:14 } }, "Ofício nº " + g.numOficio + " - " + g.dest.nome),
              React.createElement("div", { style:{ fontSize:12, marginTop:3, color: g.dest.email ? C.verde : "#c66" } }, g.dest.email ? "Email: " + g.dest.email : "Email não cadastrado - preencher antes de enviar"),
              g.assunto && React.createElement("div", { style:{ fontSize:12, marginTop:3, color:"#555" } }, "Assunto: " + g.assunto),
              React.createElement("div", { style:{ marginTop:8, paddingTop:8, borderTop:"1px solid #f5f5f5" } },
                g.itens.map(function(item, j) {
                  return React.createElement("div", { key:j, style:{ fontSize:11, color:"#555", padding:"2px 0" } }, "[+] " + item.numProc + " (" + item.tipo + ") - " + (item.teor||"").slice(0,90) + ((item.teor||"").length>90?"...":""));
                })
              )
            );
          })
        ),
        React.createElement("div", { style:C.card },
          React.createElement("h3", { style:{ margin:"0 0 10px", color:C.azul, fontSize:14 } }, "Certidões de Cumprimento de Despacho"),
          React.createElement("div", { style:{ fontSize:12, color:"#666", marginBottom:10 } }, "Juntar aos autos após a expedição. Confira o TIPO de certidão de cada procedimento (a IA sugere, mas você pode trocar). Os números de ID MP saem em branco (______) para você preencher no sistema."),
          resultado.certs.map(function(cert, i) {
            return React.createElement("div", { key:i, style:{ border:"1px solid #dff0d8", borderRadius:8, padding:12, marginBottom:8, background:"#fafff5" } },
              React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" } },
                React.createElement("div", { style:{ fontWeight:"bold", color:"#2d5a1b", fontSize:13 } }, cert.numProc + " (" + cert.tipo + ")"),
                React.createElement("select", { value:cert.tipoCertidao || "encaminhamento", style:Object.assign({},C.input,{width:"auto",fontSize:12,padding:"4px 8px"}), onChange:function(e){ var v=e.target.value; setResultado(function(prev){ var certs=prev.certs.map(function(c,idx){ return idx===i?Object.assign({},c,{tipoCertidao:v}):c; }); return Object.assign({},prev,{certs:certs}); }); } },
                  React.createElement("option", { value:"encaminhamento" }, "Encaminhamento"),
                  React.createElement("option", { value:"reiteracao" }, "Reiteração"),
                  React.createElement("option", { value:"prazo_vencido" }, "Encaminhamento - Prazo Vencido")
                )
              ),
              cert.exps.map(function(exp, j) { return React.createElement("div", { key:j, style:{ fontSize:11, color:"#444", marginTop:2 } }, (j+1) + ". " + exp.nome + " — Ofício nº " + exp.numOficio); })
            );
          })
        ),
        React.createElement("div", { style:Object.assign({},C.card,{background:"white",border:"1px solid #ddd"}) },
          React.createElement("h3", { style:{ margin:"0 0 14px", color:C.azul, fontSize:14 } }, "Baixar os arquivos gerados"),
          React.createElement("div", { style:{ border:"2px solid #4a90d9", borderRadius:10, padding:16, textAlign:"center" } },
            React.createElement("div", { style:{ fontSize:28, marginBottom:8 } }, "[ZIP]"),
            React.createElement("div", { style:{ fontWeight:"bold", color:C.azul, fontSize:14, marginBottom:6 } }, "Baixar pacote ZIP"),
            React.createElement("div", { style:{ fontSize:12, color:"#666", marginBottom:12 } }, "Ofícios (.docx timbrado), certidões, e-mails (.eml) e checklist."),
            React.createElement("button", { style:Object.assign({},btn("#4a90d9"),{minWidth:200}), onClick:baixarZip }, "Baixar ZIP")
          ),
          progresso.msg && React.createElement("div", { style:{ marginTop:12, background:"#e8f0fe", borderRadius:8, padding:10, textAlign:"center", fontSize:13, color:C.azul } }, progresso.msg + (progresso.total>0?" ("+progresso.atual+"/"+progresso.total+")":""))
        ),
        React.createElement("button", { style:btnOut(), onClick:function(){ setStep("fila"); setResultado(null); setProcs([]); } }, "<- Nova expedição")
      )
    )
  );
}

function Header(props) {
  var screen = props.screen; var setScreen = props.setScreen;
  var steps = props.steps; var stepLabels = props.stepLabels; var step = props.step; var onSettings = props.onSettings;
  return React.createElement("div", { style:{ background:"linear-gradient(135deg,#0a2440 0%,#1a3a5c 100%)", color:"white", padding:"16px 20px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" } },
    React.createElement("div", null,
      React.createElement("div", { style:{ fontWeight:"bold", fontSize:16 } }, "MPBA - Expedição Consolidada de Ofícios"),
      React.createElement("div", { style:{ fontSize:11, opacity:.7 } }, "Promotorias de Justiça")
    ),
    React.createElement("div", { style:{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" } },
      screen === "main" && steps && steps.map(function(s, i) {
        return React.createElement("div", { key:s, style:{ padding:"3px 10px", borderRadius:20, fontSize:11, background:step===s?"rgba(255,255,255,.25)":"rgba(255,255,255,.08)", color:step===s?"white":"rgba(255,255,255,.4)", fontWeight:step===s?"bold":"normal" } }, stepLabels[i]);
      }),
      React.createElement("button", { onClick:function(){setScreen(screen==="banco"?"main":"banco");}, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Destinatários"),
      React.createElement("button", { onClick:function(){setScreen(screen==="servidores"?"main":"servidores");}, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Servidores"),
      onSettings && React.createElement("button", { onClick:onSettings, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Config")
    )
  );
}

function ModalSettings(props) {
  var [form, setForm] = useState({ key: props.settings.key || "", model: props.settings.model || "claude-sonnet-4-6", usarIA: props.settings.usarIA !== false, promotor: props.settings.promotor || "Rui César Farias dos Santos Júnior" });
  function f(k, v) { setForm(function(p){ return Object.assign({},p,{[k]:v}); }); }
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 6px", color:C.azul } }, "Configurações"),
    React.createElement("p", { style:{ margin:"0 0 16px", fontSize:12, color:"#777" } }, "A chave da API é usada apenas neste navegador e enviada direto para a Anthropic."),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Nome do Promotor de Justiça"), React.createElement("input", { style:C.input, value:form.promotor, onChange:function(e){f("promotor",e.target.value);}, placeholder:"Ex: Rui César Farias dos Santos Júnior" })),
      React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8 } },
        React.createElement("input", { type:"checkbox", id:"usarIA", checked:form.usarIA, onChange:function(e){f("usarIA",e.target.checked);} }),
        React.createElement("label", { htmlFor:"usarIA", style:{ fontSize:13, color:"#333", cursor:"pointer", fontWeight:"bold" } }, "Usar extração automática por IA (Claude)")
      ),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Chave da API Anthropic (sk-ant-...)"), React.createElement("input", { style:C.input, type:"password", value:form.key, onChange:function(e){f("key",e.target.value);}, placeholder:"sk-ant-...", autoComplete:"off" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Modelo"), React.createElement("select", { style:C.input, value:form.model, onChange:function(e){f("model",e.target.value);} },
        React.createElement("option", { value:"claude-sonnet-4-6" }, "claude-sonnet-4-6 (recomendado)"),
        React.createElement("option", { value:"claude-opus-4-8" }, "claude-opus-4-8 (mais preciso)"),
        React.createElement("option", { value:"claude-haiku-4-5-20251001" }, "claude-haiku-4-5 (mais rápido)")
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
  var [assunto, setAssunto] = useState(m.assunto || "");
  var [teor, setTeor] = useState(m.teor || "");
  var [prazo, setPrazo] = useState(m.prazo || "15 (quinze) dias");
  var [tipoCertidao, setTipoCertidao] = useState(m.tipoCertidao || "encaminhamento");
  var [sel, setSel] = useState((m.destinatarios || []).filter(function(t){ return typeof t === "string" && lista.some(function(d){ return d.chave===t; }); }));
  var [livre, setLivre] = useState((m.destinatarios || []).filter(function(t){ return typeof t === "string" && !lista.some(function(d){ return d.chave===t; }); }).join(", "));

  function toggle(chave) {
    setSel(function(prev){ return prev.indexOf(chave)!==-1 ? prev.filter(function(x){return x!==chave;}) : prev.concat([chave]); });
  }
  function salvar() {
    if (!numProc.trim()) { alert("Informe o número do procedimento."); return; }
    var livres = livre.split(",").map(function(s){return s.trim();}).filter(Boolean);
    var dests = sel.concat(livres);
    if (dests.length === 0) dests = ["Destinatário a identificar"];
    props.onSave({ numProc:numProc.trim(), tipo:tipo, tipoCertidao:tipoCertidao, assunto:assunto.trim(), teor:teor.trim(), prazo:prazo.trim() || "15 (quinze) dias", destinatarios:dests });
  }
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 4px", color:C.azul } }, "Dados do procedimento"),
    React.createElement("p", { style:{ margin:"0 0 14px", fontSize:12, color:"#777" } }, item.nome),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 } },
        React.createElement("div", null, React.createElement("label", { style:C.label }, "Número do procedimento *"), React.createElement("input", { style:C.input, value:numProc, onChange:function(e){setNumProc(e.target.value);}, placeholder:"Ex: 201.9.551584/2025" })),
        React.createElement("div", null, React.createElement("label", { style:C.label }, "Tipo"), React.createElement("select", { style:C.input, value:tipo, onChange:function(e){setTipo(e.target.value);} }, TIPOS_PROC.map(function(t){ return React.createElement("option", { key:t, value:t }, t); })))
      ),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Assunto (sintético)"), React.createElement("input", { style:C.input, value:assunto, onChange:function(e){setAssunto(e.target.value);}, placeholder:"Ex: Solicita informações." })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Teor (completa \"solicitar ___\")"), React.createElement("textarea", { style:Object.assign({},C.input,{minHeight:64,resize:"vertical"}), value:teor, onChange:function(e){setTeor(e.target.value);}, placeholder:"Ex: informações sobre eventual registro de ocorrência relacionado aos fatos" })),
      React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 } },
        React.createElement("div", null, React.createElement("label", { style:C.label }, "Prazo de resposta"), React.createElement("input", { style:C.input, value:prazo, onChange:function(e){setPrazo(e.target.value);}, placeholder:"Ex: 15 (quinze) dias" })),
        React.createElement("div", null, React.createElement("label", { style:C.label }, "Tipo de certidão"), React.createElement("select", { style:C.input, value:tipoCertidao, onChange:function(e){setTipoCertidao(e.target.value);} },
          React.createElement("option", { value:"encaminhamento" }, "Encaminhamento"),
          React.createElement("option", { value:"reiteracao" }, "Reiteração"),
          React.createElement("option", { value:"prazo_vencido" }, "Encam. - Prazo Vencido")
        ))
      ),
      React.createElement("div", null,
        React.createElement("label", { style:C.label }, "Destinatários (banco da comarca)"),
        lista.length === 0 && React.createElement("div", { style:{ fontSize:12, color:"#999" } }, "Nenhum destinatário no banco desta comarca."),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, maxHeight:160, overflowY:"auto" } },
          lista.map(function(d){
            return React.createElement("label", { key:d.id, style:{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#333", cursor:"pointer", padding:"2px 0" } },
              React.createElement("input", { type:"checkbox", checked:sel.indexOf(d.chave)!==-1, onChange:function(){toggle(d.chave);} }),
              d.nome
            );
          })
        )
      ),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Outros destinatários (separados por vírgula)"), React.createElement("input", { style:C.input, value:livre, onChange:function(e){setLivre(e.target.value);}, placeholder:"Ex: conselho tutelar" }))
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
    React.createElement("h3", { style:{ margin:"0 0 18px", color:"#0a2440" } }, isNew ? "Novo Destinatário" : "Editar Destinatário"),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Órgão / Nome *"), React.createElement("input", { style:C.input, value:form.nome, onChange:function(e){f("nome",e.target.value);}, placeholder:"Ex: Delegacia de Polícia de Nova Viçosa" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Palavra-chave *"), React.createElement("input", { style:C.input, value:form.chave, onChange:function(e){f("chave",e.target.value);}, placeholder:"Como aparece no despacho (ex: policia civil)" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Vocativo (tratamento)"), React.createElement("input", { style:C.input, value:form.vocativo||"", onChange:function(e){f("vocativo",e.target.value);}, placeholder:"Ex: A Sua Excelência o Senhor" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Nome da autoridade (opcional)"), React.createElement("input", { style:C.input, value:form.nomeAutoridade||"", onChange:function(e){f("nomeAutoridade",e.target.value);}, placeholder:"Ex: MARCOS RENATO DE LIMA LUDOVICO" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Endereço"), React.createElement("input", { style:C.input, value:form.endereco||"", onChange:function(e){f("endereco",e.target.value);}, placeholder:"Ex: Av. dos Cajueiros, 1, Centro" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "CEP / Cidade"), React.createElement("input", { style:C.input, value:form.cepCidade||"", onChange:function(e){f("cepCidade",e.target.value);}, placeholder:"Ex: 45920-000 Nova Viçosa - BA" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Email"), React.createElement("input", { style:C.input, value:form.email||"", onChange:function(e){f("email",e.target.value);}, placeholder:"email@dominio.gov.br" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Comarca"), React.createElement("select", { value:form.comarca||comarca, onChange:function(e){f("comarca",e.target.value);}, style:C.input }, React.createElement("option", { value:"prado" }, "Prado/BA"), React.createElement("option", { value:"nova_vicosa" }, "Nova Viçosa/BA"), React.createElement("option", { value:"alcobaca" }, "Alcobaça/BA"), React.createElement("option", { value:"todos" }, "Todas")))
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:18 } },
      React.createElement("button", { style:btnOut({flex:1}), onClick:onClose }, "Cancelar"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ if(!form.nome||!form.chave){alert("Preencha Órgão/Nome e Palavra-chave.");return;} onSave(form); } }, "Salvar")
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
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Nome completo *"), React.createElement("input", { style:C.input, value:form.nome, onChange:function(e){f("nome",e.target.value);}, placeholder:"Ex: Manjari Autran Almeida de Oliveira" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Cargo *"), React.createElement("input", { style:C.input, value:form.cargo||"", onChange:function(e){f("cargo",e.target.value);}, placeholder:"Ex: Assistente Técnico Administrativo" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Matrícula"), React.createElement("input", { style:C.input, value:form.matricula, onChange:function(e){f("matricula",e.target.value);}, placeholder:"Ex: 355.757" })),
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Comarca principal"), React.createElement("select", { value:form.comarca, onChange:function(e){f("comarca",e.target.value);}, style:C.input }, React.createElement("option", { value:"prado" }, "Prado/BA"), React.createElement("option", { value:"nova_vicosa" }, "Nova Viçosa/BA"), React.createElement("option", { value:"alcobaca" }, "Alcobaça/BA")))
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:18 } },
      React.createElement("button", { style:btnOut({flex:1}), onClick:onClose }, "Cancelar"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ if(!form.nome||!form.cargo){alert("Preencha nome e cargo.");return;} onSave(form); } }, "Salvar")
    )
  );
}

function TelaProcessando(props) {
  var [seg, setSeg] = useState(0);
  useEffect(function() {
    var t = setInterval(function(){ setSeg(function(s){ return s + 1; }); }, 1000);
    return function(){ clearInterval(t); };
  }, []);
  var min = Math.floor(seg/60), s = seg % 60;
  var tempo = (min ? min + "m " : "") + s + "s";
  return React.createElement("div", { style:Object.assign({},C.card,{textAlign:"center",padding:40}) },
    React.createElement("div", { style:{ fontSize:40, marginBottom:14 } }, "[ ... ]"),
    React.createElement("h2", { style:{ color:C.azul, marginBottom:8 } }, "Processando..."),
    React.createElement("div", { style:{ color:"#666", marginBottom:6, fontSize:14 } }, props.msg || "Trabalhando..."),
    React.createElement("div", { style:{ color:"#999", fontSize:13, marginBottom:18 } }, "Tempo: " + tempo + (seg > 20 ? " — análises de procedimentos grandes podem levar 1 a 2 minutos." : "")),
    seg > 150 && React.createElement("div", { style:{ background:"#fffbeb", border:"1px solid #f5e090", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:12, color:"#7a5c00" } }, "Está demorando bastante. Se não concluir, cancele e tente com menos PDFs por vez (ex.: um procedimento por vez)."),
    React.createElement("button", { style:btnOut(), onClick:props.onCancel }, "Cancelar")
  );
}

function ModalImport(props) {
  var [txt, setTxt] = useState("");
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 6px", color:C.azul } }, "Importar destinatários (CSV)"),
    React.createElement("p", { style:{ margin:"0 0 12px", fontSize:12, color:"#777" } }, "Cole as linhas no formato: Nome/Cargo; Instituição/Órgão; Endereço; E-mail. Aceita separador ; ou , e cabeçalho opcional. Duplicados (mesmo órgão) são ignorados."),
    React.createElement("textarea", { style:Object.assign({},C.input,{minHeight:180,resize:"vertical",fontFamily:"monospace",fontSize:12}), value:txt, onChange:function(e){setTxt(e.target.value);}, placeholder:'"Coordenação";"CRAS de Prado";"";"cras@exemplo.com"' }),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:16 } },
      React.createElement("button", { style:btnOut({flex:1}), onClick:props.onClose }, "Cancelar"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ props.onImport(txt); } }, "Importar")
    )
  );
}

function TelaResolucao(props) {
  var pendentes = props.pendentes; var onConfirmar = props.onConfirmar; var onPular = props.onPular;
  var [itens, setItens] = useState(pendentes.map(function(p){
    var ia = p.ia || {};
    return Object.assign({}, p, { salvar:true, form:{ nome: ia.orgao || p.textoOriginal || "", vocativo: ia.vocativo || "", nomeAutoridade: ia.nomeAutoridade || "", endereco: ia.endereco || "", cepCidade: ia.cepCidade || "", email: ia.email || "", chave: normChave(ia.orgao || p.textoOriginal || "").slice(0,24) } });
  }));
  function atualizar(id, upd) { setItens(function(prev){ return prev.map(function(x){ return x.id===id?Object.assign({},x,upd):x; }); }); }
  return React.createElement("div", null,
    React.createElement("div", { style:{ background:"#fffbeb", border:"1px solid #f5e090", borderRadius:12, padding:16, marginBottom:14 } },
      React.createElement("h3", { style:{ margin:"0 0 6px", color:"#7a5c00", fontSize:14 } }, "Identificação manual — " + pendentes.length + " destinatário(s)/usuário(s) não localizado(s) no banco"),
      React.createElement("p", { style:{ margin:0, fontSize:12, color:"#665500" } }, "Para cada item abaixo está indicado QUEM é (texto do despacho) e em QUAL procedimento. Confira/complete os dados — a IA já preencheu o que conseguiu. Pessoas físicas (vítima, denunciante, investigado etc.) também aparecem aqui para você cadastrar.")
    ),
    itens.map(function(item, idx) {
      return React.createElement("div", { key:item.id, style:Object.assign({},C.card) },
        React.createElement("div", { style:{ display:"inline-block", background:"#e8f0fe", color:C.azul, padding:"2px 8px", borderRadius:6, fontSize:11, fontWeight:"bold", marginBottom:6 } }, "Procedimento: " + (item.numProc||"?")),
        React.createElement("div", { style:{ fontWeight:"bold", color:"#0a2440", fontSize:14, marginBottom:4 } }, "Quem: \"" + item.textoOriginal + "\""),
        item.teor && React.createElement("div", { style:{ fontSize:11, color:"#888", marginBottom:10 } }, "Diligência: " + item.teor.slice(0,160) + (item.teor.length>160?"...":"")),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 } },
          [["Órgão / Nome *","nome","Delegacia de Polícia de ..."],["Vocativo","vocativo","A Sua Excelência o Senhor"],["Nome da autoridade","nomeAutoridade",""],["Email","email","email@dominio.com"],["Endereço","endereco","Av. ..., nº, bairro"],["CEP / Cidade","cepCidade","00000-000 Cidade - BA"],["Palavra-chave","chave","como aparece no despacho"]].map(function(field) {
            return React.createElement("div", { key:field[1], style: field[1]==="nome"?{gridColumn:"1/-1"}:null },
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
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){ onConfirmar(itens.map(function(x){ return Object.assign({},x.form,{salvar:x.salvar,numProc:x.numProc,tipo:x.tipo,tipoCertidao:x.tipoCertidao,assunto:x.assunto,teor:x.teor,prazo:x.prazo}); })); } }, "Confirmar e gerar ofícios")
    )
  );
}
