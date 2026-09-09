"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Inbox, ParkingCircle, ShieldAlert, Wrench, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Aviso,
  Badge,
  BotaoLink,
  Cartao,
  Carregando,
  Pagina,
  Placa,
  cx,
} from "@/components/ui";

// A fila do gestor. Tudo vem pronto da view v_alertas_ativos — nada e
// recalculado aqui. Cada alerta carrega o botao que resolve o problema.

type Alerta = {
  tipo: string;
  gravidade: string;
  ordem: number;
  veiculo_id: string;
  placa: string;
  modelo: string;
  titulo: string;
  detalhe: string | null;
  desde: string | null;
};

/** Faixa lateral e etiqueta seguem os tons do kit. */
const GRAVIDADE = {
  "CRÍTICO": { faixa: "border-l-red-600", tom: "critico" as const },
  "ATENÇÃO": { faixa: "border-l-amber-500", tom: "atencao" as const },
};

const ICONE: Record<string, LucideIcon> = {
  "REVISÃO": Wrench,
  ROTEIRO: Inbox,
  PARADO: ParkingCircle,
  "OCORRÊNCIA": ShieldAlert,
};

// Para onde o gestor vai para resolver cada tipo de alerta.
function acao(a: Alerta): { href: string; texto: string } {
  switch (a.tipo) {
    case "REVISÃO":
      return { href: "/manutencao", texto: "Abrir manutenção" };
    case "ROTEIRO":
      return { href: "/roteiro/chegada", texto: "Registrar a chegada" };
    case "OCORRÊNCIA":
      return { href: "/ocorrencias", texto: "Tratar ocorrência" };
    default:
      return { href: "/historico?placa=" + a.placa, texto: "Ver histórico" };
  }
}

function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : null;
}

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("TODOS");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("v_alertas_ativos")
        .select("*")
        .order("ordem")
        .order("placa");
      if (error) setErro(error.message);
      setAlertas((data as Alerta[]) ?? []);
      setCarregando(false);
    })();
  }, []);

  const tipos = ["TODOS", ...Array.from(new Set(alertas.map((a) => a.tipo)))];
  const lista = alertas.filter((a) => (tipo === "TODOS" ? true : a.tipo === tipo));
  const criticos = alertas.filter((a) => a.gravidade === "CRÍTICO").length;

  return (
    <Pagina
      estreita
      titulo="Alertas"
      subtitulo={
        carregando
          ? "carregando…"
          : alertas.length === 0
            ? "nada pendente"
            : `${alertas.length} no total${criticos > 0 ? ` · ${criticos} crítico(s)` : ""}`
      }
      acoes={
        tipos.length > 2 && (
          <div className="flex flex-wrap gap-1.5">
            {tipos.map((f) => (
              <button
                key={f}
                onClick={() => setTipo(f)}
                className={cx(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition",
                  tipo === f
                    ? "bg-brand-700 text-white ring-brand-700"
                    : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                )}
              >
                {f === "TODOS" ? "Tudo" : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )
      }
    >
      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : erro ? (
        <Aviso>
          <p>Não consegui ler os alertas: {erro}</p>
          <p className="mt-2 text-[12.5px] opacity-80">
            Se a mensagem fala em <code>v_alertas_ativos</code>, a migration{" "}
            <code>0007_alertas_ativos.sql</code> ainda não foi aplicada no Supabase.
          </p>
        </Aviso>
      ) : lista.length === 0 ? (
        <Aviso tom="ok">
          Nenhum alerta. Revisões em dia, nenhum roteiro em aberto de dias anteriores, nenhum veículo
          esquecido e nenhuma ocorrência grave sem tratamento.
        </Aviso>
      ) : (
        <div className="flex flex-col gap-2.5">
          {lista.map((a, i) => {
            const g = GRAVIDADE[a.gravidade as keyof typeof GRAVIDADE];
            const Icone = ICONE[a.tipo] ?? AlertTriangle;
            const act = acao(a);
            const quando = dataBR(a.desde);
            return (
              <Cartao
                key={`${a.tipo}-${a.veiculo_id}-${i}`}
                className={cx("border-l-4 p-4", g?.faixa ?? "border-l-slate-300")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icone size={16} className="shrink-0 text-slate-400" />
                  <Placa>{a.placa}</Placa>
                  <span className="text-[13px] text-slate-500">{a.modelo}</span>
                  <Badge tom={g?.tom ?? "mudo"}>{a.gravidade}</Badge>
                  {quando && (
                    <span className="ml-auto text-[12px] text-slate-400">desde {quando}</span>
                  )}
                </div>

                <div className="mb-1 mt-2.5 text-sm font-semibold text-slate-900">{a.titulo}</div>
                <div className="text-[12.5px] text-slate-500">{a.detalhe}</div>

                <BotaoLink href={act.href} tamanho="sm" className="mt-3">
                  {act.texto}
                  <ArrowRight size={13} />
                </BotaoLink>
              </Cartao>
            );
          })}
        </div>
      )}
    </Pagina>
  );
}
