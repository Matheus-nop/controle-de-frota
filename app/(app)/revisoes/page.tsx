"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Plus, Printer } from "lucide-react";
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
  const [carregando, setCarregando] = useState(true);
  const [semMigracao, setSemMigracao] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [p, v] = await Promise.all([
      supabase.from("v_pacotes_revisao").select("*").order("vence_em", { nullsFirst: false }),
      supabase.from("veiculos").select("id, placa, modelo, km_atual").neq("status", "VENDIDO").order("placa"),
    ]);
    // A migração é aplicada à mão no SQL Editor; entre o deploy e ela, a tela
    // explica em português em vez de mostrar erro de banco.
    if (faltaMigracaoDosPacotes(p.error)) setSemMigracao(true);
    else setPacotes((p.data as Pacote[]) ?? []);
    setVeiculos((v.data as Veiculo[]) ?? []);
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
                <CartaoPacote key={p.id} p={p} onMudou={carregar} />
              ))}
            </div>
          )}
        </>
      )}
    </Pagina>
  );
}

function CartaoPacote({ p, onMudou }: { p: Pacote; onMudou: () => void }) {
  const [agendar, setAgendar] = useState(false);
  const situacao = situacaoDoPacote(p);
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
        <BotaoLink href="/manutencao" tamanho="sm">
          Ver manutenções
        </BotaoLink>
        <EncerrarPacote p={p} onMudou={onMudou} />
      </div>

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

function NovoPacote({
  veiculos,
  onCriado,
}: {
  veiculos: Veiculo[];
  onCriado: () => void;
}) {
  const [veiculoId, setVeiculoId] = useState("");
  const [prestador, setPrestador] = useState("");
  const [servico, setServico] = useState("ALINHAMENTO E BALANCEAMENTO");
  const [contratadoEm, setContratadoEm] = useState(hojeBR());
  const [kmContratado, setKmContratado] = useState("");
  const [gratuitas, setGratuitas] = useState("6");
  const [cadaKm, setCadaKm] = useState("10000");
  const [cadaDias, setCadaDias] = useState("60");
  const [venceEm, setVenceEm] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const escolhido = veiculos.find((v) => v.id === veiculoId);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!veiculoId || !prestador.trim() || !servico.trim()) {
      setErro("Escolha o veículo e preencha o prestador e o serviço.");
      return;
    }
    const n = paraInteiro(gratuitas);
    if (!n || n <= 0) {
      setErro("Quantas revisões gratuitas o prestador deu?");
      return;
    }
    setSalvando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("pacotes_revisao").insert({
        veiculo_id: veiculoId,
        prestador: prestador.trim().toUpperCase(),
        servico: servico.trim().toUpperCase(),
        contratado_em: contratadoEm,
        // Sem km informado, usa o hodômetro de agora: é de onde a primeira
        // revisão vai contar, e sem ele a previsão por km não existiria.
        km_contratado: paraInteiro(kmContratado) ?? escolhido?.km_atual ?? null,
        revisoes_gratuitas: n,
        cada_km: paraInteiro(cadaKm),
        cada_dias: paraInteiro(cadaDias),
        vence_em: venceEm || null,
        observacao: observacao.trim() || null,
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
          <Campo rotulo="Prestador *">
            <Input
              value={prestador}
              onChange={(e) => setPrestador(e.target.value)}
              placeholder="FULL PNEUS"
            />
          </Campo>
          <Campo rotulo="Serviço *">
            <Input value={servico} onChange={(e) => setServico(e.target.value)} />
          </Campo>
          <Campo rotulo="Contratado em">
            <Input
              type="date"
              value={contratadoEm}
              onChange={(e) => setContratadoEm(e.target.value)}
            />
          </Campo>
          <CampoNumero
            rotulo="Km na contratação"
            unidade="km"
            valor={kmContratado}
            onValor={setKmContratado}
            dica={
              escolhido?.km_atual != null
                ? `em branco usa o hodômetro de agora, ${emKm(escolhido.km_atual)}`
                : undefined
            }
          />
          <Campo rotulo="Revisões gratuitas *">
            <Input
              inputMode="numeric"
              value={gratuitas}
              onChange={(e) => setGratuitas(e.target.value.replace(/\D/g, ""))}
            />
          </Campo>
          <CampoNumero rotulo="A cada" unidade="km" valor={cadaKm} onValor={setCadaKm} />
          <Campo rotulo="Ou a cada (dias)">
            <Input
              inputMode="numeric"
              value={cadaDias}
              onChange={(e) => setCadaDias(e.target.value.replace(/\D/g, ""))}
            />
          </Campo>
          <Campo rotulo="Benefício vence em">
            <Input type="date" value={venceEm} onChange={(e) => setVenceEm(e.target.value)} />
          </Campo>
        </div>
        <div className="mt-2.5">
          <Campo rotulo="Observação">
            <Textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="nº da nota, condições combinadas, nome de quem vendeu…"
            />
          </Campo>
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
