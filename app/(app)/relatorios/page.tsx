"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { diaDe, diaISO, intervaloUTC } from "@/lib/frota/tempo";
import {
  combustivelPorVeiculo, contar, contasManutencao, kmPorDia, kmPorMes,
  kmPorVeiculo, manutencaoPorVeiculo, porTecnico,
  type Manutencao, type Ocorrencia, type Roteiro, type Veiculo,
} from "./dados";

// Relatórios do gestor. Um período, cinco recortes, um CSV em cada.
//
// Por que tela própria e não a aba do painel: o painel carrega a frota inteira
// sem recorte de data, porque a pergunta dele é "como está agora". Relatório é
// a pergunta oposta — "o que aconteceu entre tal e tal dia" — e sem período
// todo número vira o acumulado de sempre, que não serve para fechar mês.
//
// As contas moram em ./dados.ts. O custo do roteiro vem pronto de v_roteiros:
// recalcular aqui criaria uma segunda fonte para o mesmo número, que é o que a
// planilha fazia de errado.

type Aba = "combustivel" | "km" | "tecnicos" | "manutencoes" | "ocorrencias";

const ABAS: [Aba, string][] = [
  ["combustivel", "Combustível"],
  ["km", "Km rodado"],
  ["tecnicos", "Técnicos"],
  ["manutencoes", "Manutenções"],
  ["ocorrencias", "Ocorrências"],
];

const nf = new Intl.NumberFormat("pt-BR");
const brl = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const km = (n: number | null | undefined) => (n == null ? "—" : nf.format(Math.round(n)) + " km");
const dataBR = (s: string | null) =>
  s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesBR = (s: string) => `${MESES[parseInt(s.slice(5, 7), 10) - 1]}/${s.slice(0, 4)}`;

function horas(min: number) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min}min`;
}

// O dia local do roteiro. Uma função só, usada por todos os agrupamentos —
// é o que impede o relatório mensal de jogar o roteiro das 22h no mês seguinte.
const diaDoRoteiro = (r: Roteiro) => diaDe(r.saida_em);

function baixar(nome: string, cabecalho: string[], linhas: (string | number)[][]) {
  const csv = [cabecalho, ...linhas]
    .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  // BOM na frente: sem ele o Excel abre "JOÃO" como "JOÃO".
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome + ".csv";
  a.click();
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default function RelatoriosPage() {
  const hoje = diaISO(new Date());
  const inicioDoMes = hoje.slice(0, 8) + "01";

  const [de, setDe] = useState(inicioDoMes);
  const [ate, setAte] = useState(hoje);
  const [aba, setAba] = useState<Aba>("combustivel");

  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    // O refresh do token corre em paralelo com as queries e devolve 401 se
    // alguma sair primeiro; getUser() espera o token ficar bom.
    await supabase.auth.getUser();

    // `saida_em` é timestamptz: o recorte precisa ser o dia de São Paulo virado
    // em UTC, senão o filtro corta às 21h e some com o roteiro das 22h.
    const janela = intervaloUTC(de, ate);

    const [vei, rot, man, oco] = await Promise.all([
      supabase.from("veiculos").select("id, placa, modelo, custo_km, consumo_km_l, valor_combustivel"),
      supabase.from("v_roteiros")
        .select("id, placa, modelo, saida_em, chegada_em, km_rodado, custo_roteiro, custo_km, duracao_min, tecnico_saida, situacao")
        .gte("saida_em", janela.de).lte("saida_em", janela.ate),
      // `aberta_em` e `data` são colunas date: dia puro, sem fuso a converter.
      supabase.from("manutencoes")
        .select("*, veiculo:veiculo_id(placa,modelo)")
        .gte("aberta_em", de).lte("aberta_em", ate),
      supabase.from("ocorrencias")
        .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)")
        .gte("data", de).lte("data", ate),
    ]);

    const problema = vei.error || rot.error || man.error || oco.error;
    if (problema) setErro(problema.message);

    setVeiculos((vei.data as Veiculo[]) ?? []);
    setRoteiros((rot.data as Roteiro[]) ?? []);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    setManutencoes(
      ((man.data as any[]) ?? []).map((m) => {
        const v = one(m.veiculo as { placa: string; modelo: string } | null);
        return { ...m, placa: v?.placa ?? "—", modelo: v?.modelo ?? "" } as Manutencao;
      }),
    );
    setOcorrencias(
      ((oco.data as any[]) ?? []).map((o) => {
        const v = one(o.veiculo as { placa: string; modelo: string } | null);
        const t = one(o.tecnico as { nome: string } | null);
        return { ...o, placa: v?.placa ?? "—", modelo: v?.modelo ?? "", tecnico: t?.nome ?? "—" } as Ocorrencia;
      }),
    );
    setCarregando(false);
  }, [de, ate]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  function atalho(dias: number) {
    setDe(diaISO(new Date(Date.now() - dias * 86400000)));
    setAte(hoje);
  }
  function mesPassado() {
    const d = new Date();
    const primeiro = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
    const ultimo = new Date(d.getFullYear(), d.getMonth(), 0, 12);
    setDe(diaISO(primeiro));
    setAte(diaISO(ultimo));
  }

  const periodo = `${dataBR(de)} a ${dataBR(ate)}`;
  const sufixo = `${de}-a-${ate}`;

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
            <div className="d">Relatórios</div>
            <div className="s">{periodo}</div>
          </div>
          <a className="sair" href="/">← Painel</a>
          <form action="/auth/signout" method="post">
            <button className="sair" type="submit">Sair</button>
          </form>
        </div>
      </header>

      <nav className="subnav">
        <div className="subnav-in">
          {ABAS.map(([k, rotulo]) => (
            <button key={k} className={aba === k ? "navtab on" : "navtab"} onClick={() => setAba(k)}>
              {rotulo}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap">
        <section className="filtros no-print">
          <div className="campo">
            <label htmlFor="de">De</label>
            <input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="ate">Até</label>
            <input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="atalhos">
            <button className="chip" onClick={() => { setDe(inicioDoMes); setAte(hoje); }}>Este mês</button>
            <button className="chip" onClick={mesPassado}>Mês passado</button>
            <button className="chip" onClick={() => atalho(30)}>30 dias</button>
            <button className="chip" onClick={() => atalho(90)}>90 dias</button>
          </div>
          <button className="btn" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
        </section>

        <div className="periodo-print">Período: {periodo}</div>

        {erro && <div className="aviso-erro">{erro}</div>}
        {carregando ? (
          <div className="panel"><div className="empty">Carregando o período…</div></div>
        ) : (
          <>
            {aba === "combustivel" && <Combustivel {...{ roteiros, veiculos, sufixo, periodo }} />}
            {aba === "km" && <KmRodado {...{ roteiros, sufixo, periodo }} />}
            {aba === "tecnicos" && <Tecnicos {...{ roteiros, sufixo, periodo }} />}
            {aba === "manutencoes" && <Manutencoes {...{ manutencoes, sufixo, periodo }} />}
            {aba === "ocorrencias" && <Ocorrencias {...{ ocorrencias, sufixo, periodo }} />}
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------ peças comuns ------------------------------ */
function Kpi({ lbl, val, sub, tom }: { lbl: string; val: string; sub: string; tom?: string | null }) {
  return (
    <div className="kpi">
      <div className="lbl">{lbl}</div>
      <div className={"val mono" + (tom ? " " + tom : "")}>{val}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function Cabeca({ titulo, dica, onCSV }: { titulo: string; dica: string; onCSV: () => void }) {
  return (
    <div className="board-head">
      <h2>{titulo}</h2>
      <span className="hint">{dica}</span>
      <button className="btn ml-auto no-print" onClick={onCSV}>↧ CSV</button>
    </div>
  );
}

function Barra({ rotulo, sub, valor, texto, max }: {
  rotulo: React.ReactNode; sub?: string; valor: number; texto: string; max: number;
}) {
  return (
    <div className="barra">
      <div className="barra-top">
        {rotulo}
        {sub && <span className="mute-xs">{sub}</span>}
        <span className="mono forte ml-auto">{texto}</span>
      </div>
      <div className="trilho"><div className="fill" style={{ width: (100 * valor / max) + "%" }} /></div>
    </div>
  );
}

function Vazio({ o_que }: { o_que: string }) {
  return <div className="panel"><div className="empty">Nenhuma {o_que} no período escolhido.</div></div>;
}

/* ----------------------------- 1. combustível ----------------------------- */
function Combustivel({ roteiros, veiculos, sufixo, periodo }: {
  roteiros: Roteiro[]; veiculos: Veiculo[]; sufixo: string; periodo: string;
}) {
  const linhas = useMemo(() => combustivelPorVeiculo(roteiros, veiculos), [roteiros, veiculos]);
  const custo = linhas.reduce((s, l) => s + l.custo, 0);
  const kmTotal = linhas.reduce((s, l) => s + l.km, 0);
  const litros = linhas.reduce((s, l) => s + (l.litros ?? 0), 0);
  const max = Math.max(1, ...linhas.map((l) => l.custo));

  if (linhas.length === 0) return <Vazio o_que="rodagem" />;

  return (
    <>
      <section className="kpis kpis-4">
        <Kpi lbl="Custo de combustível" val={brl(custo)} sub={periodo} />
        <Kpi lbl="Km rodado" val={km(kmTotal)} sub="frota inteira" />
        <Kpi lbl="Custo médio" val={"R$ " + (custo / (kmTotal || 1)).toFixed(2)} sub="por km" />
        <Kpi lbl="Litros (estimado)" val={litros ? nf.format(Math.round(litros)) + " L" : "—"} sub="pelo consumo cadastrado" />
      </section>

      <Cabeca
        titulo="Custo de combustível por veículo"
        dica="km rodado × custo por km do cadastro"
        onCSV={() => baixar(`combustivel-${sufixo}`,
          ["placa", "veiculo", "roteiros", "km_rodado", "custo_por_km", "custo_total", "litros_estimados"],
          linhas.map((l) => [l.placa, l.modelo, l.roteiros, l.km,
            l.custoKm?.toFixed(4) ?? "", l.custo.toFixed(2),
            l.litros != null ? l.litros.toFixed(1) : ""]))}
      />

      <section className="panel">
        {linhas.map((l) => (
          <Barra
            key={l.placa}
            rotulo={<span className="plate">{l.placa}</span>}
            sub={l.modelo}
            valor={l.custo}
            texto={brl(l.custo)}
            max={max}
          />
        ))}
        <div className="rodape-tabela">
          {linhas.map((l) => (
            <div key={l.placa} className="linha">
              <span className="plate">{l.placa}</span>
              <span className="mute-xs">{l.roteiros} roteiro(s)</span>
              <span className="mono ml-auto">{km(l.km)}</span>
              <span className="mono">{l.litros != null ? nf.format(Math.round(l.litros)) + " L" : "s/ consumo"}</span>
              <span className="mono forte">{brl(l.custo)}</span>
            </div>
          ))}
          <div className="linha total">
            <span className="forte">Total</span>
            <span className="mono ml-auto">{km(kmTotal)}</span>
            <span className="mono">{litros ? nf.format(Math.round(litros)) + " L" : "—"}</span>
            <span className="mono forte">{brl(custo)}</span>
          </div>
        </div>
      </section>

      <div className="legend">
        Custo estimado: km rodado × o custo por km do cadastro do veículo (preço do
        combustível ÷ consumo). Não é nota de posto — para custo real seria preciso
        registrar abastecimento.
      </div>
    </>
  );
}

/* ------------------------------- 2. km rodado ----------------------------- */
function KmRodado({ roteiros, sufixo, periodo }: { roteiros: Roteiro[]; sufixo: string; periodo: string }) {
  const [corte, setCorte] = useState<"dia" | "mes" | "veiculo">("dia");

  const porDia = useMemo(() => kmPorDia(roteiros, diaDoRoteiro), [roteiros]);
  const porMes = useMemo(() => kmPorMes(roteiros, diaDoRoteiro), [roteiros]);
  const porVeic = useMemo(() => kmPorVeiculo(roteiros), [roteiros]);

  const lista = corte === "dia" ? porDia : corte === "mes" ? porMes : porVeic;
  const rotuloDe = (c: string) => (corte === "dia" ? dataBR(c) : corte === "mes" ? mesBR(c) : c);
  const kmTotal = porVeic.reduce((s, l) => s + l.km, 0);
  const nRoteiros = porVeic.reduce((s, l) => s + l.roteiros, 0);
  const max = Math.max(1, ...lista.map((l) => l.km));

  if (lista.length === 0) return <Vazio o_que="rodagem" />;

  return (
    <>
      <section className="kpis kpis-4">
        <Kpi lbl="Km no período" val={km(kmTotal)} sub={periodo} />
        <Kpi lbl="Roteiros fechados" val={String(nRoteiros)} sub="com km lançado" />
        <Kpi lbl="Média por roteiro" val={km(kmTotal / (nRoteiros || 1))} sub="frota inteira" />
        <Kpi lbl="Média por dia" val={km(kmTotal / (porDia.length || 1))} sub={`${porDia.length} dia(s) com roteiro`} />
      </section>

      <Cabeca
        titulo={corte === "dia" ? "Km por dia" : corte === "mes" ? "Km por mês" : "Km por veículo"}
        dica="o roteiro conta no dia em que saiu"
        onCSV={() => baixar(`km-por-${corte}-${sufixo}`,
          [corte, "km_rodado", "roteiros", "custo_combustivel"],
          lista.map((l) => [l.chave, l.km, l.roteiros, l.custo.toFixed(2)]))}
      />

      <div className="chips no-print">
        {(["dia", "mes", "veiculo"] as const).map((c) => (
          <button key={c} className={corte === c ? "chip on" : "chip"} onClick={() => setCorte(c)}>
            {c === "dia" ? "Por dia" : c === "mes" ? "Por mês" : "Por veículo"}
          </button>
        ))}
      </div>

      <section className="panel">
        {lista.map((l) => (
          <Barra
            key={l.chave}
            rotulo={
              corte === "veiculo"
                ? <span className="plate">{l.chave}</span>
                : <span className="forte mono">{rotuloDe(l.chave)}</span>
            }
            sub={`${l.roteiros} roteiro(s)`}
            valor={l.km}
            texto={km(l.km)}
            max={max}
          />
        ))}
        <div className="linha total">
          <span className="forte">Total do período</span>
          <span className="mono ml-auto">{nRoteiros} roteiro(s)</span>
          <span className="mono forte">{km(kmTotal)}</span>
        </div>
      </section>
    </>
  );
}

/* ------------------------------- 3. técnicos ------------------------------ */
function Tecnicos({ roteiros, sufixo, periodo }: { roteiros: Roteiro[]; sufixo: string; periodo: string }) {
  const linhas = useMemo(() => porTecnico(roteiros, diaDoRoteiro), [roteiros]);
  const max = Math.max(1, ...linhas.map((l) => l.roteiros));
  const totalRot = linhas.reduce((s, l) => s + l.roteiros, 0);
  const totalKm = linhas.reduce((s, l) => s + l.km, 0);

  if (linhas.length === 0) return <Vazio o_que="saída" />;

  return (
    <>
      <section className="kpis kpis-3">
        <Kpi lbl="Deslocamentos" val={String(totalRot)} sub={periodo} />
        <Kpi lbl="Técnicos que saíram" val={String(linhas.length)} sub="no período" />
        <Kpi lbl="Km da equipe" val={km(totalKm)} sub="só roteiros fechados" />
      </section>

      <Cabeca
        titulo="Deslocamentos por técnico"
        dica="a saída conta mesmo sem chegada registrada"
        onCSV={() => baixar(`tecnicos-${sufixo}`,
          ["tecnico", "roteiros", "dias_com_saida", "km_rodado", "media_km_por_roteiro", "tempo_fora", "sem_chegada"],
          linhas.map((l) => [l.tecnico, l.roteiros, l.dias, l.km,
            Math.round(l.km / (l.roteiros - l.emAberto || 1)), horas(l.minutos), l.emAberto]))}
      />

      <section className="panel">
        {linhas.map((l) => {
          const fechados = l.roteiros - l.emAberto;
          return (
            <div key={l.tecnico} className="barra">
              <div className="barra-top">
                <span className="forte">{l.tecnico}</span>
                {l.emAberto > 0 && <span className="tag warn">{l.emAberto} sem chegada</span>}
                <span className="mono forte ml-auto">{l.roteiros} roteiro(s)</span>
              </div>
              <div className="trilho"><div className="fill" style={{ width: (100 * l.roteiros / max) + "%" }} /></div>
              <div className="mute-xs">
                {km(l.km)} · {horas(l.minutos)} fora · {l.dias} dia(s) com saída
                {fechados > 0 ? ` · média ${km(l.km / fechados)}/roteiro` : ""}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ----------------------------- 4. manutenções ----------------------------- */
function Manutencoes({ manutencoes, sufixo, periodo }: {
  manutencoes: Manutencao[]; sufixo: string; periodo: string;
}) {
  const porVeiculo = useMemo(() => manutencaoPorVeiculo(manutencoes), [manutencoes]);
  const total = contasManutencao(manutencoes);
  const porTipo = useMemo(() => contar(manutencoes, (m) => m.tipo), [manutencoes]);
  const porOrigem = useMemo(() => contar(manutencoes, (m) => m.origem), [manutencoes]);
  const max = Math.max(1, ...porVeiculo.map((l) => l.gasto));

  if (manutencoes.length === 0) return <Vazio o_que="manutenção aberta" />;

  return (
    <>
      <section className="kpis kpis-4">
        <Kpi lbl="Gasto" val={brl(total.gasto)} sub={periodo} />
        <Kpi lbl="Previsto em aberto" val={brl(total.previsto)} sub="orçado, ainda na oficina" tom={total.previsto > 0 ? "warn" : null} />
        <Kpi lbl="Ordens abertas" val={String(total.abertas)} sub={`de ${total.ordens} no período`} tom={total.abertas > 0 ? "warn" : null} />
        <Kpi lbl="Custo médio" val={brl(total.ordens ? total.gasto / total.ordens : 0)} sub="por ordem" />
      </section>

      <Cabeca
        titulo="Manutenção por veículo"
        dica="ordens abertas dentro do período"
        onCSV={() => baixar(`manutencoes-${sufixo}`,
          ["aberta_em", "placa", "veiculo", "tipo", "origem", "prioridade", "status", "oficina",
            "problema", "servico_realizado", "pecas_trocadas", "orcamento", "valor_final", "concluida_em"],
          manutencoes.map((m) => [m.aberta_em ?? "", m.placa, m.modelo, m.tipo ?? "", m.origem ?? "",
            m.prioridade ?? "", m.status, m.oficina ?? "", m.descricao_problema,
            m.servico_realizado ?? "", m.pecas_trocadas ?? "",
            m.orcamento?.toFixed(2) ?? "", m.valor_final?.toFixed(2) ?? "", m.concluida_em ?? ""]))}
      />

      <section className="panel">
        {porVeiculo.map((l) => (
          <div key={l.placa} className="barra">
            <div className="barra-top">
              <span className="plate">{l.placa}</span>
              <span className="mute-xs">{l.modelo}</span>
              <span className="mono forte ml-auto">{brl(l.gasto)}</span>
            </div>
            <div className="trilho"><div className="fill" style={{ width: (100 * l.gasto / max) + "%" }} /></div>
            <div className="mute-xs">
              {l.ordens} ordem(ns)
              {l.abertas > 0 ? ` · ${l.abertas} em aberto` : ""}
              {l.previsto > 0 ? ` · previsto ${brl(l.previsto)}` : ""}
            </div>
          </div>
        ))}
      </section>

      <div className="duas">
        <Contagem titulo="Por tipo" linhas={porTipo} />
        <Contagem titulo="Por origem" linhas={porOrigem} />
      </div>
    </>
  );
}

/* ----------------------------- 5. ocorrências ----------------------------- */
function Ocorrencias({ ocorrencias, sufixo, periodo }: {
  ocorrencias: Ocorrencia[]; sufixo: string; periodo: string;
}) {
  const porVeiculo = useMemo(() => contar(ocorrencias, (o) => o.placa), [ocorrencias]);
  const porTipo = useMemo(() => contar(ocorrencias, (o) => o.tipo), [ocorrencias]);
  const porGravidade = useMemo(() => contar(ocorrencias, (o) => o.gravidade), [ocorrencias]);
  const abertas = ocorrencias.filter((o) => o.status === "ABERTA" || o.status === "EM ANÁLISE").length;
  const graves = ocorrencias.filter((o) => o.gravidade === "GRAVE").length;
  const comTerceiros = ocorrencias.filter((o) => o.terceiros).length;
  const max = Math.max(1, ...porVeiculo.map((l) => l.n));

  if (ocorrencias.length === 0) return <Vazio o_que="ocorrência" />;

  return (
    <>
      <section className="kpis kpis-4">
        <Kpi lbl="Ocorrências" val={String(ocorrencias.length)} sub={periodo} />
        <Kpi lbl="Em aberto" val={String(abertas)} sub="ainda sem desfecho" tom={abertas > 0 ? "warn" : null} />
        <Kpi lbl="Graves" val={String(graves)} sub="no período" tom={graves > 0 ? "crit" : null} />
        <Kpi lbl="Com terceiros" val={String(comTerceiros)} sub="outro veículo ou pessoa" />
      </section>

      <Cabeca
        titulo="Ocorrências por veículo"
        dica="dano, acidente e avaria relatados pela equipe"
        onCSV={() => baixar(`ocorrencias-${sufixo}`,
          ["data", "placa", "veiculo", "tecnico", "tipo", "gravidade", "terceiros", "local",
            "descricao", "status", "resolvida_em"],
          ocorrencias.map((o) => [o.data, o.placa, o.modelo, o.tecnico, o.tipo, o.gravidade,
            o.terceiros ? "sim" : "não", o.local ?? "", o.descricao, o.status, o.resolvida_em ?? ""]))}
      />

      <section className="panel">
        {porVeiculo.map((l) => (
          <Barra
            key={l.chave}
            rotulo={<span className="plate">{l.chave}</span>}
            valor={l.n}
            texto={`${l.n} ocorrência(s)`}
            max={max}
          />
        ))}
      </section>

      <div className="duas">
        <Contagem titulo="Por tipo" linhas={porTipo} />
        <Contagem titulo="Por gravidade" linhas={porGravidade} />
      </div>

      <div className="board-head"><h2>Uma a uma</h2></div>
      <section className="panel">
        {[...ocorrencias].sort((a, b) => b.data.localeCompare(a.data)).map((o) => (
          <div key={o.id} className="ocorr">
            <div className="barra-top">
              <span className="mono forte">{dataBR(o.data)}</span>
              <span className="plate">{o.placa}</span>
              <span className={"tag " + (o.gravidade === "GRAVE" ? "crit" : o.gravidade === "MODERADA" ? "warn" : "mute")}>
                {o.gravidade}
              </span>
              <span className="mute-xs">{o.tipo}</span>
              <span className="tag mute ml-auto">{o.status}</span>
            </div>
            <div className="ocorr-desc">{o.descricao}</div>
            <div className="mute-xs">
              {o.tecnico}
              {o.local ? " · " + o.local : ""}
              {o.terceiros ? " · com terceiros" : ""}
              {o.resolvida_em ? " · encerrada em " + dataBR(o.resolvida_em) : ""}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function Contagem({ titulo, linhas }: { titulo: string; linhas: { chave: string; n: number }[] }) {
  const total = linhas.reduce((s, l) => s + l.n, 0) || 1;
  return (
    <section className="panel">
      <div className="mini-head">{titulo}</div>
      {linhas.map((l) => (
        <div key={l.chave} className="linha">
          <span>{l.chave}</span>
          <span className="mono ml-auto">{l.n}</span>
          <span className="mute-xs">{Math.round(100 * l.n / total)}%</span>
        </div>
      ))}
    </section>
  );
}

/* ================================== CSS ================================== */
const CSS = `
.app{--bg:#EBEEF4;--surface:#fff;--surface-2:#F4F6FB;--border:#DBE0EA;--border-strong:#C4CCDA;
  --ink:#16233C;--ink-2:#53607A;--ink-3:#8591A5;--brand:#2B4C8C;--navy:#17263F;--navy-2:#223B63;
  --silver:#AEB8C6;--ok:#1B9E6B;--ok-bg:#E5F4EE;--warn:#C08306;--warn-bg:#FAEFD6;--crit:#CE3A44;--crit-bg:#FAE5E7;
  --shadow:0 1px 2px rgba(22,35,60,.06),0 8px 24px rgba(22,35,60,.05);
  min-height:100vh;background:var(--bg);color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.app .mono{font-variant-numeric:tabular-nums}
.app button,.app input,.app select{font-family:inherit}
.mute-xs{font-size:12px;color:var(--ink-2)}
.forte{font-weight:650;color:var(--ink)}
.ml-auto{margin-left:auto}

.topbar{background:linear-gradient(180deg,var(--navy),var(--navy-2));color:#fff;position:sticky;top:0;z-index:10}
.topbar-in{max-width:1240px;margin:0 auto;padding:13px 20px;display:flex;align-items:center;gap:12px}
.logo-h{height:42px;display:block}
@media(max-width:560px){.logo-h{height:34px}.top-meta{display:none}}
.spacer{flex:1}
.top-meta{text-align:right;line-height:1.3}
.top-meta .d{font-size:13px;font-weight:600}
.top-meta .s{font-size:11.5px;color:var(--silver)}
.sair{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;
  padding:8px 12px;font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;white-space:nowrap}
.sair:hover{background:rgba(255,255,255,.2)}

.subnav{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:68px;z-index:9}
.subnav-in{max-width:1240px;margin:0 auto;padding:0 12px;display:flex;gap:2px;overflow-x:auto}
.navtab{padding:13px 14px;font-size:13px;font-weight:600;color:var(--ink-2);border:none;background:none;
  border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap}
.navtab.on{color:var(--brand);border-bottom-color:var(--brand)}

.wrap{max-width:1240px;margin:0 auto;padding:20px 20px 64px}

.filtros{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);
  padding:14px 16px;margin-bottom:20px;display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}
.campo{display:flex;flex-direction:column;gap:5px;min-width:145px}
.campo label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.campo input{padding:9px 10px;border-radius:9px;border:1px solid var(--border-strong);font-size:14px;
  background:var(--surface);color:var(--ink);box-sizing:border-box;width:100%}
.atalhos,.chips{display:flex;gap:7px;flex-wrap:wrap}
.chips{margin-bottom:12px}
.chip{padding:8px 13px;border-radius:20px;border:1px solid var(--border-strong);background:var(--surface);
  color:var(--ink-2);font-size:12.5px;font-weight:600;cursor:pointer}
.chip.on{background:var(--brand);border-color:transparent;color:#fff}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;font-size:13.5px;
  font-weight:600;cursor:pointer;border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}

.periodo-print{display:none}
.aviso-erro{background:var(--crit-bg);border:1px solid #E9B7BC;color:#8E2129;border-radius:12px;
  padding:14px 16px;font-size:13.5px;margin-bottom:16px}

.kpis{display:grid;gap:14px;margin-bottom:22px}
.kpis-4{grid-template-columns:repeat(4,1fr)}
.kpis-3{grid-template-columns:repeat(3,1fr)}
@media(max-width:840px){.kpis-4,.kpis-3{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:15px 16px;box-shadow:var(--shadow)}
.kpi .lbl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.kpi .val{font-size:24px;font-weight:700;letter-spacing:-.02em;margin-top:7px;line-height:1}
.kpi .val.warn{color:var(--warn)}
.kpi .val.crit{color:var(--crit)}
.kpi .sub{font-size:11.5px;color:var(--ink-2);margin-top:6px}

.board-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.board-head h2{font-size:15px;font-weight:650;margin:0}
.board-head .hint{font-size:12px;color:var(--ink-3)}

.panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:6px 16px;
  box-shadow:var(--shadow);margin-bottom:20px}
.empty{font-size:12.5px;color:var(--ink-3);padding:20px 4px;text-align:center}
.legend{margin-top:4px;font-size:12px;color:var(--ink-3);text-align:center;line-height:1.5}

.barra{padding:12px 0;border-top:1px solid var(--border)}
.barra:first-child{border-top:none}
.barra-top{display:flex;align-items:center;gap:9px;margin-bottom:6px;flex-wrap:wrap}
.trilho{height:7px;background:var(--surface-2);border:1px solid var(--border);border-radius:4px;overflow:hidden;margin-bottom:5px}
.fill{height:100%;background:var(--brand)}
.plate{font-weight:700;font-size:12px;letter-spacing:.04em;color:var(--ink);background:var(--surface-2);
  border:1px solid var(--border-strong);border-radius:6px;padding:2px 7px}
.tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:1px 7px;border-radius:5px}
.tag.warn{background:var(--warn-bg);color:var(--warn)}
.tag.crit{background:var(--crit-bg);color:var(--crit)}
.tag.mute{background:var(--surface-2);color:var(--ink-2);border:1px solid var(--border)}

.linha{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border);font-size:13px}
.linha.total{border-top:2px solid var(--border-strong);font-weight:650}
.rodape-tabela{margin-top:6px}
.mini-head{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);
  font-weight:700;padding:12px 0 2px}
.duas{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
@media(max-width:720px){.duas{grid-template-columns:1fr}}

.ocorr{padding:12px 0;border-top:1px solid var(--border)}
.ocorr:first-child{border-top:none}
.ocorr-desc{font-size:13.5px;margin:5px 0 3px;line-height:1.45}

@media print{
  .no-print,.topbar,.subnav,.chips{display:none!important}
  .app{background:#fff}
  .wrap{padding:0}
  .periodo-print{display:block;font-size:12px;color:#53607A;margin-bottom:14px}
  .panel,.kpi{box-shadow:none;break-inside:avoid}
  @page{size:A4;margin:12mm}
}
@media(prefers-reduced-motion:reduce){.app *{transition:none!important}}
`;
