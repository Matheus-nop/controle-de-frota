"use client";

// Onde o veículo ficou quando não esteve com a gente — e a pergunta que isso
// existe para responder: "chegou uma multa de 12/09, quem estava com ele?".
//
// A Scudo passou dois períodos na ITAVEMA e a concessionária rodou com ela em
// rodovia para testar. Multa desses dias chega no nome da empresa, e o condutor
// a indicar não é ninguém da equipe. Sem registro, a defesa depende de alguém
// lembrar.
//
// A regra mora em lib/frota/paradas.ts, com teste. Aqui é só tela.

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mensagemDeErro } from "@/lib/frota/erro";
import { dataBR, diaHoraDe, hojeBR, intervaloUTC } from "@/lib/frota/tempo";
import {
  avisosDaParada,
  diasDaParada,
  emAndamento,
  faltaMigracaoDasParadas,
  quemEstavaCom,
  resumoDaParada,
  type Parada,
  type Resposta,
  type RoteiroNoDia,
} from "@/lib/frota/paradas";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  Cartao,
  Input,
  Modal,
  Placa,
  Select,
  cx,
} from "@/components/ui";

/* ------------------------------------------------------- os períodos ----- */

/** A lista de períodos de um veículo, no cartão dele. */
export function ParadasDoVeiculo({
  veiculoId,
  paradas,
  podeEscrever,
  onMudou,
}: {
  veiculoId: string;
  paradas: Parada[];
  podeEscrever: boolean;
  onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const minhas = paradas.filter((p) => p.veiculo_id === veiculoId);
  const agora = minhas.find(emAndamento);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
          Parado com terceiro
        </span>
        {agora ? (
          <Badge tom="atencao">
            {agora.onde} · há {diasDaParada(agora, hojeBR())} dias
          </Badge>
        ) : (
          <span className="text-[12.5px] text-slate-500">
            {minhas.length === 0
              ? "nenhum período registrado"
              : `${minhas.length} período(s), todos encerrados`}
          </span>
        )}
        <div className="ml-auto flex gap-1.5">
          {minhas.length > 0 && (
            <Botao tamanho="sm" onClick={() => setAberto((x) => !x)}>
              {aberto ? "Fechar" : "Ver"}
            </Botao>
          )}
          {podeEscrever && (
            <Botao tamanho="sm" onClick={() => setRegistrando(true)}>
              <Plus size={13} />
              Registrar período
            </Botao>
          )}
        </div>
      </div>

      {aberto && minhas.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {minhas.map((p) => (
            <li
              key={p.id}
              className={cx(
                "rounded-lg px-2.5 py-2 text-[12.5px] leading-relaxed ring-1 ring-inset",
                emAndamento(p)
                  ? "bg-amber-50 text-amber-900 ring-amber-200"
                  : "bg-slate-50 text-slate-700 ring-slate-200",
              )}
            >
              <div className="font-medium">{resumoDaParada(p)}</div>
              {p.observacao && <div className="mt-0.5 text-slate-500">{p.observacao}</div>}
            </li>
          ))}
        </ul>
      )}

      {registrando && (
        <RegistrarParada
          veiculoId={veiculoId}
          outras={minhas}
          onFechar={() => setRegistrando(false)}
          onSalvo={() => {
            setRegistrando(false);
            onMudou();
          }}
        />
      )}
    </div>
  );
}

function RegistrarParada({
  veiculoId,
  outras,
  onFechar,
  onSalvo,
}: {
  veiculoId: string;
  outras: Parada[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [onde, setOnde] = useState("");
  const [motivo, setMotivo] = useState("MANUTENÇÃO CORRETIVA");
  const [obs, setObs] = useState("");
  const [roteiros, setRoteiros] = useState<RoteiroNoDia[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Os roteiros do veículo no período, para avisar da contradição. A busca
  // mora dentro do efeito, e não num callback que ele chama: o lint do projeto
  // barra mexer no estado direto no corpo do efeito.
  useEffect(() => {
    let valeu = true;
    (async () => {
      if (!de) return;
      const janela = intervaloUTC(de, ate || hojeBR());
      const supabase = createClient();
      const { data } = await supabase
        .from("v_roteiros")
        .select("id, saida_em, chegada_em, tecnico_saida, tecnico_chegada")
        .eq("veiculo_id", veiculoId)
        .gte("saida_em", janela.de)
        .lte("saida_em", janela.ate);
      if (valeu) setRoteiros((data as RoteiroNoDia[]) ?? []);
    })();
    return () => {
      valeu = false;
    };
  }, [veiculoId, de, ate]);

  const avisos = avisosDaParada({ de: de || null, ate: ate || null, onde, outras, roteiros });
  const falta = !de || !onde.trim() || !motivo.trim();
  const ordemErrada = !!de && !!ate && ate < de;
  const podeGravar = !salvando && !falta && !ordemErrada && (avisos.length === 0 || confirmado);

  async function gravar() {
    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: eu } = await supabase
        .from("tecnicos")
        .select("id")
        .eq("user_id", user?.id)
        .maybeSingle();

      // O `.select` confere que gravou mesmo: INSERT barrado pela RLS levanta
      // erro, mas o hábito da casa é não confiar no silêncio.
      const { data, error } = await supabase
        .from("paradas")
        .insert({
          veiculo_id: veiculoId,
          de,
          ate: ate || null,
          onde: onde.trim().toUpperCase(),
          motivo: motivo.trim().toUpperCase(),
          observacao: obs.trim() || null,
          registrado_por: eu?.id ?? null,
        })
        .select("id");

      if (error) {
        setErro(
          faltaMigracaoDasParadas(error)
            ? "A migração 0033 ainda não rodou neste banco. Rode-a no SQL Editor do Supabase."
            : error.code === "23505"
              ? "Este veículo já tem um período em aberto. Encerre aquele antes de abrir outro."
              : error.code === "42501"
                ? "Registrar período é do gestor ou do PCM."
                : mensagemDeErro(error, "o registro do período"),
        );
        return;
      }
      if (!data || data.length === 0) {
        setErro("Nada foi gravado: registrar período é do gestor ou do PCM.");
        return;
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "o registro do período"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo="Registrar período parado com terceiro"
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!podeGravar} onClick={gravar}>
            <CalendarClock size={14} />
            {salvando ? "Gravando…" : "Gravar período"}
          </Botao>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-slate-600">
          O tempo em que o veículo ficou na oficina, na concessionária ou em pátio — com alguém que
          não é da equipe. É esse registro que responde de quem o veículo estava quando chega uma
          multa.
        </p>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Campo rotulo="Saiu em">
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Voltou em" dica="Em branco enquanto o veículo não voltar.">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Campo>
          <Campo rotulo="Com quem ficou" dica="A casa que ficou com o veículo. Ex.: ITAVEMA.">
            <Input value={onde} onChange={(e) => setOnde(e.target.value)} placeholder="ITAVEMA" />
          </Campo>
          <Campo rotulo="Motivo">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {["MANUTENÇÃO CORRETIVA", "REVISÃO", "SINISTRO", "PERÍCIA", "OUTRO"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        <Campo rotulo="Observação" dica="O que explicaria o registro para quem ler daqui a um ano.">
          <Input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="A concessionária rodou com o veículo em rodovia para testar."
          />
        </Campo>

        {ordemErrada && <Aviso>A volta não pode ser antes da ida.</Aviso>}

        {/* Aviso não trava: quem lança um período de três meses atrás pode
            estar justamente consertando o que já existe. Mas tem que ser visto. */}
        {!ordemErrada && avisos.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            {avisos.map((a) => (
              <p key={a} className="mb-1.5">
                {a}
              </p>
            ))}
            <label className="mt-1 flex items-start gap-2 font-medium">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className="mt-[3px] size-4 rounded border-slate-300"
              />
              Conferi e é isso mesmo.
            </label>
          </div>
        )}

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}

/* --------------------------------------------- a pergunta da multa ------- */

/**
 * "Chegou uma multa de 12/09. Quem estava com o veículo?"
 *
 * É a pergunta que custa dinheiro quando fica sem resposta: no Brasil o
 * proprietário indica o condutor, e não indicar deixa a multa e os pontos com
 * a empresa.
 */
export function QuemEstava({
  veiculos,
  paradas,
}: {
  veiculos: { id: string; placa: string; modelo: string }[];
  paradas: Parada[];
}) {
  const [veiculoId, setVeiculoId] = useState("");
  const [data, setData] = useState("");
  const [roteiros, setRoteiros] = useState<RoteiroNoDia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [resposta, setResposta] = useState<Resposta | null>(null);

  const buscar = useCallback(async () => {
    if (!veiculoId || !data) return;
    setBuscando(true);
    setResposta(null);
    // Janela de folga de dois dias para trás: roteiro que virou o dia saiu
    // ontem e chegou hoje, e filtrar só pelo dia da multa o deixaria de fora.
    const antes = new Date(Date.parse(data + "T00:00:00Z") - 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    const janela = intervaloUTC(antes, data);
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("v_roteiros")
      .select("id, saida_em, chegada_em, tecnico_saida, tecnico_chegada")
      .eq("veiculo_id", veiculoId)
      .gte("saida_em", janela.de)
      .lte("saida_em", janela.ate);
    const rs = (rows as RoteiroNoDia[]) ?? [];
    setRoteiros(rs);
    setResposta(quemEstavaCom(data, paradas.filter((p) => p.veiculo_id === veiculoId), rs));
    setBuscando(false);
  }, [veiculoId, data, paradas]);

  const v = veiculos.find((x) => x.id === veiculoId);

  return (
    <Cartao titulo="Chegou uma multa? Veja quem estava com o veículo" className="mb-4">
      <div className="p-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <Campo rotulo="Veículo" className="min-w-[210px] flex-[1_1_220px]">
            <Select
              value={veiculoId}
              onChange={(e) => {
                setVeiculoId(e.target.value);
                setResposta(null);
              }}
            >
              <option value="">Selecione…</option>
              {veiculos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.placa} — {x.modelo}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Data da infração" className="min-w-[160px]">
            <Input
              type="date"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                setResposta(null);
              }}
            />
          </Campo>
          <Botao variante="primario" disabled={!veiculoId || !data || buscando} onClick={buscar}>
            <Search size={14} />
            {buscando ? "Procurando…" : "Ver quem estava"}
          </Botao>
        </div>

        {resposta && v && <Veredito r={resposta} placa={v.placa} data={data} roteiros={roteiros} />}
      </div>
    </Cartao>
  );
}

function Veredito({
  r,
  placa,
  data,
}: {
  r: Resposta;
  placa: string;
  data: string;
  roteiros: RoteiroNoDia[];
}) {
  const contradiz = r.tipo === "terceiro" && r.roteiros.length > 0;

  return (
    <div className="mt-3.5 space-y-2.5">
      <div
        className={cx(
          "rounded-lg px-3.5 py-3 ring-1 ring-inset",
          r.tipo === "terceiro"
            ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
            : r.tipo === "equipe"
              ? "bg-amber-50 text-amber-900 ring-amber-200"
              : "bg-slate-50 text-slate-700 ring-slate-200",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Placa>{placa}</Placa>
          <span className="text-[12.5px]">em {dataBR(data)}</span>
        </div>
        <p className="mt-1.5 text-[14.5px] font-semibold leading-snug">
          {r.tipo === "terceiro"
            ? `Estava com ${r.paradas.map((p) => p.onde).join(" e ")} — não era condutor nosso.`
            : r.tipo === "equipe"
              ? `Estava com a equipe: ${r.condutores.join(", ") || "técnico não identificado"}.`
              : "Sem registro nesse dia: nem roteiro da equipe, nem período com terceiro."}
        </p>
        {r.paradas.map((p) => (
          <p key={p.id} className="mt-1 text-[12.5px]">
            {resumoDaParada(p)}
            {p.observacao ? ` · ${p.observacao}` : ""}
          </p>
        ))}
        {r.tipo === "nada" && (
          <p className="mt-1 text-[12.5px] leading-relaxed">
            Pode ser roteiro que ninguém lançou, ou um período com terceiro que falta registrar.
            Confira o histórico antes de indicar condutor.
          </p>
        )}
      </div>

      {r.roteiros.length > 0 && (
        <div
          className={cx(
            "rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed ring-1 ring-inset",
            contradiz ? "bg-red-50 text-red-800 ring-red-200" : "bg-white text-slate-600 ring-slate-200",
          )}
        >
          {contradiz && (
            <p className="mb-1.5 font-semibold">
              Atenção: há roteiro da equipe nesse mesmo dia. Um dos dois registros está errado —
              confira antes de indicar o condutor, porque a sua própria base diz o contrário.
            </p>
          )}
          {r.roteiros.map((x) => (
            <p key={x.id}>
              Roteiro de {diaHoraDe(x.saida_em) ?? "—"}
              {x.chegada_em ? ` até ${diaHoraDe(x.chegada_em)}` : " (sem chegada)"} ·{" "}
              {x.tecnico_saida ?? "—"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
