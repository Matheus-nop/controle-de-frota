"use client";
import React, { useState, useMemo } from "react";

/* ============================ utilidades ============================ */
const nf = new Intl.NumberFormat("pt-BR");
const brl = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const km = (n) => (n == null ? "—" : nf.format(Math.round(n)) + " km");
const dataBR = (s) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "—");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function VehIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M2 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1h3.4a1 1 0 0 1 .82.43l2.6 3.7a1 1 0 0 1 .18.57V15a1 1 0 0 1-1 1h-1.1a2.4 2.4 0 0 1-4.8 0H8.9a2.4 2.4 0 0 1-4.8 0H3a1 1 0 0 1-1-1V7Zm12 2v2.5h4.3L16.6 9H14Z" />
      <circle cx="6.6" cy="16" r="1.5" fill="currentColor" />
      <circle cx="16.4" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}
function Thumb({ foto }) {
  return <span className="thumb">{foto ? <img className="thumb-img" src={foto} alt="" /> : <VehIcon />}</span>;
}
function Plate({ p }) {
  return <span className="plate">{p}</span>;
}

/* ============================ componente ============================ */
export default function PainelFrota({ dados, referencia }) {
  const DADOS = dados;
  const REF = referencia;
  const [view, setView] = useState("operacao");
  const [sel, setSel] = useState(null);

  const m = useMemo(() => {
    const { veiculos, roteiros, manutencoes, custos, checklists } = DADOS;
    const porPlaca = Object.fromEntries(veiculos.map((v) => [v.placa, v]));
    const mesRef = REF.slice(0, 7);

    const naRua = roteiros
      .filter((r) => r.st === "PENDENTE DE CHEGADA" && r.ds === REF)
      .sort((a, b) => (a.hs || "").localeCompare(b.hs || ""));
    const semFechamento = roteiros
      .filter((r) => r.st === "PENDENTE DE CHEGADA" && r.ds < REF)
      .sort((a, b) => (b.ds || "").localeCompare(a.ds || ""));
    const chegadaSemSaida = roteiros.filter((r) => r.st === "CHEGADA SEM SAÍDA");
    const kmSuspeito = roteiros
      .filter((r) => r.st === "CONCLUÍDO - KM ALTO VERIFICAR")
      .sort((a, b) => (b.kmr || 0) - (a.kmr || 0));

    const concluidos = roteiros.filter((r) => (r.st || "").startsWith("CONCLUÍDO"));
    const concluidosHoje = concluidos.filter((r) => r.dc === REF || (r.dc == null && r.ds === REF));

    const doMes = roteiros.filter((r) => r.ds && r.ds.startsWith(mesRef) && r.kmr);
    const kmMes = doMes.reduce((s, r) => s + r.kmr, 0);
    const custoMes = doMes.reduce((s, r) => s + r.kmr * (porPlaca[r.placa]?.custoKm || 0), 0);

    const ativos = veiculos.filter((v) => v.status === "ATIVO");
    const bloqueados = veiculos.filter((v) => v.status === "BLOQUEADO");

    const frota = ativos.map((v) => {
      const falta = v.revisao != null && v.km != null ? v.revisao - v.km : null;
      const situacao = falta == null ? "sem" : falta <= 0 ? "vencida" : falta <= 2000 ? "proxima" : "ok";
      const ultimo = roteiros.filter((r) => r.placa === v.placa && r.ds).sort((a, b) => b.ds.localeCompare(a.ds))[0];
      return { ...v, falta, situacao, ultimoUso: ultimo?.ds, naRua: naRua.some((r) => r.placa === v.placa) };
    });
    const revisoesVencidas = frota.filter((v) => v.situacao === "vencida").length;

    // pendências unificadas para o kanban
    const pend = [
      ...semFechamento.map((r) => ({ r, tag: "sem fechamento" })),
      ...chegadaSemSaida.map((r) => ({ r, tag: "chegada sem saída" })),
      ...kmSuspeito.map((r) => ({ r, tag: "km alto" })),
    ];

    // info de bloqueio: último checklist com motivo por placa
    const bloqInfo = bloqueados.map((v) => {
      const c = checklists
        .filter((c) => c.placa === v.placa && c.motivo)
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
      return { v, motivo: c?.motivo, urg: c?.urg, data: c?.data, cond: c?.cond };
    });

    const gastoManut = manutencoes.reduce((s, x) => s + (x.valor || 0), 0);

    return {
      veiculos, roteiros, manutencoes, checklists, porPlaca,
      naRua, concluidosHoje, concluidos, pend, bloqueados, bloqInfo,
      kmMes, custoMes, ativos, frota, revisoesVencidas, gastoManut,
      custos: [...custos].sort((a, b) => (b.total || 0) - (a.total || 0)),
    };
  }, []);

  const totalPend = m.pend.length;
  const d = new Date(REF + "T12:00:00");
  const dataTopo = `${dataBR(REF)}/${d.getFullYear()}`;

  const abas = [
    ["operacao", "Operação"],
    ["frota", "Frota"],
    ["custos", "Custos"],
    ["manut", "Manutenções"],
    ["relatorios", "Relatórios"],
  ];

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <img className="logo-h" src="/logowhite.png" alt="Grupo Nova Opção" />
          </div>
          <div className="spacer" />
          <div className="top-meta">
            <div className="d mono">{dataTopo}</div>
            <div className="s">{m.ativos.length} veículos ativos</div>
          </div>
          <form action="/auth/signout" method="post">
            <button className="sair" type="submit">Sair</button>
          </form>
        </div>
      </header>

      <nav className="subnav">
        <div className="subnav-in">
          {abas.map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} className={view === k ? "navtab on" : "navtab"}>
              {label}
              {k === "operacao" && totalPend > 0 && <span className="dotn">{totalPend}</span>}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap">
        <div className="actions">
          <a className="btn primary" href="/roteiro/saida">+ Registrar saída</a>
          <a className="btn" href="/roteiro/chegada">Registrar chegada</a>
          <a className="btn" href="/checklist">Checklist</a>
                    <a className="btn" href="/manutencao">Manutenção</a>
                    <a className="btn" href="/veiculos">Veículos</a>
          <a className="btn rel" onClick={() => setView("relatorios")}>↧ Relatórios</a>
        </div>

        {view === "operacao" && <Operacao m={m} onSel={setSel} referencia={REF} />}
        {view === "frota" && <Frota m={m} onSel={setSel} />}
        {view === "custos" && <Custos m={m} />}
        {view === "manut" && <Manut m={m} />}
        {view === "relatorios" && <Relatorios m={m} referencia={REF} />}
      </main>

      {sel && <Ficha placa={sel} m={m} onClose={() => setSel(null)} />}
    </div>
  );
}

/* ============================ OPERAÇÃO (kanban) ============================ */
function Kpi({ lbl, val, sub, tom }) {
  return (
    <div className="kpi">
      <div className="lbl">{lbl}</div>
      <div className={"val mono" + (tom ? " " + tom : "")}>{val}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function Card({ children, onClick }) {
  return <div className="card" onClick={onClick}>{children}</div>;
}

function Operacao({ m, onSel, referencia }) {
  const mesLbl = MESES[parseInt(referencia.slice(5, 7), 10) - 1] + "/" + referencia.slice(0, 4);
  return (
    <>
      <section className="kpis">
        <Kpi lbl="Na rua" val={m.naRua.length} sub="veículos em roteiro" />
        <Kpi lbl="Concluídos hoje" val={m.concluidosHoje.length} sub="roteiros fechados" />
        <Kpi lbl="Km no mês" val={nf.format(m.kmMes)} sub={mesLbl} />
        <Kpi lbl="Custo no mês" val={brl(m.custoMes)} sub="combustível est." />
        <Kpi lbl="Revisões vencidas" val={m.revisoesVencidas} sub="verificar" tom={m.revisoesVencidas > 0 ? "crit" : null} />
        <Kpi lbl="Bloqueados" val={m.bloqueados.length} sub="aguardando reparo" tom={m.bloqueados.length > 0 ? "crit" : null} />
      </section>

      <div className="board-head">
        <h2>Operação do dia</h2>
        <span className="hint">atualiza conforme a equipe lança saída e chegada</span>
      </div>

      <section className="board">
        <Coluna cor="var(--brand)" titulo="Na rua" n={m.naRua.length} vazio="Nenhum veículo na rua agora.">
          {m.naRua.map((r, i) => (
            <Card key={i} onClick={() => onSel(r.placa)}>
              <div className="card-top"><Thumb foto={m.porPlaca[r.placa]?.foto} /><Plate p={r.placa} /><span className="card-model">{r.veic.split(" - ")[0]}</span></div>
              <div className="card-tec">{r.tec || "sem técnico"}</div>
              <div className="card-meta"><span>Saiu <b className="mono">{r.hs || "—"}</b></span><span>Km <b className="mono">{nf.format(r.kms)}</b></span></div>
            </Card>
          ))}
        </Coluna>

        <Coluna cor="var(--ok)" titulo="Concluídos hoje" n={m.concluidosHoje.length} vazio="Nenhum roteiro fechado hoje ainda.">
          {m.concluidosHoje.slice(0, 12).map((r, i) => (
            <Card key={i} onClick={() => onSel(r.placa)}>
              <div className="card-top"><Thumb foto={m.porPlaca[r.placa]?.foto} /><Plate p={r.placa} /><span className="card-model">{r.veic.split(" - ")[0]}</span></div>
              <div className="card-tec">{r.tec || "—"}</div>
              <div className="card-meta"><span><b className="mono">{nf.format(r.kmr || 0)}</b> km</span><span>{brl((r.kmr || 0) * (m.porPlaca[r.placa]?.custoKm || 0))}</span></div>
            </Card>
          ))}
          {m.concluidosHoje.length > 12 && <div className="empty">+ {m.concluidosHoje.length - 12} outros</div>}
        </Coluna>

        <Coluna cor="var(--warn)" titulo="Pendências" n={m.pend.length} vazio="Sem pendências. 👏">
          {m.pend.map(({ r, tag }, i) => (
            <Card key={i} onClick={() => onSel(r.placa)}>
              <div className="card-top"><Thumb foto={m.porPlaca[r.placa]?.foto} /><Plate p={r.placa} /><span className="card-model">{r.veic.split(" - ")[0]}</span><span className="tag warn ml-auto">{tag}</span></div>
              <div className="card-tec">{r.tec || "—"}</div>
              <div className="card-meta"><span>{tag === "km alto" ? nf.format(r.kmr) + " km — verificar" : "Saiu " + dataBR(r.ds) + " " + (r.hs || "")}</span></div>
            </Card>
          ))}
        </Coluna>

        <Coluna cor="var(--crit)" titulo="Bloqueados" n={m.bloqueados.length} vazio="Nenhum veículo bloqueado.">
          {m.bloqInfo.map(({ v, motivo, urg, cond, data }, i) => (
            <Card key={i} onClick={() => onSel(v.placa)}>
              <div className="card-top"><Thumb foto={v.foto} /><Plate p={v.placa} /><span className="card-model">{v.modelo}</span>{urg && <span className="tag crit ml-auto">{String(urg).toLowerCase()}</span>}</div>
              <div className="card-tec">{motivo || "Bloqueado"}</div>
              <div className="card-meta"><span>{cond ? "Checklist de " + cond : "checklist"}{data ? " · " + dataBR(data) : ""}</span></div>
            </Card>
          ))}
        </Coluna>
      </section>

      <div className="legend">Toque num cartão para ver a ficha completa do veículo.</div>
    </>
  );
}

function Coluna({ cor, titulo, n, vazio, children }) {
  const arr = React.Children.toArray(children);
  return (
    <div className="col" style={{ "--c": cor }}>
      <div className="col-head"><span className="cdot" /><span className="ct">{titulo}</span><span className="cn mono">{n}</span></div>
      <div className="col-body">{arr.length ? arr : <div className="empty">{vazio}</div>}</div>
    </div>
  );
}

/* ============================ FROTA ============================ */
function Frota({ m, onSel }) {
  const todos = [...m.frota, ...m.bloqueados.map((v) => ({ ...v, situacao: "bloq" }))];
  const rot = { vencida: ["Revisão vencida", "warn"], proxima: ["Revisão próxima", "warn"], ok: ["OK", "ok"], sem: ["Sem revisão", "mute"], bloq: ["Bloqueado", "crit"] };
  return (
    <section className="grid-veic">
      {todos.map((v, i) => {
        const [lbl, tom] = rot[v.situacao] || rot.sem;
        return (
          <div key={i} className="vcard" onClick={() => onSel(v.placa)}>
            <div className="vcard-top"><Thumb foto={v.foto} /><Plate p={v.placa} />{v.naRua && <span className="tag ok ml-auto">na rua</span>}</div>
            <div className="vcard-model">{v.modelo} · {v.ano || "—"}</div>
            <div className="vcard-resp">{v.resp && v.resp !== "—" ? v.resp : "sem responsável"}</div>
            <div className="vcard-foot">
              <span className="mono">{km(v.km)}</span>
              <span className={"tag " + tom}>{lbl}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ============================ CUSTOS ============================ */
function Custos({ m }) {
  const total = m.custos.reduce((s, c) => s + (c.total || 0), 0);
  const kmTot = m.custos.reduce((s, c) => s + (c.km || 0), 0) || 1;
  const max = Math.max(1, ...m.custos.map((c) => c.total || 0));
  return (
    <>
      <section className="kpis kpis-3">
        <Kpi lbl="Custo acumulado" val={brl(total)} sub="combustível, período" />
        <Kpi lbl="Custo médio" val={"R$ " + (total / kmTot).toFixed(2)} sub="por km rodado" />
        <Kpi lbl="Manutenção" val={brl(m.gastoManut)} sub="no período" />
      </section>
      <div className="board-head"><h2>Custo por veículo</h2></div>
      <section className="panel">
        {m.custos.map((c, i) => (
          <div key={i} className="barra">
            <div className="barra-top"><Plate p={c.placa} /><span className="mute-xs">{(c.veic || "").split(" - ")[0]}</span><span className="mono forte ml-auto">{brl(c.total)}</span></div>
            <div className="trilho"><div className="fill" style={{ width: (100 * (c.total || 0) / max) + "%" }} /></div>
            <div className="mute-xs">{km(c.km)} · R$ {(c.medio || 0).toFixed(2)}/km</div>
          </div>
        ))}
        {m.custos.length === 0 && <div className="empty">Sem custos no período.</div>}
      </section>
    </>
  );
}

/* ============================ MANUTENÇÕES ============================ */
function Manut({ m }) {
  return (
    <>
      <div className="board-head"><h2>Manutenções</h2><span className="hint">{m.manutencoes.length} registro(s)</span></div>
      <section className="panel">
        {m.manutencoes.map((x, i) => (
          <div key={i} className="man">
            <div className="man-head"><Plate p={x.placa} /><span className="mute-xs">{x.tipo || "—"}</span><span className="tag mute">{x.status || "—"}</span><span className="mono forte ml-auto">{brl(x.valor)}</span></div>
            <div className="man-serv">{x.servico || x.prob || "—"}</div>
            <div className="mute-xs">{dataBR(x.data)} · {x.oficina || "—"}</div>
          </div>
        ))}
        {m.manutencoes.length === 0 && <div className="empty">Nenhuma manutenção registrada.</div>}
      </section>
    </>
  );
}

/* ============================ RELATÓRIOS ============================ */
function Relatorios({ m, referencia }) {
  function baixarCSV() {
    const linhas = [["placa", "veiculo", "data_saida", "hora_saida", "data_chegada", "tecnico", "km_saida", "km_chegada", "km_rodado", "situacao"]];
    m.roteiros.forEach((r) => linhas.push([r.placa, (r.veic || "").split(" - ")[0], r.ds || "", r.hs || "", r.dc || "", r.tec || "", r.kms ?? "", r.kmc ?? "", r.kmr ?? "", r.st || ""]));
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "roteiros-" + referencia + ".csv";
    a.click();
  }
  const total = m.custos.reduce((s, c) => s + (c.total || 0), 0);
  return (
    <>
      <div className="board-head"><h2>Relatórios</h2><span className="hint">exporte e imprima os dados da frota</span></div>
      <section className="rel-grid">
        <div className="rel-card">
          <h3>Roteiros (planilha)</h3>
          <p className="mute-xs">Todos os roteiros com km, técnico e situação, para abrir no Excel.</p>
          <button className="btn primary" onClick={baixarCSV}>↧ Baixar CSV</button>
        </div>
        <div className="rel-card">
          <h3>Resumo para impressão</h3>
          <p className="mute-xs">Visão do período com custos e frota, pronta para PDF (imprimir → salvar como PDF).</p>
          <button className="btn" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
        </div>
        <div className="rel-card">
          <h3>Números do período</h3>
          <div className="rel-nums">
            <div><b className="mono">{nf.format(m.kmMes)}</b><span>km no mês</span></div>
            <div><b className="mono">{brl(m.custoMes)}</b><span>combustível</span></div>
            <div><b className="mono">{m.concluidos.length}</b><span>concluídos</span></div>
            <div><b className="mono">{brl(total)}</b><span>custo total</span></div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ============================ FICHA ============================ */
function Ficha({ placa, m, onClose }) {
  const v = m.porPlaca[placa];
  const rots = m.roteiros.filter((r) => r.placa === placa).sort((a, b) => (b.ds || "").localeCompare(a.ds || "")).slice(0, 8);
  const mans = m.manutencoes.filter((x) => x.placa === placa);
  const chks = m.checklists.filter((c) => c.placa === placa).sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 5);
  if (!v) return null;
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="card-top"><Thumb foto={v.foto} /><Plate p={placa} /><span className="card-model">{v.modelo} · {v.ano || "—"}</span></div>
          <button className="fechar" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-sub">{v.resp && v.resp !== "—" ? v.resp : "sem responsável"} · status {v.status}</div>

        <div className="mini-kpis">
          <div><div className="mute-xs">Km atual</div><div className="forte mono">{km(v.km)}</div></div>
          <div><div className="mute-xs">Próx. revisão</div><div className="forte mono">{v.revisao ? nf.format(v.revisao) : "—"}</div></div>
          <div><div className="mute-xs">Custo/km</div><div className="forte mono">{v.custoKm ? "R$ " + Number(v.custoKm).toFixed(2) : "—"}</div></div>
          <div><div className="mute-xs">Consumo</div><div className="forte mono">{v.kml ? v.kml + " km/l" : "—"}</div></div>
        </div>

        <h4>Últimos roteiros</h4>
        {rots.length === 0 ? <p className="mute-xs">Sem roteiros.</p> : rots.map((r, i) => (
          <div key={i} className="linha"><span className="mono">{dataBR(r.ds)}</span><span className="mute-xs">{r.tec || "—"}</span><span className="mono ml-auto">{r.kmr != null ? nf.format(r.kmr) + " km" : r.st}</span></div>
        ))}

        {mans.length > 0 && <><h4>Manutenções</h4>{mans.map((x, i) => (
          <div key={i} className="linha"><span className="mono">{dataBR(x.data)}</span><span className="mute-xs">{x.servico || x.prob}</span><span className="mono ml-auto">{brl(x.valor)}</span></div>
        ))}</>}

        {chks.length > 0 && <><h4>Checklists</h4>{chks.map((c, i) => (
          <div key={i} className="linha"><span className="mono">{dataBR(c.data)}</span><span className="mute-xs">{c.motivo ? "⚠ " + c.motivo : "OK"}</span><span className="mute-xs ml-auto">{c.cond}</span></div>
        ))}</>}
      </div>
    </div>
  );
}

/* ============================ CSS ============================ */
const CSS = `
.app{--bg:#EBEEF4;--surface:#fff;--surface-2:#F4F6FB;--border:#DBE0EA;--border-strong:#C4CCDA;
  --ink:#16233C;--ink-2:#53607A;--ink-3:#8591A5;--brand:#2B4C8C;--navy:#17263F;--navy-2:#223B63;
  --silver:#AEB8C6;--ok:#1B9E6B;--ok-bg:#E5F4EE;--warn:#C08306;--warn-bg:#FAEFD6;--crit:#CE3A44;--crit-bg:#FAE5E7;
  --shadow:0 1px 2px rgba(22,35,60,.06),0 8px 24px rgba(22,35,60,.05);
  min-height:100vh;background:var(--bg);color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.app .mono{font-variant-numeric:tabular-nums}
.app button{font-family:inherit}
.mute-xs{font-size:12px;color:var(--ink-2)}
.forte{font-weight:650;color:var(--ink)}
.ml-auto{margin-left:auto}

.topbar{background:linear-gradient(180deg,var(--navy),var(--navy-2));color:#fff;position:sticky;top:0;z-index:10}
.topbar-in{max-width:1240px;margin:0 auto;padding:13px 20px;display:flex;align-items:center;gap:14px}
.brand{display:flex;align-items:center;gap:12px}
.logo-h{height:42px;display:block}
@media(max-width:560px){.logo-h{height:34px}}
.thumb-img{width:100%;height:100%;object-fit:cover;border-radius:8px}
.eyebrow{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--silver);font-weight:700}
.brand-txt h1{margin:2px 0 0;font-size:17px;font-weight:650;letter-spacing:-.01em}
.spacer{flex:1}
.top-meta{text-align:right;line-height:1.3}
.top-meta .d{font-size:13px;font-weight:600}
.top-meta .s{font-size:11.5px;color:var(--silver)}
.sair{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer}
.sair:hover{background:rgba(255,255,255,.2)}

.subnav{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:70px;z-index:9}
.subnav-in{max-width:1240px;margin:0 auto;padding:0 12px;display:flex;gap:2px;overflow-x:auto}
.navtab{padding:13px 14px;font-size:13px;font-weight:600;color:var(--ink-2);border:none;background:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px}
.navtab.on{color:var(--brand);border-bottom-color:var(--brand)}
.dotn{background:var(--crit);color:#fff;font-size:10px;font-weight:700;border-radius:20px;padding:0 6px;min-width:16px;text-align:center}

.wrap{max-width:1240px;margin:0 auto;padding:20px 20px 64px}
.actions{display:flex;gap:10px;margin-bottom:22px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);box-shadow:var(--shadow);text-decoration:none}
.btn.primary{background:var(--brand);border-color:transparent;color:#fff}
.btn.rel{margin-left:auto}

.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:24px}
.kpis-3{grid-template-columns:repeat(3,1fr)}
@media(max-width:1080px){.kpis{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:15px 16px;box-shadow:var(--shadow)}
.kpi .lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.kpi .val{font-size:25px;font-weight:700;letter-spacing:-.02em;margin-top:7px;line-height:1}
.kpi .val.crit{color:var(--crit)}
.kpi .sub{font-size:11.5px;color:var(--ink-2);margin-top:6px}

.board-head{display:flex;align-items:baseline;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.board-head h2{font-size:15px;font-weight:650;margin:0}
.board-head .hint{font-size:12px;color:var(--ink-3)}
.board{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start}
@media(max-width:980px){.board{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.board{grid-template-columns:1fr}}
.col{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.col-head{display:flex;align-items:center;gap:8px;padding:12px 14px 11px;border-top:3px solid var(--c)}
.cdot{width:8px;height:8px;border-radius:50%;background:var(--c)}
.ct{font-size:12.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
.cn{margin-left:auto;font-size:12px;font-weight:700;color:var(--ink-2);background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:1px 9px}
.col-body{padding:4px 10px 12px;display:flex;flex-direction:column;gap:9px;min-height:40px}

.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 12px;box-shadow:0 1px 2px rgba(22,35,60,.04);cursor:pointer}
.card:hover{border-color:var(--border-strong)}
.card-top{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.thumb{width:34px;height:34px;border-radius:8px;flex:none;background:var(--surface-2);border:1px solid var(--border);display:grid;place-items:center;color:var(--brand)}
.plate{font-weight:700;font-size:12px;letter-spacing:.04em;color:var(--ink);background:var(--surface-2);border:1px solid var(--border-strong);border-radius:6px;padding:2px 7px}
.card-model{font-size:12px;color:var(--ink-2);font-weight:500}
.card-tec{font-size:13px;font-weight:600;margin-bottom:6px}
.card-meta{display:flex;gap:12px;font-size:11.5px;color:var(--ink-2)}
.card-meta b{color:var(--ink);font-weight:650}
.tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:1px 7px;border-radius:5px}
.tag.warn{background:var(--warn-bg);color:var(--warn)}
.tag.crit{background:var(--crit-bg);color:var(--crit)}
.tag.ok{background:var(--ok-bg);color:var(--ok)}
.tag.mute{background:var(--surface-2);color:var(--ink-2);border:1px solid var(--border)}
.empty{font-size:12px;color:var(--ink-3);padding:10px 4px;text-align:center}
.legend{margin-top:24px;font-size:12px;color:var(--ink-3);text-align:center}

.grid-veic{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.vcard{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:var(--shadow);cursor:pointer}
.vcard:hover{border-color:var(--border-strong)}
.vcard-top{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.vcard-model{font-size:14px;font-weight:650}
.vcard-resp{font-size:12.5px;color:var(--ink-2);margin-top:2px}
.vcard-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:13px}

.panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:6px 16px;box-shadow:var(--shadow)}
.barra{padding:12px 0;border-top:1px solid var(--border)}
.barra:first-child{border-top:none}
.barra-top{display:flex;align-items:center;gap:9px;margin-bottom:6px}
.trilho{height:7px;background:var(--surface-2);border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-bottom:5px}
.fill{height:100%;background:var(--brand)}
.man{padding:12px 0;border-top:1px solid var(--border)}
.man:first-child{border-top:none}
.man-head{display:flex;align-items:center;gap:9px;margin-bottom:4px;flex-wrap:wrap}
.man-serv{font-size:13.5px;margin-bottom:2px}

.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.rel-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;box-shadow:var(--shadow)}
.rel-card h3{margin:0 0 6px;font-size:14.5px}
.rel-card p{margin:0 0 14px}
.rel-nums{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rel-nums div{display:flex;flex-direction:column}
.rel-nums b{font-size:18px}
.rel-nums span{font-size:11px;color:var(--ink-3)}

.linha{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);font-size:13px}
.linha .mute-xs{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.modal{position:fixed;inset:0;background:rgba(16,26,38,.55);z-index:40;display:flex;align-items:flex-end;justify-content:center}
@media(min-width:700px){.modal{align-items:center;padding:24px}}
.sheet{background:var(--bg);width:100%;max-width:600px;max-height:88vh;overflow-y:auto;border-radius:14px 14px 0 0;padding:18px}
@media(min-width:700px){.sheet{border-radius:14px}}
.sheet-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.sheet-sub{font-size:13px;color:var(--ink-2);margin:10px 0 14px}
.fechar{background:var(--surface);border:1px solid var(--border);border-radius:8px;width:32px;height:32px;cursor:pointer;color:var(--ink-2);font-size:14px;flex:none}
.sheet h4{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin:18px 0 2px}
.mini-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px}
@media(min-width:520px){.mini-kpis{grid-template-columns:repeat(4,1fr)}}
.mini-kpis .forte{font-size:15px;margin-top:1px}

@media print{.topbar,.subnav,.actions,.legend,.sair{display:none!important}.app{background:#fff}}
@media(prefers-reduced-motion:reduce){.app *{transition:none!important}}
`;
