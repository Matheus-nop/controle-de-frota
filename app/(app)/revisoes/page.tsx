"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Pencil, Plus, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  datasDaSerie,
  faltaMigracaoDosPacotes,
  proximaDoPacote,
  saldoDoPacote,
  situacaoDoPacote,
  type Pacote,
  venceOuVenceu,
  type Situacao,
} from "@/lib/frota/pacote";
import { emKm, paraInteiro } from "@/lib/frota/numero";
import { hojeBR } from "@/lib/frota/tempo";
import { mensagemDeErro } from "@/lib/frota/erro";
import {
  Aviso,
  Badge,
  Botao,
  BotaoLink,
  Campo,
  CampoNumero,
  Cartao,
  Carregando,
  Confirmar,
  Input,
  Modal,
  Pagina,
  Placa,
  Select,
  Textarea,
  Vazio,
  type Tom,
} from "@/components/ui";

// Revisões programadas: o que o prestador deve e quando cobrar.
//
// O caso que originou a tela: alinhamento e balanceamento comprados com
// direito a seis revisões gratuitas. Sem registro, o saldo vence sem ser
// usado — paga-se por sete serviços e usam-se dois.
//
// A tela não guarda saldo nenhum. "Quantas sobram" é contagem das manutenções
// que apontam para o pacote, feita pela view `v_pacotes_revisao`. Cancelar uma
// manutenção devolve a revisão sozinho, sem ninguém lembrar de somar de volta.

type Veiculo = { id: string; placa: string; modelo: string; km_atual: number | null };

/** Uma revisão do pacote: é uma manutenção comum, vista daqui. */
export type Revisao = {
  id: string;
  pacote_id: string;
  status: string;
  agendada_para: string | null;
  concluida_em: string | null;
  km_abertura: number | null;
  oficina: string | null;
};

const SITUACOES = ["AGENDADA", "CONCLUÍDA", "CANCELADA"] as const;

const TOM_REVISAO: Record<string, Tom> = {
  AGENDADA: "info",
  ABERTA: "atencao",
  "EM EXECUÇÃO": "atencao",
  "CONCLUÍDA": "ok",
  CANCELADA: "mudo",
};

/** A data que importa na revisão: quando aconteceu, ou quando está marcada. */
function dataDaRevisao(r: Revisao): string | null {
  return r.concluida_em ?? r.agendada_para;
}

const TOM_SITUACAO: Record<Situacao, Tom> = {
  "EM DIA": "ok",
  "REVISÃO VENCIDA": "atencao",
  "VENCE EM BREVE": "atencao",
  VENCIDO: "critico",
  ESGOTADO: "mudo",
  ENCERRADO: "mudo",
};

export default function RevisoesPage() {
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semMigracao, setSemMigracao] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [p, v, r] = await Promise.all([
      supabase.from("v_pacotes_revisao").select("*").order("vence_em", { nullsFirst: false }),
      supabase.from("veiculos").select("id, placa, modelo, km_atual").neq("status", "VENDIDO").order("placa"),
      // As revisões de todos os pacotes de uma vez: são poucas (seis por
      // pacote, num punhado de pacotes) e uma consulta por cartão seria
      // desperdício numa frota de nove veículos.
      supabase
        .from("manutencoes")
        .select("id, pacote_id, status, agendada_para, concluida_em, km_abertura, oficina")
        .not("pacote_id", "is", null),
    ]);
    // A migração é aplicada à mão no SQL Editor; entre o deploy e ela, a tela
    // explica em português em vez de mostrar erro de banco.
    if (faltaMigracaoDosPacotes(p.error)) setSemMigracao(true);
    else setPacotes((p.data as Pacote[]) ?? []);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setRevisoes((r.data as Revisao[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const ativos = pacotes.filter((p) => !p.encerrado_em && p.restantes > 0);
  const gratuitas = ativos.reduce((s, p) => s + p.restantes, 0);

  return (
    <Pagina
      estreita
      titulo="Revisões programadas"
      subtitulo={
        carregando
          ? "carregando…"
          : `${ativos.length} pacote${ativos.length === 1 ? "" : "s"} em aberto · ${gratuitas} revis${
              gratuitas === 1 ? "ão" : "ões"
            } gratuita${gratuitas === 1 ? "" : "s"} a usar`
      }
      acoes={
        !semMigracao && (
          <Botao variante="primario" onClick={() => setAddOpen((x) => !x)}>
            {addOpen ? "Fechar" : (<><Plus size={14} />Novo pacote</>)}
          </Botao>
        )
      }
    >
      {semMigracao ? (
        <Aviso>
          A migração <strong>0027</strong> ainda não rodou no Supabase. Rode-a no SQL Editor e esta
          tela passa a funcionar — nada do que já existe é afetado até lá.
        </Aviso>
      ) : (
        <>
          {addOpen && (
            <NovoPacote
              veiculos={veiculos}
              onCriado={() => {
                setAddOpen(false);
                void carregar();
              }}
            />
          )}

          {carregando ? (
            <Cartao>
              <Carregando />
            </Cartao>
          ) : pacotes.length === 0 ? (
            <Vazio
              titulo="Nenhum pacote cadastrado."
              texto="Cadastre o que o prestador vendeu — por exemplo, alinhamento com seis revisões gratuitas — e o sistema passa a avisar antes de cada uma vencer."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {pacotes.map((p) => (
                <CartaoPacote
                  key={p.id}
                  p={p}
                  revisoes={revisoes.filter((r) => r.pacote_id === p.id)}
                  onMudou={carregar}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Pagina>
  );
}

function CartaoPacote({
  p,
  revisoes,
  onMudou,
}: {
  p: Pacote;
  revisoes: Revisao[];
  onMudou: () => void;
}) {
  const [agendar, setAgendar] = useState(false);
  const [editar, setEditar] = useState(false);
  const [editandoRevisao, setEditandoRevisao] = useState<Revisao | null>(null);
  const situacao = situacaoDoPacote(p);
  // As canceladas somem: não consomem revisão e não vão para o cronograma.
  // A ordem é a do calendário, que é como o papel e a conversa acontecem.
  const ativas = revisoes
    .filter((r) => r.status !== "CANCELADA")
    .sort((a, b) => (dataDaRevisao(a) ?? "").localeCompare(dataDaRevisao(b) ?? ""));
  const proxima = proximaDoPacote(p);

  return (
    <Cartao className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Placa>{p.placa}</Placa>
        <span className="text-[13px] text-slate-500">{p.modelo}</span>
        <Badge tom={TOM_SITUACAO[situacao]}>{situacao}</Badge>
        <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900">
          {p.restantes}/{p.revisoes_gratuitas}
        </span>
      </div>

      <div className="mb-1 mt-2.5 text-sm font-semibold text-slate-900">{p.servico}</div>
      <div className="text-[12px] text-slate-500">
        {p.prestador} · {saldoDoPacote(p)}
        {p.vence_em ? ` · ${venceOuVenceu(p.vence_em)}` : ""}
      </div>

      {proxima && (
        <div className="mt-2.5 rounded-lg bg-brand-50/70 px-3 py-2 text-[12.5px] text-brand-900 ring-1 ring-inset ring-brand-200">
          <span className="font-semibold">Próxima:</span> {proxima}
          {p.km_atual != null && p.proxima_km != null && (
            <span className="text-brand-700">
              {" "}
              · hodômetro em {emKm(p.km_atual)}
              {p.km_atual >= p.proxima_km ? ` (passou ${emKm(p.km_atual - p.proxima_km)})` : ""}
            </span>
          )}
        </div>
      )}

      {p.observacao && <div className="mt-2 text-[12.5px] text-slate-600">{p.observacao}</div>}

      {/* Cada revisão, para corrigir uma a uma. Sem isto, lançar que a
          primeira foi mesmo no dia 03 e não no dia marcado exigia caçar a
          manutenção na outra tela — e lá não há campo para a data em que ela
          de fato aconteceu. */}
      {ativas.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 rounded-lg ring-1 ring-inset ring-slate-200">
          {ativas.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2">
              <span className="w-[22px] text-[12.5px] font-semibold tabular-nums text-slate-500">
                {i + 1}ª
              </span>
              <Badge tom={TOM_REVISAO[r.status] ?? "mudo"}>{r.status}</Badge>
              <span className="text-[12.5px] tabular-nums text-slate-700">
                {dataDaRevisao(r) ? dataBR(dataDaRevisao(r)!) : "sem data"}
              </span>
              {r.km_abertura != null && r.status === "CONCLUÍDA" && (
                <span className="text-[12px] text-slate-500">{emKm(r.km_abertura)}</span>
              )}
              <Botao tamanho="sm" className="ml-auto" onClick={() => setEditandoRevisao(r)}>
                Alterar
              </Botao>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {p.restantes > 0 && !p.encerrado_em && (
          <Botao tamanho="sm" variante="primario" onClick={() => setAgendar(true)}>
            <CalendarClock size={13} />
            Agendar revisão
          </Botao>
        )}
        {/* O papel que vai para o balcão do prestador e volta carimbado. */}
        <BotaoLink href={`/revisoes/cronograma?id=${p.id}`} tamanho="sm">
          <Printer size={13} />
          Cronograma
        </BotaoLink>
        <Botao tamanho="sm" onClick={() => setEditar(true)}>
          <Pencil size={13} />
          Editar
        </Botao>
        <BotaoLink href="/manutencao" tamanho="sm">
          Ver manutenções
        </BotaoLink>
        <EncerrarPacote p={p} onMudou={onMudou} />
      </div>

      {editandoRevisao && (
        <EditarRevisao
          r={editandoRevisao}
          p={p}
          onFechar={() => setEditandoRevisao(null)}
          onSalvo={() => {
            setEditandoRevisao(null);
            onMudou();
          }}
        />
      )}

      {editar && (
        <EditarPacote
          p={p}
          onFechar={() => setEditar(false)}
          onSalvo={() => {
            setEditar(false);
            onMudou();
          }}
        />
      )}

      {agendar && (
        <AgendarRevisao
          p={p}
          onFechar={() => setAgendar(false)}
          onAgendado={() => {
            setAgendar(false);
            onMudou();
          }}
        />
      )}
    </Cartao>
  );
}

/** Agenda as próximas revisões do pacote.
 *
 *  Uma de cada vez não é como o prestador combina: "de quinze em quinze" sai
 *  do balcão já com todas as datas. Agendar a série inteira de uma vez é o que
 *  deixa o cronograma existir em papel e o alerta avisar de cada uma.
 *
 *  Cada revisão vira uma manutenção AGENDADA apontando para o pacote. O saldo
 *  cai na hora, e volta sozinho se alguma for cancelada. */
function AgendarRevisao({
  p,
  onFechar,
  onAgendado,
}: {
  p: Pacote;
  onFechar: () => void;
  onAgendado: () => void;
}) {
  const [data, setData] = useState(
    p.proxima_em && p.proxima_em > hojeBR() ? p.proxima_em : hojeBR(),
  );
  const [oficina, setOficina] = useState(p.prestador);
  const [quantas, setQuantas] = useState("1");
  const [cada, setCada] = useState(String(p.cada_dias ?? 15));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const n = Math.min(Math.max(paraInteiro(quantas) ?? 1, 1), p.restantes);
  const intervalo = paraInteiro(cada) ?? 0;
  const datas = data && intervalo > 0 ? datasDaSerie(data, intervalo, n) : data ? [data] : [];

  async function agendar() {
    setErro(null);
    if (!data) {
      setErro("Escolha o dia combinado com a oficina.");
      return;
    }
    if (n > 1 && intervalo <= 0) {
      setErro("Para agendar mais de uma, diga de quantos em quantos dias.");
      return;
    }
    setSalvando(true);
    try {
      const supabase = createClient();
      const linhas = datas.map((dia, i) => ({
        veiculo_id: p.veiculo_id,
        descricao_problema: `${p.servico} — revisão ${p.usadas + i + 1} de ${p.revisoes_gratuitas} do pacote`,
        tipo: "PREVENTIVA",
        origem: "PREVENTIVA PROGRAMADA",
        oficina: oficina.trim() || p.prestador,
        pacote_id: p.id,
        agendada_para: dia,
        km_abertura: p.km_atual,
        status: "AGENDADA",
      }));
      const { error } = await supabase.from("manutencoes").insert(linhas);
      if (error) throw error;
      onAgendado();
    } catch (err) {
      setErro(mensagemDeErro(err, "o agendamento"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto titulo="Agendar revisão" onFechar={onFechar}>
      <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
        Marca a partir da <strong>{p.usadas + 1}ª de {p.revisoes_gratuitas}</strong> revisões de{" "}
        {p.servico.toLowerCase()} na {p.prestador}. Cada uma entra como manutenção agendada; o
        alerta avisa quando o dia chegar, e some sozinho assim que o veículo for.
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Campo rotulo="Primeira, no dia">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Oficina">
          <Input value={oficina} onChange={(e) => setOficina(e.target.value)} />
        </Campo>
        <Campo rotulo={`Quantas agendar (sobram ${p.restantes})`}>
          <Input
            inputMode="numeric"
            value={quantas}
            onChange={(e) => setQuantas(e.target.value.replace(/\D/g, ""))}
          />
        </Campo>
        <Campo rotulo="De quantos em quantos dias">
          <Input
            inputMode="numeric"
            value={cada}
            onChange={(e) => setCada(e.target.value.replace(/\D/g, ""))}
          />
        </Campo>
      </div>

      {/* As datas aparecem ANTES de gravar: agendar cinco de uma vez e só
          descobrir depois que caiu tudo em domingo custa cinco remarcações. */}
      {datas.length > 1 && (
        <div className="mt-3 rounded-lg bg-brand-50/70 px-3 py-2.5 text-[12.5px] text-brand-900 ring-1 ring-inset ring-brand-200">
          <span className="font-semibold">Vai agendar {datas.length}:</span>{" "}
          {datas.map((d) => dataBR(d)).join(" · ")}
        </div>
      )}

      {erro && (
        <div className="mt-2.5">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      <div className="mt-3.5 flex items-center gap-2">
        <Botao variante="primario" onClick={agendar} disabled={salvando}>
          {salvando ? "Agendando…" : datas.length > 1 ? `Agendar as ${datas.length}` : "Agendar"}
        </Botao>
        <Botao onClick={onFechar}>Cancelar</Botao>
      </div>
    </Modal>
  );
}

function EncerrarPacote({ p, onMudou }: { p: Pacote; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  if (p.encerrado_em) {
    return (
      <span className="text-[12px] text-slate-500">encerrado em {dataBR(p.encerrado_em)}</span>
    );
  }
  return (
    <>
      <Botao tamanho="sm" onClick={() => setAberto(true)}>
        Encerrar
      </Botao>
      <Confirmar
        aberto={aberto}
        titulo="Encerrar o pacote?"
        texto="Use quando o benefício acabou antes da hora — veículo vendido, prestador trocado, acordo desfeito. O histórico das revisões já usadas continua; o pacote só para de cobrar as que sobraram."
        confirmarTexto="Encerrar"
        onFechar={() => setAberto(false)}
        onConfirmar={() => {
          void (async () => {
            const supabase = createClient();
            await supabase
              .from("pacotes_revisao")
              .update({ encerrado_em: hojeBR() })
              .eq("id", p.id);
            setAberto(false);
            onMudou();
          })();
        }}
      />
    </>
  );
}

/** Corrige uma revisão: a situação, a data em que de fato aconteceu, o km.
 *
 *  A tela de Manutenção não serve para isto: lá, marcar CONCLUÍDA grava a data
 *  de HOJE, sem campo para dizer que o serviço foi no dia 3. E achar a
 *  manutenção certa no meio de todas exige saber o que procurar.
 *
 *  Cancelar é o jeito de apagar um engano — três agendamentos no mesmo dia,
 *  por exemplo. A cancelada devolve a revisão ao saldo, some do cronograma e
 *  continua no histórico, em vez de desaparecer sem rastro. */
function EditarRevisao({
  r,
  p,
  onFechar,
  onSalvo,
}: {
  r: Revisao;
  p: Pacote;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [status, setStatus] = useState(r.status);
  const [data, setData] = useState(dataDaRevisao(r) ?? hojeBR());
  const [km, setKm] = useState(r.km_abertura != null ? String(r.km_abertura) : "");
  const [oficina, setOficina] = useState(r.oficina ?? p.prestador);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const concluida = status === "CONCLUÍDA";
  const cancelada = status === "CANCELADA";

  async function salvar() {
    setErro(null);
    if (!cancelada && !data) {
      setErro(concluida ? "Em que dia a revisão foi feita?" : "Para que dia ela está marcada?");
      return;
    }
    setSalvando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("manutencoes")
        .update({
          status,
          // Concluída guarda a data em que aconteceu E preserva a prevista:
          // é a comparação que o cronograma impresso mostra lado a lado.
          concluida_em: concluida ? data : null,
          agendada_para: concluida ? r.agendada_para : cancelada ? r.agendada_para : data,
          km_abertura: paraInteiro(km),
          oficina: oficina.trim() || null,
        })
        .eq("id", r.id);
      if (error) throw error;
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "a correção da revisão"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto titulo="Alterar revisão" onFechar={onFechar}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Campo rotulo="Situação">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {SITUACOES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </Campo>
        {!cancelada && (
          <Campo rotulo={concluida ? "Foi feita em" : "Marcada para"}>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        )}
        <CampoNumero
          rotulo={concluida ? "Km na revisão" : "Km previsto"}
          unidade="km"
          valor={km}
          onValor={setKm}
        />
        <Campo rotulo="Oficina">
          <Input value={oficina} onChange={(e) => setOficina(e.target.value)} />
        </Campo>
      </div>

      {cancelada && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-600">
          Cancelada, esta revisão <strong>volta para o saldo</strong> do pacote e some do
          cronograma impresso. O registro continua no histórico — é assim que se desfaz um
          agendamento repetido sem perder o rastro.
        </p>
      )}
      {concluida && r.agendada_para && r.agendada_para !== data && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-600">
          Estava marcada para {dataBR(r.agendada_para)}. O cronograma vai mostrar as duas datas,
          prevista e realizada.
        </p>
      )}

      {erro && (
        <div className="mt-2.5">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      <div className="mt-3.5 flex items-center gap-2">
        <Botao variante="primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
        <Botao onClick={onFechar}>Cancelar</Botao>
      </div>
    </Modal>
  );
}

/** Os campos do pacote, compartilhados entre cadastrar e editar.
 *
 *  Existem como um bloco só porque a tela nasceu sem "editar", e corrigir uma
 *  cadência errada obrigava a apagar o pacote e refazer — perdendo o histórico
 *  das revisões já usadas. Dois formulários com os mesmos nove campos
 *  divergiriam na primeira mudança, então o estado e a validação moram aqui. */
function useCamposDoPacote(p?: Pacote) {
  const [prestador, setPrestador] = useState(p?.prestador ?? "");
  const [servico, setServico] = useState(p?.servico ?? "ALINHAMENTO E BALANCEAMENTO");
  const [contratadoEm, setContratadoEm] = useState(p?.contratado_em ?? hojeBR());
  const [kmContratado, setKmContratado] = useState(
    p?.km_contratado != null ? String(p.km_contratado) : "",
  );
  const [gratuitas, setGratuitas] = useState(p ? String(p.revisoes_gratuitas) : "6");
  const [cadaKm, setCadaKm] = useState(p?.cada_km != null ? String(p.cada_km) : "");
  const [cadaDias, setCadaDias] = useState(p?.cada_dias != null ? String(p.cada_dias) : "");
  const [venceEm, setVenceEm] = useState(p?.vence_em ?? "");
  const [observacao, setObservacao] = useState(p?.observacao ?? "");

  /** Nulo quando está tudo certo; a frase do problema quando não está. */
  function validar(): string | null {
    if (!prestador.trim() || !servico.trim()) return "Preencha o prestador e o serviço.";
    const n = paraInteiro(gratuitas);
    if (!n || n <= 0) return "Quantas revisões gratuitas o prestador deu?";
    // Pacote sem cadência nenhuma não tem como prever a próxima — e prever a
    // próxima é a razão de a tela existir.
    if (paraInteiro(cadaKm) == null && paraInteiro(cadaDias) == null) {
      return "Diga a cadência: de quantos em quantos km, de quantos em quantos dias, ou as duas.";
    }
    return null;
  }

  function paraGravar() {
    return {
      prestador: prestador.trim().toUpperCase(),
      servico: servico.trim().toUpperCase(),
      contratado_em: contratadoEm,
      km_contratado: paraInteiro(kmContratado),
      revisoes_gratuitas: paraInteiro(gratuitas) ?? 1,
      cada_km: paraInteiro(cadaKm),
      cada_dias: paraInteiro(cadaDias),
      vence_em: venceEm || null,
      observacao: observacao.trim() || null,
    };
  }

  return {
    prestador, setPrestador, servico, setServico,
    contratadoEm, setContratadoEm, kmContratado, setKmContratado,
    gratuitas, setGratuitas, cadaKm, setCadaKm, cadaDias, setCadaDias,
    venceEm, setVenceEm, observacao, setObservacao,
    validar, paraGravar,
  };
}

type CamposPacote = ReturnType<typeof useCamposDoPacote>;

function CamposDoPacote({ f, dicaKm }: { f: CamposPacote; dicaKm: number | null }) {
  return (
    <>
      <Campo rotulo="Prestador *">
        <Input
          value={f.prestador}
          onChange={(e) => f.setPrestador(e.target.value)}
          placeholder="FULL PNEUS"
        />
      </Campo>
      <Campo rotulo="Serviço *">
        <Input value={f.servico} onChange={(e) => f.setServico(e.target.value)} />
      </Campo>
      <Campo rotulo="Contratado em">
        <Input
          type="date"
          value={f.contratadoEm}
          onChange={(e) => f.setContratadoEm(e.target.value)}
        />
      </Campo>
      <CampoNumero
        rotulo="Km na contratação"
        unidade="km"
        valor={f.kmContratado}
        onValor={f.setKmContratado}
        dica={dicaKm != null ? `em branco usa o hodômetro de agora, ${emKm(dicaKm)}` : undefined}
      />
      <Campo rotulo="Revisões gratuitas *">
        <Input
          inputMode="numeric"
          value={f.gratuitas}
          onChange={(e) => f.setGratuitas(e.target.value.replace(/\D/g, ""))}
        />
      </Campo>
      {/* As duas cadências em branco de propósito: preencher uma que o
          prestador não deu faz o cartão prever uma data que ninguém combinou —
          foi o que aconteceu com os 10.000 km num pacote que era por dia. */}
      <CampoNumero
        rotulo="A cada (km)"
        unidade="km"
        valor={f.cadaKm}
        onValor={f.setCadaKm}
        dica="deixe em branco se o acordo não é por km"
      />
      <Campo rotulo="Ou a cada (dias)">
        <Input
          inputMode="numeric"
          value={f.cadaDias}
          onChange={(e) => f.setCadaDias(e.target.value.replace(/\D/g, ""))}
        />
      </Campo>
      <Campo rotulo="Benefício vence em">
        <Input type="date" value={f.venceEm} onChange={(e) => f.setVenceEm(e.target.value)} />
      </Campo>
      <div className="sm:col-span-2 lg:col-span-3">
        <Campo rotulo="Observação">
          <Textarea
            rows={2}
            value={f.observacao}
            onChange={(e) => f.setObservacao(e.target.value)}
            placeholder="nº da nota, condições combinadas, nome de quem vendeu…"
          />
        </Campo>
      </div>
    </>
  );
}

/** Corrige o pacote sem apagá-lo. O histórico das revisões já usadas aponta
 *  para este id — refazer o pacote do zero perderia todas elas. */
function EditarPacote({
  p,
  onFechar,
  onSalvo,
}: {
  p: Pacote;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const f = useCamposDoPacote(p);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    const problema = f.validar();
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("pacotes_revisao")
        .update(f.paraGravar())
        .eq("id", p.id);
      if (error) throw error;
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "a correção do pacote"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto titulo="Editar pacote" onFechar={onFechar}>
      <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
        O veículo não muda: se for outro veículo, é outro pacote. As{" "}
        {p.usadas === 1 ? "revisão já usada continua" : `${p.usadas} revisões já usadas continuam`}{" "}
        no histórico.
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <CamposDoPacote f={f} dicaKm={p.km_atual} />
      </div>
      {erro && (
        <div className="mt-2.5">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      <div className="mt-3.5 flex items-center gap-2">
        <Botao variante="primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
        <Botao onClick={onFechar}>Cancelar</Botao>
      </div>
    </Modal>
  );
}

function NovoPacote({
  veiculos,
  onCriado,
}: {
  veiculos: Veiculo[];
  onCriado: () => void;
}) {
  const [veiculoId, setVeiculoId] = useState("");
  const f = useCamposDoPacote();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const escolhido = veiculos.find((v) => v.id === veiculoId);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!veiculoId) {
      setErro("Escolha o veículo.");
      return;
    }
    const problema = f.validar();
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("pacotes_revisao").insert({
        veiculo_id: veiculoId,
        ...f.paraGravar(),
        // Sem km informado, usa o hodômetro de agora: é de onde a primeira
        // revisão vai contar, e sem ele a previsão por km não existiria.
        km_contratado: f.paraGravar().km_contratado ?? escolhido?.km_atual ?? null,
      });
      if (error) throw error;
      onCriado();
    } catch (err) {
      setErro(mensagemDeErro(err, "o cadastro do pacote"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao titulo="Novo pacote de revisão" className="mb-3 ring-brand-300">
      <form onSubmit={criar} className="p-4">
        <p className="mb-3.5 text-[13px] leading-relaxed text-slate-600">
          O que o prestador vendeu junto com o serviço. A cadência é a que ele recomendou — com as
          duas preenchidas, vence o que chegar primeiro.
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Veículo *">
            <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              <option value="">—</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} · {v.modelo}
                </option>
              ))}
            </Select>
          </Campo>
          <CamposDoPacote f={f} dicaKm={escolhido?.km_atual ?? null} />
        </div>
        {erro && (
          <div className="mt-2.5">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <div className="mt-3.5">
          <Botao variante="primario" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Cadastrar pacote"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

function dataBR(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
