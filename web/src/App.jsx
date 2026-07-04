import React, { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { cloudAtivo, cloudLerBanco, cloudEscreverBanco, cloudObservar } from "./cloud.js";

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

// Mescla o banco mestre (publicado) no banco local: entradas do mestre prevalecem
// para os mesmos nomes (atualiza e-mail/endereco), mantendo as entradas locais proprias.
function mesclarMaster(local, masterList) {
  var byNome = {};
  (local || []).forEach(function(d){ d = migrarDest(d); byNome[normChave(d.nome)] = d; });
  (masterList || []).forEach(function(m){
    m = migrarDest(m);
    var k = normChave(m.nome);
    var existente = byNome[k];
    byNome[k] = Object.assign({}, m, { id: (existente && existente.id) ? existente.id : (m.id || uid()) });
  });
  return Object.keys(byNome).map(function(k){ return byNome[k]; });
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
  var ehPromotor = o.assinante === "promotor";   // promotor assina (não "de ordem")
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

  var introPrefix = ehPromotor
    ? "Cumprimentando-o cordialmente, no uso de minhas atribuições legais, na qualidade de Promotor de Justiça de " + promotoriaCidade + ", sirvo-me do presente para solicitar "
    : "Cumprimentando-o cordialmente e de ordem do Excelentíssimo Senhor Doutor " + promotor + ", Promotor de Justiça de " + promotoriaCidade + ", sirvo-me do presente para solicitar ";
  if (itens.length === 1) {
    x += xmlPar(introPrefix + itens[0].teor + ", no prazo de " + (itens[0].prazo || "15 (quinze) dias") + ".", { size:22, firstLine:708 });
  } else {
    x += xmlPar(introPrefix + "o atendimento das diligências abaixo relacionadas, observado, para cada uma, o respectivo prazo de resposta:", { size:22, firstLine:708 });
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
  if (ehPromotor) {
    x += xmlPar(promotor, { size:22, align:"center" });
    x += xmlPar("Promotor de Justiça de " + promotoriaCidade, { size:22, align:"center" });
  } else {
    x += xmlPar(servNome, { size:22, align:"center" });
    x += xmlPar(servCargo, { size:22, align:"center" });
  }
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
  // X-Unsent: 1 faz o Outlook abrir o .eml como RASCUNHO editavel (compor/anexar/enviar),
  // e nao como mensagem recebida (somente leitura). Formato simples de 1 parte (text/html).
  var eml = "X-Unsent: 1\r\n"
    + "MIME-Version: 1.0\r\n"
    + (d.email ? "To: " + d.email + "\r\n" : "")
    + "Subject: " + assunto + "\r\n"
    + "Content-Type: text/html; charset=utf-8\r\n"
    + "Content-Transfer-Encoding: 8bit\r\n"
    + "\r\n"
    + corpo + "\r\n";
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
  // 45% do INÍCIO (capa/autuação/qualificação das partes — onde estão os nomes)
  // e 55% do FIM (despachos mais recentes).
  var ini = Math.floor(lim * 0.45);
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
"1) Localize o ÚLTIMO despacho (o mais recente do Promotor) e trate SOMENTE dele.\n" +
"   REITERAÇÃO / DESPACHO ANTERIOR (muito importante): se o último despacho apenas manda REITERAR ou CUMPRIR/RENOVAR despacho anterior (ex.: \"reitere-se\", \"reitere-se os ofícios\", \"cumpra-se o despacho anterior\", \"cumpra-se o despacho de fls. X / ID MP Y\", \"renove-se\", \"diante da ausência de resposta, reiterem-se\"), então LOCALIZE nos autos esse despacho anterior referenciado e extraia OS MESMOS destinatários e comandos que ELE determinou (é para as MESMAS pessoas/órgãos, reenviando). NÃO devolva vazio nem \"a identificar\" nesses casos: vá buscar o despacho anterior. Marque tipoCertidao = \"reiteracao\".\n" +
"2) Identifique CADA DILIGÊNCIA EXPRESSAMENTE determinada. Uma diligência = UM destinatário + o que se determinou SOLICITAR/REQUISITAR/OFICIAR/NOTIFICAR/INTIMAR ÀQUELE destinatário.\n" +
"   Crie diligência SOMENTE para quem o despacho EXPRESSAMENTE mandou oficiar/notificar/requisitar. NÃO crie diligência para partes apenas citadas/qualificadas sem determinação de ofício. Se o último despacho NÃO determinar expedição de ofício (ex.: apenas arquivamento, ciência, juntada, conclusão), devolva \"diligencias\": [] para esse procedimento.\n\n" +
"REGRA CRÍTICA DE ATRIBUIÇÃO (leia com atenção):\n" +
"- O teor de cada diligência deve corresponder EXATAMENTE ao que o despacho mandou pedir ÀQUELE destinatário. NUNCA repita o mesmo teor para destinatários diferentes e NUNCA misture o comando de um destinatário no de outro.\n" +
"- Use a natureza do pedido para conferir o destinatário correto. Exemplos de pistas: boletim de ocorrência (BO), inquérito policial, situação processual de investigado, registro de ocorrência => DELEGACIA DE POLÍCIA. Relatório psicossocial/acompanhamento de família, medidas de proteção a criança/adolescente => CONSELHO TUTELAR. Acompanhamento socioassistencial, CRAS/CREAS, visita domiciliar social, idoso/vulnerável => CREAS ou CRAS. Atendimento/prontuário médico => SECRETARIA DE SAÚDE/HOSPITAL.\n" +
"- Se o despacho determinar VÁRIAS coisas ao MESMO destinatário, junte tudo em um único teor para aquele destinatário.\n\n" +
"IDENTIFICAÇÃO DO NOME REAL (muito importante): para CADA diligência, descubra QUEM é o destinatário pelo NOME, procurando em TODO o material fornecido — não só no despacho, mas também na CAPA/AUTUAÇÃO, na QUALIFICAÇÃO das partes, na petição/representação inicial, no boletim de ocorrência e em peças anteriores.\n" +
"- Quando o despacho usar um papel genérico (ex.: \"oficie-se/notifique-se o(a) NOTICIANTE / DENUNCIANTE / VÍTIMA / REPRESENTANTE / COMUNICANTE / REQUERENTE / INVESTIGADO / AVERIGUADO / NOTICIADO\"), LOCALIZE o nome próprio dessa pessoa na qualificação dos autos e use-o em orgao e em nomeAutoridade, com endereco, cepCidade, email e (se útil) o vínculo entre parênteses, ex.: \"João da Silva (noticiante)\".\n" +
"- Quando mandar oficiar um ÓRGÃO, use o nome completo do órgão.\n" +
"- CASAMENTO COM O BANCO (essencial para não pedir identificação manual à toa): ao final há a lista \"DESTINATÁRIOS JÁ CADASTRADOS\", TODOS da localidade do procedimento (o município está indicado no cabeçalho da lista). Se a diligência corresponder a um deles — AINDA QUE o despacho use outro nome, sigla ou abreviação (ex.: \"DT de Prado\" = \"Delegacia Territorial de Prado\"; \"CT\" = \"Conselho Tutelar\") — copie em \"bancoNome\" EXATAMENTE o nome tal como está na lista.\n" +
"- ÓRGÃO GENÉRICO POR CONTEXTO: com frequência o despacho cita o órgão SEM o município (ex.: só \"Delegacia de Polícia\", \"Conselho Tutelar\", \"CREAS\", \"Secretaria de Saúde\", \"Prefeitura\"). Como os fatos/jurisdição do procedimento são da localidade da lista, associe o órgão genérico ao correspondente DAQUELA localidade (ex.: num feito de Prado, \"Delegacia de Polícia\" = \"Delegacia de Polícia Civil de Prado\"; \"Conselho Tutelar\" = \"Conselho Tutelar de Prado\").\n" +
"- PROIBIÇÃO ABSOLUTA DE ERRO/ALUCINAÇÃO: só preencha bancoNome quando tiver CERTEZA de que é o MESMO órgão (mesma natureza e localidade coerente). NUNCA associe a órgão de natureza diferente (ex.: Delegacia/Polícia Civil ≠ Polícia Militar; CREAS ≠ CRAS; Secretaria de Saúde ≠ Secretaria de Educação; Conselho Tutelar ≠ Conselho de Direitos). Se houver QUALQUER dúvida, ambiguidade (mais de um possível) ou indício de município diferente do da lista, deixe bancoNome VAZIO — é MELHOR ir para conferência manual do que errar o destinatário. Nunca invente. Nunca chute.\n" +
"- Deixe \"bancoNome\" vazio quando não houver correspondente seguro (pessoa física, órgão novo, ou dúvida).\n" +
"- Use \"Destinatário a identificar\" APENAS como ÚLTIMO recurso, quando, mesmo após procurar em todo o material, realmente não houver como saber o nome. Nesse caso, no teor, ESCREVA o papel e onde procurar (ex.: \"notificar o denunciante — qualificação não localizada nos autos enviados\"), para o servidor saber quem buscar.\n" +
"- NÃO invente nome, endereço, CPF, e-mail ou telefone: só informe o que constar nos autos.\n\n" +
"Para cada diligência forneça:\n" +
"- orgao (instituição destinatária), vocativo (ex.: \"A Sua Excelência o Senhor\", \"A Sua Senhoria o Senhor\", \"Ao Ilustre Conselho Tutelar\", \"Ao Coordenador do CREAS\"), nomeAutoridade (nome da pessoa, se houver), endereco, cepCidade, email (o que estiver disponível; vazio se não houver);\n" +
"- assunto: sintético, poucas palavras (ex.: \"Solicita informações.\", \"Requisita documentos.\");\n" +
"- teor: frase objetiva que completa \"sirvo-me do presente para solicitar ___\" (ex.: \"informações sobre o andamento do BO nº 220187/2026 e a situação processual do investigado\"). NÃO inclua o prazo no teor.\n" +
"- prazo: o prazo de resposta determinado no despacho PARA AQUELE destinatário, por extenso no formato número + (extenso) + dias (ex.: \"15 (quinze) dias\", \"10 (dez) dias\", \"5 (cinco) dias úteis\"). Se o despacho não indicar prazo, use \"15 (quinze) dias\".\n\n" +
"tipo do procedimento: PA, IP, NF, IC, PP ou TCO.\n" +
"tipoCertidao do procedimento (qual certidão de cumprimento será lavrada): \"encaminhamento\" (expedição/encaminhamento normal dos ofícios) | \"reiteracao\" (o despacho determina REITERAR ofícios — \"reitere-se\", \"renove-se\", ou reiteração por ausência de resposta) | \"prazo_vencido\" (o procedimento está com prazo de conclusão vencido / determina-se providência por prazo vencido). Em dúvida, use \"encaminhamento\".\n\n" +
"Responda SOMENTE com um array JSON, sem markdown e sem explicações, no formato:\n" +
"[{\"numProc\":\"...\",\"tipo\":\"NF\",\"tipoCertidao\":\"encaminhamento\",\"diligencias\":[{\"bancoNome\":\"\",\"orgao\":\"...\",\"vocativo\":\"...\",\"nomeAutoridade\":\"\",\"endereco\":\"\",\"cepCidade\":\"\",\"email\":\"\",\"assunto\":\"...\",\"teor\":\"...\",\"prazo\":\"15 (quinze) dias\"}]}]\n" +
"Se o procedimento não tiver diligência a expedir, use \"diligencias\": []. NÃO invente destinatário.";

// Monta o bloco com a lista de destinatarios do banco (para a IA casar).
function montarBancoBlock(listaBanco, municipio) {
  if (!listaBanco || !listaBanco.length) return "";
  var linhas = listaBanco.map(function(d){ return "- " + d.nome; }).join("\n");
  var cab = municipio ? ("Localidade/município de referência destes destinatários: " + municipio + "/BA. ") : "";
  return "\n\n===== DESTINATÁRIOS JÁ CADASTRADOS =====\n" + cab + "Use em \"bancoNome\" o nome EXATO desta lista quando a diligência corresponder a um deles (inclusive quando o despacho citar o órgão de forma genérica, sem o município). Na dúvida, deixe \"bancoNome\" vazio.\n" + linhas;
}

// Tokens significativos (palavras > 3 letras, sem termos genericos) para casamento fuzzy.
var STOP_TOKENS = { "de":1,"da":1,"do":1,"dos":1,"das":1,"municipal":1,"estado":1,"bahia":1,"prado":1,"nova":1,"vicosa":1,"alcobaca":1,"comarca":1,"justica":1 };
function tokensSig(s) {
  return normChave(s).split(" ").filter(function(w){ return w.length > 3 && !STOP_TOKENS[w]; });
}

// Envia todos os arquivos numa unica chamada e retorna o array de procedimentos.
async function extrairProcedimentos(files, onProgresso, signal, listaBanco, municipio) {
  var content = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (onProgresso) onProgresso("Lendo " + f.name + " (" + (i+1) + "/" + files.length + ")");
    var texto = "";
    if (/\.pdf$/i.test(f.name)) {
      try { texto = await extrairTextoPDF(f); } catch (e) { texto = ""; }
      if (texto && texto.replace(/\s/g, "").length > 40) {
        content.push({ type:"text", text:"===== ARQUIVO: " + f.name + " =====\n" + recortarTexto(texto, 130000) });
      } else {
        // PDF escaneado/sem texto -> envia como documento (imagem)
        var b64 = await lerArquivoBase64(f);
        content.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:b64 } });
        content.push({ type:"text", text:"(o arquivo PDF acima chama-se: " + f.name + ")" });
      }
    } else {
      var t = await lerArquivoTexto(f);
      content.push({ type:"text", text:"===== ARQUIVO: " + f.name + " =====\n" + recortarTexto(t, 130000) });
    }
  }
  content.push({ type:"text", text: PROMPT_EXTRACAO + montarBancoBlock(listaBanco, municipio) });
  // Estimativa de uso (tokens de entrada) para acompanhamento de custo.
  var chars = 0;
  content.forEach(function(b){ if (b.type === "text") chars += (b.text || "").length; else if (b.type === "document" && b.source) chars += Math.round((b.source.data || "").length / 3); });
  try { registrarUsoTokens(estimarTokens(chars)); } catch (e) {}
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

// Redacao do teor quando o oficio e encaminhado a um orgao "abrangente" (ex.: Prefeitura,
// em nome do Prefeito), para que este direcione ao setor competente.
function teorEncaminhamento(orgaoOriginal, teorOriginal) {
  var alvo = (orgaoOriginal && orgaoOriginal.trim() && orgaoOriginal.trim().toLowerCase().indexOf("identificar") === -1) ? orgaoOriginal.trim() : "o setor/\u00f3rg\u00e3o municipal competente";
  var base = (teorOriginal && teorOriginal.trim()) ? teorOriginal.trim() : "o atendimento da dilig\u00eancia determinada nos autos";
  return "a Vossa Excel\u00eancia que determine ao \u00f3rg\u00e3o competente \u2014 " + alvo + " \u2014 o atendimento da seguinte provid\u00eancia: " + base + ", com posterior remessa da resposta a esta Promotoria de Justi\u00e7a";
}

// ============================================================================
// Persistencia de apoio (tudo em localStorage): historico de expedicoes,
// numeracao continua por comarca/ano, aprendizado de destinatarios e uso da IA.
// ============================================================================

// ---- Historico de expedicoes ----
function carregarHistorico() { try { return JSON.parse(localStorage.getItem("mpba:historico") || "[]"); } catch (e) { return []; } }
function salvarHistorico(h) { try { localStorage.setItem("mpba:historico", JSON.stringify((h || []).slice(0, 300))); } catch (e) {} }

// ---- Numeracao continua (ultimo n\u00ba de oficio usado por comarca+ano) ----
function chaveSeq(comarca, ano) { return comarca + ":" + ano; }
function carregarSeq() { try { return JSON.parse(localStorage.getItem("mpba:seqOficio") || "{}"); } catch (e) { return {}; } }
function proximoNumeroSugerido(comarca, ano) { var m = carregarSeq(); var last = m[chaveSeq(comarca, ano)]; return last ? (last + 1) : null; }
function registrarUltimoNumero(comarca, ano, ultimo) {
  var m = carregarSeq(); var k = chaveSeq(comarca, ano);
  if (!m[k] || ultimo > m[k]) { m[k] = ultimo; try { localStorage.setItem("mpba:seqOficio", JSON.stringify(m)); } catch (e) {} }
}

// ---- Aprendizado: de-para "texto que a IA/despacho usou" -> nome no banco ----
// Quando o servidor corrige/identifica um destinatario, guardamos a associacao
// para que da proxima vez o mesmo termo caia direto no banco (sem revisao manual).
function carregarAprendizado() { try { return JSON.parse(localStorage.getItem("mpba:aprendizado") || "{}"); } catch (e) { return {}; } }
function gravarAprendizado(map) { try { localStorage.setItem("mpba:aprendizado", JSON.stringify(map || {})); } catch (e) {} }

// ---- Uso estimado da IA (tokens de entrada aproximados por mes) ----
function mesRef(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function estimarTokens(chars) { return Math.max(0, Math.round((chars || 0) / 4)); }
function carregarUso() { try { return JSON.parse(localStorage.getItem("mpba:usoIA") || "{}"); } catch (e) { return {}; } }
function registrarUsoTokens(tokens) {
  var m = carregarUso(); var k = mesRef(); m[k] = (m[k] || 0) + (tokens || 0);
  try { localStorage.setItem("mpba:usoIA", JSON.stringify(m)); } catch (e) {}
  return m[k];
}

// Texto-previa (leitura humana) do corpo do oficio, espelhando gerarBodyOficio.
// Usado na tela de conferencia/edicao antes de gerar o .docx.
function previewTextoOficio(o) {
  var d = o.dest, itens = o.itens || [];
  var ehPromotor = o.assinante === "promotor";
  var L = [];
  L.push("Of\u00edcio n\u00ba " + o.numOficio);
  L.push("");
  L.push((o.promotoriaCidade || "") + ", data da assinatura eletr\u00f4nica.");
  L.push("");
  if (d.vocativo) L.push(d.vocativo);
  if (d.nomeAutoridade) L.push(d.nomeAutoridade);
  L.push(d.nome || "");
  if (d.endereco) L.push(d.endereco);
  if (d.cepCidade) L.push(d.cepCidade);
  L.push("");
  L.push("Assunto: " + (o.assunto || "Solicita provid\u00eancias."));
  L.push("Refer\u00eancia: " + itens.map(function (i) { return i.numProc; }).join("; ") + ".");
  L.push("");
  var intro = ehPromotor
    ? "Cumprimentando-o cordialmente, no uso de minhas atribui\u00e7\u00f5es legais, na qualidade de Promotor de Justi\u00e7a de " + o.promotoriaCidade + ", sirvo-me do presente para solicitar "
    : "Cumprimentando-o cordialmente e de ordem do Excelent\u00edssimo Senhor Doutor " + o.promotor + ", Promotor de Justi\u00e7a de " + o.promotoriaCidade + ", sirvo-me do presente para solicitar ";
  if (itens.length === 1) {
    L.push(intro + (itens[0].teor || "") + ", no prazo de " + (itens[0].prazo || "15 (quinze) dias") + ".");
  } else {
    L.push(intro + "o atendimento das dilig\u00eancias abaixo relacionadas, observado, para cada uma, o respectivo prazo de resposta:");
    itens.forEach(function (it, i) {
      L.push("    " + (i + 1) + ". Refer\u00eancia " + it.numProc + (it.tipo ? " (" + it.tipo + ")" : "") + ": " + (it.teor || "") + ". Prazo de resposta: " + (it.prazo || "15 (quinze) dias") + ".");
    });
  }
  L.push("");
  L.push("A resposta dever\u00e1 ser encaminhada para o endere\u00e7o eletr\u00f4nico " + (o.emailResp || ""));
  L.push("");
  L.push("Respeitosamente,");
  L.push("(assinado eletronicamente)");
  if (ehPromotor) { L.push(o.promotor); L.push("Promotor de Justi\u00e7a de " + o.promotoriaCidade); }
  else { L.push(o.servNome); L.push(o.servCargo); }
  return L.join("\n");
}

export default function App() {
  var [screen, setScreen] = useState("loading");
  var [comarca, setComarca] = useState("prado");
  var [destDB, setDestDB] = useState([]);
  var [servDB, setServDB] = useState([]);
  var [servAtual, setServAtual] = useState(null);
  var [step, setStep] = useState("config");
  var [cfg, setCfg] = useState({ numInicial:"", ano: String(new Date().getFullYear()), data: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"}), assinante:"servidor" });
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
  var [aprendizadoDB, setAprendizadoDB] = useState({});
  var [historico, setHistorico] = useState([]);
  var [usoMes, setUsoMes] = useState(0);
  var [numTocado, setNumTocado] = useState(false);   // servidor digitou o nº manualmente
  var [modalEditOficio, setModalEditOficio] = useState(null);
  var fileRef = useRef();
  var bancoFileRef = useRef();
  var abortRef = useRef(null);

  useEffect(function() {
    // Registro do Service Worker (uso offline / instalar como app). So em navegador.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try { navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(function(){}); } catch (e) {}
    }
    (async function() {
      setSettings(carregarSettings());
      var dSaved = await sGet("mpba:dest");
      var sSaved = await sGet("mpba:serv");
      var cSaved = await sGet("mpba:comarca");
      var verSaved = await sGet("mpba:bancoVersao");
      var dList;
      // Banco mestre publicado (sincronizacao de leitura entre computadores).
      var master = null;
      try {
        var respM = await fetch(import.meta.env.BASE_URL + "banco.json", { cache:"no-store" });
        if (respM.ok) master = await respM.json();
      } catch(e) { console.warn("banco mestre:", e); }

      if (master && Array.isArray(master.destinatarios)) {
        var baseLocal;
        if (dSaved) {
          // Ja havia banco local: so aplica o mestre se a versao mudou (mantendo os itens locais proprios).
          if (verSaved === master.versao) { setDestDB(dSaved.map(migrarDest)); baseLocal = null; }
          else baseLocal = dSaved.map(migrarDest);
        } else {
          baseLocal = DEST_INICIAIS.map(migrarDest);
        }
        if (baseLocal) {
          dList = mesclarMaster(baseLocal, master.destinatarios);
          try { await sSet("mpba:dest", dList); await sSet("mpba:bancoVersao", master.versao); } catch(e) {}
        } else {
          dList = dSaved.map(migrarDest);
        }
      } else if (dSaved) {
        dList = dSaved.map(migrarDest);
      } else {
        dList = DEST_INICIAIS.map(migrarDest);
        try { await sSet("mpba:dest", dList); } catch(e) {}
      }
      var sList = (sSaved || SERV_INICIAIS).map(function(s){ return Object.assign({ cargo:"" }, s); });
      var c = cSaved || "prado";
      // Sincronizacao em nuvem (Firebase) em SEGUNDO PLANO: nunca bloqueia a
      // abertura do app. Se a nuvem estiver lenta/indisponivel, o app abre
      // normalmente com o banco local e sincroniza assim que a conexao responder.
      // (Antes, um await aqui podia travar o app na tela "Carregando...".)
      if (cloudAtivo()) {
        var baseCloud = dList;
        (async function(){
          try {
            var cloud = await cloudLerBanco();
            if (cloud && Array.isArray(cloud.destinatarios)) {
              var merged = mesclarMaster(baseCloud, cloud.destinatarios);
              setDestDB(merged); sSet("mpba:dest", merged);
              // se o local tinha itens que a nuvem nao tem, sobe a versao mesclada
              if (merged.length !== cloud.destinatarios.length) { cloudEscreverBanco(merged).catch(function(){}); }
            } else {
              // nuvem vazia -> semeia com o banco atual
              cloudEscreverBanco(baseCloud).catch(function(){});
            }
            cloudObservar(function(remote){
              if (remote && Array.isArray(remote.destinatarios)) {
                var m = remote.destinatarios.map(migrarDest);
                setDestDB(m); sSet("mpba:dest", m);
              }
            });
          } catch(e) { console.warn("cloud sync:", e); }
        })();
      }

      setDestDB(dList);
      setServDB(sList);
      setComarca(c);
      setServAtual(sList.find(function(s) { return s.comarca === c; }) || sList[0] || null);
      // Apoio: aprendizado, historico, uso da IA e sugestao de numeracao inicial.
      setAprendizadoDB(carregarAprendizado());
      setHistorico(carregarHistorico());
      setUsoMes(carregarUso()[mesRef()] || 0);
      var sugerido = proximoNumeroSugerido(c, cfg.ano);
      if (sugerido) setCfg(function(p){ return p.numInicial ? p : Object.assign({}, p, { numInicial: String(sugerido) }); });
      try { var bytes = await carregarCasca(); setCascaBytes(bytes); } catch(e) { console.warn(e); }
      setScreen("main");
    })();
  }, []);

  async function salvarDest(lista) { setDestDB(lista); await sSet("mpba:dest", lista); if (cloudAtivo()) cloudEscreverBanco(lista).catch(function(){}); }
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

  // Exporta TODO o banco (JSON) para sincronizar entre computadores.
  function exportarBanco() {
    try {
      var blob = new Blob([JSON.stringify(destDB, null, 2)], { type:"application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "banco_destinatarios_mpba.json";
      document.body.appendChild(a); a.click();
      setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch (e) { alert("Falha ao exportar: " + (e && e.message ? e.message : e)); }
  }

  async function importarBancoArquivo(file) {
    try {
      var txt = await file.text();
      var arr = JSON.parse(txt);
      if (!Array.isArray(arr) || arr.length === 0) { alert("Arquivo inválido: esperado um banco exportado (.json)."); return; }
      if (!confirm("Isso vai SUBSTITUIR todo o banco de destinatários atual por " + arr.length + " item(ns) do arquivo. Continuar?")) return;
      var lista = arr.map(migrarDest).map(function(d){ return Object.assign({}, d, { id: d.id || uid(), tipo: d.tipo || "institucional" }); });
      await salvarDest(lista);
      alert("Banco importado com sucesso: " + lista.length + " destinatários.");
    } catch (e) { alert("Não foi possível importar: " + (e && e.message ? e.message : e)); }
  }

  function mudarComarca(c) {
    setComarca(c);
    sSet("mpba:comarca", c);
    setServAtual(servDB.find(function(s) { return s.comarca === c; }) || servDB[0] || null);
    // Se o servidor ainda nao digitou um numero, sugere o proximo desta comarca/ano.
    if (!numTocado) {
      var sug = proximoNumeroSugerido(c, cfg.ano);
      setCfg(function(p){ return Object.assign({}, p, { numInicial: sug ? String(sug) : "" }); });
    }
  }

  // Sugestao de numeracao para a comarca/ano atuais (ultimo usado + 1).
  var numSugerido = proximoNumeroSugerido(comarca, cfg.ano);

  // Registra a associacao "texto usado pela IA/despacho" -> nome escolhido no banco,
  // para acertar automaticamente nas proximas expedicoes.
  function aprender(origem, nomeBanco) {
    var k = normChave(origem);
    if (!k || !nomeBanco) return;
    setAprendizadoDB(function(prev){
      if (prev[k] === nomeBanco) return prev;
      var m = Object.assign({}, prev); m[k] = nomeBanco; gravarAprendizado(m); return m;
    });
  }

  // Resolve um destinatario (objeto da IA {orgao, bancoNome,...} ou string) contra o banco.
  function resolverDest(item) {
    var ia = typeof item === "object" ? item : {};
    var lista = destDB.filter(function(d) { return d.comarca === comarca || d.comarca === "todos"; });
    function merge(achado, origem) {
      return {
        id: achado.id, chave: achado.chave, nome: achado.nome,
        vocativo: achado.vocativo || ia.vocativo || "",
        nomeAutoridade: achado.nomeAutoridade || ia.nomeAutoridade || "",
        endereco: achado.endereco || ia.endereco || "",
        cepCidade: achado.cepCidade || ia.cepCidade || "",
        email: achado.email || ia.email || "",
        origem: origem || "banco",
      };
    }
    // 0) Aprendizado: termo ja corrigido pelo servidor antes -> vai direto ao banco.
    var brutoAP = normChave(ia.orgao || ia.nome || (typeof item === "string" ? item : ""));
    if (brutoAP && aprendizadoDB[brutoAP]) {
      var alvoAP = normChave(aprendizadoDB[brutoAP]);
      var mapd = lista.find(function(d){ return normChave(d.nome) === alvoAP; })
              || destDB.find(function(d){ return normChave(d.nome) === alvoAP; });
      if (mapd) return merge(mapd, "banco");
    }
    // 1) Casamento explicito indicado pela IA (bancoNome)
    if (ia.bancoNome && !/identificar/i.test(ia.bancoNome)) {
      var bn = normChave(ia.bancoNome);
      var mb = lista.find(function(d){ return normChave(d.nome) === bn; })
            || lista.find(function(d){ return normChave(d.nome).indexOf(bn) !== -1 || bn.indexOf(normChave(d.nome)) !== -1; });
      if (mb) return merge(mb);
    }
    var texto = typeof item === "string" ? item : (ia.orgao || ia.nome || "");
    var lower = normChave(texto);
    if (!lower || /identificar/i.test(lower)) return null;
    // 2) Exato por nome ou chave
    var ex = lista.find(function(d){ return normChave(d.nome) === lower || normChave(d.chave) === lower; });
    if (ex) return merge(ex);
    // 3) Substring (chave/nome contidos no texto, ou vice-versa)
    var sub = lista.find(function(d){ return lower.indexOf(normChave(d.chave)) !== -1 || normChave(d.nome).indexOf(lower) !== -1 || lower.indexOf(normChave(d.nome)) !== -1; });
    if (sub) return merge(sub);
    // 4) Sobreposicao de tokens significativos (ex.: "DT de Prado" ~ "Delegacia Territorial de Prado")
    var toks = tokensSig(lower);
    if (toks.length) {
      var best = null, bestScore = 0;
      lista.forEach(function(d){
        var chaveToks = tokensSig(d.chave);
        var nomeToks = tokensSig(d.nome);
        var alvo = chaveToks.length ? chaveToks : nomeToks;
        if (!alvo.length) return;
        var shared = alvo.filter(function(t){ return toks.indexOf(t) !== -1; }).length;
        var todosChave = chaveToks.length > 0 && chaveToks.every(function(t){ return toks.indexOf(t) !== -1; });
        var score = (todosChave ? 100 : 0) + shared;
        if (score > bestScore && (todosChave || shared >= 2)) { bestScore = score; best = d; }
      });
      if (best) return merge(best);
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
        if (r) resolvidas.push(Object.assign(base, { dest:r, origem:r.origem || "banco" }));
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
          var listaBanco = destDB.filter(function(d){ return d.comarca === comarca || d.comarca === "todos"; });
          var municipioCtx = (COMARCAS[comarca] && COMARCAS[comarca].cidade) || "";
          var extraidos = await extrairProcedimentos(arquivosIA, function(msg){ setProgresso({ msg:msg, atual:0, total:0 }); }, ctrl.signal, listaBanco, municipioCtx);
          brutos = brutos.concat(extraidos);
          setUsoMes(carregarUso()[mesRef()] || 0);
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
    // Rede de seguranca: nunca gerar oficio para "Destinatario a identificar" (ou sem nome).
    diligencias = (diligencias || []).filter(function(d){ return d && d.dest && d.dest.nome && d.dest.nome.trim() && !/identificar/i.test(d.dest.nome); });
    var numInicial = parseInt(cfg.numInicial, 10);
    var ano = cfg.ano || String(new Date().getFullYear());
    function destKey(d) { return d.id || normChave(d.nome); }
    var porDest = {};
    diligencias.forEach(function(d) {
      var key = destKey(d.dest);
      if (!porDest[key]) porDest[key] = { dest:d.dest, itens:[], assuntos:[], origem:d.origem || "banco" };
      // origem do grupo: "banco" so se TODAS as diligencias vierem do banco.
      if ((d.origem || "banco") !== "banco") porDest[key].origem = d.origem;
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
          var blob = await montarDocx(gerarBodyOficio({ dest:g.dest, itens:g.itens, numOficio:g.numOficio, assunto:g.assunto, promotor:promotor, promotoriaCidade:cidade, emailResp:emailResp, servNome:servNome, servCargo:servCargo, assinante:cfg.assinante || "servidor" }), bytes);
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
    var semEmailN = grupos.filter(function(g){ return !g.dest.email; }).length;
    var conferirN = grupos.filter(function(g){ return (g.origem || "banco") !== "banco"; }).length;
    var ck = "CHECKLIST - " + comarcaData.label + " - " + cfg.data + "\nServidor: " + servNome + " (" + servCargo + (servAtual.matricula && servAtual.matricula !== "--" ? ", Mat. " + servAtual.matricula : "") + ")\nAssinatura: " + ((cfg.assinante === "promotor") ? ("Promotor de Justica (" + promotor + ")") : "Servidor (de ordem do Promotor)") + "\n" + "=".repeat(50) + "\n";
    ck += "RESUMO: " + grupos.length + " oficio(s), " + certs.length + " certidao(oes).\n";
    if (semEmailN) ck += "ATENCAO: " + semEmailN + " oficio(s) SEM e-mail (o .eml sai sem destinatario; preencher no Outlook).\n";
    if (conferirN) ck += "ATENCAO: " + conferirN + " oficio(s) com destinatario preenchido manualmente/encaminhado (conferir).\n";
    ck += "\n";
    grupos.forEach(function(g, i) {
      var marca = (g.origem || "banco") === "banco" ? "" : ((g.origem === "encaminhado") ? "  [ENCAMINHADO]" : "  [CONFERIR]");
      ck += (i+1) + ". Ofício nº " + g.numOficio + " -> " + g.dest.nome + marca + "\n   Email: " + (g.dest.email || "CADASTRAR") + "\n   Referência: " + g.itens.map(function(x){return x.numProc;}).join("; ") + "\n\n";
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
    p3.file("LEIA-ME.txt", "Duplo clique no .eml -> o Outlook abre uma MENSAGEM NOVA (rascunho) ja preenchida, pronta para editar. Anexe o docx do oficio + os PDFs e clique em Enviar.\r\n\r\nSe o arquivo abrir em outro programa (ou como mensagem so-leitura, sem deixar anexar): clique com o botao direito no .eml -> Abrir com -> Outlook (Desktop). No celular, encaminhe/abra pelo app do Outlook.");
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
    // Registra numeracao continua + historico da expedicao (para consulta futura).
    try {
      var grps = resultado.grupos || [];
      var numsFin = grps.map(function(g){ return parseInt(String(g.numOficio).replace(/\D.*$/,""), 10); }).filter(function(n){ return !isNaN(n); });
      var ano = cfg.ano || String(new Date().getFullYear());
      if (numsFin.length) { registrarUltimoNumero(comarca, ano, Math.max.apply(null, numsFin)); }
      var entrada = {
        id: uid(),
        dataISO: new Date().toISOString(),
        dataBR: new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" }) + " " + new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" }),
        comarca: comarca,
        comarcaLabel: COMARCAS[comarca].label,
        ano: ano,
        assinante: cfg.assinante || "servidor",
        servidor: servAtual ? servAtual.nome : "",
        oficios: grps.map(function(g){ return { numOficio:g.numOficio, nome:g.dest.nome, email:g.dest.email || "", procs:(g.itens||[]).map(function(x){ return x.numProc; }) }; }),
        certs: (resultado.certs || []).map(function(c){ return { numProc:c.numProc, tipoCertidao:c.tipoCertidao }; })
      };
      var novoHist = [entrada].concat(historico);
      salvarHistorico(novoHist); setHistorico(novoHist);
      // Prepara a proxima numeracao (sem exigir digitacao manual na proxima expedicao).
      setNumTocado(false);
      var prox = proximoNumeroSugerido(comarca, ano);
      if (prox) setCfg(function(p){ return Object.assign({}, p, { numInicial: String(prox) }); });
    } catch (e) { console.warn("historico/seq:", e); }
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
            React.createElement("button", { style:btn("#1a7a3a",{fontSize:12,padding:"7px 10px"}), onClick:exportarBanco }, "Exportar banco"),
            React.createElement("label", { style:Object.assign({},btn("#0a7",{fontSize:12,padding:"7px 10px",cursor:"pointer"})) }, "Importar banco",
              React.createElement("input", { ref:bancoFileRef, type:"file", accept:".json,application/json", style:{ display:"none" }, onChange:function(e){ if(e.target.files[0]){ importarBancoArquivo(e.target.files[0]); e.target.value=""; } } })
            ),
            React.createElement("button", { style:btn(C.verde,{fontSize:12,padding:"7px 10px"}), onClick:function() { setModalDest({ dest:{ id:uid(), comarca:comarca, chave:"", nome:"", vocativo:"", nomeAutoridade:"", endereco:"", cepCidade:"", email:"", tipo:"institucional" }, isNew:true }); } }, "+ Novo")
          )
        ),
        cloudAtivo() && React.createElement("div", { style:{ fontSize:12, color:C.verde, background:"#eafaf0", border:"1px solid #bfe6cd", borderRadius:6, padding:"6px 10px", marginBottom:8 } }, "☁ Sincronização em nuvem ativa — o banco é compartilhado e atualiza em todos os computadores automaticamente."),
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

  // Tela historico de expedicoes
  if (screen === "historico") {
    return React.createElement("div", { style:{ fontFamily:"Arial", minHeight:"100vh", background:C.cinza } },
      React.createElement(Header, { screen, setScreen, comarca, mudarComarca, onSettings:function(){setShowSettings(true);} }),
      settingsModal,
      React.createElement("div", { style:{ maxWidth:820, margin:"0 auto", padding:"20px 14px" } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 } },
          React.createElement("h2", { style:{ margin:0, color:C.azul, fontSize:16 } }, "Histórico de Expedições"),
          historico.length > 0 && React.createElement("button", { style:btn("#c00",{fontSize:12,padding:"6px 10px"}), onClick:async function(){ if(confirm("Apagar todo o histórico de expedições deste navegador? (não afeta os arquivos já baixados)")){ salvarHistorico([]); setHistorico([]); } } }, "Limpar histórico")
        ),
        React.createElement("div", { style:{ fontSize:12, color:"#888", marginBottom:12 } }, "Registro das expedições feitas neste navegador (para consulta e para a numeração automática continuar de onde parou). Fica salvo localmente."),
        historico.length === 0 && React.createElement("div", { style:Object.assign({}, C.card, { textAlign:"center", color:"#888", padding:32 }) }, "Nenhuma expedição registrada ainda. Ao baixar um pacote ZIP, ele aparece aqui."),
        historico.map(function(h) {
          var nums = (h.oficios||[]).map(function(o){ return parseInt(String(o.numOficio).replace(/\D.*$/,""),10); }).filter(function(n){ return !isNaN(n); });
          var faixa = nums.length ? (String(Math.min.apply(null,nums)).padStart(3,"0") + " a " + String(Math.max.apply(null,nums)).padStart(3,"0")) : "-";
          return React.createElement("div", { key:h.id, style:C.card },
            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" } },
              React.createElement("div", null,
                React.createElement("span", { style:{ fontWeight:"bold", color:C.azul, fontSize:14 } }, h.comarcaLabel + " — " + faixa + "/" + h.ano),
                React.createElement("span", { style:{ fontSize:12, color:"#888", marginLeft:8 } }, h.dataBR)
              ),
              React.createElement("span", { style:{ background:"#e8f0fe", color:C.azul, padding:"2px 8px", borderRadius:10, fontSize:11 } }, (h.oficios||[]).length + " ofício(s) · " + (h.certs||[]).length + " certidão(ões)")
            ),
            React.createElement("div", { style:{ fontSize:12, color:"#666", marginTop:4 } }, "Servidor: " + (h.servidor||"-") + " · Assinatura: " + (h.assinante==="promotor"?"Promotor":"Servidor (de ordem)")),
            React.createElement("div", { style:{ marginTop:8, paddingTop:8, borderTop:"1px solid #f5f5f5" } },
              (h.oficios||[]).map(function(o, j){
                return React.createElement("div", { key:j, style:{ fontSize:12, color:"#444", padding:"2px 0" } },
                  React.createElement("strong", null, "Ofício nº " + o.numOficio),
                  " — " + o.nome + (o.email?"":" (sem e-mail)") + " · Ref.: " + (o.procs||[]).join("; ")
                );
              })
            )
          );
        })
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
          React.createElement("div", { style:{ marginTop:4 } }, "Promotoria: ", React.createElement("strong", null, COMARCAS[comarca].promotoria)),
          settings.usarIA && React.createElement("div", { style:{ marginTop:4, fontSize:12, color:"#888" } }, "Uso estimado da IA neste mês: ~", React.createElement("strong", null, (usoMes>=1000? (usoMes/1000).toFixed(usoMes>=10000?0:1)+" mil" : usoMes) + " tokens de entrada"), Object.keys(aprendizadoDB).length ? (" · " + Object.keys(aprendizadoDB).length + " associação(ões) aprendida(s)") : ""),
          React.createElement("div", { style:{ marginTop:10 } },
            React.createElement("label", { style:C.label }, "Quem assina os ofícios?"),
            React.createElement("select", { style:C.input, value:cfg.assinante || "servidor", onChange:function(e){ var v=e.target.value; setCfg(function(p){ return Object.assign({},p,{assinante:v}); }); } },
              React.createElement("option", { value:"servidor" }, "Servidor (de ordem do Promotor)"),
              React.createElement("option", { value:"promotor" }, "Promotor de Justiça (" + settings.promotor + ")")
            ),
            React.createElement("div", { style:{ fontSize:11, color:"#888", marginTop:4 } }, cfg.assinante === "promotor" ? "A redação fica em 1ª pessoa (sem \"de ordem\") e a assinatura é do Promotor." : "A redação usa \"de ordem do Promotor\" e a assinatura é do servidor.")
          )
        ),
        React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 } },
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Nº inicial do ofício *"), React.createElement("input", { style:C.input, value:cfg.numInicial, onChange:function(e){ setNumTocado(true); setCfg(function(p){return Object.assign({},p,{numInicial:e.target.value});}); }, placeholder:"Ex: 95" })),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Ano"), React.createElement("input", { style:C.input, value:cfg.ano, onChange:function(e){ var v=e.target.value; setCfg(function(p){ var np=Object.assign({},p,{ano:v}); if(!numTocado){ var s=proximoNumeroSugerido(comarca,v); np.numInicial = s?String(s):""; } return np; }); } })),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Data (certidão)"), React.createElement("input", { style:C.input, value:cfg.data, onChange:function(e){setCfg(function(p){return Object.assign({},p,{data:e.target.value});});} }))
        ),
        numSugerido && React.createElement("div", { style:{ fontSize:12, color:C.verde, marginTop:8, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" } },
          React.createElement("span", null, "Numeração automática: o último ofício de " + COMARCAS[comarca].label + "/" + cfg.ano + " foi " + String(numSugerido-1).padStart(3,"0") + ". Sugerido: " + String(numSugerido).padStart(3,"0") + "."),
          String(cfg.numInicial) !== String(numSugerido) && React.createElement("button", { style:btn(C.verde,{padding:"3px 9px",fontSize:11}), onClick:function(){ setNumTocado(false); setCfg(function(p){ return Object.assign({},p,{numInicial:String(numSugerido)}); }); } }, "Usar " + String(numSugerido).padStart(3,"0"))
        ),
        React.createElement("div", { style:{ fontSize:11, color:"#888", marginTop:6 } }, "O ofício sai numerado como, ex.: 095." + cfg.ano + " e datado como \"data da assinatura eletrônica\". A numeração continua automaticamente da última expedição."),
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
        destDB:destDB,
        comarca:comarca,
        onConfirmar:function(extras) {
          function nomeValido(n){ return n && n.trim() && !/identificar/i.test(n); }
          // salva no banco os marcados (com nome valido e nao redirecionados)
          var novosParaSalvar = extras.filter(function(r){ return r.salvar && nomeValido(r.nome) && !r.via; });
          if (novosParaSalvar.length > 0) {
            var vistos = {};
            var unicos = novosParaSalvar.filter(function(r){ var k=normChave(r.nome); if(vistos[k]) return false; vistos[k]=1; return true; });
            var novaLista = destDB.concat(unicos.map(function(r){ return { id:uid(), comarca:comarca, chave:r.chave||normChave(r.nome).slice(0,24), nome:r.nome, vocativo:r.vocativo||"", nomeAutoridade:r.nomeAutoridade||"", endereco:r.endereco||"", cepCidade:r.cepCidade||"", email:r.email||"", tipo:"institucional" }; }));
            salvarDest(novaLista);
          }
          // cada pendente vira uma diligencia: PRIORIDADE ao nome preenchido; senao, encaminha via orgao.
          // Nunca gera "Destinatario a identificar".
          var novasDilig = extras.map(function(r){
            if (nomeValido(r.nome)) {
              // Aprendizado: se o termo que a IA usou difere do nome escolhido e o nome
              // corresponde a um item do banco, memoriza para acertar automaticamente depois.
              if (r.termoIA && normChave(r.termoIA) !== normChave(r.nome)) {
                var jaNoBanco = destDB.find(function(d){ return normChave(d.nome) === normChave(r.nome); });
                if (jaNoBanco || r.salvar) aprender(r.termoIA, r.nome);
              }
              return { numProc:r.numProc, tipo:r.tipo, tipoCertidao:r.tipoCertidao||"encaminhamento", assunto:r.assunto||"", teor:r.teor||"", prazo:r.prazo||"15 (quinze) dias", origem:"manual", dest:{ nome:r.nome, vocativo:r.vocativo||"", nomeAutoridade:r.nomeAutoridade||"", endereco:r.endereco||"", cepCidade:r.cepCidade||"", email:r.email||"", chave:r.chave||normChave(r.nome).slice(0,24) } };
            }
            if (r.via) {
              // Encaminhar via orgao abrangente (ex.: Prefeitura) -> em nome da autoridade, que direciona ao setor competente
              var org = destDB.find(function(d){ return d.chave===r.via && (d.comarca===comarca||d.comarca==="todos"); }) || destDB.find(function(d){ return d.chave===r.via; });
              if (org) {
                return { numProc:r.numProc, tipo:r.tipo, tipoCertidao:r.tipoCertidao||"encaminhamento", assunto:r.assunto||"", teor: teorEncaminhamento(r.originalNome, r.teor), prazo:r.prazo||"15 (quinze) dias", origem:"encaminhado",
                  dest:{ id:org.id, nome:org.nome, vocativo:org.vocativo||"A Sua Excelência o Senhor", nomeAutoridade:org.nomeAutoridade||"", endereco:org.endereco||"", cepCidade:org.cepCidade||"", email:org.email||"", chave:org.chave } };
              }
            }
            return null; // sem nome e sem encaminhamento -> ignorado (nunca vira placeholder)
          }).filter(Boolean);
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
        // Conferencia antes de gerar: destaca pendencias (sem e-mail, sem endereco, a conferir).
        (function(){
          var gs = resultado.grupos || [];
          var semEmail = gs.filter(function(g){ return !g.dest.email; });
          var semEnd = gs.filter(function(g){ return !g.dest.endereco && !g.dest.cepCidade; });
          var conferir = gs.filter(function(g){ return (g.origem || "banco") !== "banco"; });
          if (!semEmail.length && !semEnd.length && !conferir.length) {
            return React.createElement("div", { key:"conf", style:{ background:"#eafaf0", border:"1px solid #bfe6cd", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:"#1a7a3a" } }, "✓ Conferência: todos os " + gs.length + " ofício(s) com destinatário do banco, e-mail e endereço preenchidos. Pronto para gerar.");
          }
          return React.createElement("div", { key:"conf", style:{ background:"#fffbeb", border:"1px solid #f5e090", borderRadius:10, padding:"12px 14px", marginBottom:14, fontSize:13, color:"#7a5c00" } },
            React.createElement("div", { style:{ fontWeight:"bold", marginBottom:6 } }, "Conferência antes de gerar — pontos de atenção:"),
            React.createElement("ul", { style:{ margin:"0 0 0 18px", padding:0, lineHeight:1.7 } },
              semEmail.length ? React.createElement("li", { key:"e" }, React.createElement("strong", null, semEmail.length + " ofício(s) sem e-mail"), " — o .eml sairá sem destinatário (\"Para:\") e precisará ser preenchido à mão no Outlook. Use \"Ver / editar\" para incluir o e-mail.") : null,
              semEnd.length ? React.createElement("li", { key:"a" }, semEnd.length + " ofício(s) sem endereço no corpo do documento (não impede o envio por e-mail).") : null,
              conferir.length ? React.createElement("li", { key:"c" }, React.createElement("strong", null, conferir.length + " ofício(s) a conferir"), " — destinatário preenchido manualmente ou por encaminhamento (não veio direto do banco).") : null
            )
          );
        })(),
        React.createElement("div", { style:C.card },
          React.createElement("h3", { style:{ margin:"0 0 4px", color:C.azul, fontSize:14 } }, "Ofícios (com juntada por destinatário)"),
          React.createElement("div", { style:{ fontSize:12, color:"#666", marginBottom:12 } }, "Clique em \"Ver / editar\" para conferir o texto completo e ajustar destinatário, assunto, teor ou prazo antes de gerar."),
          resultado.grupos.map(function(g, i) {
            var org = g.origem || "banco";
            var badge = org === "banco" ? { t:"✓ do banco", bg:"#eafaf0", cor:"#1a7a3a", bd:"#bfe6cd" }
                     : org === "encaminhado" ? { t:"↪ encaminhado", bg:"#f5f0ff", cor:"#5b21b6", bd:"#e0d4ff" }
                     : { t:"⚠ conferir", bg:"#fffbeb", cor:"#7a5c00", bd:"#f5e090" };
            return React.createElement("div", { key:i, style:{ border:"1px solid #e8f0fe", borderRadius:8, padding:12, marginBottom:10 } },
              React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, flexWrap:"wrap" } },
                React.createElement("div", { style:{ fontWeight:"bold", color:C.azul, fontSize:14 } }, "Ofício nº " + g.numOficio + " - " + g.dest.nome),
                React.createElement("div", { style:{ display:"flex", gap:6, alignItems:"center" } },
                  React.createElement("span", { style:{ background:badge.bg, color:badge.cor, border:"1px solid "+badge.bd, padding:"2px 8px", borderRadius:10, fontSize:11, fontWeight:"bold" } }, badge.t),
                  React.createElement("button", { style:btn(C.azul,{padding:"4px 10px",fontSize:11}), onClick:function(){ setModalEditOficio({ idx:i }); } }, "Ver / editar")
                )
              ),
              React.createElement("div", { style:{ fontSize:12, marginTop:3, color: g.dest.email ? C.verde : "#c66", fontWeight: g.dest.email ? "normal" : "bold" } }, g.dest.email ? "Email: " + g.dest.email : "⚠ Email não cadastrado — o e-mail sairá sem destinatário; preencha em \"Ver / editar\"."),
              !g.dest.endereco && !g.dest.cepCidade && React.createElement("div", { style:{ fontSize:11, marginTop:2, color:"#c66" } }, "Sem endereço no corpo do ofício."),
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
        React.createElement("button", { style:btnOut(), onClick:function(){ setStep("fila"); setResultado(null); setProcs([]); } }, "<- Nova expedição"),
        modalEditOficio && resultado.grupos[modalEditOficio.idx] && React.createElement(ModalEditOficio, {
          grupo: resultado.grupos[modalEditOficio.idx],
          ctx: {
            promotor: settings.promotor || "Rui César Farias dos Santos Júnior",
            promotoriaCidade: COMARCAS[comarca].promotoriaCidade || COMARCAS[comarca].cidade,
            assinante: cfg.assinante || "servidor",
            emailResp: COMARCAS[comarca].email,
            servNome: servAtual ? servAtual.nome : "",
            servCargo: servAtual ? (servAtual.cargo || "Servidor(a)") : ""
          },
          onClose: function(){ setModalEditOficio(null); },
          onSave: function(novoGrupo){
            var idx = modalEditOficio.idx;
            setResultado(function(prev){
              var grupos = prev.grupos.map(function(g, i){ return i === idx ? novoGrupo : g; });
              var antigoNome = prev.grupos[idx].dest.nome;
              // Se o nome do destinatario mudou, reflete nas certidoes (lista de expedicoes).
              var certs = prev.certs.map(function(c){
                return Object.assign({}, c, { exps: c.exps.map(function(e){ return e.numOficio === novoGrupo.numOficio ? Object.assign({}, e, { nome:novoGrupo.dest.nome }) : e; }) });
              });
              return Object.assign({}, prev, { grupos:grupos, certs:certs });
            });
            setModalEditOficio(null);
          }
        })
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
      React.createElement("button", { onClick:function(){setScreen(screen==="historico"?"main":"historico");}, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Histórico"),
      onSettings && React.createElement("button", { onClick:onSettings, style:{ background:"rgba(255,255,255,.15)", border:"none", color:"white", padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer" } }, "Config")
    )
  );
}

function ModalSettings(props) {
  var [form, setForm] = useState({ key: props.settings.key || "", model: props.settings.model || "claude-sonnet-4-6", usarIA: props.settings.usarIA !== false, promotor: props.settings.promotor || "Rui César Farias dos Santos Júnior" });
  var [mostrarKey, setMostrarKey] = useState(false);
  function f(k, v) { setForm(function(p){ return Object.assign({},p,{[k]:v}); }); }
  function copiarKey() {
    if (!form.key) { alert("Não há chave salva neste navegador."); return; }
    try { navigator.clipboard.writeText(form.key).then(function(){ alert("Chave copiada para a área de transferência."); }, function(){ setMostrarKey(true); alert("Não consegui copiar automaticamente. A chave está visível — selecione e copie manualmente."); }); }
    catch(e){ setMostrarKey(true); alert("Selecione a chave visível e copie manualmente."); }
  }
  return React.createElement(Modal, null,
    React.createElement("h3", { style:{ margin:"0 0 6px", color:C.azul } }, "Configurações"),
    React.createElement("p", { style:{ margin:"0 0 16px", fontSize:12, color:"#777" } }, "A chave da API é usada apenas neste navegador e enviada direto para a Anthropic."),
    React.createElement("div", { style:{ display:"grid", gap:12 } },
      React.createElement("div", null, React.createElement("label", { style:C.label }, "Nome do Promotor de Justiça"), React.createElement("input", { style:C.input, value:form.promotor, onChange:function(e){f("promotor",e.target.value);}, placeholder:"Ex: Rui César Farias dos Santos Júnior" })),
      React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8 } },
        React.createElement("input", { type:"checkbox", id:"usarIA", checked:form.usarIA, onChange:function(e){f("usarIA",e.target.checked);} }),
        React.createElement("label", { htmlFor:"usarIA", style:{ fontSize:13, color:"#333", cursor:"pointer", fontWeight:"bold" } }, "Usar extração automática por IA (Claude)")
      ),
      React.createElement("div", null,
        React.createElement("label", { style:C.label }, "Chave da API Anthropic (sk-ant-...)"),
        React.createElement("div", { style:{ display:"flex", gap:6 } },
          React.createElement("input", { style:Object.assign({},C.input,{flex:1}), type: mostrarKey ? "text" : "password", value:form.key, onChange:function(e){f("key",e.target.value);}, placeholder:"sk-ant-...", autoComplete:"off" }),
          React.createElement("button", { type:"button", style:btnOut({fontSize:12,padding:"6px 10px"}), onClick:function(){ setMostrarKey(function(v){ return !v; }); } }, mostrarKey ? "Ocultar" : "Mostrar"),
          React.createElement("button", { type:"button", style:btn(C.azul,{fontSize:12,padding:"6px 10px"}), onClick:copiarKey }, "Copiar")
        ),
        React.createElement("div", { style:{ fontSize:11, color:"#888", marginTop:4 } }, "A chave fica só neste navegador. Use \"Mostrar\"/\"Copiar\" para reaproveitá-la em outro computador.")
      ),
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

// Conferencia/edicao de um oficio antes de gerar o .docx: mostra a previa do texto
// e permite ajustar destinatario, assunto e o teor/prazo de cada diligencia.
function ModalEditOficio(props) {
  var g = props.grupo; var ctx = props.ctx;
  var [dest, setDest] = useState(Object.assign({ nome:"", vocativo:"", nomeAutoridade:"", endereco:"", cepCidade:"", email:"" }, g.dest));
  var [assunto, setAssunto] = useState(g.assunto || "");
  var [itens, setItens] = useState((g.itens || []).map(function(it){ return Object.assign({}, it); }));
  function fd(k, v) { setDest(function(p){ return Object.assign({},p,{[k]:v}); }); }
  function fi(idx, k, v) { setItens(function(prev){ return prev.map(function(it,i){ return i===idx ? Object.assign({},it,{[k]:v}) : it; }); }); }
  var previa = previewTextoOficio({ dest:dest, itens:itens, numOficio:g.numOficio, assunto:assunto, promotor:ctx.promotor, promotoriaCidade:ctx.promotoriaCidade, emailResp:ctx.emailResp, servNome:ctx.servNome, servCargo:ctx.servCargo, assinante:ctx.assinante });
  return React.createElement("div", { style:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 } },
    React.createElement("div", { style:{ background:"white", borderRadius:12, padding:24, width:"100%", maxWidth:760, maxHeight:"92vh", overflowY:"auto" } },
      React.createElement("h3", { style:{ margin:"0 0 4px", color:C.azul } }, "Conferir / editar — Ofício nº " + g.numOficio),
      React.createElement("p", { style:{ margin:"0 0 14px", fontSize:12, color:"#777" } }, "As alterações valem para este ofício. A prévia à direita atualiza em tempo real."),
      React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 } },
        // Coluna esquerda: campos editaveis
        React.createElement("div", { style:{ display:"grid", gap:10 } },
          React.createElement("div", { style:{ fontWeight:"bold", fontSize:12, color:C.azul } }, "Destinatário"),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Órgão / Nome"), React.createElement("input", { style:C.input, value:dest.nome||"", onChange:function(e){fd("nome",e.target.value);} })),
          React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 } },
            React.createElement("div", null, React.createElement("label", { style:C.label }, "Vocativo"), React.createElement("input", { style:C.input, value:dest.vocativo||"", onChange:function(e){fd("vocativo",e.target.value);} })),
            React.createElement("div", null, React.createElement("label", { style:C.label }, "Nome da autoridade"), React.createElement("input", { style:C.input, value:dest.nomeAutoridade||"", onChange:function(e){fd("nomeAutoridade",e.target.value);} }))
          ),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Endereço"), React.createElement("input", { style:C.input, value:dest.endereco||"", onChange:function(e){fd("endereco",e.target.value);} })),
          React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 } },
            React.createElement("div", null, React.createElement("label", { style:C.label }, "CEP / Cidade"), React.createElement("input", { style:C.input, value:dest.cepCidade||"", onChange:function(e){fd("cepCidade",e.target.value);} })),
            React.createElement("div", null, React.createElement("label", { style:Object.assign({},C.label,{color: dest.email?"#555":"#c66"}) }, "Email" + (dest.email?"":" (vazio)")), React.createElement("input", { style:Object.assign({},C.input, dest.email?null:{borderColor:"#e6a"}), value:dest.email||"", onChange:function(e){fd("email",e.target.value);}, placeholder:"email@dominio.gov.br" }))
          ),
          React.createElement("div", null, React.createElement("label", { style:C.label }, "Assunto"), React.createElement("input", { style:C.input, value:assunto, onChange:function(e){setAssunto(e.target.value);} })),
          React.createElement("div", { style:{ fontWeight:"bold", fontSize:12, color:C.azul, marginTop:4 } }, "Diligências (teor e prazo)"),
          itens.map(function(it, idx){
            return React.createElement("div", { key:idx, style:{ border:"1px solid #eee", borderRadius:8, padding:8 } },
              React.createElement("div", { style:{ fontSize:11, color:"#888", marginBottom:4 } }, "Referência " + it.numProc + (it.tipo?" ("+it.tipo+")":"")),
              React.createElement("textarea", { style:Object.assign({},C.input,{minHeight:52,resize:"vertical"}), value:it.teor||"", onChange:function(e){fi(idx,"teor",e.target.value);}, placeholder:"teor da diligência" }),
              React.createElement("div", { style:{ marginTop:6 } }, React.createElement("label", { style:C.label }, "Prazo"), React.createElement("input", { style:C.input, value:it.prazo||"", onChange:function(e){fi(idx,"prazo",e.target.value);}, placeholder:"15 (quinze) dias" }))
            );
          })
        ),
        // Coluna direita: previa do texto
        React.createElement("div", null,
          React.createElement("div", { style:{ fontWeight:"bold", fontSize:12, color:C.azul, marginBottom:6 } }, "Prévia do ofício"),
          React.createElement("pre", { style:{ whiteSpace:"pre-wrap", fontFamily:"Georgia, 'Times New Roman', serif", fontSize:12, lineHeight:1.5, background:"#fbfbfb", border:"1px solid #eee", borderRadius:8, padding:12, margin:0, maxHeight:"60vh", overflowY:"auto" } }, previa),
          React.createElement("div", { style:{ fontSize:11, color:"#999", marginTop:6 } }, "O documento final sai timbrado e formatado (Times New Roman). Esta prévia mostra apenas o texto.")
        )
      ),
      React.createElement("div", { style:{ display:"flex", gap:10, marginTop:18 } },
        React.createElement("button", { style:btnOut({flex:1}), onClick:props.onClose }, "Cancelar"),
        React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){
          if (!dest.nome || !dest.nome.trim()) { alert("O ofício precisa de um destinatário (Órgão/Nome)."); return; }
          props.onSave(Object.assign({}, g, { dest:dest, assunto:assunto, itens:itens }));
        } }, "Salvar alterações")
      )
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
  var destDB = props.destDB || []; var comarca = props.comarca;
  // Orgaos "abrangentes" disponiveis no banco (Prefeitura primeiro, depois os demais da comarca).
  var coberturas = destDB.filter(function(d){ return d.comarca === comarca || d.comarca === "todos"; })
    .sort(function(a,b){ var pa = normChave(a.nome).indexOf("prefeitura")!==-1?0:1; var pb = normChave(b.nome).indexOf("prefeitura")!==-1?0:1; return pa-pb; });
  var prefeituraCob = coberturas.filter(function(c){ return normChave(c.nome).indexOf("prefeitura")!==-1; })[0];
  function ehPlaceholder(s){ return !s || /identificar/i.test(s); }
  var [itens, setItens] = useState(pendentes.map(function(p){
    var ia = p.ia || {};
    var bruto = ia.orgao || p.textoOriginal || "";
    var naoIdent = ehPlaceholder(bruto);
    var nome0 = naoIdent ? "" : bruto;
    // Se a IA nao identificou, ja deixa pre-selecionado o encaminhamento via Prefeitura (se houver no banco),
    // para nunca sair "Destinatario a identificar". O servidor ainda pode preencher os dados diretos acima.
    var via0 = naoIdent && prefeituraCob ? prefeituraCob.chave : "";
    return Object.assign({}, p, { naoIdent:naoIdent, salvar:true, via:via0, form:{ nome: nome0, vocativo: ia.vocativo || "", nomeAutoridade: ia.nomeAutoridade || "", endereco: ia.endereco || "", cepCidade: ia.cepCidade || "", email: ia.email || "", chave: normChave(nome0).slice(0,24) } });
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
        React.createElement("div", { style:{ fontWeight:"bold", color:"#0a2440", fontSize:14, marginBottom:4 } }, item.naoIdent ? "Destinatário não identificado pela IA" : ("Quem: \"" + item.textoOriginal + "\"")),
        item.naoIdent && React.createElement("div", { style:{ fontSize:11, color:"#7a5c00", background:"#fffbeb", border:"1px solid #f5e090", borderRadius:6, padding:"6px 8px", marginBottom:8 } }, prefeituraCob ? ("Preencha os dados abaixo se conseguir identificar. Caso contrário, este item já será encaminhado via " + prefeituraCob.nome + " (em nome do Prefeito), sem gerar \"Destinatário a identificar\".") : "Preencha os dados abaixo ou escolha um órgão para encaminhar — este item não será gerado como \"Destinatário a identificar\"."),
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
          ),
          // Alternativa: encaminhar via orgao abrangente (so se nao conseguir os dados acima)
          coberturas.length > 0 && React.createElement("div", { style:{ gridColumn:"1/-1", background:"#f5f0ff", border:"1px solid #e0d4ff", borderRadius:8, padding:"10px 12px", marginTop:4 } },
            React.createElement("div", { style:{ fontSize:12, color:"#5b21b6", fontWeight:"bold", marginBottom:4 } }, "Não conseguiu o endereço? Encaminhar via órgão que abarca"),
            React.createElement("div", { style:{ fontSize:11, color:"#6b21a8", marginBottom:8 } }, "Use só se não localizar os dados acima. O ofício irá em nome da autoridade do órgão escolhido (ex.: o Prefeito), pedindo que direcione ao setor competente — \"" + (item.form.nome || item.textoOriginal) + "\"."),
            React.createElement("select", { style:C.input, value:item.via||"", onChange:function(e){ atualizar(item.id,{via:e.target.value}); } },
              React.createElement("option", { value:"" }, "— Não encaminhar (vou preencher os dados acima) —"),
              coberturas.map(function(c){ return React.createElement("option", { key:c.id, value:c.chave }, "Encaminhar via: " + c.nome + (c.email?"":" (sem e-mail no banco)")); })
            )
          )
        )
      );
    }),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:8 } },
      React.createElement("button", { style:btnOut(), onClick:onPular }, "Pular (ignorar não identificados)"),
      React.createElement("button", { style:btn(C.verde,{flex:1}), onClick:function(){
        var pendentesSem = itens.filter(function(x){ var nomeOk = x.form.nome && x.form.nome.trim() && !/identificar/i.test(x.form.nome); return !nomeOk && !x.via; });
        if (pendentesSem.length > 0) { alert(pendentesSem.length + " destinatário(s) ainda sem identificação. Para cada um: preencha o Órgão/Nome OU escolha \"Encaminhar via\" um órgão. (Se quiser ignorá-los, use o botão \"Pular\".)"); return; }
        onConfirmar(itens.map(function(x){ return Object.assign({},x.form,{salvar:x.salvar,via:x.via||"",originalNome:x.form.nome||x.textoOriginal||"",termoIA:(x.ia&&x.ia.orgao)||x.textoOriginal||"",numProc:x.numProc,tipo:x.tipo,tipoCertidao:x.tipoCertidao,assunto:x.assunto,teor:x.teor,prazo:x.prazo}); }));
      } }, "Confirmar e gerar ofícios")
    )
  );
}
