"use client";

import { useCallback, useEffect, useState } from "react";
import { Paperclip, Plus, Printer, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeBR } from "@/lib/frota/tempo";
import { emKm, emReais, paraDecimal, paraInteiro } from "@/lib/frota/numero";
import { itensDoMarco, marcoSugerido, regrasDoMarco, type Escopo } from "@/lib/frota/escopo";
import { enviarFotos } from "@/lib/frota/foto";
import {
  anexarNotas,
  faltaMigracaoDasNotas,
  notasDe,
  removerNota,
  resumoDaNota,
  ROTULOS_NOTA,
} from "@/lib/frota/notas";
import { mensagemDeErro } from "@/lib/frota/erro";
import {
  Aviso,
  Badge,
  Botao,
  BotaoLink,
  Campo,
  CampoArquivos,
  CampoNumero,
  chaveDoArquivo,
  Cartao,
  Carregando,
  Checkbox,
  Input,
  Pagina,
  Placa,
  Select,
  Vazio,
  cx,
  type Tom,
} from "@/components/ui";

type Veiculo = {
  id: string;
  placa: string;
  modelo: string;
  km_atual: number | null;
  proxima_revisao_km: number | null;
};
type Tecnico = { id: string; nome: string };
type Manut = {
  id: string;
  veiculo_id: string;
  aberta_em: string | null;
  km_abertura: number | null;
  origem: string | null;
  tipo: string | null;
  descricao_problema: string;
  prioridade: string | null;
  responsavel_id: string | null;
  oficina: string | null;
  orcamento: number | null;
  status: string;
  concluida_em: string | null;
  valor_final: number | null;
  servico_realizado: string | null;
  pecas_trocadas: string | null;
  proxima_revisao_km: number | null;
  nota_fiscal_url: string | null;
  notas_fiscais?: unknown;
  veiculo: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
};

const ORIGENS = ["CHECKLIST SEMANAL", "ROTEIRO", "ACIDENTE/AVARIA", "PREVENTIVA PROGRAMADA", "OUTRO"];
const TIPOS = ["PREVENTIVA", "CORRETIVA"];
const PRIORIDADES = ["BAIXA", "MÉDIA", "ALTA", "EMERGENCIAL"];
const STATUS = ["ABERTA", "EM EXECUÇÃO", "CONCLUÍDA", "CANCELADA"];

const TOM_STATUS: Record<string, Tom> = {
  ABERTA: "atencao",
  "EM EXECUÇÃO": "info",
  CONCLUÍDA: "ok",
  CANCELADA: "mudo",
};
const FAIXA_STATUS: Record<string, string> = {
  ABERTA: "border-l-amber-500",
  "EM EXECUÇÃO": "border-l-brand-600",
  CONCLUÍDA: "border-l-emerald-600",
  CANCELADA: "border-l-slate-300",
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}

const FILTROS: [string, string][] = [
  ["ABERTAS", "Em aberto"],
  ["CONCLUÍDA", "Concluídas"],
  ["CANCELADA", "Canceladas"],
  ["TODAS", "Todas"],
];

export default function ManutencaoPage() {
  const [manuts, setManuts] = useState<Manut[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [escopos, setEscopos] = useState<Escopo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filtro, setFiltro] = useState("ABERTAS");

  const carregar = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();
    const [m, v, t, esc] = await Promise.all([
      supabase
        .from("manutencoes")
        .select("*, veiculo:veiculo_id(placa,modelo)")
        .order("aberta_em", { ascending: false }),
      supabase
        .from("veiculos")
        .select("id, placa, modelo, km_atual, proxima_revisao_km")
        .in("status", ["ATIVO", "BLOQUEADO", "MANUTENCAO"])
        .order("placa"),
      supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("escopos_manutencao").select("*").eq("ativo", true),
    ]);
    setManuts((m.data as Manut[]) ?? []);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setTecnicos((t.data as Tecnico[]) ?? []);
    // Sem escopo cadastrado a lista vem vazia e a tela segue igual: o escopo
    // acrescenta, não bloqueia quem ainda não cadastrou plano nenhum.
    setEscopos((esc.data as Escopo[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const lista = manuts.filter((m) =>
    filtro === "TODAS"
      ? true
      : filtro === "ABERTAS"
        ? m.status === "ABERTA" || m.status === "EM EXECUÇÃO"
        : m.status === filtro,
  );
  const abertas = manuts.filter((m) => m.status === "ABERTA" || m.status === "EM EXECUÇÃO").length;
  const gastoTotal = manuts.reduce((s, m) => s + (m.valor_final || 0), 0);

  return (
    <Pagina
      estreita
      titulo="Manutenções"
      subtitulo={carregando ? "carregando…" : `${abertas} em aberto · ${emReais(gastoTotal)} já pagos`}
      acoes={
        <Botao variante="primario" onClick={() => setAddOpen((x) => !x)}>
          {addOpen ? (
            "Fechar"
          ) : (
            <>
              <Plus size={14} />
              Abrir manutenção
            </>
          )}
        </Botao>
      }
    >
      {addOpen && (
        <NovaManutencao
          veiculos={veiculos}
          tecnicos={tecnicos}
          escopos={escopos}
          onCriada={() => {
            setCarregando(true);
            void carregar();
          }}
        />
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTROS.map(([valor, rotulo]) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={cx(
              "rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition",
              filtro === valor
                ? "bg-brand-700 text-white ring-brand-700"
                : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : lista.length === 0 ? (
        <Vazio titulo="Nenhuma manutenção nesse filtro." />
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((m) => (
            <CartaoManutencao key={m.id} m={m} tecnicos={tecnicos} onSalvo={carregar} />
          ))}
        </div>
      )}
    </Pagina>
  );
}

function CartaoManutencao({
  m,
  tecnicos,
  onSalvo,
}: {
  m: Manut;
  tecnicos: Tecnico[];
  onSalvo: () => void;
}) {
  const v = one(m.veiculo);
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState(m.status);
  const [oficina, setOficina] = useState(m.oficina || "");
  const [kmAbertura, setKmAbertura] = useState(
    m.km_abertura != null ? String(m.km_abertura) : "",
  );
  const [orcamento, setOrcamento] = useState(m.orcamento != null ? String(m.orcamento) : "");
  const [valor, setValor] = useState(m.valor_final != null ? String(m.valor_final) : "");
  const [servico, setServico] = useState(m.servico_realizado || "");
  const [pecas, setPecas] = useState(m.pecas_trocadas || "");
  const [proxRev, setProxRev] = useState(
    m.proxima_revisao_km != null ? String(m.proxima_revisao_km) : "",
  );
  const [resp, setResp] = useState(m.responsavel_id || "");
  // A oficina fatura peça e mão de obra em notas separadas, às vezes de CNPJs
  // diferentes. Por isso é lista, e por isso cada uma tem o seu rótulo — o nome
  // do arquivo costuma ser "scan_0012.pdf" e não ajuda ninguém depois.
  const [notas, setNotas] = useState<File[]>([]);
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  // As notas já anexadas, nas duas formas — a coluna única antiga e a lista.
  const notasAnexadas = notasDe(m);

  /** Tira uma nota da manutenção. O arquivo continua no Storage: removeu a
   *  errada, o endereço ainda existe. Some da manutenção, que é o que o botão
   *  promete. */
  async function tirarNota(url: string) {
    setSalvando(true);
    setMsg(null);
    try {
      const supabase = createClient();
      let { error } = await supabase
        .from("manutencoes")
        .update(removerNota(m, url))
        .eq("id", m.id);
      // Antes da 0019 só existe a nota da coluna antiga — e tirar aquela é
      // zerar a coluna.
      if (faltaMigracaoDasNotas(error)) {
        ({ error } = await supabase
          .from("manutencoes")
          .update({ nota_fiscal_url: null })
          .eq("id", m.id));
      }
      if (error) throw error;
      onSalvo();
    } catch (err) {
      setMsg({ ok: false, txt: mensagemDeErro(err, "a remoção da nota") });
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      const supabase = createClient();
      // Em fila, como toda foto do app desde que o 4G da rua derrubou o envio
      // simultâneo do checklist. PDF passa inteiro: a redução só mexe em imagem.
      const enviadas = await enviarFotos(supabase, "manutencoes", `${m.id}/nf`, notas);
      const anexadas = anexarNotas(
        m,
        enviadas.map((url, i) => ({ url, rotulo: rotulos[chaveDoArquivo(notas[i])] || null })),
      );

      const concluindo = status === "CONCLUÍDA";
      const campos = {
        status,
        oficina: oficina.trim() || null,
        km_abertura: paraInteiro(kmAbertura),
        orcamento: paraDecimal(orcamento),
        valor_final: paraDecimal(valor),
        servico_realizado: servico.trim() || null,
        pecas_trocadas: pecas.trim() || null,
        proxima_revisao_km: paraInteiro(proxRev),
        responsavel_id: resp || null,
        concluida_em: concluindo ? (m.concluida_em ?? hojeBR()) : null,
      };

      let { error } = await supabase
        .from("manutencoes")
        .update({ ...campos, ...anexadas })
        .eq("id", m.id);

      // Antes da 0019 a coluna da lista não existe. Em vez de recusar o
      // andamento inteiro por causa dela, grava o resto e guarda a última nota
      // na coluna antiga — e diz em português o que ficou para depois.
      let soUmaNota = false;
      if (faltaMigracaoDasNotas(error)) {
        const ultima = anexadas.notas_fiscais.at(-1) as { url?: string } | undefined;
        ({ error } = await supabase
          .from("manutencoes")
          .update({ ...campos, nota_fiscal_url: ultima?.url ?? m.nota_fiscal_url })
          .eq("id", m.id));
        soUmaNota = anexadas.notas_fiscais.length > 1;
      }
      if (error) throw error;
      setMsg({
        ok: true,
        txt: soUmaNota
          ? "Salvo, mas só uma nota ficou anexada: a migração 0019 ainda não rodou no Supabase."
          : "Salvo.",
      });
      // A lista de escolhidos zera: o que foi enviado agora aparece no cartão, e
      // deixar os arquivos no campo faria o próximo "salvar" reenviar tudo.
      setNotas([]);
      setRotulos({});
      onSalvo();
    } catch (err) {
      setMsg({ ok: false, txt: mensagemDeErro(err, "o registro do andamento") });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao className={cx("border-l-4 p-4", FAIXA_STATUS[m.status] ?? "border-l-slate-300")}>
      <div className="flex flex-wrap items-center gap-2">
        <Placa>{v?.placa}</Placa>
        <span className="text-[13px] text-slate-500">{v?.modelo}</span>
        <Badge tom={TOM_STATUS[m.status] ?? "mudo"}>{m.status}</Badge>
        {m.prioridade && <span className="text-[11.5px] text-slate-500">{m.prioridade}</span>}
        <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900">
          {emReais(m.valor_final ?? m.orcamento)}
        </span>
      </div>

      <div className="mb-1 mt-2.5 text-sm font-semibold text-slate-900">{m.descricao_problema}</div>
      <div className="text-[12px] text-slate-500">
        Aberta {dataBR(m.aberta_em)}
        {m.origem ? " · " + m.origem : ""}
        {m.oficina ? " · " + m.oficina : ""}
        {m.concluida_em ? " · concluída " + dataBR(m.concluida_em) : ""}
      </div>

      {notasAnexadas.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {notasAnexadas.length === 1 ? "Nota fiscal" : `${notasAnexadas.length} notas fiscais`}
          </span>
          {notasAnexadas.map((n, i) => (
            <span key={n.url} className="inline-flex items-center gap-1">
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
              >
                <Paperclip size={13} />
                {resumoDaNota(n, i)}
              </a>
              <button
                type="button"
                aria-label={`Tirar a nota ${resumoDaNota(n, i)} desta manutenção`}
                disabled={salvando}
                onClick={() => tirarNota(n.url)}
                className="toque rounded-full p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Botao tamanho="sm" onClick={() => setAberto((x) => !x)}>
          {aberto ? "Fechar" : "Registrar andamento"}
        </Botao>
        {/* o papel que vai com o veículo para a oficina */}
        <BotaoLink href={`/manutencao/ordem?id=${m.id}`} tamanho="sm">
          <Printer size={13} />
          Ordem de serviço
        </BotaoLink>
      </div>

      {aberto && (
        <div className="mt-3.5 border-t border-slate-100 pt-3.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Oficina">
              <Input value={oficina} onChange={(e) => setOficina(e.target.value)} />
            </Campo>
            <Campo rotulo="Responsável">
              <Select value={resp} onChange={(e) => setResp(e.target.value)}>
                <option value="">—</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            {/* O km da abertura entra aqui, e não só no formulário de abrir,
                porque ele é o número que mais chega errado: vem do hodômetro
                anotado no pátio e às vezes só é conferido depois. Sem este
                campo, corrigir um km errado exigia mexer no banco. */}
            <CampoNumero
              rotulo="Km na abertura"
              unidade="km"
              valor={kmAbertura}
              onValor={setKmAbertura}
              dica="Como estava o hodômetro quando a manutenção foi aberta."
            />
            <CampoNumero
              rotulo="Orçamento"
              unidade="reais"
              valor={orcamento}
              onValor={setOrcamento}
            />
            <CampoNumero
              rotulo="Valor final"
              unidade="reais"
              valor={valor}
              onValor={setValor}
              dica="Só depois de pago — é o que entra no gasto da frota."
            />
            <CampoNumero
              rotulo="Próx. revisão (km)"
              unidade="km"
              valor={proxRev}
              onValor={setProxRev}
            />
          </div>

          <div className="mt-2.5 space-y-2.5">
            <Campo rotulo="Serviço realizado">
              <Input value={servico} onChange={(e) => setServico(e.target.value)} placeholder="o que foi feito" />
            </Campo>
            <Campo rotulo="Peças trocadas">
              <Input value={pecas} onChange={(e) => setPecas(e.target.value)} placeholder="peças substituídas" />
            </Campo>
            <CampoArquivos
              rotulo="Notas fiscais (foto ou PDF)"
              dica="A oficina costuma emitir uma nota de peças e outra de serviço. Pode anexar as duas."
              accept="image/*,application/pdf"
              arquivos={notas}
              onArquivos={setNotas}
              extra={(f) => (
                <select
                  value={rotulos[chaveDoArquivo(f)] ?? ""}
                  onChange={(e) =>
                    setRotulos((r) => ({ ...r, [chaveDoArquivo(f)]: e.target.value }))
                  }
                  aria-label={`O que a nota ${f.name} cobre`}
                  className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11.5px] text-slate-700"
                >
                  <option value="">sem rótulo</option>
                  {ROTULOS_NOTA.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <Botao variante="primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar andamento"}
            </Botao>
            {msg && (
              <span className={cx("text-[13px]", msg.ok ? "text-emerald-700" : "text-red-700")}>
                {msg.txt}
              </span>
            )}
          </div>
        </div>
      )}
    </Cartao>
  );
}

function NovaManutencao({
  veiculos,
  tecnicos,
  escopos,
  onCriada,
}: {
  veiculos: Veiculo[];
  tecnicos: Tecnico[];
  escopos: Escopo[];
  onCriada: () => void;
}) {
  const [veiculoId, setVeiculoId] = useState("");
  const [km, setKm] = useState("");
  const [origem, setOrigem] = useState("");
  const [tipo, setTipo] = useState("");
  const [problema, setProblema] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [resp, setResp] = useState("");
  const [oficina, setOficina] = useState("");
  const [orcamento, setOrcamento] = useState("");
  // O marco de revisão que esta preventiva atende. É o que resolve o escopo do
  // modelo, e é uma decisão de quem abre — por isso é campo, e não conta.
  const [revisaoKm, setRevisaoKm] = useState("");
  const [bloquear, setBloquear] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // id da ordem recem-aberta: e so para oferecer a impressao na hora, que e
  // quando o veiculo ainda esta na mao de quem vai levar para a oficina.
  const [criadaId, setCriadaId] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!veiculoId || !problema.trim()) {
      setErro("Escolha o veículo e descreva o problema.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();
    const { data: criada, error } = await supabase
      .from("manutencoes")
      .insert({
        veiculo_id: veiculoId,
        km_abertura: paraInteiro(km),
        origem: origem || null,
        tipo: tipo || null,
        descricao_problema: problema.trim(),
        prioridade: prioridade || null,
        responsavel_id: resp || null,
        oficina: oficina.trim() || null,
        orcamento: paraDecimal(orcamento),
        // Só na preventiva: numa corretiva o marco não quer dizer nada, e
        // gravá-lo faria a ordem de serviço imprimir uma lista que ninguém pediu.
        revisao_km: tipo === "PREVENTIVA" ? paraInteiro(revisaoKm) : null,
        status: "ABERTA",
      })
      .select("id")
      .single();
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
    if (bloquear) {
      await supabase.from("veiculos").update({ status: "MANUTENCAO" }).eq("id", veiculoId);
    }
    setCriadaId((criada as { id: string } | null)?.id ?? null);
    setSalvando(false);
    onCriada();
  }

  const veiculoSel = veiculos.find((v) => v.id === veiculoId);
  const escoposDoModelo = veiculoSel ? escopos.filter((e) => e.modelo === veiculoSel.modelo) : [];
  const marco = paraInteiro(revisaoKm);
  const servicos = itensDoMarco(escoposDoModelo, marco);
  const regras = regrasDoMarco(escoposDoModelo, marco);

  // Trocar de veículo propõe o marco dele. Proposta, não imposição: quem abre
  // pode estar antecipando a revisão dos 60 mil no veículo que está com 52.
  function escolherVeiculo(id: string) {
    setVeiculoId(id);
    const v = veiculos.find((x) => x.id === id);
    const sugerido = marcoSugerido(v?.proxima_revisao_km, v?.km_atual);
    setRevisaoKm(sugerido ? String(sugerido) : "");
  }

  return (
    <Cartao titulo="Abrir manutenção" className="mb-3 ring-brand-300">
      <form onSubmit={criar} className="p-4">
        {criadaId && (
          <div className="mb-3.5 rounded-lg bg-emerald-50 p-3.5 ring-1 ring-inset ring-emerald-200">
            <div className="text-[13.5px] font-semibold text-emerald-800">Manutenção aberta.</div>
            <p className="mb-2.5 mt-1 text-[12.5px] leading-relaxed text-emerald-800">
              Imprima a ordem de serviço e mande junto com o veículo — é o que orienta a oficina e
              volta preenchido para você lançar aqui.
            </p>
            <BotaoLink href={`/manutencao/ordem?id=${criadaId}`} tamanho="sm">
              <Printer size={13} />
              Imprimir ordem de serviço
            </BotaoLink>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Veículo *">
            <Select value={veiculoId} onChange={(e) => escolherVeiculo(e.target.value)}>
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.modelo} — {v.placa}
                </option>
              ))}
            </Select>
          </Campo>
          <CampoNumero rotulo="Km na abertura" unidade="km" valor={km} onValor={setKm} />
          <Campo rotulo="Origem">
            <Select value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="">—</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">—</option>
              {TIPOS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Prioridade">
            <Select value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
              <option value="">—</option>
              {PRIORIDADES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Responsável">
            <Select value={resp} onChange={(e) => setResp(e.target.value)}>
              <option value="">—</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Oficina">
            <Input value={oficina} onChange={(e) => setOficina(e.target.value)} />
          </Campo>
          <CampoNumero
            rotulo="Orçamento"
            unidade="reais"
            valor={orcamento}
            onValor={setOrcamento}
          />
        </div>

        {/* O escopo aparece ANTES de abrir, e não só no papel impresso: quem
            abre confere se o plano do modelo bate com o que vai mandar fazer, e
            corrige o marco se estiver antecipando a revisão. Depois de impresso,
            discutir a lista com a oficina custa uma viagem. */}
        {tipo === "PREVENTIVA" && (
          <div className="mt-2.5 rounded-lg bg-brand-50/70 p-3.5 ring-1 ring-inset ring-brand-200">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <CampoNumero
                rotulo="Revisão de quantos km"
                unidade="km"
                valor={revisaoKm}
                onValor={setRevisaoKm}
                dica={
                  veiculoSel?.proxima_revisao_km
                    ? `Próxima revisão deste veículo: ${emKm(veiculoSel.proxima_revisao_km)}.`
                    : "Define o escopo que a oficina vai seguir."
                }
              />
              <div className="sm:col-span-2">
                <span className="rotulo">Escopo do {veiculoSel?.modelo ?? "modelo"}</span>
                {escoposDoModelo.length === 0 ? (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                    Nenhum escopo cadastrado para este modelo. A ordem de serviço sai sem lista
                    de serviços —{" "}
                    <BotaoLink href="/escopos" tamanho="sm">
                      cadastrar agora
                    </BotaoLink>
                  </p>
                ) : servicos.length === 0 ? (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                    {marco
                      ? `Nenhuma regra do ${veiculoSel?.modelo} cai em ${emKm(marco)}. As regras cadastradas são de ${escoposDoModelo
                          .map((e) => emKm(e.km_intervalo))
                          .join(", ")}.`
                      : "Informe o km da revisão para ver o que a oficina deve fazer."}
                  </p>
                ) : (
                  <>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {servicos.map((i) => (
                        <Badge key={i} tom="info">
                          {i}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-slate-500">
                      {servicos.length} serviço(s), das regras de{" "}
                      {regras.map((r) => emKm(r.km_intervalo)).join(", ")}. Vai impresso na ordem
                      de serviço.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <Campo rotulo="Problema *" className="mt-2.5">
          <Input
            value={problema}
            onChange={(e) => setProblema(e.target.value)}
            placeholder="descreva o problema"
          />
        </Campo>

        <label className="mt-3 flex items-center gap-2 text-[13px] font-medium text-slate-700">
          <Checkbox checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
          Colocar o veículo em manutenção (sai da operação)
        </label>

        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <Botao type="submit" variante="sucesso" disabled={salvando}>
            {salvando ? "Abrindo…" : "Abrir manutenção"}
          </Botao>
          {erro && <Aviso>{erro}</Aviso>}
        </div>
      </form>
    </Cartao>
  );
}
