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
  "RAFAEL": "Rafael Ávila",
  "IGORPEDROSA": "Igor Pedrosa",
  "ALEXANDRE BRITO": "Alexandre Brito",
  "LUIZ HENRIQUE": "Luiz Henrique",
  "HENRIQUE": "Luiz Henrique",
  "LUIZA HENRIQUE": "Luiz Henrique",
  "DOUGLAS DE SENA": "Douglas de Sena",
  "DOUGLAS DE SENNA": "Douglas de Sena",
  "MATHEUS RODRIGUES": "Matheus Rodrigues",
  "MATHEUS": "Matheus Rodrigues",
  "SILVIO SANTOS": "Silvio Santos",
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
// DATA — o formato NAO e fixo, e assumir errado corrompe em silencio.
//
// O export de 17/07/2026 veio "5/18/26" (mes/dia). O de 04/08/2026 veio
// "18/05/2026" (dia/mes) — mesma planilha, mesmo roteiro. Depende da locale de
// quem exporta.
//
// O risco nao esta em "18/05": mes 18 nao existe e estoura na hora. Esta em
// "07/08", onde os dois numeros cabem nas duas posicoes: viraria 8 de julho em
// vez de 7 de agosto sem erro nenhum, em ~1/3 das linhas.
//
// Entao detectamos o formato a partir dos dados: onde um dos campos passa de
// 12, ele so pode ser o dia. Se houver prova das duas ordens no mesmo arquivo,
// a planilha esta inconsistente e o script PARA — nao ha palpite seguro.
// ---------------------------------------------------------------------------
const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

// A deteccao e POR FONTE, nao por arquivo: no export de 04/08/2026 a KM_DIARIO
// veio "18/05/2026" (dia/mes) e a aba de checklist veio "5/13/26" (mes/dia), no
// mesmo .xlsx. Faz sentido — o checklist e a resposta crua do Forms, enquanto a
// KM_DIARIO e derivada, onde alguem formatou a coluna em pt-BR.
function detectarFormatoData(valores, nomeDaFonte, fallback = null) {
  let diaPrimeiro = 0, mesPrimeiro = 0;
  const provaDia = [], provaMes = [];
  for (const v of valores) {
    const m = String(v ?? "").trim().match(RE_DATA);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) { diaPrimeiro++; if (provaDia.length < 3) provaDia.push(v); }
    else if (b > 12 && a <= 12) { mesPrimeiro++; if (provaMes.length < 3) provaMes.push(v); }
  }
  // Duas ordens DENTRO da mesma fonte e sujeira de verdade: nao ha palpite bom.
  if (diaPrimeiro && mesPrimeiro) {
    throw new Error(
      `${nomeDaFonte}: datas em DUAS ordens diferentes na mesma aba — nao da para migrar em seguranca.\n` +
      `  parecem D/M/AAAA: ${diaPrimeiro} (ex.: ${provaDia.join(", ")})\n` +
      `  parecem M/D/AAAA: ${mesPrimeiro} (ex.: ${provaMes.join(", ")})\n` +
      `  Padronize a coluna no Google Sheets e exporte de novo.`,
    );
  }
  if (diaPrimeiro) return { ordem: "DMA", evidencia: diaPrimeiro, exemplo: provaDia[0], herdado: false };
  if (mesPrimeiro) return { ordem: "MDA", evidencia: mesPrimeiro, exemplo: provaMes[0], herdado: false };

  // Nenhum dia passou de 12 (aba pequena, ou so datas do inicio do mes).
  if (fallback) return { ...fallback, evidencia: 0, herdado: true };
  throw new Error(
    `${nomeDaFonte}: nao da para saber se as datas sao D/M ou M/D — nenhum dia passa de 12.\n` +
    "  Sem essa prova, metade das datas entraria trocada em silencio.\n" +
    "  Formate a coluna como AAAA-MM-DD no Google Sheets e exporte de novo.",
  );
}

// "18/05/2026" -> "2026-05-18". Devolve null se nao der para confiar.
function dataISO(v, fmt) {
  if (!v) return null;
  const m = String(v).trim().match(RE_DATA);
  if (!m) return null;
  let dia, mes;
  if (fmt.ordem === "DMA") { dia = +m[1]; mes = +m[2]; }
  else { mes = +m[1]; dia = +m[2]; }
  // O ano vem em tres formatos no mesmo arquivo: "2026", "26" e "0026" — este
  // ultimo e defeito do export do Google (24 checklists vieram assim). Todos
  // querem dizer a mesma coisa; abaixo de 100 e ano de dois digitos.
  let ano = +m[3];
  if (ano < 100) ano += 2000;
  if (ano < 2020 || ano > 2030) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// "8:55" / "4:34:00 PM" -> "08:55:00"
function horaISO(v) {
  if (!v) return "00:00:00";
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return "00:00:00";
  let h = +m[1];
  const min = m[2];
  const seg = m[3] ?? "00";
  const ampm = (m[4] || "").toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}:${seg}`;
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
const wb = XLSX.readFile(ENTRADA, { cellDates: true });
const ler = (aba) => XLSX.utils.sheet_to_json(wb.Sheets[aba], { defval: null, raw: false });

const roteiros = ler("KM_DIARIO");

// Descobrir a ordem das datas ANTES de interpretar qualquer uma. Olha as duas
// colunas de data juntas: quanto mais amostra, mais chance de achar um dia > 12.
const checklistsBrutos = ler("RESPOSTAS CHECKLIST VEICULAR SE");
const manutencoesBrutas = ler("MANUTENÇÕES_VEÍCULOS");

// Uma deteccao por aba. A KM_DIARIO e a maior amostra, entao serve de fallback
// para as abas pequenas onde nenhum dia passa de 12.
const FMT_ROTEIROS = detectarFormatoData(
  roteiros.flatMap((l) => [l["DATA_SAÍDA"], l["DATA_CHEGADA"]]), "KM_DIARIO",
);
const FMT_CHECKLIST = detectarFormatoData(
  checklistsBrutos.map((l) => l["DATA DA VISTORIA"]), "RESPOSTAS CHECKLIST", FMT_ROTEIROS,
);
const FMT_MANUT = detectarFormatoData(
  manutencoesBrutas.flatMap((l) => [l["DATA_ABERTURA"], l["DATA_CONCLUSÃO"]]), "MANUTENÇÕES_VEÍCULOS", FMT_ROTEIROS,
);

const rotuloFmt = (f) => (f.ordem === "DMA" ? "DIA/MES/ANO" : "MES/DIA/ANO") +
  (f.herdado ? "  (herdado da KM_DIARIO — nenhum dia > 12 nesta aba)" : `  (${f.evidencia} provam, ex.: ${f.exemplo})`);
console.log("formato de data por aba:");
console.log("   KM_DIARIO:            " + rotuloFmt(FMT_ROTEIROS));
console.log("   RESPOSTAS CHECKLIST:  " + rotuloFmt(FMT_CHECKLIST));
console.log("   MANUTENÇÕES_VEÍCULOS: " + rotuloFmt(FMT_MANUT));

const limpos = [];
const quarentena = [];
const pessoas = new Set(Object.values(TECNICOS));
const desconhecidos = new Set();

for (const l of roteiros) {
  const motivos = [];

  const p = placaDe(l["VEÍCULO"]);
  const tSaida = resolverTecnico(l["TÉCNICO_SAÍDA"]);
  const tChegada = resolverTecnico(l["TÉCNICO_CHEGADA"]);
  const dSaida = dataISO(l["DATA_SAÍDA"], FMT_ROTEIROS);
  const dChegada = dataISO(l["DATA_CHEGADA"], FMT_ROTEIROS);
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
// CHECKLISTS — a vistoria semanal. O `itens` jsonb reproduz o mesmo formato
// que app/checklist/page.tsx grava hoje, senao a tela /historico nao consegue
// ler o que veio da planilha.
// ---------------------------------------------------------------------------
const ITENS = [
  ["PNEUS EM BOAS CONDIÇÕES?", "pneus"],
  ["FARÓIS FUNCIONANDO?", "farois"],
  ["LANTERNAS FUNCIONANDO?", "lanternas"],
  ["SETAS FUNCIONANDO?", "setas"],
  ["LUZ DE FREIO FUNCIONANDO?", "luz_freio"],
  ["VIDROS FUNCIONANDO?", "vidros"],
  ["TRAVAS FUNCIONANDO?", "travas"],
  ["AR CONDICIONADO FUNCIONANDO?", "ar"],
  ["RETROVISORES EM BOM ESTADO?", "retrovisores"],
  ["PAINEL APRESENTA ALGUMA LUZ DE ALERTA?", "luz_painel"],
  ["VEÍCULO APRESENTA BARULHO OU ALGUM COMPORTAMENTO ESTRANHO?", "barulho"],
];
const URGENCIAS = ["BAIXA", "MÉDIA", "ALTA", "EMERGENCIAL"];

const checklists = [];
const checklistsPulados = [];
const semResposta = []; // vistorias anteriores a pergunta "veiculo apto?"

for (const l of checklistsBrutos) {
  const p = placaDe(l["MODELO E PLACA VEÍCULO"]);
  const t = resolverTecnico(l["NOME DO CONDUTOR"]);
  const d = dataISO(l["DATA DA VISTORIA"], FMT_CHECKLIST);
  const km = inteiro(l["KM ATUAL"]);
  const aptoTxt = String(l["VEÍCULO APTO PARA OPERAÇÃO?"] ?? "").trim();

  // A tabela exige veiculo, tecnico, data, km e apto. Sem um deles nao ha
  // checklist — nao ha o que inserir nem meia verdade a gravar.
  // `apto` e NOT NULL, mas 7 respostas antigas nao trazem a pergunta — ela
  // entrou no formulario depois. Nesses casos: se ha motivo de bloqueio, o
  // veiculo estava bloqueado; se nao ha nada, tratamos como apto e MARCAMOS a
  // ausencia no jsonb, para o registro nao afirmar o que a pessoa nao disse.
  const motivoBloqueio = (l["MOTIVO DO BLOQUEIO"] || "").trim();
  const aptoRespondido = /^(SIM|N[ÃA]O)$/i.test(aptoTxt);
  const apto = aptoRespondido ? /^SIM$/i.test(aptoTxt) : !motivoBloqueio;

  const falta = [];
  if (!p) falta.push("veiculo");
  if (!t.nome) falta.push(t.desconhecido ? `tecnico desconhecido (${t.bruto})` : "tecnico");
  if (!d) falta.push("data");
  if (km == null) falta.push("km");
  if (t.desconhecido) desconhecidos.add(t.bruto);

  if (falta.length) {
    checklistsPulados.push({ ref: `${l["MODELO E PLACA VEÍCULO"] ?? "?"} ${l["DATA DA VISTORIA"] ?? "?"}`, falta });
    continue;
  }

  const rapido = {};
  for (const [col, key] of ITENS) {
    const v = String(l[col] ?? "").trim().toUpperCase();
    rapido[key] = v || null;
  }

  const novaAvaria = String(l["O VEÍCULO APRESENTA ALGUMA NOVA AVARIA?"] ?? "").trim().toUpperCase() || null;
  const urg = String(l["GRAU DE URGÊNCIA"] ?? "").trim().toUpperCase();
  if (!aptoRespondido) semResposta.push(`${l["MODELO E PLACA VEÍCULO"] ?? "?"} ${l["DATA DA VISTORIA"] ?? "?"}`);

  checklists.push({
    placa: p,
    tecnico: t.nome,
    data: d,
    km,
    apto,
    motivo_bloqueio: apto ? null : (motivoBloqueio || null),
    descricao: apto ? null : (l["DESCREVA O MOTIVO"] || null),
    urgencia: URGENCIAS.includes(urg) ? urg : null,
    itens: {
      usado_por_outro: l["O VEÍCULO FOI UTILIZADO POR OUTRO CONDUTOR ANTES DESTA VISTORIA?"] || null,
      checklist: rapido,
      nova_avaria: novaAvaria,
      avaria: novaAvaria === "SIM" ? {
        onde: l["ONDE?"] || null,
        tipo: l["TIPO DE AVARIA?"] || null,
        ja_existia: l["A AVARIA JÁ EXISTIA?"] || null,
        descricao: l["DESCREVA RAPIDAMENTE"] || null,
        fotos: [],
      } : null,
      // vazio de proposito: as fotos sao link de pagina do Drive, nao imagem.
      fotos_semanais: [],
      fotos_bloqueio: [],
      origem: "PLANILHA",
      apto_nao_respondido: aptoRespondido ? undefined : true,
    },
  });
}

// ---------------------------------------------------------------------------
// MANUTENCOES — a aba MANUTENCOES_VEICULOS ja e a consolidada (abertura +
// andamento na mesma linha), como a KM_DIARIO e para os roteiros.
// ---------------------------------------------------------------------------
const ORIGENS = ["CHECKLIST SEMANAL", "ROTEIRO", "ACIDENTE/AVARIA", "PREVENTIVA PROGRAMADA", "OUTRO"];
const TIPOS = ["PREVENTIVA", "CORRETIVA"];
const PRIORIDADES = ["BAIXA", "MÉDIA", "ALTA", "EMERGENCIAL"];
const STATUS = ["ABERTA", "EM EXECUÇÃO", "CONCLUÍDA", "CANCELADA"];
const soSe = (lista, v) => (lista.includes(String(v ?? "").trim().toUpperCase()) ? String(v).trim().toUpperCase() : null);

const manutencoes = [];
const manutencoesPuladas = [];

for (const l of manutencoesBrutas) {
  const p = placa(l["PLACA"]) || placaDe(l["VEÍCULO"]);
  const problema = (l["DESCRIÇÃO_PROBLEMA"] || "").trim();
  if (!p || !problema) {
    manutencoesPuladas.push({ ref: l["ID_MANUTENCAO"] || "?", falta: !p ? "veiculo" : "descricao do problema" });
    continue;
  }
  const resp = resolverTecnico(l["RESPONSÁVEL"]);
  if (resp.desconhecido) desconhecidos.add(resp.bruto);

  manutencoes.push({
    id_origem: l["ID_MANUTENCAO"],
    placa: p,
    aberta_em: dataISO(l["DATA_ABERTURA"], FMT_MANUT),
    km_abertura: inteiro(l["KM_ABERTURA"]),
    origem: soSe(ORIGENS, l["ORIGEM"]),
    tipo: soSe(TIPOS, l["TIPO_MANUTENÇÃO"]),
    descricao_problema: problema,
    prioridade: soSe(PRIORIDADES, l["PRIORIDADE"]),
    responsavel: resp.nome,
    oficina: l["FORNECEDOR_OFICINA"] || null,
    orcamento: inteiro(l["ORÇAMENTO"]),
    status: soSe(STATUS, l["STATUS"]) ?? "ABERTA",
    concluida_em: dataISO(l["DATA_CONCLUSÃO"], FMT_MANUT),
    valor_final: inteiro(l["VALOR_FINAL"]),
    servico_realizado: l["SERVIÇO_REALIZADO"] || null,
    // a coluna OBS da planilha guarda justamente "PEÇAS TROCADAS: ..."
    pecas_trocadas: l["OBS"] || null,
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
  w(`select pg_temp.veic(${sql(c.placa)}), pg_temp.tec(${sql(c.tecnico)}), ${sql(c.data)}::date, ${sqlNum(c.km)}, ${sql(JSON.stringify(c.itens))}::jsonb, ${sqlBool(c.apto)}, ${sql(c.motivo_bloqueio)}, ${sql(c.descricao)}, ${sql(c.urgencia)}`);
  w(`where pg_temp.veic(${sql(c.placa)}) is not null and pg_temp.tec(${sql(c.tecnico)}) is not null`);
  w(`  and not exists (select 1 from checklists x where x.veiculo_id = pg_temp.veic(${sql(c.placa)})`);
  w(`    and x.data = ${sql(c.data)}::date and x.km_atual = ${sqlNum(c.km)});`);
}
w("");

// --- manutencoes ---
w("-- ============ manutencoes (" + manutencoes.length + ") ============");
for (const m of manutencoes) {
  w(`insert into manutencoes (veiculo_id, aberta_em, km_abertura, origem, tipo, descricao_problema,`);
  w(`  prioridade, responsavel_id, oficina, orcamento, status, concluida_em, valor_final,`);
  w(`  servico_realizado, pecas_trocadas, proxima_revisao_km)`);
  w(`select pg_temp.veic(${sql(m.placa)}), ${m.aberta_em ? `${sql(m.aberta_em)}::date` : "current_date"}, ${sqlNum(m.km_abertura)}, ${sql(m.origem)}, ${sql(m.tipo)}, ${sql(m.descricao_problema)},`);
  w(`  ${sql(m.prioridade)}, ${m.responsavel ? `pg_temp.tec(${sql(m.responsavel)})` : "NULL"}, ${sql(m.oficina)}, ${sqlNum(m.orcamento)}, ${sql(m.status)}, ${m.concluida_em ? `${sql(m.concluida_em)}::date` : "NULL"}, ${sqlNum(m.valor_final)},`);
  w(`  ${sql(m.servico_realizado)}, ${sql(m.pecas_trocadas)}, ${sqlNum(m.proxima_revisao_km)}`);
  w(`where pg_temp.veic(${sql(m.placa)}) is not null`);
  w(`  and not exists (select 1 from manutencoes x where x.veiculo_id = pg_temp.veic(${sql(m.placa)})`);
  w(`    and x.descricao_problema = ${sql(m.descricao_problema)});`);
}
w("");

if (checklistsPulados.length || manutencoesPuladas.length) {
  w("-- ============ NAO migrados (ficam registrados aqui, nao somem) ============");
  for (const c of checklistsPulados) w(`--   checklist ${c.ref}: falta ${c.falta.join(", ")}`);
  for (const m of manutencoesPuladas) w(`--   manutencao ${m.ref}: falta ${m.falta}`);
  w("");
}

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
console.log("roteiros (KM_DIARIO):", roteiros.length);
console.log("  limpos:     ", limpos.length);
console.log("  quarentena: ", quarentena.length);
console.log("checklists:", checklistsBrutos.length, "->", checklists.length, "migram");
if (semResposta.length) console.log("   " + semResposta.length + " checklists sem a pergunta \"veiculo apto?\" (marcados em itens.apto_nao_respondido)");
for (const c of checklistsPulados) console.log("   pulado:", c.ref, "— falta", c.falta.join(", "));
console.log("manutencoes:", manutencoesBrutas.length, "->", manutencoes.length, "migram");
for (const m of manutencoesPuladas) console.log("   pulada:", m.ref, "— falta", m.falta);
console.log("");
const porMotivo = {};
for (const r of quarentena) for (const m of r.motivos) porMotivo[m] = (porMotivo[m] || 0) + 1;
for (const [m, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
  console.log("   " + String(n).padStart(4) + "x  " + m);
}
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
