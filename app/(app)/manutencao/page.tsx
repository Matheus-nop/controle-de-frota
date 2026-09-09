"use client";

import { useCallback, useEffect, useState } from "react";
import { Paperclip, Plus, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeBR } from "@/lib/frota/tempo";
import { enviarFoto } from "@/lib/frota/foto";
import {
  Aviso,
  Badge,
  Botao,
  BotaoLink,
  Campo,
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

type Veiculo = { id: string; placa: string; modelo: string };
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
function intOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}
function numOrNull(s: string): number | null {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}
function brl(n: number | null) {
  return n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  const [carregando, setCarregando] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filtro, setFiltro] = useState("ABERTAS");

  const carregar = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();
    const [m, v, t] = await Promise.all([
      supabase
        .from("manutencoes")
        .select("*, veiculo:veiculo_id(placa,modelo)")
        .order("aberta_em", { ascending: false }),
      supabase
        .from("veiculos")
        .select("id, placa, modelo")
        .in("status", ["ATIVO", "BLOQUEADO", "MANUTENCAO"])
        .order("placa"),
      supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setManuts((m.data as Manut[]) ?? []);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setTecnicos((t.data as Tecnico[]) ?? []);
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
      subtitulo={carregando ? "carregando…" : `${abertas} em aberto · ${brl(gastoTotal)} já pagos`}
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
  const [orcamento, setOrcamento] = useState(m.orcamento != null ? String(m.orcamento) : "");
  const [valor, setValor] = useState(m.valor_final != null ? String(m.valor_final) : "");
  const [servico, setServico] = useState(m.servico_realizado || "");
  const [pecas, setPecas] = useState(m.pecas_trocadas || "");
  const [proxRev, setProxRev] = useState(
    m.proxima_revisao_km != null ? String(m.proxima_revisao_km) : "",
  );
  const [resp, setResp] = useState(m.responsavel_id || "");
  const [nf, setNf] = useState<FileList | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const enviada = await enviarFoto(supabase, "manutencoes", `${m.id}/nf`, nf?.[0]);
      const nfUrl = enviada ?? m.nota_fiscal_url;

      const concluindo = status === "CONCLUÍDA";
      const { error } = await supabase
        .from("manutencoes")
        .update({
          status,
          oficina: oficina.trim() || null,
          orcamento: numOrNull(orcamento),
          valor_final: numOrNull(valor),
          servico_realizado: servico.trim() || null,
          pecas_trocadas: pecas.trim() || null,
          proxima_revisao_km: intOrNull(proxRev),
          responsavel_id: resp || null,
          concluida_em: concluindo ? (m.concluida_em ?? hojeBR()) : null,
          nota_fiscal_url: nfUrl,
        })
        .eq("id", m.id);
      if (error) throw error;
      setMsg({ ok: true, txt: "Salvo." });
      onSalvo();
    } catch (err) {
      setMsg({ ok: false, txt: err instanceof Error ? err.message : "Erro ao salvar." });
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
          {brl(m.valor_final ?? m.orcamento)}
        </span>
      </div>

      <div className="mb-1 mt-2.5 text-sm font-semibold text-slate-900">{m.descricao_problema}</div>
      <div className="text-[12px] text-slate-500">
        Aberta {dataBR(m.aberta_em)}
        {m.origem ? " · " + m.origem : ""}
        {m.oficina ? " · " + m.oficina : ""}
        {m.concluida_em ? " · concluída " + dataBR(m.concluida_em) : ""}
      </div>

      {m.nota_fiscal_url && (
        <a
          href={m.nota_fiscal_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 hover:underline"
        >
          <Paperclip size={13} />
          Ver nota fiscal
        </a>
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
            <Campo rotulo="Orçamento">
              <Input
                type="number"
                step="0.01"
                value={orcamento}
                onChange={(e) => setOrcamento(e.target.value)}
              />
            </Campo>
            <Campo rotulo="Valor final" dica="Só depois de pago — é o que entra no gasto da frota.">
              <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
            </Campo>
            <Campo rotulo="Próx. revisão (km)">
              <Input type="number" value={proxRev} onChange={(e) => setProxRev(e.target.value)} />
            </Campo>
          </div>

          <div className="mt-2.5 space-y-2.5">
            <Campo rotulo="Serviço realizado">
              <Input value={servico} onChange={(e) => setServico(e.target.value)} placeholder="o que foi feito" />
            </Campo>
            <Campo rotulo="Peças trocadas">
              <Input value={pecas} onChange={(e) => setPecas(e.target.value)} placeholder="peças substituídas" />
            </Campo>
            <Campo rotulo="Nota fiscal (foto ou PDF)">
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setNf(e.target.files)}
                className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
              />
            </Campo>
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
  onCriada,
}: {
  veiculos: Veiculo[];
  tecnicos: Tecnico[];
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
        km_abertura: intOrNull(km),
        origem: origem || null,
        tipo: tipo || null,
        descricao_problema: problema.trim(),
        prioridade: prioridade || null,
        responsavel_id: resp || null,
        oficina: oficina.trim() || null,
        orcamento: numOrNull(orcamento),
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
            <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.modelo} — {v.placa}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Km na abertura">
            <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
          </Campo>
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
          <Campo rotulo="Orçamento">
            <Input
              type="number"
              step="0.01"
              value={orcamento}
              onChange={(e) => setOrcamento(e.target.value)}
            />
          </Campo>
        </div>

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
