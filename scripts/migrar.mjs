// Migracao do historico da planilha para o Supabase.
//
//   node scripts/migrar.mjs
//
// Le  dados-origem/CONTROLE_DE_FROTA.xlsx
// Gera dados-origem/historico.sql   (revisar e colar no SQL editor)
//
// Por que gera SQL em vez de escrever no banco: nao ha credencial do Supabase
// no ambiente onde este script roda. O efeito colateral e bom — o SQL fica
// legivel e revisavel antes de tocar em producao.
//
// O arquivo gerado NAO vai para o repositorio: carrega nome de todo mundo, e o
// repo e publico. Por isso a pasta dados-origem/ inteira e gitignored.
//
// Idempotente: cada roteiro carrega a chave ID_AUTO da planilha e so entra se
// aquela chave ainda nao existir. Rodar duas vezes nao duplica nada.
//
// FOTOS HISTORICAS: nao migram, por decisao do gestor em 2026-08-03.
// Elas existem — a KM_DIARIO guarda LINHA_SAIDA/LINHA_CHEGADA apontando para a
// aba RESPOSTAS_ROTEIRO, e de la sai a foto do painel de 274 dos 276 roteiros.
// O problema e o formato: "https://drive.google.com/open?id=..." e pagina do
// Drive, nao imagem. Gravar isso em foto_painel_saida faria a tela /historico
// renderizar 274 imagens quebradas, que passa a impressao de sistema com
// defeito — pior do que assumir que o roteiro antigo nao tem foto.
//
// Para trazer as fotos de verdade um dia: baixar cada uma via
// "https://drive.google.com/uc?export=download&id=<ID>" (exige acesso
// autenticado ao Drive) e subir no bucket `roteiros` do Storage. E trabalho a
// parte, e so vale a pena se aparecer a necessidade real de consultar foto de
// roteiro antigo.

import XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Aceita um caminho: `node scripts/migrar.mjs ../outra/planilha.xlsx`.
// Sem argumento, usa dados-origem/ ao lado do projeto. O SQL sai na mesma pasta
// da planilha — que e gitignored justamente por isso.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRADA = process.argv[2]
  ? resolve(process.argv[2])
  : join(RAIZ, "dados-origem", "CONTROLE_DE_FROTA.xlsx");
const SAIDA = join(dirname(ENTRADA), "historico.sql");

// ---------------------------------------------------------------------------
// Mapa de tecnicos — CONFIRMADO PELO GESTOR em 2026-08-03.
// A esquerda: como aparece na planilha (sem acento, maiusculo, espaco unico).
// A direita: a pessoa. O guia proibe adivinhar isso sozinho, e com razao:
// "RAFAEL AVILA - DOUGLAS DE SENA" sao duas pessoas num roteiro so.
// ---------------------------------------------------------------------------
const TECNICOS = {
  "LEONARDO ALVES": "Leonardo Alves",
  "VICTOR ALEXANDRE": "Victor Alexandre",
  "LEONARDO OLIVEIRA": "Leonardo Oliveira",
  "IGOR PEDROSA": "Igor Pedrosa",
  "IGOR": "Igor Pedrosa",
  "IGOR PEDROSA DA SILVA": "Igor Pedrosa",
  "RAFAEL AVILA": "Rafael Ávila",
  "RAFEL AVILA": "Rafael Ávila",
  "ALEXANDRE BRITO": "Alexandre Brito",
  "LUIZ HENRIQUE": "Luiz Henrique",
  "HENRIQUE": "Luiz Henrique",
  "LUIZA HENRIQUE": "Luiz Henrique",
  "DOUGLAS DE SENA": "Douglas de Sena",
  "DOUGLAS DE SENNA": "Douglas de Sena",
  "MATHEUS RODRIGUES": "Matheus Rodrigues",
  "MATHEUS": "Matheus Rodrigues",
  "SILVIO SANTOS": "Silvio Santos",
  // Sem espaco e so o primeiro nome. Vieram do historico.sql de 2026-08-04,
  // que ja resolvia os dois; nao ha outro Rafael nem outro Igor no mapa.
  "IGORPEDROSA": "Igor Pedrosa",
  "RAFAEL": "Rafael Ávila",
};

// Campo com duas pessoas: a primeira dirige, a segunda vai para a observacao.
// Decisao do gestor (opcao "a"), 2026-08-03.
const SEPARADOR_DUPLA = /\s*(?:-|\/|,|\se\s)\s*/i;

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------
const chave = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();

const placa = (s) => String(s ?? "").toUpperCase().replace(/[\s-]/g, "").trim();

// "FIORINO - SRT9D65" -> SRT9D65 ; "STRADA - SRT 9D55" -> SRT9D55
function placaDe(texto) {
  const partes = String(texto ?? "").split(/\s-\s|-/).map((x) => x.trim()).filter(Boolean);
  return partes.length ? placa(partes[partes.length - 1]) : null;
}

const inteiro = (v) => {
  if (v == null || String(v).trim() === "") return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
};

// ---------------------------------------------------------------------------
// Data e hora: le o SERIAL do Excel, nunca o texto ao lado dele.
//
// Na planilha a celula de data e um numero (46160 = 18/05/2026). O texto que
// aparece na tela e so um formato, e o formato segue o locale de quem exportou:
// o Google escreve "18/05/2026", exports antigos vinham "5/18/26". Ler o texto
// obriga a adivinhar a ordem, e adivinhar errado NAO da erro — "05/06/2026"
// vira 6 de maio em vez de 5 de junho, calado, em toda linha do ano cujo dia
// seja <= 12. Foi o que aconteceu: o script assumia M/D/A e a planilha passou
// a sair D/M/A.
//
// parse_date_code devolve os componentes do calendario direto do serial, sem
// passar por Date e portanto sem fuso — converter serial via Date recuaria um
// dia inteiro em UTC-3, que e o mesmo bug de lib/frota/tempo.ts.
// ---------------------------------------------------------------------------

// quantas celulas cairam no caminho de texto (nao deveria acontecer)
let dataPorTexto = 0;

function serial(v) {
  if (typeof v === "number" && Number.isFinite(v)) return XLSX.SSF.parse_date_code(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // cellDates ja converteu: usa os componentes LOCAIS, nunca toISOString
    return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(),
             H: v.getHours(), M: v.getMinutes(), S: v.getSeconds() };
  }
  return null;
}

const dd = (n) => String(n).padStart(2, "0");

const TEXTO_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

// "26" e "0026" sao 2026. A planilha tem as duas grafias.
function ano4(a) {
  const n = +a;
  return n < 100 ? 2000 + n : n;
}

// Descobre se uma COLUNA de texto esta em M/D/A ou D/M/A, olhando as linhas em
// que o proprio valor desfaz a duvida (um dos dois numeros passa de 12). Uma
// linha isolada como "05/06/2026" e indecifravel; a coluna inteira quase nunca
// e. Se as evidencias se contradizerem, devolve null e ninguem chuta.
function inferirOrdem(valores) {
  let mda = 0, dma = 0;
  for (const v of valores) {
    if (typeof v !== "string") continue;
    const m = v.trim().match(TEXTO_DATA);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dma++;
    else if (b > 12 && a <= 12) mda++;
  }
  if (mda && dma) return null;
  return mda ? "MDA" : dma ? "DMA" : null;
}

// 46160 -> "2026-05-18". Devolve null se nao der para confiar.
function dataISO(v, ordem = null) {
  if (v == null || v === "") return null;
  const c = serial(v);
  if (c) {
    if (!c.y || c.y < 2020 || c.y > 2030) return null;
    return `${c.y}-${dd(c.m)}-${dd(c.d)}`;
  }
  // Sobra: a celula veio como texto. Usa a ordem inferida da coluna; sem ela,
  // so aceita quando a propria linha desfaz a duvida.
  const m = String(v).trim().match(TEXTO_DATA);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  const ano = ano4(m[3]);
  if (ano < 2020 || ano > 2030) return null;
  let dia, mes;
  if (a > 12 && b <= 12) { dia = a; mes = b; }
  else if (b > 12 && a <= 12) { mes = a; dia = b; }
  else if (ordem === "MDA") { mes = a; dia = b; }
  else if (ordem === "DMA") { dia = a; mes = b; }
  else return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  dataPorTexto++;
  return `${ano}-${dd(mes)}-${dd(dia)}`;
}

// 0.3715 (fracao do dia) / "8:55" / "4:34:00 PM" -> "08:55:00"
function horaISO(v) {
  if (v == null || v === "") return "00:00:00";
  const c = serial(v);
  if (c) return `${dd(c.H)}:${dd(c.M)}:${dd(c.S)}`;
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return "00:00:00";
  let h = +m[1];
  const min = m[2];
  const seg = m[3] ?? "00";
  const ampm = (m[4] || "").toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${dd(h)}:${min}:${seg}`;
}

const ts = (d, h) => (d ? `${d} ${horaISO(h)}` : null);

// aspas simples de SQL
const sql = (v) => (v == null || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const sqlNum = (v) => (v == null ? "NULL" : String(v));
const sqlBool = (v) => (v == null ? "NULL" : v ? "true" : "false");
const sqlArr = (a) => `array[${a.map((x) => sql(x)).join(", ")}]::text[]`;

// Resolve o campo de tecnico. Devolve { nome, acompanhante, bruto, desconhecido }
function resolverTecnico(bruto) {
  const original = String(bruto ?? "").trim();
  if (!original) return { nome: null, acompanhante: null, bruto: null, desconhecido: false };

  const k = chave(original);
  if (TECNICOS[k]) return { nome: TECNICOS[k], acompanhante: null, bruto: original, desconhecido: false };

  // duas pessoas no mesmo campo
  const partes = k.split(SEPARADOR_DUPLA).map((p) => p.trim()).filter(Boolean);
  if (partes.length > 1) {
    const nomes = partes.map((p) => TECNICOS[p]).filter(Boolean);
    if (nomes.length >= 1) {
      return {
        nome: nomes[0],
        acompanhante: nomes.slice(1).join(", ") || partes.slice(1).join(", "),
        bruto: original,
        desconhecido: false,
      };
    }
  }
  return { nome: null, acompanhante: null, bruto: original, desconhecido: true };
}

// ---------------------------------------------------------------------------
// leitura
// ---------------------------------------------------------------------------
// raw: true de proposito — queremos o valor da celula, nao o texto formatado.
// Data e hora dependem disso (ver dataISO); o resto e texto e nao muda.
const wb = XLSX.readFile(ENTRADA);
const ler = (aba) => XLSX.utils.sheet_to_json(wb.Sheets[aba], { defval: null, raw: true });

const roteiros = ler("KM_DIARIO");

// A ordem e da COLUNA, nao da linha: as duas datas do roteiro saem do mesmo
// formulario, entao a evidencia das duas junta decide melhor que cada uma so.
const ordemRoteiro = inferirOrdem([
  ...roteiros.map((l) => l["DATA_SAÍDA"]),
  ...roteiros.map((l) => l["DATA_CHEGADA"]),
]);

const limpos = [];
const quarentena = [];
const pessoas = new Set(Object.values(TECNICOS));
const desconhecidos = new Set();

for (const l of roteiros) {
  const motivos = [];

  const p = placaDe(l["VEÍCULO"]);
  const tSaida = resolverTecnico(l["TÉCNICO_SAÍDA"]);
  const tChegada = resolverTecnico(l["TÉCNICO_CHEGADA"]);
  const dSaida = dataISO(l["DATA_SAÍDA"], ordemRoteiro);
  const dChegada = dataISO(l["DATA_CHEGADA"], ordemRoteiro);
  const kSaida = inteiro(l["KM_SAÍDA"]);
  const kChegada = inteiro(l["KM_CHEGADA"]);

  if (!p) motivos.push("veiculo nao identificado");
  if (!dSaida) motivos.push("data de saida ilegivel");
  if (kSaida == null) motivos.push("sem km de saida");
  if (!tSaida.nome) motivos.push(tSaida.desconhecido ? "tecnico de saida desconhecido" : "sem tecnico de saida");
  if (tSaida.desconhecido) desconhecidos.add(tSaida.bruto);
  if (tChegada.desconhecido) desconhecidos.add(tChegada.bruto);

  const temChegada = kChegada != null && dChegada != null;
  if (!temChegada) {
    motivos.push("sem chegada (roteiro aberto)");
  } else {
    if (kSaida != null && kChegada < kSaida) motivos.push("km de chegada menor que o de saida");
    else if (kSaida != null && kChegada - kSaida > 600) motivos.push("km rodado acima de 600");
    if (dSaida && dChegada < dSaida) motivos.push("chegada antes da saida");
  }

  // observacao: junta o que a planilha tinha + quem estava junto
  const obs = [
    l["OBS_SAÍDA"],
    tSaida.acompanhante ? `acompanhado de ${tSaida.acompanhante}` : null,
  ].filter(Boolean).join(" · ") || null;
  const obsChegada = [
    l["OBS_CHEGADA"],
    tChegada.acompanhante ? `acompanhado de ${tChegada.acompanhante}` : null,
  ].filter(Boolean).join(" · ") || null;

  const reg = {
    id_auto: l["ID_AUTO"],
    placa: p,
    veiculo_bruto: l["VEÍCULO"],
    tecnico_saida: tSaida.nome,
    tecnico_saida_bruto: tSaida.bruto,
    tecnico_chegada: tChegada.nome,
    tecnico_chegada_bruto: tChegada.bruto,
    saida_em: ts(dSaida, l["HORA_SAÍDA"]),
    km_saida: kSaida,
    chegada_em: temChegada ? ts(dChegada, l["HORA_CHEGADA"]) : null,
    km_chegada: temChegada ? kChegada : null,
    status: l["STATUS"],
    houve_pendencia: l["HOUVE_PENDÊNCIA"] ? /SIM/i.test(l["HOUVE_PENDÊNCIA"]) : null,
    descricao_pendencias: l["DESCRIÇÃO_PENDÊNCIAS"],
    obs_saida: obs,
    obs_chegada: obsChegada,
    motivos,
  };

  if (motivos.length) quarentena.push(reg);
  else limpos.push(reg);
}

// ---------------------------------------------------------------------------
// checklists — a aba de respostas do Google Forms
//
// A vistoria semanal existia como formulario antes do app. O `itens` reproduz
// o formato que app/checklist/page.tsx grava hoje, para a tela /historico ler
// igual o que veio da planilha e o que a equipe lanca agora.
//
// As perguntas do Forms sao guardadas com a resposta CRUA ("SIM"/"NAO"), sem
// traduzir para "esta bom". "PAINEL APRESENTA ALGUMA LUZ DE ALERTA? = SIM" e
// um problema, "PNEUS EM BOAS CONDICOES? = SIM" nao e — inverter um e esquecer
// o outro seria pior do que guardar o que a pessoa respondeu.
// ---------------------------------------------------------------------------
const PERGUNTAS = {
  pneus: "PNEUS EM BOAS CONDIÇÕES?",
  farois: "FARÓIS FUNCIONANDO?",
  lanternas: "LANTERNAS FUNCIONANDO?",
  setas: "SETAS FUNCIONANDO?",
  luz_freio: "LUZ DE FREIO FUNCIONANDO?",
  vidros: "VIDROS FUNCIONANDO?",
  travas: "TRAVAS FUNCIONANDO?",
  ar: "AR CONDICIONADO FUNCIONANDO?",
  retrovisores: "RETROVISORES EM BOM ESTADO?",
  luz_painel: "PAINEL APRESENTA ALGUMA LUZ DE ALERTA?",
  barulho: "VEÍCULO APRESENTA BARULHO OU ALGUM COMPORTAMENTO ESTRANHO?",
};

const checklists = [];
const checklistsQuarentena = [];

const respostasChecklist = ler("RESPOSTAS CHECKLIST VEICULAR SE");
const ordemChecklist = inferirOrdem(respostasChecklist.map((l) => l["DATA DA VISTORIA"]));

for (const l of respostasChecklist) {
  const p = placaDe(l["MODELO E PLACA VEÍCULO"]);
  const t = resolverTecnico(l["NOME DO CONDUTOR"]);
  const data = dataISO(l["DATA DA VISTORIA"], ordemChecklist);
  const km = inteiro(l["KM ATUAL"]);

  if (t.desconhecido) desconhecidos.add(t.bruto);

  // Sem veiculo, sem pessoa ou sem data nao da para gravar: a FK exige as duas
  // primeiras e a terceira e a chave de idempotencia.
  if (!p || !t.nome || !data) {
    checklistsQuarentena.push({ placa: p, condutor: t.bruto, data, km });
    continue;
  }
  if (t.nome) pessoas.add(t.nome);

  const itens = {
    usado_por_outro: l["O VEÍCULO FOI UTILIZADO POR OUTRO CONDUTOR ANTES DESTA VISTORIA?"] ?? null,
    checklist: Object.fromEntries(
      Object.entries(PERGUNTAS).map(([k, pergunta]) => [k, l[pergunta] ?? null])
    ),
    nova_avaria: l["O VEÍCULO APRESENTA ALGUMA NOVA AVARIA?"] ?? null,
    avaria:
      l["O VEÍCULO APRESENTA ALGUMA NOVA AVARIA?"] === "SIM"
        ? {
            onde: l["ONDE?"] ?? null,
            tipo: l["TIPO DE AVARIA?"] ?? null,
            ja_existia: l["A AVARIA JÁ EXISTIA?"] ?? null,
            descricao: l["DESCREVA RAPIDAMENTE"] ?? null,
            fotos: [],
          }
        : null,
    // Vazias de proposito: no Forms a foto e link de PAGINA do Drive, nao de
    // imagem. Gravar isso faria a /historico mostrar imagem quebrada. Mesma
    // decisao das fotos de roteiro (ver cabecalho).
    fotos_semanais: [],
    fotos_bloqueio: [],
    origem: "PLANILHA",
  };

  // 7 respostas nao marcaram o campo "apto". Nao da para presumir apto: quem
  // nao respondeu pode ter parado no meio justamente por ter achado problema.
  // Fica false (bloqueado) com a marca de que foi o formulario que faltou, e
  // nao a pessoa que reprovou o veiculo.
  const aptoBruto = l["VEÍCULO APTO PARA OPERAÇÃO?"];
  if (aptoBruto == null || aptoBruto === "") itens.apto_nao_respondido = true;

  checklists.push({
    placa: p,
    tecnico: t.nome,
    data,
    km,
    itens,
    apto: aptoBruto === "SIM",
    motivo_bloqueio: l["MOTIVO DO BLOQUEIO"],
    descricao: l["DESCREVA O MOTIVO"],
    urgencia: l["GRAU DE URGÊNCIA"],
  });
}

// ---------------------------------------------------------------------------
// manutencoes — a aba que a planilha ja mantinha a mao
//
// Sem quarentena aqui: sao 6 linhas preenchidas por uma pessoa so, nao 368
// respostas de formulario. Se alguma nao tiver placa reconhecivel o insert
// simplesmente nao acontece (o `where veic is not null` cuida), e o relatorio
// diz quantas entraram.
// ---------------------------------------------------------------------------
const manutencoes = [];

for (const l of ler("MANUTENÇÕES_VEÍCULOS")) {
  const p = placa(l["PLACA"]) || placaDe(l["VEÍCULO"]);
  if (!p) continue;
  const resp = resolverTecnico(l["RESPONSÁVEL"]);
  if (resp.desconhecido) desconhecidos.add(resp.bruto);

  manutencoes.push({
    placa: p,
    aberta_em: dataISO(l["DATA_ABERTURA"]),
    km_abertura: inteiro(l["KM_ABERTURA"]),
    origem: l["ORIGEM"],
    tipo: l["TIPO_MANUTENÇÃO"],
    descricao_problema: l["DESCRIÇÃO_PROBLEMA"],
    prioridade: l["PRIORIDADE"],
    responsavel: resp.nome,
    oficina: l["FORNECEDOR_OFICINA"],
    orcamento: l["ORÇAMENTO"] ?? null,
    status: l["STATUS"],
    concluida_em: dataISO(l["DATA_CONCLUSÃO"]),
    valor_final: l["VALOR_FINAL"] ?? null,
    servico_realizado: l["SERVIÇO_REALIZADO"],
    pecas_trocadas: l["OBS"],
    proxima_revisao_km: inteiro(l["PRÓXIMA_REVISÃO_KM"]),
  });
}

// ---------------------------------------------------------------------------
// geracao do SQL
// ---------------------------------------------------------------------------
const out = [];
const w = (s = "") => out.push(s);

w("-- Historico da planilha CONTROLE_DE_FROTA.xlsx");
w("-- GERADO por scripts/migrar.mjs — nao edite a mao, rode o script de novo.");
w("--");
w("-- NAO VERSIONE ESTE ARQUIVO: tem nome de tecnico e o repositorio e publico.");
w("--");
w("-- Pre-requisito: migration 0008_roteiros_quarentena.sql aplicada.");
w("-- Idempotente: cada roteiro carrega a chave ID_AUTO da planilha; rodar de");
w("-- novo nao duplica. Roda inteiro numa transacao — ou entra tudo, ou nada.");
w("--");
w(`-- roteiros limpos:    ${limpos.length}`);
w(`-- para a quarentena:  ${quarentena.length}`);
w("");
w("begin;");
w("");

// --- tecnicos ---
w("-- ============ tecnicos ============");
w("-- So cria quem ainda nao existe. A comparacao ignora acento e caixa para");
w("-- nao criar 'Rafael Avila' ao lado do 'Rafael Ávila' que ja esta la.");
w("insert into tecnicos (nome)");
w("select v.nome from (values");
w([...pessoas].sort().map((n) => `  (${sql(n)})`).join(",\n"));
w(") as v(nome)");
w("where not exists (");
w("  select 1 from tecnicos t");
w("  where upper(translate(t.nome,");
w("    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',");
w("    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))");
w("      = upper(translate(v.nome,");
w("    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',");
w("    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))");
w(");");
w("");

// helper de lookup usado nos inserts
w("-- atalhos de resolucao (mesma comparacao sem acento/caixa)");
w("create or replace function pg_temp.tec(p_nome text) returns uuid");
w("language sql stable as $$");
w("  select id from tecnicos where upper(translate(nome,");
w("    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',");
w("    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))");
w("    = upper(translate(p_nome,");
w("    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',");
w("    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) limit 1");
w("$$;");
w("");
w("create or replace function pg_temp.veic(p_placa text) returns uuid");
w("language sql stable as $$");
w("  select id from veiculos where replace(replace(upper(placa),' ',''),'-','') = p_placa limit 1");
w("$$;");
w("");

// --- roteiros limpos ---
w("-- ============ roteiros (" + limpos.length + ") ============");
w("-- A chave de idempotencia e o ID_AUTO da planilha, guardado em obs_saida?");
w("-- Nao: roteiros nao tem coluna para isso. Usamos a combinacao");
w("-- (veiculo, saida_em, km_saida), que e unica na pratica e nao exige");
w("-- mudar o schema so por causa da importacao.");
for (const r of limpos) {
  w(`insert into roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida, obs_saida,`);
  w(`  tecnico_chegada_id, chegada_em, km_chegada, obs_chegada, houve_pendencia, descricao_pendencias)`);
  w(`select pg_temp.veic(${sql(r.placa)}), pg_temp.tec(${sql(r.tecnico_saida)}), ${sql(r.saida_em)}::timestamptz, ${sqlNum(r.km_saida)}, ${sql(r.obs_saida)},`);
  w(`  ${r.tecnico_chegada ? `pg_temp.tec(${sql(r.tecnico_chegada)})` : "NULL"}, ${r.chegada_em ? `${sql(r.chegada_em)}::timestamptz` : "NULL"}, ${sqlNum(r.km_chegada)}, ${sql(r.obs_chegada)}, ${sqlBool(r.houve_pendencia)}, ${sql(r.descricao_pendencias)}`);
  w(`where pg_temp.veic(${sql(r.placa)}) is not null`);
  w(`  and pg_temp.tec(${sql(r.tecnico_saida)}) is not null`);
  w(`  and not exists (select 1 from roteiros x where x.veiculo_id = pg_temp.veic(${sql(r.placa)})`);
  w(`    and x.saida_em = ${sql(r.saida_em)}::timestamptz and x.km_saida = ${sqlNum(r.km_saida)});`);
}
w("");

// --- quarentena ---
w("-- ============ quarentena (" + quarentena.length + ") ============");
for (const r of quarentena) {
  w(`insert into roteiros_quarentena (origem, linha_origem, veiculo_id, veiculo_bruto,`);
  w(`  tecnico_saida_id, tecnico_saida_bruto, tecnico_chegada_id, tecnico_chegada_bruto,`);
  w(`  saida_em, km_saida, chegada_em, km_chegada, status_planilha, houve_pendencia,`);
  w(`  descricao_pendencias, obs, motivos)`);
  w(`values ('PLANILHA', ${sql(r.id_auto)}, pg_temp.veic(${sql(r.placa)}), ${sql(r.veiculo_bruto)},`);
  w(`  ${r.tecnico_saida ? `pg_temp.tec(${sql(r.tecnico_saida)})` : "NULL"}, ${sql(r.tecnico_saida_bruto)}, ${r.tecnico_chegada ? `pg_temp.tec(${sql(r.tecnico_chegada)})` : "NULL"}, ${sql(r.tecnico_chegada_bruto)},`);
  w(`  ${r.saida_em ? `${sql(r.saida_em)}::timestamptz` : "NULL"}, ${sqlNum(r.km_saida)}, ${r.chegada_em ? `${sql(r.chegada_em)}::timestamptz` : "NULL"}, ${sqlNum(r.km_chegada)}, ${sql(r.status)}, ${sqlBool(r.houve_pendencia)},`);
  w(`  ${sql(r.descricao_pendencias)}, ${sql([r.obs_saida, r.obs_chegada].filter(Boolean).join(" · ") || null)}, ${sqlArr(r.motivos)})`);
  w(`on conflict (origem, linha_origem) where linha_origem is not null do nothing;`);
}
// --- checklists ---
w("-- ============ checklists (" + checklists.length + ") ============");
w("-- O `itens` reproduz o formato que app/checklist/page.tsx grava hoje, para");
w("-- a tela /historico ler igual o que veio da planilha e o que a equipe lanca.");
w("-- As fotos ficam como lista vazia: no Forms elas sao link de pagina do Drive.");
for (const c of checklists) {
  w(`insert into checklists (veiculo_id, tecnico_id, data, km_atual, itens, apto, motivo_bloqueio, descricao, urgencia)`);
  w(`select pg_temp.veic(${sql(c.placa)}), pg_temp.tec(${sql(c.tecnico)}), ${sql(c.data)}::date, ${sqlNum(c.km)}, ${sql(JSON.stringify(c.itens))}::jsonb, ${c.apto ? "true" : "false"}, ${sql(c.motivo_bloqueio)}, ${sql(c.descricao)}, ${sql(c.urgencia)}`);
  w(`where pg_temp.veic(${sql(c.placa)}) is not null and pg_temp.tec(${sql(c.tecnico)}) is not null`);
  w(`  and not exists (select 1 from checklists x where x.veiculo_id = pg_temp.veic(${sql(c.placa)})`);
  w(`    and x.data = ${sql(c.data)}::date and x.km_atual = ${sqlNum(c.km)});`);
}
w("");

// --- manutencoes ---
w("-- ============ manutencoes (" + manutencoes.length + ") ============");
for (const m of manutencoes) {
  const veic = `pg_temp.veic(${sql(m.placa)})`;
  w(`insert into manutencoes (veiculo_id, aberta_em, km_abertura, origem, tipo, descricao_problema,`);
  w(`  prioridade, responsavel_id, oficina, orcamento, status, concluida_em, valor_final,`);
  w(`  servico_realizado, pecas_trocadas, proxima_revisao_km)`);
  w(`select ${veic}, ${m.aberta_em ? `${sql(m.aberta_em)}::date` : "NULL"}, ${sqlNum(m.km_abertura)}, ${sql(m.origem)}, ${sql(m.tipo)}, ${sql(m.descricao_problema)},`);
  w(`  ${sql(m.prioridade)}, ${m.responsavel ? `pg_temp.tec(${sql(m.responsavel)})` : "NULL"}, ${sql(m.oficina)}, ${sqlNum(m.orcamento)}, ${sql(m.status)}, ${m.concluida_em ? `${sql(m.concluida_em)}::date` : "NULL"}, ${sqlNum(m.valor_final)},`);
  w(`  ${sql(m.servico_realizado)}, ${sql(m.pecas_trocadas)}, ${sqlNum(m.proxima_revisao_km)}`);
  w(`where ${veic} is not null`);
  w(`  and not exists (select 1 from manutencoes x where x.veiculo_id = ${veic}`);
  w(`    and x.descricao_problema = ${sql(m.descricao_problema)});`);
}
w("");
w("commit;");
w("");
w("-- conferencia depois de rodar:");
w("--   select count(*) from roteiros;");
w("--   select count(*) from checklists;");
w("--   select count(*) from manutencoes;");
w("--   select motivos, count(*) from roteiros_quarentena group by motivos order by 2 desc;");

writeFileSync(SAIDA, out.join("\n"), "utf8");

// ---------------------------------------------------------------------------
// relatorio
// ---------------------------------------------------------------------------
console.log("planilha:", roteiros.length, "roteiros em KM_DIARIO");
console.log("  limpos:     ", limpos.length);
console.log("  quarentena: ", quarentena.length);
console.log("");
const porMotivo = {};
for (const r of quarentena) for (const m of r.motivos) porMotivo[m] = (porMotivo[m] || 0) + 1;
for (const [m, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
  console.log("   " + String(n).padStart(4) + "x  " + m);
}
console.log("");
if (dataPorTexto) {
  console.log("");
  console.log(`nota: ${dataPorTexto} data(s) vieram como TEXTO, nao como serial do Excel.`);
  console.log(`      ordem inferida da coluna — roteiros: ${ordemRoteiro ?? "indefinida"}` +
              `, checklists: ${ordemChecklist ?? "indefinida"}.`);
  console.log("      O que a coluna nao decidiu ficou de fora, sem chute.");
}

console.log("");
console.log(`checklists:   ${checklists.length}` +
  (checklistsQuarentena.length ? `  (${checklistsQuarentena.length} fora: sem veiculo, pessoa ou data)` : ""));
console.log(`manutencoes:  ${manutencoes.length}`);

console.log("");
console.log("pessoas que o SQL vai garantir em tecnicos:", pessoas.size);
for (const p of [...pessoas].sort()) console.log("   - " + p);
if (desconhecidos.size) {
  console.log("");
  console.log("NOMES NAO MAPEADOS (viram quarentena, ninguem e inventado):");
  for (const d of desconhecidos) console.log("   - " + JSON.stringify(d));
}
console.log("");
console.log("gerado:", SAIDA);
