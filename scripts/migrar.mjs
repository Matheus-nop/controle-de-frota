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

// 46160 -> "2026-05-18". Devolve null se nao der para confiar.
function dataISO(v) {
  if (v == null || v === "") return null;
  const c = serial(v);
  if (c) {
    if (!c.y || c.y < 2020 || c.y > 2030) return null;
    return `${c.y}-${dd(c.m)}-${dd(c.d)}`;
  }
  // Sobra: planilha exportada com a data como texto. Ambiguo por natureza,
  // entao so aceita quando o proprio valor desfaz a duvida (dia > 12).
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, a, b, ano] = m;
  ano = ano.length === 2 ? "20" + ano : ano;
  if (ano.length !== 4 || +ano < 2020 || +ano > 2030) return null;
  let dia, mes;
  if (+a > 12 && +b <= 12) { dia = a; mes = b; }        // 18/05 -> D/M
  else if (+b > 12 && +a <= 12) { mes = a; dia = b; }   // 05/18 -> M/D
  else return null;                                     // 05/06: nao da para saber
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

const limpos = [];
const quarentena = [];
const pessoas = new Set(Object.values(TECNICOS));
const desconhecidos = new Set();

for (const l of roteiros) {
  const motivos = [];

  const p = placaDe(l["VEÍCULO"]);
  const tSaida = resolverTecnico(l["TÉCNICO_SAÍDA"]);
  const tChegada = resolverTecnico(l["TÉCNICO_CHEGADA"]);
  const dSaida = dataISO(l["DATA_SAÍDA"]);
  const dChegada = dataISO(l["DATA_CHEGADA"]);
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
w("");
w("commit;");
w("");
w("-- conferencia depois de rodar:");
w("--   select count(*) from roteiros;");
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
  console.log(`ATENCAO: ${dataPorTexto} data(s) vieram como TEXTO, nao como`);
  console.log("serial do Excel. Foram lidas pela ordem do proprio valor (dia > 12),");
  console.log("e as ambiguas viraram quarentena. Confira uma linha antes de aplicar.");
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
