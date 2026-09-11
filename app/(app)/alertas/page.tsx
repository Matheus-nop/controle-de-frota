"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  GitCompareArrows,
  Inbox,
  ParkingCircle,
  ShieldAlert,
  Undo2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cienciaDe, faltaMigracaoDaCiencia, type Alerta } from "@/lib/frota/ciencia";
import { mensagemDeErro } from "@/lib/frota/erro";
import { dataBR, diaHoraDe } from "@/lib/frota/tempo";
import {
  Aviso,
  Badge,
  Botao,
  BotaoLink,
  Campo,
  Cartao,
  Carregando,
  Input,
  Modal,
  Pagina,
  Placa,
  cx,
} from "@/components/ui";

// A fila do gestor. Tudo vem pronto da view v_alertas_com_ciencia — nada e
// recalculado aqui. Cada alerta carrega o botao que resolve o problema.
//
// A fila nao acumula: os alertas sao recalculados a cada abertura, e somem
// sozinhos quando a causa deixa de existir. O que a ciencia acrescenta e o
// "eu ja vi este": tira da fila sem mexer em dado nenhum, e devolve o alerta
// se a mesma coisa acontecer de novo mais tarde (ver lib/frota/ciencia.ts).

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
  AVARIA: GitCompareArrows,
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
    // O alerta diz que apareceu dano. A pergunta seguinte é sempre "apareceu
    // quando?", e quem responde isso é o comparativo, já no veículo certo.
    case "AVARIA":
      return { href: "/comparativo?placa=" + a.placa, texto: "Comparar vistorias" };
    default:
      return { href: "/historico?placa=" + a.placa, texto: "Ver histórico" };
  }
}

/** Identidade do alerta na tela. Dois alertas do mesmo tipo e veículo só se
 *  distinguem pela referência — e ela é o que a ciência grava. */
const chave = (a: Alerta) => `${a.tipo}|${a.veiculo_id}|${a.referencia ?? ""}`;

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [quemId, setQuemId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("TODOS");
  const [vendoVistos, setVendoVistos] = useState(false);
  // Sem a 0018 a tela continua funcionando, só sem a ciência.
  const [temCiencia, setTemCiencia] = useState(true);
  const [dandoCiencia, setDandoCiencia] = useState<Alerta | null>(null);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const supabase = createClient();
    await supabase.auth.getUser();

    const nova = await supabase.from("v_alertas_com_ciencia").select("*").order("ordem").order("placa");
    if (faltaMigracaoDaCiencia(nova.error)) {
      const velha = await supabase.from("v_alertas_ativos").select("*").order("ordem").order("placa");
      setTemCiencia(false);
      setErro(velha.error ? velha.error.message : null);
      setAlertas((velha.data as Alerta[]) ?? []);
    } else {
      setTemCiencia(true);
      setErro(nova.error ? nova.error.message : null);
      setAlertas((nova.data as Alerta[]) ?? []);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
      const supabase = createClient();
      const { data: sessao } = await supabase.auth.getUser();
      if (sessao?.user) {
        const { data: eu } = await supabase
          .from("tecnicos")
          .select("id")
          .eq("user_id", sessao.user.id)
          .maybeSingle();
        setQuemId((eu as { id: string } | null)?.id ?? null);
      }
    })();
  }, [carregar]);

  async function desfazer(a: Alerta) {
    setDesfazendo(chave(a));
    const supabase = createClient();
    // O `.select` confere que apagou mesmo: DELETE barrado pela RLS não volta
    // com erro, volta com zero linhas — e o botão fingiria ter funcionado.
    const { data, error } = await supabase
      .from("alertas_ciencia")
      .delete()
      .eq("tipo", a.tipo)
      .eq("veiculo_id", a.veiculo_id)
      .eq("referencia", a.referencia ?? "")
      .select("tipo");
    setDesfazendo(null);
    if (error || !data || data.length === 0) {
      setErro(
        error
          ? mensagemDeErro(error, "o desfazer")
          : "Nada mudou: só gestor e PCM podem desfazer a ciência.",
      );
      return;
    }
    await carregar();
  }

  const pendentes = alertas.filter((a) => !cienciaDe(a));
  const vistos = alertas.filter((a) => cienciaDe(a));
  const base = vendoVistos ? vistos : pendentes;

  const tipos = ["TODOS", ...Array.from(new Set(base.map((a) => a.tipo)))];
  const lista = base.filter((a) => (tipo === "TODOS" ? true : a.tipo === tipo));
  const criticos = pendentes.filter((a) => a.gravidade === "CRÍTICO").length;

  return (
    <Pagina
      estreita
      titulo="Alertas"
      subtitulo={
        carregando
          ? "carregando…"
          : pendentes.length === 0
            ? "nada pendente"
            : `${pendentes.length} na fila${criticos > 0 ? ` · ${criticos} crítico(s)` : ""}`
      }
      acoes={
        <div className="flex flex-wrap gap-1.5">
          {tipos.length > 2 &&
            tipos.map((f) => (
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
          {temCiencia && vistos.length > 0 && (
            <button
              onClick={() => {
                setVendoVistos((v) => !v);
                setTipo("TODOS");
              }}
              className={cx(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition",
                vendoVistos
                  ? "bg-slate-700 text-white ring-slate-700"
                  : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
              )}
            >
              <Eye size={12} className="mr-1 inline" />
              {vendoVistos ? "Voltar para a fila" : `Já vistos (${vistos.length})`}
            </button>
          )}
        </div>
      }
    >
      {erro && (
        <div className="mb-3">
          <Aviso>
            <p>{erro}</p>
            <p className="mt-2 text-[12.5px] opacity-80">
              Se a mensagem fala em <code>v_alertas_ativos</code>, a migration{" "}
              <code>0007_alertas_ativos.sql</code> ainda não foi aplicada no Supabase.
            </p>
          </Aviso>
        </div>
      )}

      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : lista.length === 0 ? (
        vendoVistos ? (
          <Aviso tom="mudo">Nenhum alerta com ciência neste filtro.</Aviso>
        ) : (
          <Aviso tom="ok">
            Nenhum alerta na fila. Revisões em dia, nenhum roteiro em aberto de dias anteriores,
            nenhum veículo esquecido e nenhuma ocorrência grave sem tratamento.
          </Aviso>
        )
      ) : (
        <div className="flex flex-col gap-2.5">
          {lista.map((a) => {
            const g = GRAVIDADE[a.gravidade as keyof typeof GRAVIDADE];
            const Icone = ICONE[a.tipo] ?? AlertTriangle;
            const act = acao(a);
            const quando = dataBR(a.desde);
            const ciencia = cienciaDe(a);
            return (
              <Cartao
                key={chave(a)}
                className={cx(
                  "border-l-4 p-4",
                  ciencia ? "border-l-slate-300 bg-slate-50/60" : (g?.faixa ?? "border-l-slate-300"),
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icone size={16} className="shrink-0 text-slate-400" />
                  <Placa>{a.placa}</Placa>
                  <span className="text-[13px] text-slate-500">{a.modelo}</span>
                  <Badge tom={ciencia ? "mudo" : (g?.tom ?? "mudo")}>{a.gravidade}</Badge>
                  {quando && (
                    <span className="ml-auto text-[12px] text-slate-400">desde {quando}</span>
                  )}
                </div>

                <div className="mb-1 mt-2.5 text-sm font-semibold text-slate-900">{a.titulo}</div>
                <div className="text-[12.5px] text-slate-500">{a.detalhe}</div>

                {ciencia && (
                  <div className="mt-2.5 rounded-lg bg-slate-100 p-2.5 text-[12.5px] text-slate-600 ring-1 ring-inset ring-slate-200">
                    Visto por <strong>{ciencia.por ?? "alguém"}</strong> em{" "}
                    {diaHoraDe(ciencia.em) ?? "—"}
                    {ciencia.observacao ? ` · ${ciencia.observacao}` : ""}. Fora da fila até
                    acontecer de novo.
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <BotaoLink href={act.href} tamanho="sm">
                    {act.texto}
                    <ArrowRight size={13} />
                  </BotaoLink>
                  {temCiencia &&
                    (ciencia ? (
                      <Botao
                        tamanho="sm"
                        disabled={desfazendo === chave(a)}
                        onClick={() => desfazer(a)}
                      >
                        <Undo2 size={13} />
                        {desfazendo === chave(a) ? "Desfazendo…" : "Voltar para a fila"}
                      </Botao>
                    ) : (
                      <Botao tamanho="sm" onClick={() => setDandoCiencia(a)}>
                        <Check size={13} />
                        Dar ciência
                      </Botao>
                    ))}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      {dandoCiencia && (
        <DarCiencia
          a={dandoCiencia}
          quemId={quemId}
          onFechar={() => setDandoCiencia(null)}
          onSalvo={() => {
            setDandoCiencia(null);
            void carregar();
          }}
        />
      )}
    </Pagina>
  );
}

/**
 * "Eu vi este alerta."
 *
 * Não muda dado nenhum: a avaria continua registrada, a revisão continua
 * vencida. O que sai é o alerta da fila — e volta sozinho se a mesma coisa
 * acontecer de novo, porque a ciência é gravada contra a OCORRÊNCIA (a vistoria
 * que achou o dano, o marco de km), e não contra o veículo.
 *
 * A observação é opcional de propósito. Exigir texto para tirar um alerta da
 * tela transforma "já vi" em formulário, e o que acontece então é que ninguém
 * dá ciência e a fila volta a ser ignorada por inteiro.
 */
function DarCiencia({
  a,
  quemId,
  onFechar,
  onSalvo,
}: {
  a: Alerta;
  quemId: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const supabase = createClient();
    const { error } = await supabase.from("alertas_ciencia").insert({
      tipo: a.tipo,
      veiculo_id: a.veiculo_id,
      referencia: a.referencia ?? "",
      por: quemId,
      observacao: observacao.trim() || null,
    });
    setSalvando(false);
    if (error) {
      setErro(mensagemDeErro(error, "a ciência"));
      return;
    }
    onSalvo();
  }

  return (
    <Modal
      aberto
      titulo={`Dar ciência · ${a.placa}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={salvando} onClick={salvar}>
            <Check size={14} />
            {salvando ? "Gravando…" : "Já vi este alerta"}
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <div className="text-sm font-semibold text-slate-900">{a.titulo}</div>
          <div className="text-[12.5px] text-slate-500">{a.detalhe}</div>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-600">
          O alerta sai da fila e do contador do painel. <strong>Nada muda no registro</strong> — a
          avaria continua lá, a revisão continua vencida.
        </p>
        <p className="text-[13px] leading-relaxed text-slate-600">
          E ele <strong>volta sozinho</strong> se a mesma coisa acontecer de novo: a ciência vale
          para esta ocorrência, não para o veículo. Uma vistoria nova com mais dano dispara um
          alerta novo.
        </p>
        <Campo rotulo="Observação (opcional)">
          <Input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="já abri ocorrência, dano é da batida de agosto, oficina agendada…"
          />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}
