"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { diaDe, diaISO, intervaloUTC } from "@/lib/frota/tempo";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Contador,
  Input,
  Pagina,
  cx,
} from "@/components/ui";
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

// Fora do componente: `new Date()` é impuro e não pode ser chamado no corpo de
// um componente. Estas duas só alimentam o valor inicial dos filtros.
function hojeISO() {
  return diaISO(new Date());
}
function inicioDoMes() {
  return hojeISO().slice(0, 8) + "01";
}

export default function RelatoriosPage() {
  const [de, setDe] = useState(() => inicioDoMes());
  const [ate, setAte] = useState(() => hojeISO());
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
    (async () => {
      await buscar();
    })();
  }, [buscar]);

  function atalho(dias: number) {
    setDe(diaISO(new Date(Date.now() - dias * 86400000)));
    setAte(hojeISO());
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
    <Pagina
      titulo="Relatórios"
      subtitulo={periodo}
      acoes={
        <div className="rolagem-fina flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-200/70 p-1 print:hidden">
          {ABAS.map(([k, rotulo]) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={cx(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-semibold transition",
                aba === k ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      }
    >
      <Cartao className="mb-5 p-3.5 print:hidden">
        <div className="flex flex-wrap items-end gap-2.5">
          <Campo rotulo="De" className="min-w-[145px]">
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até" className="min-w-[145px]">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap gap-1.5">
            <Chip onClick={() => { setDe(inicioDoMes()); setAte(hojeISO()); }}>Este mês</Chip>
            <Chip onClick={mesPassado}>Mês passado</Chip>
            <Chip onClick={() => atalho(30)}>30 dias</Chip>
            <Chip onClick={() => atalho(90)}>90 dias</Chip>
          </div>
          <Botao className="ml-auto" onClick={() => window.print()}>
            <Printer size={14} />
            Imprimir / PDF
          </Botao>
        </div>
      </Cartao>

      {/* Só no papel: a folha impressa precisa dizer de que período ela é. */}
      <div className="mb-3.5 hidden text-[12px] text-slate-500 print:block">Período: {periodo}</div>

      {erro && <Aviso>{erro}</Aviso>}
      {carregando ? (
        <Cartao>
          <Carregando texto="Carregando o período…" />
        </Cartao>
      ) : (
        <>
          {aba === "combustivel" && <Combustivel {...{ roteiros, veiculos, sufixo, periodo }} />}
          {aba === "km" && <KmRodado {...{ roteiros, sufixo, periodo }} />}
          {aba === "tecnicos" && <Tecnicos {...{ roteiros, sufixo, periodo }} />}
          {aba === "manutencoes" && <Manutencoes {...{ manutencoes, sufixo, periodo }} />}
          {aba === "ocorrencias" && <Ocorrencias {...{ ocorrencias, sufixo, periodo }} />}
        </>
      )}
    </Pagina>
  );
}

/* ------------------------------ peças comuns ------------------------------ */
function Chip({ children, onClick, ativo }: { children: React.ReactNode; onClick(): void; ativo?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition",
        ativo
          ? "bg-brand-700 text-white ring-brand-700"
          : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function Kpi({ lbl, val, sub, tom }: { lbl: string; val: string; sub: string; tom?: string | null }) {
  const cor = tom === "warn" ? "text-amber-600" : tom === "crit" ? "text-red-600" : "text-slate-900";
  return <Contador rotulo={lbl} valor={val} legenda={sub} tom={cor} />;
}

function Cabeca({ titulo, dica, onCSV }: { titulo: string; dica: string; onCSV: () => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <h2 className="text-[15px] font-semibold text-slate-900">{titulo}</h2>
      <span className="text-[12px] text-slate-500">{dica}</span>
      <Botao className="ml-auto print:hidden" onClick={onCSV}>
        <Download size={14} />
        CSV
      </Botao>
    </div>
  );
}

/** Trilho da barra: uma medida só, uma cor só — o azul da marca. */
function Barra({ rotulo, sub, valor, texto, max }: {
  rotulo: React.ReactNode; sub?: string; valor: number; texto: string; max: number;
}) {
  return (
    <div className="border-t border-slate-100 py-3 first:border-t-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {rotulo}
        {sub && <span className="text-[12px] text-slate-500">{sub}</span>}
        <span className="ml-auto font-semibold tabular-nums text-slate-900">{texto}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
        <div className="h-full rounded-full bg-brand-600" style={{ width: (100 * valor / max) + "%" }} />
      </div>
    </div>
  );
}

function SemDados({ o_que }: { o_que: string }) {
  return (
    <Cartao className="px-4 py-8 text-center text-[13px] text-slate-500">
      Nenhuma {o_que} no período escolhido.
    </Cartao>
  );
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

  if (linhas.length === 0) return <SemDados o_que="rodagem" />;

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi lbl="Custo de combustível" val={brl(custo)} sub={periodo} />
        <Kpi lbl="Km rodado" val={km(kmTotal)} sub="frota inteira" />
        <Kpi lbl="Custo médio" val={brl(custo / (kmTotal || 1))} sub="por km" />
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

      <section className="mb-5 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
        {linhas.map((l) => (
          <Barra
            key={l.placa}
            rotulo={<span className="placa">{l.placa}</span>}
            sub={l.modelo}
            valor={l.custo}
            texto={brl(l.custo)}
            max={max}
          />
        ))}
        <div className="mt-1.5">
          {linhas.map((l) => (
            <div key={l.placa} className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-2.5 text-[13px] first:border-t-0">
              <span className="placa">{l.placa}</span>
              <span className="text-[12px] text-slate-500">{l.roteiros} roteiro(s)</span>
              <span className="ml-auto tabular-nums">{km(l.km)}</span>
              <span className="tabular-nums">{l.litros != null ? nf.format(Math.round(l.litros)) + " L" : "s/ consumo"}</span>
              <span className="font-semibold tabular-nums text-slate-900">{brl(l.custo)}</span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 border-t-2 border-slate-300 py-2.5 text-[13px] font-semibold text-slate-900">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="ml-auto tabular-nums">{km(kmTotal)}</span>
            <span className="tabular-nums">{litros ? nf.format(Math.round(litros)) + " L" : "—"}</span>
            <span className="font-semibold tabular-nums text-slate-900">{brl(custo)}</span>
          </div>
        </div>
      </section>

      <div className="mb-5 text-center text-[12px] leading-relaxed text-slate-400">
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

  if (lista.length === 0) return <SemDados o_que="rodagem" />;

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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

      <div className="mb-3 flex flex-wrap gap-1.5 print:hidden">
        {(["dia", "mes", "veiculo"] as const).map((c) => (
          <Chip key={c} ativo={corte === c} onClick={() => setCorte(c)}>
            {c === "dia" ? "Por dia" : c === "mes" ? "Por mês" : "Por veículo"}
          </Chip>
        ))}
      </div>

      <section className="mb-5 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
        {lista.map((l) => (
          <Barra
            key={l.chave}
            rotulo={
              corte === "veiculo"
                ? <span className="placa">{l.chave}</span>
                : <span className="font-semibold tabular-nums text-slate-900">{rotuloDe(l.chave)}</span>
            }
            sub={`${l.roteiros} roteiro(s)`}
            valor={l.km}
            texto={km(l.km)}
            max={max}
          />
        ))}
        <div className="flex flex-wrap items-center gap-3 border-t-2 border-slate-300 py-2.5 text-[13px] font-semibold text-slate-900">
          <span className="font-semibold text-slate-900">Total do período</span>
          <span className="ml-auto tabular-nums">{nRoteiros} roteiro(s)</span>
          <span className="font-semibold tabular-nums text-slate-900">{km(kmTotal)}</span>
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

  if (linhas.length === 0) return <SemDados o_que="saída" />;

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
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

      <section className="mb-5 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
        {linhas.map((l) => {
          const fechados = l.roteiros - l.emAberto;
          return (
            <div key={l.tecnico} className="border-t border-slate-100 py-3 first:border-t-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{l.tecnico}</span>
                {l.emAberto > 0 && <Badge tom="atencao">{l.emAberto} sem chegada</Badge>}
                <span className="ml-auto font-semibold tabular-nums text-slate-900">{l.roteiros} roteiro(s)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200"><div className="h-full rounded-full bg-brand-600" style={{ width: (100 * l.roteiros / max) + "%" }} /></div>
              <div className="text-[12px] text-slate-500">
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

  if (manutencoes.length === 0) return <SemDados o_que="manutenção aberta" />;

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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
            "problema", "servico_realizado", "pecas_trocadas", "garantia", "orcamento", "valor_final",
            "concluida_em"],
          manutencoes.map((m) => [m.aberta_em ?? "", m.placa, m.modelo, m.tipo ?? "", m.origem ?? "",
            m.prioridade ?? "", m.status, m.oficina ?? "", m.descricao_problema,
            m.servico_realizado ?? "", m.pecas_trocadas ?? "", m.garantia ?? "",
            m.orcamento?.toFixed(2) ?? "", m.valor_final?.toFixed(2) ?? "", m.concluida_em ?? ""]))}
      />

      <section className="mb-5 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
        {porVeiculo.map((l) => (
          <div key={l.placa} className="border-t border-slate-100 py-3 first:border-t-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="placa">{l.placa}</span>
              <span className="text-[12px] text-slate-500">{l.modelo}</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900">{brl(l.gasto)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200"><div className="h-full rounded-full bg-brand-600" style={{ width: (100 * l.gasto / max) + "%" }} /></div>
            <div className="text-[12px] text-slate-500">
              {l.ordens} ordem(ns)
              {l.abertas > 0 ? ` · ${l.abertas} em aberto` : ""}
              {l.previsto > 0 ? ` · previsto ${brl(l.previsto)}` : ""}
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

  if (ocorrencias.length === 0) return <SemDados o_que="ocorrência" />;

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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

      <section className="mb-5 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
        {porVeiculo.map((l) => (
          <Barra
            key={l.chave}
            rotulo={<span className="placa">{l.chave}</span>}
            valor={l.n}
            texto={`${l.n} ocorrência(s)`}
            max={max}
          />
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Contagem titulo="Por tipo" linhas={porTipo} />
        <Contagem titulo="Por gravidade" linhas={porGravidade} />
      </div>

      <h2 className="mb-3 text-[15px] font-semibold text-slate-900">Uma a uma</h2>
      <section className="mb-5 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
        {[...ocorrencias].sort((a, b) => b.data.localeCompare(a.data)).map((o) => (
          <div key={o.id} className="border-t border-slate-100 py-3 first:border-t-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums text-slate-900">{dataBR(o.data)}</span>
              <span className="placa">{o.placa}</span>
              <Badge tom={o.gravidade === "GRAVE" ? "critico" : o.gravidade === "MODERADA" ? "atencao" : "mudo"}>
                {o.gravidade}
              </Badge>
              <span className="text-[12px] text-slate-500">{o.tipo}</span>
              <Badge className="ml-auto">{o.status}</Badge>
            </div>
            <div className="my-1 text-[13.5px] leading-relaxed text-slate-800">{o.descricao}</div>
            <div className="text-[12px] text-slate-500">
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
    <section className="mb-5 rounded-xl bg-white px-4 pb-1 shadow-sm ring-1 ring-slate-200">
      <div className="pb-0.5 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">{titulo}</div>
      {linhas.map((l) => (
        <div key={l.chave} className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-2.5 text-[13px] first:border-t-0">
          <span>{l.chave}</span>
          <span className="ml-auto tabular-nums">{l.n}</span>
          <span className="text-[12px] text-slate-500">{Math.round(100 * l.n / total)}%</span>
        </div>
      ))}
    </section>
  );
}
