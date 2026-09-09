"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { diaISO } from "@/lib/frota/tempo";

// Conferência de ponto: os horários que a equipe registrou, para bater com a
// marcação da folha.
//
// Visual: os mesmos tokens e componentes do painel (components/painel/
// PainelFrota.jsx) — topo navy, KPI em cartão, chip de placa, tag de estado.
// A tela nasceu como tabela e destoava do resto do app; agora é cartão, e a
// leitura por dia é a que o time da folha faz de verdade (fecha um dia,
// confere, passa para o próximo).
//
// A tela é de leitura e não tem km nem custo — quem confere ponto não precisa
// do custo da frota, e o que não aparece não vaza. Quem entra aqui é o papel
// PONTO (e o gestor); a RLS de `roteiros` é quem garante isso de verdade.
//
// Tudo que é hora vem pronto da view v_conferencia_ponto, já no fuso de São
// Paulo. Nenhuma conta de horário acontece nesta tela — a lição do bug de fuso
// de agosto foi essa: hora se calcula num lugar só.

type Linha = {
  id: string;
  dia: string; // YYYY-MM-DD, o dia da saída em São Paulo
  placa: string;
  modelo: string;
  tecnico_saida: string;
  tecnico_chegada: string | null;
  hora_saida: string | null; // HH:MM:SS
  hora_chegada: string | null;
  duracao_min: number | null;
  virou_o_dia: boolean;
  dia_chegada: string | null;
  em_aberto: boolean;
};

function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : "—";
}

function duracao(min: number | null) {
  if (min == null || min < 0) return "—";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min}min`;
}

function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}

// "quinta-feira" a partir de "2026-09-04". Meio-dia de propósito: data pura
// vira UTC no parser e o dia recuaria três horas.
const fmtDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
function diaSemana(dia: string) {
  return fmtDiaSemana.format(new Date(dia + "T12:00:00"));
}

export default function PontoPage() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // O caminho de volta só existe para quem tem para onde voltar: o gestor.
  // Para o papel PONTO esta é a tela inicial — um "← Painel" ali mandaria a
  // pessoa para "/", que o proxy devolve na hora para cá.
  const [ehGestor, setEhGestor] = useState(false);

  const hoje = diaISO(new Date());
  const quinzeDias = diaISO(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000));

  const [de, setDe] = useState(quinzeDias);
  const [ate, setAte] = useState(hoje);
  const [tecnico, setTecnico] = useState("");

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    // O refresh do token corre em paralelo com a query e devolve 401 se a
    // query sair primeiro; getUser() espera o token ficar bom.
    await supabase.auth.getUser();

    // `dia` já é a data local calculada na view — filtro direto, sem a
    // conversão de janela UTC que /historico precisa fazer sobre timestamptz.
    const { data, error } = await supabase
      .from("v_conferencia_ponto")
      .select("*")
      .gte("dia", de)
      .lte("dia", ate)
      .order("dia", { ascending: false })
      .order("hora_saida", { ascending: true });

    if (error) setErro(error.message);
    setLinhas((data as Linha[]) ?? []);
    setCarregando(false);
  }, [de, ate]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("tecnicos").select("papel").eq("user_id", user.id).maybeSingle();
      setEhGestor((data as { papel?: string } | null)?.papel === "GESTOR");
    })();
  }, []);

  const tecnicos = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.tecnico_saida))).sort(),
    [linhas],
  );
  const visiveis = useMemo(
    () => (tecnico ? linhas.filter((l) => l.tecnico_saida === tecnico) : linhas),
    [linhas, tecnico],
  );

  // Um bloco por dia. É assim que a folha é conferida: fecha um dia, confere,
  // passa para o próximo.
  const dias = useMemo(() => {
    const porDia = new Map<string, Linha[]>();
    for (const l of visiveis) {
      const lista = porDia.get(l.dia) ?? [];
      lista.push(l);
      porDia.set(l.dia, lista);
    }
    return [...porDia.entries()].map(([dia, lista]) => ({
      dia,
      lista,
      minutos: lista.reduce((s, l) => s + (l.duracao_min ?? 0), 0),
      abertos: lista.filter((l) => l.em_aberto).length,
    }));
  }, [visiveis]);

  const emAberto = visiveis.filter((l) => l.em_aberto).length;
  const viraram = visiveis.filter((l) => l.virou_o_dia).length;
  const totalMin = visiveis.reduce((s, l) => s + (l.duracao_min ?? 0), 0);

  function baixarCSV() {
    const cab = ["dia", "placa", "veiculo", "tecnico_saida", "tecnico_chegada",
      "hora_saida", "hora_chegada", "dia_chegada", "duracao", "virou_o_dia", "situacao"];
    const linhasCsv = [cab];
    visiveis.forEach((l) => linhasCsv.push([
      l.dia, l.placa, l.modelo, l.tecnico_saida, l.tecnico_chegada ?? "",
      hhmm(l.hora_saida), hhmm(l.hora_chegada), l.dia_chegada ?? "",
      duracao(l.duracao_min), l.virou_o_dia ? "sim" : "não",
      l.em_aberto ? "sem chegada registrada" : "fechado",
    ]));
    const csv = linhasCsv
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    // BOM na frente: sem ele o Excel abre "JOÃO" como "JOÃO".
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conferencia-ponto-${de}-a-${ate}.csv`;
    a.click();
  }

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo-h" src="/logowhite.png" alt="Grupo Nova Opção" />
          </div>
          <div className="spacer" />
          <div className="top-meta">
            <div className="d">Conferência de ponto</div>
            <div className="s">{visiveis.length} roteiro(s) no período</div>
          </div>
          {ehGestor && <a className="sair volta" href="/">← Painel</a>}
          <form action="/auth/signout" method="post">
            <button className="sair" type="submit">Sair</button>
          </form>
        </div>
      </header>

      <main className="wrap">
        <section className="kpis">
          <Kpi lbl="Roteiros" val={String(visiveis.length)} sub="no período escolhido" />
          <Kpi lbl="Tempo somado" val={duracao(totalMin)} sub="só os roteiros fechados" />
          <Kpi
            lbl="Sem chegada"
            val={String(emAberto)}
            sub={emAberto > 0 ? "confirmar com o técnico" : "tudo fechado"}
            tom={emAberto > 0 ? "warn" : null}
          />
          <Kpi lbl="Viraram o dia" val={String(viraram)} sub="ponto em dois dias" />
        </section>

        <section className="filtros">
          <div className="campo">
            <label htmlFor="de">De</label>
            <input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="ate">Até</label>
            <input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="tec">Técnico</label>
            <select id="tec" value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
              <option value="">Todos</option>
              {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn" onClick={baixarCSV} disabled={visiveis.length === 0}>
            ↧ Baixar CSV
          </button>
        </section>

        {erro && <div className="aviso-erro">{erro}</div>}

        {carregando && <div className="panel"><div className="empty">Carregando…</div></div>}

        {!carregando && dias.length === 0 && !erro && (
          <div className="panel"><div className="empty">Nenhum roteiro no período escolhido.</div></div>
        )}

        {dias.map(({ dia, lista, minutos, abertos }) => (
          <section key={dia} className="dia">
            <div className="dia-head">
              <span className="dia-data mono">{dataBR(dia)}</span>
              <span className="dia-semana">{diaSemana(dia)}</span>
              <span className="dia-meta mono ml-auto">
                {lista.length} roteiro(s) · {duracao(minutos)}
                {abertos > 0 ? ` · ${abertos} sem chegada` : ""}
              </span>
            </div>

            <div className="cards">
              {lista.map((l) => (
                <article key={l.id} className={l.em_aberto ? "card aberto" : "card"}>
                  <div className="card-top">
                    <span className="plate">{l.placa}</span>
                    <span className="card-model">{l.modelo}</span>
                    {l.em_aberto && <span className="tag warn ml-auto">sem chegada</span>}
                    {l.virou_o_dia && <span className="tag ok ml-auto">virou o dia</span>}
                  </div>

                  <div className="card-tec">{l.tecnico_saida}</div>
                  {l.tecnico_chegada && l.tecnico_chegada !== l.tecnico_saida && (
                    <div className="card-troca">voltou com {l.tecnico_chegada}</div>
                  )}

                  <div className="horas">
                    <div className="hora">
                      <span className="rot">Saída</span>
                      <b className="mono">{hhmm(l.hora_saida)}</b>
                    </div>
                    <span className="flecha">→</span>
                    <div className="hora">
                      <span className="rot">Chegada</span>
                      <b className="mono">{hhmm(l.hora_chegada)}</b>
                    </div>
                    <div className="hora fim">
                      <span className="rot">Tempo fora</span>
                      <b className="mono">{duracao(l.duracao_min)}</b>
                    </div>
                  </div>

                  {(l.em_aberto || l.virou_o_dia) && (
                    <div className="card-nota">
                      {l.em_aberto
                        ? "O técnico não registrou a chegada. O horário de volta não existe — não é zero."
                        : `Voltou em ${dataBR(l.dia_chegada)}: o ponto dessa pessoa cai em dois dias.`}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}

        {dias.length > 0 && (
          <div className="legend">
            Os horários são os que a equipe registrou ao sair e ao voltar, no fuso de São Paulo.
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({ lbl, val, sub, tom }: { lbl: string; val: string; sub: string; tom?: string | null }) {
  return (
    <div className="kpi">
      <div className="lbl">{lbl}</div>
      <div className={"val mono" + (tom ? " " + tom : "")}>{val}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

/* ============================ CSS ============================ */
// Mesmo bloco de tokens do painel. Duplicado de propósito: as telas do projeto
// carregam o próprio estilo e não dependem de um CSS global — mexer numa não
// quebra a outra. Se um dia forem três telas assim, aí vale extrair.
const CSS = `
.app{--bg:#EBEEF4;--surface:#fff;--surface-2:#F4F6FB;--border:#DBE0EA;--border-strong:#C4CCDA;
  --ink:#16233C;--ink-2:#53607A;--ink-3:#8591A5;--brand:#2B4C8C;--navy:#17263F;--navy-2:#223B63;
  --silver:#AEB8C6;--ok:#1B9E6B;--ok-bg:#E5F4EE;--warn:#C08306;--warn-bg:#FAEFD6;--crit:#CE3A44;--crit-bg:#FAE5E7;
  --shadow:0 1px 2px rgba(22,35,60,.06),0 8px 24px rgba(22,35,60,.05);
  min-height:100vh;background:var(--bg);color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.app .mono{font-variant-numeric:tabular-nums}
.app button,.app input,.app select{font-family:inherit}
.ml-auto{margin-left:auto}

.topbar{background:linear-gradient(180deg,var(--navy),var(--navy-2));color:#fff;position:sticky;top:0;z-index:10}
.topbar-in{max-width:1240px;margin:0 auto;padding:13px 20px;display:flex;align-items:center;gap:12px}
.brand{display:flex;align-items:center;gap:12px}
.logo-h{height:42px;display:block}
@media(max-width:560px){.logo-h{height:34px}}
.spacer{flex:1}
.top-meta{text-align:right;line-height:1.3}
.top-meta .d{font-size:13px;font-weight:600}
.top-meta .s{font-size:11.5px;color:var(--silver)}
.sair{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;white-space:nowrap}
.sair:hover{background:rgba(255,255,255,.2)}
@media(max-width:560px){.top-meta{display:none}.sair{padding:8px 10px}}

.wrap{max-width:1240px;margin:0 auto;padding:20px 20px 64px}

.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
@media(max-width:840px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:15px 16px;box-shadow:var(--shadow)}
.kpi .lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.kpi .val{font-size:25px;font-weight:700;letter-spacing:-.02em;margin-top:7px;line-height:1}
.kpi .val.warn{color:var(--warn)}
.kpi .sub{font-size:11.5px;color:var(--ink-2);margin-top:6px}

.filtros{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);
  padding:14px 16px;margin-bottom:22px;display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}
.campo{display:flex;flex-direction:column;gap:5px;min-width:150px;flex:1}
.campo label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.campo input,.campo select{padding:9px 10px;border-radius:9px;border:1px solid var(--border-strong);
  font-size:14px;background:var(--surface);color:var(--ink);box-sizing:border-box;width:100%}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;font-size:13.5px;
  font-weight:600;cursor:pointer;border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}
.btn:disabled{opacity:.5;cursor:default}

.aviso-erro{background:var(--crit-bg);border:1px solid #E9B7BC;color:#8E2129;border-radius:12px;padding:14px 16px;font-size:13.5px;margin-bottom:16px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:6px 16px;box-shadow:var(--shadow)}
.empty{font-size:12.5px;color:var(--ink-3);padding:18px 4px;text-align:center}
.legend{margin-top:24px;font-size:12px;color:var(--ink-3);text-align:center}

.dia{margin-bottom:26px}
.dia-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap;
  border-bottom:1px solid var(--border);padding-bottom:8px}
.dia-data{font-size:15px;font-weight:700;letter-spacing:-.01em}
.dia-semana{font-size:12.5px;color:var(--ink-2);text-transform:capitalize}
.dia-meta{font-size:11.5px;color:var(--ink-3)}

.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--ok);
  border-radius:12px;padding:13px 14px;box-shadow:var(--shadow)}
.card.aberto{border-left-color:var(--warn);background:linear-gradient(90deg,var(--warn-bg),var(--surface) 60%)}
.card-top{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.plate{font-weight:700;font-size:12px;letter-spacing:.04em;color:var(--ink);background:var(--surface-2);
  border:1px solid var(--border-strong);border-radius:6px;padding:2px 7px}
.card-model{font-size:12px;color:var(--ink-2);font-weight:500}
.tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:1px 7px;border-radius:5px}
.tag.warn{background:var(--warn-bg);color:var(--warn)}
.tag.ok{background:var(--ok-bg);color:var(--ok)}
.card-tec{font-size:14px;font-weight:650;letter-spacing:-.01em}
.card-troca{font-size:11.5px;color:var(--ink-2);margin-top:2px}

.horas{display:flex;align-items:flex-end;gap:12px;margin-top:11px;padding-top:11px;border-top:1px solid var(--border)}
.hora{display:flex;flex-direction:column;gap:2px}
.hora .rot{font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);font-weight:700}
.hora b{font-size:17px;font-weight:700;letter-spacing:-.02em;line-height:1}
.hora.fim{margin-left:auto;text-align:right}
.hora.fim b{font-size:15px;color:var(--ink-2)}
.flecha{color:var(--ink-3);font-size:13px;padding-bottom:2px}

.card-nota{font-size:11.5px;color:var(--ink-2);line-height:1.45;margin-top:10px;
  background:var(--surface-2);border-radius:7px;padding:7px 9px}

@media print{.topbar,.filtros,.legend{display:none!important}.app{background:#fff}}
@media(prefers-reduced-motion:reduce){.app *{transition:none!important}}
`;
