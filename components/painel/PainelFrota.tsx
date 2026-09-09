"use client";

/**
 * Painel do gestor: o estado da frota numa tela.
 *
 * Ordem de leitura: (1) o que exige ação agora — a faixa de alertas; (2) os
 * números do dia e do mês; (3) o quadro da operação, coluna por coluna; e as
 * outras faces da mesma frota nos recortes Frota, Custos e Manutenções.
 *
 * O visual é o do app de Roteiros (componentes em `components/ui.tsx`): mesma
 * paleta, mesmo cartão, mesmo modal. O CSS próprio que esta tela injetava saiu
 * — dois sistemas do mesmo grupo não podem ter dois desenhos de botão.
 *
 * Nada aqui calcula o que o banco já entrega pronto: km rodado, custo por km e
 * situação vêm das views. As somas de tela (km do mês, gasto por veículo) são
 * do momento, e é por isso que ficam aqui e não numa coluna.
 */

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Printer,
  Receipt,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Botao,
  BotaoLink,
  Cartao,
  Contador,
  Modal,
  Pagina,
  Placa,
  Vazio,
  cx,
  type Tom,
} from "@/components/ui";
import type {
  ChecklistDados,
  Dados,
  ManutencaoDados,
  RoteiroDados,
  VeiculoDados,
} from "@/lib/frota/types";

/* ============================ utilidades ============================ */

const nf = new Intl.NumberFormat("pt-BR");
const brl = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const km = (n?: number | null) => (n == null ? "—" : nf.format(Math.round(n)) + " km");
const dataBR = (s?: string | null) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "—");

// "08:55 → 17:20 · 8h25". O horário já vem convertido para São Paulo em
// lib/frota/tempo.ts — aqui é só a montagem do texto.
const janela = (r: RoteiroDados) => {
  const ida = r.hs || "—";
  const volta = r.hc || (r.st === "PENDENTE DE CHEGADA" ? "na rua" : "—");
  return r.dur ? `${ida} → ${volta} · ${r.dur}` : `${ida} → ${volta}`;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Só o modelo: "Fiorino - SRT9D55" vira "Fiorino". */
const modeloDe = (veic?: string | null) => (veic || "").split(" - ")[0];

/* ============================ peças de tela ============================ */

function Thumb({ foto }: { foto?: string | null }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50 text-brand-600 ring-1 ring-slate-200">
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="h-full w-full object-cover" src={foto} alt="" />
      ) : (
        <Car size={17} />
      )}
    </span>
  );
}

/** Cartão de item dentro de uma coluna do quadro. */
function CartaoItem({ children, onClick }: { children: React.ReactNode; onClick?(): void }) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 transition",
        onClick && "cursor-pointer hover:ring-brand-300",
      )}
    >
      {children}
    </div>
  );
}

const CORES_COLUNA = {
  info: "bg-brand-600",
  ok: "bg-emerald-600",
  atencao: "bg-amber-500",
  critico: "bg-red-600",
} as const;

function Coluna({
  cor,
  titulo,
  n,
  vazio,
  children,
}: {
  cor: keyof typeof CORES_COLUNA;
  titulo: string;
  n: number;
  vazio: string;
  children: React.ReactNode;
}) {
  const itens = React.Children.toArray(children);
  return (
    <div className="overflow-hidden rounded-xl bg-slate-100/70 ring-1 ring-slate-200">
      <div className={cx("h-[3px]", CORES_COLUNA[cor])} />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cx("h-2 w-2 shrink-0 rounded-full", CORES_COLUNA[cor])} />
        <span className="text-[12px] font-bold uppercase tracking-wide text-slate-700">{titulo}</span>
        <span className="ml-auto rounded-full bg-white px-2 py-px text-[11.5px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200">
          {n}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-2.5 pb-3">
        {itens.length ? itens : <p className="px-1 py-2 text-center text-[12px] text-slate-400">{vazio}</p>}
      </div>
    </div>
  );
}

/** Cabeçalho comum dos cartões do quadro: miniatura, placa e modelo. */
function TopoCartao({
  foto,
  placa,
  modelo,
  etiqueta,
}: {
  foto?: string | null;
  placa: string;
  modelo?: string | null;
  etiqueta?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Thumb foto={foto} />
      <Placa>{placa}</Placa>
      <span className="truncate text-[12px] text-slate-500">{modelo}</span>
      {etiqueta && <span className="ml-auto shrink-0">{etiqueta}</span>}
    </div>
  );
}

function Linha({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 py-2 text-[13px] first:border-t-0">
      {children}
    </div>
  );
}

/* ============================ componente ============================ */

type Vista = "operacao" | "frota" | "custos" | "manut" | "relatorios";

const VISTAS: [Vista, string][] = [
  ["operacao", "Operação"],
  ["frota", "Frota"],
  ["custos", "Custos"],
  ["manut", "Manutenções"],
  ["relatorios", "Relatórios"],
];

export default function PainelFrota({
  dados,
  referencia,
  papel = "GESTOR",
}: {
  dados: Dados;
  referencia: string;
  papel?: string;
}) {
  const [vista, setVista] = useState<Vista>("operacao");
  const [sel, setSel] = useState<string | null>(null);
  const soGestor = papel === "GESTOR";

  // Vem pronto da view v_alertas_ativos. Fica vazio enquanto o painel estiver
  // caindo no seed.
  const alertas = dados.alertas || [];
  const nCriticos = alertas.filter((a) => a.gravidade === "CRÍTICO").length;

  const m = useMemo(() => {
    const { veiculos, roteiros, manutencoes, custos, checklists } = dados;
    const porPlaca: Record<string, VeiculoDados> = Object.fromEntries(veiculos.map((v) => [v.placa, v]));
    const mesRef = referencia.slice(0, 7);

    const naRua = roteiros
      .filter((r) => r.st === "PENDENTE DE CHEGADA" && r.ds === referencia)
      .sort((a, b) => (a.hs || "").localeCompare(b.hs || ""));
    const semFechamento = roteiros
      .filter((r) => r.st === "PENDENTE DE CHEGADA" && (r.ds ?? "") < referencia)
      .sort((a, b) => (b.ds || "").localeCompare(a.ds || ""));
    const chegadaSemSaida = roteiros.filter((r) => r.st === "CHEGADA SEM SAÍDA");
    const kmSuspeito = roteiros
      .filter((r) => r.st === "CONCLUÍDO - KM ALTO VERIFICAR")
      .sort((a, b) => (b.kmr || 0) - (a.kmr || 0));

    const concluidos = roteiros.filter((r) => (r.st || "").startsWith("CONCLUÍDO"));
    // O roteiro de km alto aparece em Pendências; repetir aqui daria dois
    // cartões para o mesmo roteiro no mesmo quadro.
    const concluidosHoje = concluidos.filter(
      (r) =>
        (r.dc === referencia || (r.dc == null && r.ds === referencia)) &&
        r.st !== "CONCLUÍDO - KM ALTO VERIFICAR",
    );

    const doMes = roteiros.filter((r) => r.ds && r.ds.startsWith(mesRef) && r.kmr);
    const kmMes = doMes.reduce((s, r) => s + (r.kmr || 0), 0);
    const custoMes = doMes.reduce((s, r) => s + (r.kmr || 0) * (porPlaca[r.placa]?.custoKm || 0), 0);

    const ativos = veiculos.filter((v) => v.status === "ATIVO");
    const bloqueados = veiculos.filter((v) => v.status === "BLOQUEADO");
    // Está na oficina: fora da operação, mas continua sendo da frota. Sem esta
    // lista o veículo simplesmente sumia da tela enquanto durava o conserto.
    const emManutencao = veiculos.filter((v) => v.status === "MANUTENCAO");

    const frota = ativos.map((v) => {
      const falta = v.revisao != null && v.km != null ? v.revisao - v.km : null;
      const situacao = falta == null ? "sem" : falta <= 0 ? "vencida" : falta <= 2000 ? "proxima" : "ok";
      const ultimo = roteiros
        .filter((r) => r.placa === v.placa && r.ds)
        .sort((a, b) => (b.ds || "").localeCompare(a.ds || ""))[0];
      return { ...v, falta, situacao, ultimoUso: ultimo?.ds, naRua: naRua.some((r) => r.placa === v.placa) };
    });
    const revisoesVencidas = frota.filter((v) => v.situacao === "vencida").length;

    // pendências unificadas para o quadro
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

    // mesma conta da aba Manutenções: cancelada não custou nada
    const gastoManut = manutencoes.reduce((s, x) => s + (x.status === "CANCELADA" ? 0 : x.valor || 0), 0);

    return {
      veiculos, roteiros, manutencoes, checklists, porPlaca,
      naRua, concluidosHoje, concluidos, pend, bloqueados, bloqInfo, emManutencao,
      kmMes, custoMes, ativos, frota, revisoesVencidas, gastoManut,
      custos: [...custos].sort((a, b) => (b.total || 0) - (a.total || 0)),
    };
  }, [dados, referencia]);

  const d = new Date(referencia + "T12:00:00");
  const dia = `${SEMANA[d.getDay()]}, ${dataBR(referencia)}/${d.getFullYear()}`;

  return (
    <Pagina
      titulo="Painel da frota"
      subtitulo={`${dia} · ${m.ativos.length} veículo(s) ativo(s)`}
      acoes={
        <div className="rolagem-fina flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-200/70 p-1">
          {VISTAS.map(([k, rotulo]) => (
            <button
              key={k}
              onClick={() => setVista(k)}
              className={cx(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-semibold transition",
                vista === k ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {rotulo}
              {k === "operacao" && m.pend.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {m.pend.length}
                </span>
              )}
            </button>
          ))}
        </div>
      }
    >
      {/* O que exige ação agora vem antes de qualquer número. */}
      {alertas.length > 0 && (
        <Link
          href="/alertas"
          className={cx(
            "mb-3 flex items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset transition",
            nCriticos > 0
              ? "bg-red-50 text-red-800 ring-red-200 hover:bg-red-100"
              : "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
          )}
        >
          <AlertTriangle size={18} className="shrink-0" />
          <span>
            <b>
              {alertas.length} alerta(s) ativo(s)
              {nCriticos > 0 ? `, ${nCriticos} crítico(s)` : ""}.
            </b>{" "}
            <span className="opacity-80">{alertas[0].titulo}</span>
          </span>
          <ArrowRight size={16} className="ml-auto shrink-0" />
        </Link>
      )}

      {vista === "operacao" && <Operacao m={m} onSel={setSel} referencia={referencia} />}
      {vista === "frota" && <Frota m={m} onSel={setSel} />}
      {vista === "custos" && <Custos m={m} />}
      {vista === "manut" && <Manut m={m} />}
      {vista === "relatorios" && <Relatorios m={m} referencia={referencia} soGestor={soGestor} />}

      {sel && <Ficha placa={sel} m={m} onFechar={() => setSel(null)} />}
    </Pagina>
  );
}

/* ============================ OPERAÇÃO ============================ */

/* As sub-telas recebem o mesmo objeto memoizado do painel. Tipar cada recorte
   dele daria uma parede de interfaces que só repetiria o `useMemo` acima — o
   contrato de verdade está em `lib/frota/types.ts`, que é o que entra aqui. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function Operacao({ m, onSel, referencia }: { m: any; onSel(p: string): void; referencia: string }) {
  const mesLbl = MESES[parseInt(referencia.slice(5, 7), 10) - 1] + "/" + referencia.slice(0, 4);
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Contador rotulo="Na rua" valor={m.naRua.length} legenda="veículos em roteiro" />
        <Contador rotulo="Concluídos hoje" valor={m.concluidosHoje.length} legenda="roteiros fechados" />
        <Contador rotulo="Km no mês" valor={nf.format(m.kmMes)} legenda={mesLbl} />
        <Contador rotulo="Custo no mês" valor={brl(m.custoMes)} legenda="combustível estimado" />
        <Contador
          rotulo="Revisões vencidas"
          valor={m.revisoesVencidas}
          legenda="verificar"
          tom={m.revisoesVencidas > 0 ? "text-red-600" : "text-slate-900"}
        />
        <Contador
          rotulo="Bloqueados"
          valor={m.bloqueados.length}
          legenda="aguardando reparo"
          tom={m.bloqueados.length > 0 ? "text-red-600" : "text-slate-900"}
        />
        <Contador
          rotulo="Em manutenção"
          valor={m.emManutencao.length}
          legenda="na oficina"
          tom={m.emManutencao.length > 0 ? "text-amber-600" : "text-slate-900"}
        />
      </div>

      <div className="mb-2.5 mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-slate-900">Operação do dia</h2>
        <span className="text-[12px] text-slate-500">
          atualiza conforme a equipe lança saída e chegada
        </span>
      </div>

      <section className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Coluna cor="info" titulo="Na rua" n={m.naRua.length} vazio="Nenhum veículo na rua agora.">
          {m.naRua.map((r: RoteiroDados, i: number) => (
            <CartaoItem key={i} onClick={() => onSel(r.placa)}>
              <TopoCartao foto={m.porPlaca[r.placa]?.foto as string} placa={r.placa} modelo={modeloDe(r.veic)} />
              <div className="mb-1.5 text-[13px] font-semibold text-slate-800">{r.tec || "sem técnico"}</div>
              <div className="flex gap-3 text-[11.5px] text-slate-500">
                <span>Saiu <b className="tabular-nums text-slate-800">{r.hs || "—"}</b></span>
                <span>Km <b className="tabular-nums text-slate-800">{nf.format(r.kms ?? 0)}</b></span>
              </div>
            </CartaoItem>
          ))}
        </Coluna>

        <Coluna cor="ok" titulo="Concluídos hoje" n={m.concluidosHoje.length} vazio="Nenhum roteiro fechado hoje ainda.">
          {m.concluidosHoje.slice(0, 12).map((r: RoteiroDados, i: number) => (
            <CartaoItem key={i} onClick={() => onSel(r.placa)}>
              <TopoCartao foto={m.porPlaca[r.placa]?.foto as string} placa={r.placa} modelo={modeloDe(r.veic)} />
              <div className="mb-1 text-[13px] font-semibold text-slate-800">{r.tec || "—"}</div>
              <div className="mb-1.5 text-[11.5px] tabular-nums text-slate-500">{janela(r)}</div>
              <div className="flex gap-3 text-[11.5px] text-slate-500">
                <span><b className="tabular-nums text-slate-800">{nf.format(r.kmr || 0)}</b> km</span>
                <span>{brl((r.kmr || 0) * (m.porPlaca[r.placa]?.custoKm || 0))}</span>
              </div>
            </CartaoItem>
          ))}
          {m.concluidosHoje.length > 12 && (
            <p className="px-1 text-center text-[12px] text-slate-400">
              + {m.concluidosHoje.length - 12} outros
            </p>
          )}
        </Coluna>

        <Coluna cor="atencao" titulo="Pendências" n={m.pend.length} vazio="Sem pendências. 👏">
          {m.pend.map(({ r, tag }: { r: RoteiroDados; tag: string }, i: number) => (
            <CartaoItem key={i} onClick={() => onSel(r.placa)}>
              <TopoCartao
                foto={m.porPlaca[r.placa]?.foto as string}
                placa={r.placa}
                modelo={modeloDe(r.veic)}
                etiqueta={<Badge tom="atencao">{tag}</Badge>}
              />
              <div className="mb-1 text-[13px] font-semibold text-slate-800">{r.tec || "—"}</div>
              {tag === "km alto" ? (
                <>
                  <div className="text-[11.5px] text-slate-500">
                    <b className="tabular-nums text-slate-800">{nf.format(r.kmr ?? 0)}</b> km em {dataBR(r.ds)}
                  </div>
                  <div className="mt-0.5 text-[11.5px] tabular-nums text-slate-500">{janela(r)}</div>
                  {r.obsc && (
                    <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11.5px] leading-relaxed text-slate-600">
                      {r.obsc}
                    </p>
                  )}
                  <Conferir roteiro={r} />
                </>
              ) : (
                <div className="text-[11.5px] text-slate-500">
                  Saiu {dataBR(r.ds)} {r.hs || ""}
                </div>
              )}
            </CartaoItem>
          ))}
        </Coluna>

        <Coluna cor="atencao" titulo="Em manutenção" n={m.emManutencao.length} vazio="Nenhum veículo na oficina.">
          {m.emManutencao.map((v: VeiculoDados, i: number) => {
            // a ordem de serviço aberta mais recente deste veículo
            const ordem = m.manutencoes
              .filter((x: ManutencaoDados) => x.placa === v.placa && x.status !== "CONCLUÍDA" && x.status !== "CANCELADA")
              .sort((a: ManutencaoDados, b: ManutencaoDados) => (b.data || "").localeCompare(a.data || ""))[0];
            return (
              <CartaoItem key={i} onClick={() => onSel(v.placa)}>
                <TopoCartao
                  foto={v.foto as string}
                  placa={v.placa}
                  modelo={v.modelo}
                  etiqueta={ordem?.prio ? <Badge tom="atencao">{String(ordem.prio).toLowerCase()}</Badge> : undefined}
                />
                <div className="mb-1 text-[13px] font-semibold text-slate-800">{ordem?.prob || "Em manutenção"}</div>
                <div className="flex justify-between gap-3 text-[11.5px] text-slate-500">
                  <span className="truncate">{ordem?.oficina || "oficina não informada"}</span>
                  <span className="shrink-0 tabular-nums">{ordem?.data ? dataBR(ordem.data) : ""}</span>
                </div>
              </CartaoItem>
            );
          })}
        </Coluna>

        <Coluna cor="critico" titulo="Bloqueados" n={m.bloqueados.length} vazio="Nenhum veículo bloqueado.">
          {m.bloqInfo.map(
            (
              { v, motivo, urg, cond, data }: { v: VeiculoDados } & Partial<ChecklistDados>,
              i: number,
            ) => (
              <CartaoItem key={i} onClick={() => onSel(v.placa)}>
                <TopoCartao
                  foto={v.foto as string}
                  placa={v.placa}
                  modelo={v.modelo}
                  etiqueta={urg ? <Badge tom="critico">{String(urg).toLowerCase()}</Badge> : undefined}
                />
                <div className="mb-1 text-[13px] font-semibold text-slate-800">{motivo || "Bloqueado"}</div>
                <div className="text-[11.5px] text-slate-500">
                  {cond ? "Checklist de " + cond : "checklist"}
                  {data ? " · " + dataBR(data) : ""}
                </div>
              </CartaoItem>
            ),
          )}
        </Coluna>
      </section>

      <p className="mt-5 text-center text-[12px] text-slate-400">
        Toque num cartão para ver a ficha completa do veículo.
      </p>
    </>
  );
}

/**
 * "Km alto" some da fila quando alguém confere. Grava QUEM e QUANDO conferiu —
 * isso é decisão, não cálculo derivado, então pode ser coluna (migration 0010).
 * A situação do roteiro continua saindo pronta da view v_roteiros.
 */
function Conferir({ roteiro }: { roteiro: RoteiroDados }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Sem id não dá para gravar: é o painel rodando com os dados de demonstração.
  if (!roteiro.id) return null;

  async function marcar(e: React.MouseEvent) {
    e.stopPropagation();
    setEnviando(true);
    setErro(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: eu } = await supabase.from("tecnicos").select("id").eq("user_id", user?.id).maybeSingle();

    const { error } = await supabase
      .from("roteiros")
      .update({ km_verificado_em: new Date().toISOString(), km_verificado_por: eu?.id ?? null })
      .eq("id", roteiro.id);

    if (error) {
      setErro(error.message);
      setEnviando(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <Botao tamanho="sm" variante="sucesso" onClick={marcar} disabled={enviando}>
        <CheckCircle2 size={13} />
        {enviando ? "Marcando…" : "Km conferido"}
      </Botao>
      {erro && <span className="text-[11px] text-red-600">{erro}</span>}
    </div>
  );
}

/* ============================ FROTA ============================ */

const SITUACAO: Record<string, [string, Tom]> = {
  vencida: ["Revisão vencida", "atencao"],
  proxima: ["Revisão próxima", "atencao"],
  ok: ["Em dia", "ok"],
  sem: ["Sem revisão", "mudo"],
  oficina: ["Em manutenção", "atencao"],
  bloq: ["Bloqueado", "critico"],
};

function Frota({ m, onSel }: { m: any; onSel(p: string): void }) {
  const todos = [
    ...m.frota,
    ...m.emManutencao.map((v: VeiculoDados) => ({ ...v, situacao: "oficina" })),
    ...m.bloqueados.map((v: VeiculoDados) => ({ ...v, situacao: "bloq" })),
  ];
  if (todos.length === 0) return <Vazio titulo="Nenhum veículo cadastrado." texto="Cadastre a frota em Veículos." />;
  return (
    <section className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {todos.map((v: VeiculoDados & { situacao: string; naRua?: boolean }, i: number) => {
        const [rotulo, tom] = SITUACAO[v.situacao] || SITUACAO.sem;
        return (
          <button
            key={i}
            onClick={() => onSel(v.placa)}
            className="rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-300"
          >
            <div className="mb-2.5 flex items-center gap-2">
              <Thumb foto={v.foto as string} />
              <Placa>{v.placa}</Placa>
              {v.naRua && <Badge tom="ok" className="ml-auto">na rua</Badge>}
            </div>
            <div className="text-[14px] font-semibold text-slate-900">
              {v.modelo} · {v.ano || "—"}
            </div>
            <div className="mt-0.5 truncate text-[12.5px] text-slate-500">
              {v.resp && v.resp !== "—" ? v.resp : "sem responsável"}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[13px] tabular-nums text-slate-700">{km(v.km)}</span>
              <Badge tom={tom}>{rotulo}</Badge>
            </div>
          </button>
        );
      })}
    </section>
  );
}

/* ============================ CUSTOS ============================ */

function Barra({ pct, cor = "bg-brand-600" }: { pct: number; cor?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
      <div className={cx("h-full rounded-full", cor)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Custos({ m }: { m: any }) {
  const total = m.custos.reduce((s: number, c: any) => s + (c.total || 0), 0);
  const kmTot = m.custos.reduce((s: number, c: any) => s + (c.km || 0), 0) || 1;
  const max = Math.max(1, ...m.custos.map((c: any) => c.total || 0));
  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Contador rotulo="Custo acumulado" valor={brl(total)} legenda="combustível, no período" />
        <Contador rotulo="Custo médio" valor={"R$ " + (total / kmTot).toFixed(2)} legenda="por km rodado" />
        <Contador rotulo="Manutenção" valor={brl(m.gastoManut)} legenda="no período" />
      </div>

      <Cartao titulo="Custo por veículo" className="mt-3">
        {m.custos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Sem custos no período.</p>
        ) : (
          <ul className="divide-y divide-slate-100 px-4">
            {m.custos.map((c: any, i: number) => (
              <li key={i} className="py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Placa>{c.placa}</Placa>
                  <span className="truncate text-[12px] text-slate-500">{modeloDe(c.veic)}</span>
                  <span className="ml-auto shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">
                    {brl(c.total)}
                  </span>
                </div>
                <Barra pct={(100 * (c.total || 0)) / max} />
                <div className="mt-1.5 text-[12px] text-slate-500">
                  {km(c.km)} · R$ {(c.medio || 0).toFixed(2)}/km
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

/* ============================ MANUTENÇÕES ============================ */

const TOM_STATUS: Record<string, Tom> = {
  ABERTA: "atencao",
  "EM EXECUÇÃO": "atencao",
  CONCLUÍDA: "ok",
  CANCELADA: "mudo",
};

/**
 * Separa o que JÁ SAIU do caixa do que ainda vai sair. Ordem aberta com
 * orçamento não é gasto — é compromisso. Somar os dois num número só faria o
 * total da frota subir no dia em que alguém abre uma ordem, antes de a oficina
 * encostar no veículo.
 */
function contas(ordens: ManutencaoDados[]) {
  let gasto = 0;
  let previsto = 0;
  let abertas = 0;
  for (const x of ordens) {
    const cancelada = x.status === "CANCELADA";
    const emAberto = x.status === "ABERTA" || x.status === "EM EXECUÇÃO";
    if (emAberto) abertas++;
    if (cancelada) continue; // cancelada não custou nada
    if (x.valor != null) gasto += x.valor; // valor final = dinheiro que saiu
    else if (emAberto) previsto += x.orcamento || 0;
  }
  return { gasto, previsto, abertas };
}

function Manut({ m }: { m: any }) {
  const [aberta, setAberta] = useState<ManutencaoDados | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  // Agrupamento e soma acontecem aqui, na tela, e não viram coluna no banco —
  // é a mesma regra do km do mês. O que o banco guarda é o valor de cada ordem;
  // o total é sempre a soma do que existe agora.
  const grupos = useMemo(() => {
    const porPlaca = new Map<string, { placa: string; veic: string; ordens: ManutencaoDados[] }>();
    for (const x of m.manutencoes as ManutencaoDados[]) {
      const g = porPlaca.get(x.placa) || { placa: x.placa, veic: x.veic, ordens: [] };
      g.ordens.push(x);
      porPlaca.set(x.placa, g);
    }
    return [...porPlaca.values()]
      .map((g) => ({
        ...g,
        ...contas(g.ordens),
        // dentro do veículo, as abertas primeiro; depois a mais recente
        ordens: [...g.ordens].sort((a, b) => {
          const fechada = (x: ManutencaoDados) => (x.status === "CONCLUÍDA" || x.status === "CANCELADA" ? 1 : 0);
          return fechada(a) - fechada(b) || (b.data || "").localeCompare(a.data || "");
        }),
      }))
      .sort((a, b) => b.gasto - a.gasto || b.previsto - a.previsto);
  }, [m.manutencoes]);

  const total = contas(m.manutencoes);
  const maior = Math.max(1, ...grupos.map((g) => g.gasto));

  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Contador rotulo="Gasto em manutenção" valor={brl(total.gasto)} legenda="já pago, frota inteira" />
        <Contador
          rotulo="Previsto em aberto"
          valor={brl(total.previsto)}
          legenda="orçado, ordem ainda na oficina"
          tom={total.previsto > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <Contador
          rotulo="Ordens abertas"
          valor={total.abertas}
          legenda={`de ${m.manutencoes.length} no total`}
          tom={total.abertas > 0 ? "text-amber-600" : "text-slate-900"}
        />
      </div>

      <Cartao
        titulo="Gasto por veículo"
        acoes={<span className="text-[12px] font-normal text-slate-500">toque num veículo para ver as ordens dele</span>}
        className="mt-3"
      >
        {grupos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Nenhuma manutenção registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100 px-4">
            {grupos.map((g) => {
              const aberto = expandida === g.placa;
              return (
                <li key={g.placa} className="py-1">
                  <button
                    onClick={() => setExpandida(aberto ? null : g.placa)}
                    className="-mx-2 w-full rounded-lg px-2 py-2.5 text-left transition hover:bg-slate-50"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Placa>{g.placa}</Placa>
                      <span className="truncate text-[12px] text-slate-500">{modeloDe(g.veic)}</span>
                      <span className="ml-auto shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">
                        {brl(g.gasto)}
                      </span>
                    </div>
                    <Barra pct={(100 * g.gasto) / maior} />
                    <div className="mt-1.5 flex items-center gap-1 text-[12px] text-slate-500">
                      <span>
                        {g.ordens.length} ordem(ns)
                        {g.abertas > 0 ? ` · ${g.abertas} em aberto` : ""}
                        {g.previsto > 0 ? ` · previsto ${brl(g.previsto)}` : ""}
                      </span>
                      {aberto ? (
                        <ChevronDown size={14} className="ml-auto shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="ml-auto shrink-0" />
                      )}
                    </div>
                  </button>

                  {aberto && (
                    <div className="mb-2 ml-1 border-l-2 border-slate-200 pl-3">
                      {g.ordens.map((x, i) => (
                        <button
                          key={i}
                          onClick={() => setAberta(x)}
                          className="-mx-2 block w-full rounded-lg px-2 py-2.5 text-left transition hover:bg-slate-50"
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-[12px] text-slate-500">{x.tipo || "—"}</span>
                            <Badge tom={TOM_STATUS[x.status ?? ""] || "mudo"}>{x.status || "—"}</Badge>
                            <span className="ml-auto shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">
                              {x.valor != null ? brl(x.valor) : x.orcamento != null ? brl(x.orcamento) + " orçado" : "—"}
                            </span>
                          </div>
                          <div className="text-[13.5px] text-slate-800">{x.servico || x.prob || "—"}</div>
                          <div className="mt-0.5 text-[12px] text-slate-500">
                            {dataBR(x.data)} · {x.oficina || "oficina não informada"}
                            {x.pecas ? " · peças trocadas" : ""}
                            {x.notaFiscal ? " · com nota" : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      {grupos.length > 0 && (
        <p className="mt-4 text-center text-[12px] text-slate-400">
          Veículo sem manutenção não aparece aqui. &ldquo;Previsto&rdquo; é orçamento de ordem ainda aberta —
          dinheiro que não saiu.
        </p>
      )}

      <FichaManut man={aberta} onFechar={() => setAberta(null)} />
    </>
  );
}

/**
 * O que o gestor abre a ordem para ver: o que foi feito, o que foi trocado,
 * quanto custou e onde está a nota. Editar continua sendo em /manutencao — o
 * painel é de leitura.
 */
function FichaManut({ man, onFechar }: { man: ManutencaoDados | null; onFechar(): void }) {
  const blocos = man
    ? ([
        ["Problema relatado", man.prob],
        ["Serviço realizado", man.servico],
        ["Peças substituídas", man.pecas],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  return (
    <Modal
      aberto={!!man}
      onFechar={onFechar}
      largura="max-w-2xl"
      titulo={
        man ? (
          <span className="flex flex-wrap items-center gap-2">
            <Placa>{man.placa}</Placa>
            <span className="text-[13px] font-normal text-slate-500">{modeloDe(man.veic)}</span>
            <Badge tom={TOM_STATUS[man.status ?? ""] || "mudo"}>{man.status || "—"}</Badge>
          </span>
        ) : (
          ""
        )
      }
    >
      {man && (
        <>
          <p className="mb-3 text-[13px] text-slate-500">
            {man.tipo || "—"} · {man.origem || "origem não informada"}
            {man.prio ? " · prioridade " + String(man.prio).toLowerCase() : ""}
          </p>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200 sm:grid-cols-4">
            <Numero rotulo="Aberta em" valor={dataBR(man.data)} />
            <Numero rotulo="Concluída em" valor={man.conclusao ? dataBR(man.conclusao) : "—"} />
            <Numero rotulo="Km na abertura" valor={km(man.km)} />
            <Numero rotulo="Valor final" valor={brl(man.valor)} />
          </div>

          {blocos.map(([titulo, texto]) => (
            <React.Fragment key={titulo}>
              <h4 className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</h4>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">{texto}</p>
            </React.Fragment>
          ))}
          {blocos.length === 0 && <p className="mt-4 text-[12px] text-slate-500">Nada descrito nesta ordem ainda.</p>}

          <h4 className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Ordem</h4>
          <div className="text-[13px]">
            <Linha>
              <span className="text-slate-500">Oficina</span>
              <span className="ml-auto">{man.oficina || "—"}</span>
            </Linha>
            <Linha>
              <span className="text-slate-500">Responsável</span>
              <span className="ml-auto">{man.responsavel || "—"}</span>
            </Linha>
            <Linha>
              <span className="text-slate-500">Orçamento</span>
              <span className="ml-auto tabular-nums">{brl(man.orcamento)}</span>
            </Linha>
            {man.proximaRevisao != null && (
              <Linha>
                <span className="text-slate-500">Próxima revisão</span>
                <span className="ml-auto tabular-nums">{km(man.proximaRevisao)}</span>
              </Linha>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {man.notaFiscal && (
              <BotaoLink href={man.notaFiscal} target="_blank" rel="noopener noreferrer">
                <Receipt size={14} />
                Abrir nota fiscal
              </BotaoLink>
            )}
            <BotaoLink href={"/manutencao/ordem?id=" + man.id}>
              <Printer size={14} />
              Ordem para imprimir
            </BotaoLink>
            <BotaoLink href="/manutencao" variante="primario">
              <Wrench size={14} />
              Editar em Manutenções
            </BotaoLink>
          </div>
        </>
      )}
    </Modal>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-900">{valor}</div>
    </div>
  );
}

/* ============================ RELATÓRIOS ============================ */

function Relatorios({ m, referencia, soGestor }: { m: any; referencia: string; soGestor: boolean }) {
  function baixarCSV() {
    const linhas = [
      ["placa", "veiculo", "data_saida", "hora_saida", "data_chegada", "hora_chegada", "duracao", "tecnico", "km_saida", "km_chegada", "km_rodado", "situacao"],
    ];
    (m.roteiros as RoteiroDados[]).forEach((r) =>
      linhas.push([
        r.placa, modeloDe(r.veic), r.ds || "", r.hs || "", r.dc || "", r.hc || "", r.dur || "",
        r.tec || "", String(r.kms ?? ""), String(r.kmc ?? ""), String(r.kmr ?? ""), r.st || "",
      ]),
    );
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "roteiros-" + referencia + ".csv";
    a.click();
  }
  const total = m.custos.reduce((s: number, c: any) => s + (c.total || 0), 0);

  return (
    <section className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      {soGestor && (
        <Cartao className="p-5 ring-brand-300">
          <h3 className="text-[14.5px] font-semibold text-slate-900">Relatórios completos</h3>
          <p className="mb-4 mt-1 text-[12.5px] leading-relaxed text-slate-500">
            Combustível por veículo, km por dia e por mês, deslocamentos por técnico, manutenções e
            ocorrências — com período e CSV em cada um.
          </p>
          <BotaoLink href="/relatorios" variante="primario">
            <FileText size={14} />
            Abrir relatórios
          </BotaoLink>
        </Cartao>
      )}

      <Cartao className="p-5">
        <h3 className="text-[14.5px] font-semibold text-slate-900">Roteiros (planilha)</h3>
        <p className="mb-4 mt-1 text-[12.5px] leading-relaxed text-slate-500">
          Todos os roteiros com km, técnico e situação, para abrir no Excel.
        </p>
        <Botao variante="primario" onClick={baixarCSV}>
          <Download size={14} />
          Baixar CSV
        </Botao>
      </Cartao>

      <Cartao className="p-5">
        <h3 className="text-[14.5px] font-semibold text-slate-900">Resumo para impressão</h3>
        <p className="mb-4 mt-1 text-[12.5px] leading-relaxed text-slate-500">
          Visão do período com custos e frota, pronta para PDF (imprimir → salvar como PDF).
        </p>
        <Botao onClick={() => window.print()}>
          <Printer size={14} />
          Imprimir / PDF
        </Botao>
      </Cartao>

      <Cartao className="p-5">
        <h3 className="mb-3 text-[14.5px] font-semibold text-slate-900">Números do período</h3>
        <div className="grid grid-cols-2 gap-3">
          <Numero rotulo="km no mês" valor={nf.format(m.kmMes)} />
          <Numero rotulo="combustível" valor={brl(m.custoMes)} />
          <Numero rotulo="concluídos" valor={m.concluidos.length} />
          <Numero rotulo="custo total" valor={brl(total)} />
        </div>
      </Cartao>
    </section>
  );
}

/* ============================ FICHA DO VEÍCULO ============================ */

function Ficha({ placa, m, onFechar }: { placa: string; m: any; onFechar(): void }) {
  const v: VeiculoDados | undefined = m.porPlaca[placa];
  const rots: RoteiroDados[] = m.roteiros
    .filter((r: RoteiroDados) => r.placa === placa)
    .sort((a: RoteiroDados, b: RoteiroDados) => (b.ds || "").localeCompare(a.ds || ""))
    .slice(0, 8);
  const mans: ManutencaoDados[] = m.manutencoes.filter((x: ManutencaoDados) => x.placa === placa);
  const chks: ChecklistDados[] = m.checklists
    .filter((c: ChecklistDados) => c.placa === placa)
    .sort((a: ChecklistDados, b: ChecklistDados) => (b.data || "").localeCompare(a.data || ""))
    .slice(0, 5);
  if (!v) return null;

  return (
    <Modal
      aberto
      onFechar={onFechar}
      largura="max-w-2xl"
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          <Thumb foto={v.foto as string} />
          <Placa>{placa}</Placa>
          <span className="text-[13px] font-normal text-slate-500">
            {v.modelo} · {v.ano || "—"}
          </span>
        </span>
      }
    >
      <p className="mb-3 text-[13px] text-slate-500">
        {v.resp && v.resp !== "—" ? v.resp : "sem responsável"} · status {v.status}
      </p>

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200 sm:grid-cols-4">
        <Numero rotulo="Km atual" valor={km(v.km)} />
        <Numero rotulo="Próx. revisão" valor={v.revisao ? nf.format(v.revisao) : "—"} />
        <Numero rotulo="Custo/km" valor={v.custoKm ? "R$ " + Number(v.custoKm).toFixed(2) : "—"} />
        <Numero rotulo="Consumo" valor={v.kml ? v.kml + " km/l" : "—"} />
      </div>

      <h4 className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        Últimos roteiros
      </h4>
      {rots.length === 0 ? (
        <p className="text-[12px] text-slate-500">Sem roteiros.</p>
      ) : (
        rots.map((r, i) => (
          <Linha key={i}>
            <span className="tabular-nums">{dataBR(r.ds)}</span>
            <span className="text-[12px] tabular-nums text-slate-500">{janela(r)}</span>
            <span className="truncate text-[12px] text-slate-500">{r.tec || "—"}</span>
            <span className="ml-auto shrink-0 tabular-nums">
              {r.kmr != null ? nf.format(r.kmr) + " km" : r.st}
            </span>
          </Linha>
        ))
      )}

      {mans.length > 0 && (
        <>
          <h4 className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            Manutenções · {brl(contas(mans).gasto)} neste veículo
          </h4>
          {mans.map((x, i) => (
            <Linha key={i}>
              <span className="tabular-nums">{dataBR(x.data)}</span>
              <span className="truncate text-[12px] text-slate-500">{x.servico || x.prob}</span>
              <span className="ml-auto shrink-0 tabular-nums">{brl(x.valor)}</span>
            </Linha>
          ))}
        </>
      )}

      {chks.length > 0 && (
        <>
          <h4 className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Checklists</h4>
          {chks.map((c, i) => (
            <Linha key={i}>
              <span className="tabular-nums">{dataBR(c.data)}</span>
              <span className="truncate text-[12px] text-slate-500">{c.motivo ? "⚠ " + c.motivo : "OK"}</span>
              <span className="ml-auto shrink-0 text-[12px] text-slate-500">{c.cond}</span>
            </Linha>
          ))}
        </>
      )}

      <BotaoLink href={"/historico?placa=" + placa} className="mt-4 w-full">
        Histórico e fotos deste veículo
        <ArrowRight size={14} />
      </BotaoLink>
    </Modal>
  );
}
