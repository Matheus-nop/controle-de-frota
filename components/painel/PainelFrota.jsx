"use client";
import React, { useState, useMemo } from "react";



/* ---------- utilidades ---------- */

const nf = new Intl.NumberFormat("pt-BR");
const brl = (n) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const km = (n) => (n == null ? "—" : nf.format(Math.round(n)) + " km");
const dataBR = (s) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "—");
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const JANELA_REVISAO = 10000; // km de antecedência usados na barra de revisão

function Placa({ placa, mini }) {
  return (
    <div className={mini ? "plate plate-mini" : "plate"}>
      <div className="plate-band">
        <span className="plate-br" />
        <span className="plate-pais">BRASIL</span>
        <span className="plate-uf">BR</span>
      </div>
      <div className="plate-num">{placa}</div>
    </div>
  );
}

/* ---------- app ---------- */
export default function PainelFrota({ dados, referencia }) {
  const DADOS = dados;
  const REF = referencia;
  const [aba, setAba] = useState("hoje");
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
      .sort((a, b) => b.ds.localeCompare(a.ds));

    const chegadaSemSaida = roteiros.filter((r) => r.st === "CHEGADA SEM SAÍDA");
    const kmSuspeito = roteiros
      .filter((r) => r.st === "CONCLUÍDO - KM ALTO VERIFICAR")
      .sort((a, b) => b.kmr - a.kmr);

    const doMes = roteiros.filter((r) => r.ds && r.ds.startsWith(mesRef) && r.kmr);
    const kmMes = doMes.reduce((s, r) => s + r.kmr, 0);
    const custoMes = doMes.reduce(
      (s, r) => s + r.kmr * (porPlaca[r.placa]?.custoKm || 0),
      0
    );
    const concluidos = roteiros.filter((r) => (r.st || "").startsWith("CONCLUÍDO"));

    const ativos = veiculos.filter((v) => v.status === "ATIVO");
    const frota = ativos.map((v) => {
      const falta = v.revisao != null && v.km != null ? v.revisao - v.km : null;
      const situacao =
        falta == null ? "sem" : falta <= 0 ? "vencida" : falta <= 2000 ? "proxima" : "ok";
      const ultimo = roteiros
        .filter((r) => r.placa === v.placa && r.ds)
        .sort((a, b) => b.ds.localeCompare(a.ds))[0];
      return { ...v, falta, situacao, ultimoUso: ultimo?.ds, naRua: naRua.some((r) => r.placa === v.placa) };
    });

    const gastoManut = manutencoes.reduce((s, x) => s + (x.valor || 0), 0);
    const bloqueios = checklists
      .filter((c) => c.motivo)
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    return {
      veiculos, roteiros, manutencoes, checklists, porPlaca,
      naRua, semFechamento, chegadaSemSaida, kmSuspeito,
      kmMes, custoMes, concluidos, ativos, frota, gastoManut, bloqueios,
      custos: [...custos].sort((a, b) => b.total - a.total),
    };
  }, []);

  const abas = [
    ["hoje", "Hoje"],
    ["frota", "Frota"],
    ["manut", "Manutenção"],
    ["custos", "Custos"],
    ["dados", "Pendências"],
  ];

  const totalPend = m.semFechamento.length + m.chegadaSemSaida.length + m.kmSuspeito.length;

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="top">
        <div className="top-in">
          <div>
            <div className="eyebrow">Controle de frota</div>
            <h1>Painel</h1>
          </div>
          <div className="top-meta">
            <div className="mono">{dataBR(REF)}/2026</div>
            <div className="mute-xs">{m.ativos.length} veículos ativos</div>
          </div>
        </div>
                <div style={{ display: "flex", gap: 8, padding: "0 18px 12px", maxWidth: 1080, margin: "0 auto" }}>
          <a href="/roteiro/saida" style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 8, background: "#1F6FEB", color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>+ Registrar saída</a>
          <a href="/roteiro/chegada" style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 8, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Registrar chegada</a>
        </div>
        <nav className="tabs">
          {abas.map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)} className={aba === k ? "tab on" : "tab"}>
              {label}
              {k === "dados" && totalPend > 0 && <span className="dot">{totalPend}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="wrap">
        {aba === "hoje" && <Hoje m={m} onSel={setSel} />}
        {aba === "frota" && <Frota m={m} onSel={setSel} />}
        {aba === "manut" && <Manut m={m} />}
        {aba === "custos" && <Custos m={m} />}
             {aba === "dados" && <Pendencias m={m} REF={REF} />}
      </main>

      {sel && <Ficha placa={sel} m={m} onClose={() => setSel(null)} />}
    </div>
  );
}

/* ---------- HOJE ---------- */
function Hoje({ m, onSel }) {
  return (
    <>
      <section className="hero">
        <div className="hero-head">
          <h2>Na rua agora</h2>
          <span className="count mono">{m.naRua.length}</span>
        </div>
        {m.naRua.length === 0 ? (
          <p className="vazio">Nenhum veículo com saída em aberto hoje.</p>
        ) : (
          <ul className="rua">
            {m.naRua.map((r, i) => (
              <li key={i} className="rua-item" onClick={() => onSel(r.placa)}>
                <Placa placa={r.placa} mini />
                <div className="rua-mid">
                  <div className="rua-veic">{r.veic.split(" - ")[0]}</div>
                  <div className="mute-xs">{r.tec || "sem técnico informado"}</div>
                </div>
                <div className="rua-right">
                  <div className="mono forte">{r.hs || "—"}</div>
                  <div className="mute-xs mono">{km(r.kms)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="kpis">
        <Kpi label="Km no mês" valor={nf.format(m.kmMes)} sub="julho/2026" />
        <Kpi label="Custo no mês" valor={brl(m.custoMes)} sub="combustível estimado" />
        <Kpi label="Roteiros concluídos" valor={m.concluidos.length} sub="no período" />
        <Kpi
          label="Revisões vencidas"
          valor={m.frota.filter((v) => v.situacao === "vencida").length}
          sub="verificar"
          tom={m.frota.some((v) => v.situacao === "vencida") ? "red" : null}
        />
      </div>

      {m.frota.filter((v) => v.situacao !== "ok").length > 0 && (
        <section className="bloco">
          <h3>Precisa de atenção</h3>
          {m.frota
            .filter((v) => v.situacao !== "ok")
            .map((v) => (
              <div key={v.placa} className="alerta" onClick={() => onSel(v.placa)}>
                <span className={"tag " + v.situacao}>
                  {v.situacao === "vencida" ? "Revisão vencida" : v.situacao === "proxima" ? "Revisão próxima" : "Sem revisão"}
                </span>
                <span className="mono">{v.placa}</span>
                <span className="mute-xs">
                  {v.modelo} · {km(v.km)}
                  {v.falta != null && v.falta <= 0 && ` · passou ${nf.format(-v.falta)} km`}
                </span>
              </div>
            ))}
        </section>
      )}
    </>
  );
}

function Kpi({ label, valor, sub, tom }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={"kpi-val mono" + (tom === "red" ? " red" : "")}>{valor}</div>
      <div className="mute-xs">{sub}</div>
    </div>
  );
}

/* ---------- FROTA ---------- */
function Frota({ m, onSel }) {
  return (
    <section className="grid">
      {m.frota.map((v) => {
        const pct =
          v.falta == null ? 0 : Math.max(0, Math.min(100, (1 - v.falta / JANELA_REVISAO) * 100));
        return (
          <article key={v.placa} className="card" onClick={() => onSel(v.placa)}>
            <div className="card-top">
              <Placa placa={v.placa} />
              {v.naRua && <span className="pill">na rua</span>}
            </div>
            <div className="card-id">
              <div className="modelo">{v.modelo}</div>
              <div className="mute-xs">
                {v.ano} · {v.resp}
              </div>
            </div>

            <div className="odo">
              <div className="odo-num mono">{nf.format(v.km || 0)}</div>
              <div className="odo-un">km</div>
            </div>

            <div className="rev">
              <div className="rev-bar">
                <div className={"rev-fill " + v.situacao} style={{ width: pct + "%" }} />
              </div>
              <div className="rev-lab">
                {v.falta == null ? (
                  <span className="mute-xs">sem revisão programada</span>
                ) : v.falta > 0 ? (
                  <span className="mute-xs">
                    faltam <b className="mono">{nf.format(v.falta)} km</b> para {nf.format(v.revisao)}
                  </span>
                ) : (
                  <span className="red-xs">
                    vencida há <b className="mono">{nf.format(-v.falta)} km</b>
                  </span>
                )}
              </div>
            </div>

            <div className="card-pe">
              <span className="mute-xs">{v.kml ? v.kml + " km/l" : "—"}</span>
              <span className="mute-xs mono">{v.custoKm ? "R$ " + v.custoKm.toFixed(2) + "/km" : "—"}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ---------- MANUTENÇÃO ---------- */
function Manut({ m }) {
  return (
    <>
      <div className="kpis">
        <Kpi label="Manutenções" valor={m.manutencoes.length} sub="registradas" />
        <Kpi label="Gasto total" valor={brl(m.gastoManut)} sub="peças e serviços" />
        <Kpi label="Em aberto" valor={m.manutencoes.filter((x) => x.status !== "CONCLUÍDA").length} sub="aguardando" />
        <Kpi label="Bloqueios no checklist" valor={m.bloqueios.length} sub="apontados em campo" />
      </div>

      <section className="bloco">
        <h3>Histórico</h3>
        {m.manutencoes
          .slice()
          .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
          .map((x) => (
            <div key={x.id} className="man">
              <div className="man-head">
                <span className="mono forte">{x.placa}</span>
                <span className={"tag " + (x.tipo === "CORRETIVA" ? "corr" : "prev")}>{x.tipo}</span>
                <span className="mono valor">{brl(x.valor)}</span>
              </div>
              <div className="man-serv">{x.servico}</div>
              <div className="mute-xs">
                {dataBR(x.data)} → {dataBR(x.conclusao)} · {x.oficina} · {km(x.km)} · origem: {x.origem?.toLowerCase()}
              </div>
            </div>
          ))}
      </section>

      {m.bloqueios.length > 0 && (
        <section className="bloco">
          <h3>Apontamentos do checklist</h3>
          {m.bloqueios.slice(0, 12).map((c, i) => (
            <div key={i} className="man">
              <div className="man-head">
                <span className="mono forte">{c.placa}</span>
                <span className={"tag " + (c.urg === "EMERGENCIAL" || c.urg === "ALTA" ? "vencida" : "proxima")}>
                  {c.urg?.toLowerCase()}
                </span>
                <span className="mute-xs">{dataBR(c.data)}</span>
              </div>
              <div className="man-serv">
                {c.motivo} — {c.desc}
              </div>
              <div className="mute-xs">{c.cond}</div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/* ---------- CUSTOS ---------- */
function Custos({ m }) {
  const max = Math.max(...m.custos.map((c) => c.total));
  const total = m.custos.reduce((s, c) => s + c.total, 0);
  const kmTot = m.custos.reduce((s, c) => s + c.km, 0);
  return (
    <>
      <div className="kpis">
        <Kpi label="Custo acumulado" valor={brl(total)} sub="combustível, período todo" />
        <Kpi label="Km acumulado" valor={nf.format(kmTot)} sub="frota inteira" />
        <Kpi label="Custo médio" valor={"R$ " + (total / kmTot).toFixed(2)} sub="por km rodado" />
        <Kpi label="Manutenção" valor={brl(m.gastoManut)} sub="no mesmo período" />
      </div>

      <section className="bloco">
        <h3>Custo por veículo</h3>
        <p className="nota">
          Calculado sobre o km rodado de cada roteiro, usando o consumo e o preço do combustível do cadastro.
        </p>
        {m.custos.map((c) => (
          <div key={c.placa} className="barra">
            <div className="barra-top">
              <span className="mono forte">{c.placa}</span>
              <span className="mute-xs">{c.veic.split(" - ")[0]}</span>
              <span className="mono valor">{brl(c.total)}</span>
            </div>
            <div className="barra-trilho">
              <div className="barra-fill" style={{ width: (c.total / max) * 100 + "%" }} />
            </div>
            <div className="mute-xs mono">
              {nf.format(c.km)} km · R$ {c.medio.toFixed(2)}/km
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

/* ---------- PENDÊNCIAS / QUALIDADE ---------- */
function Pendencias({ m, REF }) {
  return (
    <>
      <p className="nota nota-topo">
        Estes são registros que a planilha não conseguiu fechar sozinha. Cada um vira uma correção manual hoje —
        e some quando o lançamento passar a ser feito pelo app.
      </p>

      <section className="bloco">
        <h3>
          Saídas sem chegada <span className="count mono">{m.semFechamento.length}</span>
        </h3>
        <p className="nota">O técnico registrou a saída e nunca fechou o roteiro. O km do dia se perde.</p>
        {m.semFechamento.map((r, i) => (
          <div key={i} className="linha">
            <span className="mono forte">{r.placa}</span>
            <span className="mute-xs">{r.tec}</span>
            <span className="mono mute-xs">
              {dataBR(r.ds)} {r.hs} · {km(r.kms)}
            </span>
            <span className="atraso mono">{diasEntre(r.ds, REF)}d</span>
          </div>
        ))}
      </section>

      <section className="bloco">
        <h3>
          Chegadas sem saída <span className="count mono">{m.chegadaSemSaida.length}</span>
        </h3>
        <p className="nota">Roteiro fechado sem abertura correspondente.</p>
        {m.chegadaSemSaida.map((r, i) => (
          <div key={i} className="linha">
            <span className="mono forte">{r.placa}</span>
            <span className="mute-xs">{r.tec}</span>
            <span className="mono mute-xs">
              {dataBR(r.dc)} · {km(r.kmc)}
            </span>
          </div>
        ))}
      </section>

      <section className="bloco">
        <h3>
          Km fora do padrão <span className="count mono">{m.kmSuspeito.length}</span>
        </h3>
        <p className="nota">Provável erro de digitação do hodômetro. Um campo numérico com validação resolve.</p>
        {m.kmSuspeito.map((r, i) => (
          <div key={i} className="linha">
            <span className="mono forte">{r.placa}</span>
            <span className="mute-xs">{dataBR(r.ds)}</span>
            <span className="mono mute-xs">
              {nf.format(r.kms)} → {nf.format(r.kmc)}
            </span>
            <span className="atraso mono">{nf.format(r.kmr)} km</span>
          </div>
        ))}
      </section>
    </>
  );
}

/* ---------- FICHA DO VEÍCULO ---------- */
function Ficha({ placa, m, onClose }) {
  const v = m.porPlaca[placa];
  const rot = m.roteiros
    .filter((r) => r.placa === placa && r.ds)
    .sort((a, b) => b.ds.localeCompare(a.ds))
    .slice(0, 15);
  const man = m.manutencoes.filter((x) => x.placa === placa);
  const custo = m.custos.find((c) => c.placa === placa);

  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <Placa placa={placa} />
          <button className="fechar" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="sheet-sub">
          {v.modelo} · {v.ano} · {v.resp}
        </div>

        <div className="mini-kpis">
          <div>
            <div className="mute-xs">Hodômetro</div>
            <div className="mono forte">{km(v.km)}</div>
          </div>
          <div>
            <div className="mute-xs">Próxima revisão</div>
            <div className="mono forte">{km(v.revisao)}</div>
          </div>
          <div>
            <div className="mute-xs">Custo/km</div>
            <div className="mono forte">R$ {v.custoKm?.toFixed(2) ?? "—"}</div>
          </div>
          <div>
            <div className="mute-xs">Acumulado</div>
            <div className="mono forte">{brl(custo?.total)}</div>
          </div>
        </div>

        {man.length > 0 && (
          <>
            <h4>Manutenções</h4>
            {man.map((x) => (
              <div key={x.id} className="linha">
                <span className="mute-xs">{dataBR(x.conclusao || x.data)}</span>
                <span className="man-serv">{x.servico}</span>
                <span className="mono valor">{brl(x.valor)}</span>
              </div>
            ))}
          </>
        )}

        <h4>Últimos roteiros</h4>
        {rot.map((r, i) => (
          <div key={i} className="linha">
            <span className="mono mute-xs">{dataBR(r.ds)}</span>
            <span className="mute-xs">{r.tec}</span>
            <span className="mono">{r.kmr ? nf.format(r.kmr) + " km" : "—"}</span>
            <span className={"st " + (r.st === "CONCLUÍDO" ? "ok" : "warn")}>
              {r.st === "CONCLUÍDO" ? "ok" : r.st.replace("CONCLUÍDO - ", "").toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- estilo ---------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..112,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.app{
  --bg:#E9EDF2; --surf:#fff; --ink:#101A26; --mute:#5C6B7C;
  --blue:#003399; --line:#D6DEE8; --red:#C42B2B; --amber:#E08A00; --green:#17795E;
  background:var(--bg); color:var(--ink); min-height:100vh;
  font-family:'Archivo',system-ui,sans-serif; font-size:15px; line-height:1.45;
  -webkit-font-smoothing:antialiased;
}
.app *{box-sizing:border-box;margin:0;padding:0}
.app .mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.app .mute-xs{font-size:11.5px;color:var(--mute);letter-spacing:.01em}
.app .red-xs{font-size:11.5px;color:var(--red);font-weight:600}
.app .forte{font-weight:600}
.app .red{color:var(--red)}

/* topo */
.top{position:sticky;top:0;z-index:20;background:var(--ink);color:#fff}
.top-in{display:flex;justify-content:space-between;align-items:flex-end;padding:16px 18px 12px;max-width:1080px;margin:0 auto}
.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:#8FA3BC;font-weight:600}
.top h1{font-size:26px;font-weight:800;font-stretch:88%;letter-spacing:-.02em;line-height:1}
.top-meta{text-align:right}
.top-meta .mono{font-size:13px;font-weight:500}
.top-meta .mute-xs{color:#8FA3BC}
.tabs{display:flex;gap:2px;padding:0 12px;max-width:1080px;margin:0 auto;overflow-x:auto}
.tab{background:none;border:0;color:#8FA3BC;font-family:inherit;font-size:12.5px;font-weight:600;
  padding:9px 12px 11px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;letter-spacing:.02em}
.tab:hover{color:#fff}
.tab.on{color:#fff;border-bottom-color:#5C9BFF}
.tab:focus-visible{outline:2px solid #5C9BFF;outline-offset:-2px}
.dot{display:inline-block;margin-left:6px;background:var(--red);color:#fff;font-size:10px;
  padding:1px 5px;border-radius:8px;font-family:'IBM Plex Mono',monospace}

.wrap{max-width:1080px;margin:0 auto;padding:18px 14px 60px;display:flex;flex-direction:column;gap:16px}

/* placa mercosul */
.plate{background:#fff;border:1.5px solid var(--ink);border-radius:4px;overflow:hidden;width:106px;flex:none}
.plate-band{background:var(--blue);height:13px;display:flex;align-items:center;padding:0 3px;gap:3px}
.plate-br{width:8px;height:6px;background:#2A9D4A;border-radius:1px;flex:none}
.plate-pais{color:#fff;font-size:6px;font-weight:700;letter-spacing:.14em;flex:1;text-align:center;font-family:'Archivo',sans-serif}
.plate-uf{color:#fff;font-size:6px;font-weight:700;font-family:'IBM Plex Mono',monospace}
.plate-num{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:17px;text-align:center;
  padding:3px 0 4px;letter-spacing:.04em}
.plate-mini{width:80px}
.plate-mini .plate-num{font-size:13px;padding:2px 0 3px}
.plate-mini .plate-band{height:10px}

/* hero */
.hero{background:var(--surf);border:1px solid var(--line);border-radius:10px;padding:16px}
.hero-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.hero h2{font-size:13px;text-transform:uppercase;letter-spacing:.14em;font-weight:700;font-stretch:88%}
.count{background:var(--ink);color:#fff;font-size:12px;padding:1px 8px;border-radius:10px;font-weight:600}
.vazio{color:var(--mute);font-size:13px;padding:8px 0}
.rua{list-style:none;display:flex;flex-direction:column;gap:1px}
.rua-item{display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:6px;cursor:pointer;
  border-left:3px solid var(--blue);background:#F5F8FC}
.rua-item:hover{background:#EBF1F9}
.rua-mid{flex:1;min-width:0}
.rua-veic{font-weight:600;font-size:14px;font-stretch:92%}
.rua-right{text-align:right}
.rua-right .forte{font-size:15px}

/* kpis */
.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@media(min-width:720px){.kpis{grid-template-columns:repeat(4,1fr)}}
.kpi{background:var(--surf);border:1px solid var(--line);border-radius:10px;padding:13px 14px}
.kpi-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--mute);font-weight:600}
.kpi-val{font-size:23px;font-weight:600;letter-spacing:-.03em;margin:3px 0 1px}

/* blocos */
.bloco{background:var(--surf);border:1px solid var(--line);border-radius:10px;padding:16px}
.bloco h3{font-size:13px;text-transform:uppercase;letter-spacing:.12em;font-weight:700;font-stretch:88%;
  margin-bottom:10px;display:flex;align-items:center;gap:8px}
.bloco h4{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--mute);
  font-weight:700;margin:16px 0 6px}
.nota{font-size:12px;color:var(--mute);margin:-4px 0 12px;max-width:60ch}
.nota-topo{background:#FDF6E3;border:1px solid #EBDCB2;border-radius:8px;padding:12px 14px;margin:0;color:#6B5A2E}

.alerta{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line);cursor:pointer;flex-wrap:wrap}
.alerta:hover{opacity:.7}
.tag{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;padding:2px 7px;border-radius:4px}
.tag.vencida{background:#FBE9E9;color:var(--red)}
.tag.proxima{background:#FDF3E0;color:var(--amber)}
.tag.sem{background:#EEF1F5;color:var(--mute)}
.tag.prev{background:#E7F3EE;color:var(--green)}
.tag.corr{background:#FBE9E9;color:var(--red)}

/* frota */
.grid{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:600px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:900px){.grid{grid-template-columns:repeat(3,1fr)}}
.card{background:var(--surf);border:1px solid var(--line);border-radius:10px;padding:14px;cursor:pointer;
  display:flex;flex-direction:column;gap:10px;transition:border-color .15s}
.card:hover{border-color:var(--ink)}
.card-top{display:flex;justify-content:space-between;align-items:flex-start}
.pill{background:var(--blue);color:#fff;font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;
  font-weight:700;padding:3px 7px;border-radius:4px}
.modelo{font-weight:700;font-size:15px;font-stretch:88%;letter-spacing:-.01em}
.odo{display:flex;align-items:baseline;gap:5px;padding:6px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.odo-num{font-size:27px;font-weight:600;letter-spacing:-.04em}
.odo-un{font-size:12px;color:var(--mute);font-weight:600}
.rev-bar{height:5px;background:#E3E9F0;border-radius:3px;overflow:hidden;margin-bottom:5px}
.rev-fill{height:100%;border-radius:3px}
.rev-fill.ok{background:var(--green)}
.rev-fill.proxima{background:var(--amber)}
.rev-fill.vencida{background:var(--red);width:100%!important}
.card-pe{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:8px}

/* manutenção */
.man{padding:11px 0;border-top:1px solid var(--line)}
.man-head{display:flex;align-items:center;gap:9px;margin-bottom:3px;flex-wrap:wrap}
.valor{margin-left:auto;font-weight:600;font-size:13px}
.man-serv{font-size:13.5px;margin-bottom:2px}

/* barras */
.barra{padding:11px 0;border-top:1px solid var(--line)}
.barra-top{display:flex;align-items:center;gap:9px;margin-bottom:5px}
.barra-trilho{height:7px;background:#E3E9F0;border-radius:4px;overflow:hidden;margin-bottom:4px}
.barra-fill{height:100%;background:var(--blue);border-radius:4px}

/* linhas */
.linha{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:13px}
.linha .mute-xs{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.atraso{margin-left:auto;background:#FBE9E9;color:var(--red);font-size:11px;font-weight:600;padding:1px 6px;border-radius:4px;flex:none}
.st{font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;padding:1px 6px;border-radius:4px;flex:none}
.st.ok{background:#E7F3EE;color:var(--green)}
.st.warn{background:#FDF3E0;color:var(--amber)}

/* ficha */
.modal{position:fixed;inset:0;background:rgba(16,26,38,.55);z-index:40;display:flex;
  align-items:flex-end;justify-content:center;padding:0}
@media(min-width:700px){.modal{align-items:center;padding:24px}}
.sheet{background:var(--bg);width:100%;max-width:620px;max-height:88vh;overflow-y:auto;
  border-radius:14px 14px 0 0;padding:18px}
@media(min-width:700px){.sheet{border-radius:12px}}
.sheet-head{display:flex;justify-content:space-between;align-items:flex-start}
.sheet-sub{font-size:13px;color:var(--mute);margin:8px 0 14px}
.fechar{background:none;border:1px solid var(--line);border-radius:6px;width:30px;height:30px;
  cursor:pointer;color:var(--mute);font-size:13px}
.fechar:hover{background:#fff;color:var(--ink)}
.mini-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;background:var(--surf);
  border:1px solid var(--line);border-radius:10px;padding:14px}
@media(min-width:520px){.mini-kpis{grid-template-columns:repeat(4,1fr)}}
.mini-kpis .forte{font-size:15px;margin-top:1px}
.sheet .linha{border-top-color:#DCE3EC}

@media(prefers-reduced-motion:reduce){.app *{transition:none!important;animation:none!important}}
`;
