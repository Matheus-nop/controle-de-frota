"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  Cartao,
  Carregando,
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
  ano: string | null;
  responsavel_id: string | null;
  km_atual: number | null;
  proxima_revisao_km: number | null;
  consumo_km_l: number | null;
  valor_combustivel: number | null;
  status: string;
};
type Tecnico = { id: string; nome: string };

const STATUS = ["ATIVO", "MANUTENCAO", "BLOQUEADO", "VENDIDO"];

const TOM_STATUS: Record<string, Tom> = {
  ATIVO: "ok",
  MANUTENCAO: "atencao",
  BLOQUEADO: "critico",
  VENDIDO: "mudo",
};

function intOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}
function numOrNull(s: string): number | null {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}
// A placa é sempre normalizada: maiúscula, sem espaço nem hífen (SRT9D55).
function normPlaca(p: string): string {
  return p.toUpperCase().replace(/[\s-]/g, "");
}

/** Grade dos formulários de veículo: uma coluna no celular, três no desktop. */
const GRADE = "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4";

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();
    const [v, t] = await Promise.all([
      supabase
        .from("veiculos")
        .select(
          "id, placa, modelo, ano, responsavel_id, km_atual, proxima_revisao_km, consumo_km_l, valor_combustivel, status",
        )
        .order("placa"),
      supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setTecnicos((t.data as Tecnico[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const ativos = veiculos.filter((v) => v.status === "ATIVO").length;

  return (
    <Pagina
      titulo="Veículos"
      subtitulo={
        carregando ? "carregando…" : `${veiculos.length} cadastrado(s) · ${ativos} em operação`
      }
      acoes={
        <Botao variante="primario" onClick={() => setAddOpen((x) => !x)}>
          {addOpen ? (
            "Fechar"
          ) : (
            <>
              <Plus size={14} />
              Adicionar veículo
            </>
          )}
        </Botao>
      }
    >
      {addOpen && (
        <NovoVeiculo
          tecnicos={tecnicos}
          onCriado={() => {
            setAddOpen(false);
            setCarregando(true);
            void carregar();
          }}
        />
      )}

      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : veiculos.length === 0 ? (
        <Vazio titulo="Nenhum veículo cadastrado." texto="Comece adicionando o primeiro." />
      ) : (
        <div className="flex flex-col gap-3">
          {veiculos.map((v) => (
            <LinhaVeiculo key={v.id} v={v} tecnicos={tecnicos} />
          ))}
        </div>
      )}
    </Pagina>
  );
}

function LinhaVeiculo({ v, tecnicos }: { v: Veiculo; tecnicos: Tecnico[] }) {
  const [modelo, setModelo] = useState(v.modelo || "");
  const [ano, setAno] = useState(v.ano || "");
  const [resp, setResp] = useState(v.responsavel_id || "");
  const [km, setKm] = useState(v.km_atual != null ? String(v.km_atual) : "");
  const [rev, setRev] = useState(v.proxima_revisao_km != null ? String(v.proxima_revisao_km) : "");
  const [cons, setCons] = useState(v.consumo_km_l != null ? String(v.consumo_km_l) : "");
  const [comb, setComb] = useState(v.valor_combustivel != null ? String(v.valor_combustivel) : "");
  const [status, setStatus] = useState(v.status);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("veiculos")
      .update({
        modelo: modelo.trim(),
        ano: ano.trim() || null,
        responsavel_id: resp || null,
        km_atual: intOrNull(km),
        proxima_revisao_km: intOrNull(rev),
        consumo_km_l: numOrNull(cons),
        valor_combustivel: numOrNull(comb),
        status,
      })
      .eq("id", v.id);
    setMsg(error ? { ok: false, txt: error.message } : { ok: true, txt: "Salvo." });
    setSalvando(false);
  }

  return (
    <Cartao
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          <Placa>{v.placa}</Placa>
          <span className="text-[13px] font-normal text-slate-500">{v.modelo}</span>
        </span>
      }
      acoes={<Badge tom={TOM_STATUS[v.status] ?? "mudo"}>{v.status}</Badge>}
    >
      <div className="p-4">
        <div className={GRADE}>
          <Campo rotulo="Modelo">
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </Campo>
          <Campo rotulo="Ano">
            <Input value={ano} onChange={(e) => setAno(e.target.value)} placeholder="2024/2025" />
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
          <Campo rotulo="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo
            rotulo="Km atual"
            dica="A saída e o checklist já atualizam este número sozinhos."
          >
            <Input type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
          </Campo>
          <Campo rotulo="Próx. revisão (km)">
            <Input type="number" inputMode="numeric" value={rev} onChange={(e) => setRev(e.target.value)} />
          </Campo>
          <Campo rotulo="Consumo (km/l)">
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={cons}
              onChange={(e) => setCons(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Preço do combustível">
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={comb}
              onChange={(e) => setComb(e.target.value)}
            />
          </Campo>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Botao variante="primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
          {msg && (
            <span className={cx("text-[13px]", msg.ok ? "text-emerald-700" : "text-red-700")}>
              {msg.txt}
            </span>
          )}
        </div>
      </div>
    </Cartao>
  );
}

function NovoVeiculo({ tecnicos, onCriado }: { tecnicos: Tecnico[]; onCriado: () => void }) {
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [resp, setResp] = useState("");
  const [km, setKm] = useState("");
  const [rev, setRev] = useState("");
  const [cons, setCons] = useState("");
  const [comb, setComb] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!placa.trim() || !modelo.trim()) {
      setErro("Placa e modelo são obrigatórios.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.from("veiculos").insert({
      placa: normPlaca(placa),
      modelo: modelo.trim(),
      ano: ano.trim() || null,
      responsavel_id: resp || null,
      km_atual: intOrNull(km),
      proxima_revisao_km: intOrNull(rev),
      consumo_km_l: numOrNull(cons),
      valor_combustivel: numOrNull(comb),
      status: "ATIVO",
    });
    if (error) {
      setErro(error.code === "23505" ? "Já existe um veículo com essa placa." : error.message);
      setSalvando(false);
    } else {
      onCriado();
    }
  }

  return (
    <Cartao titulo="Novo veículo" className="mb-3 ring-brand-300">
      <form onSubmit={criar} className="p-4">
        <div className={GRADE}>
          <Campo rotulo="Placa *" dica="Sem espaço nem hífen.">
            <Input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="SRT9D55" />
          </Campo>
          <Campo rotulo="Modelo *">
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Fiorino" />
          </Campo>
          <Campo rotulo="Ano">
            <Input value={ano} onChange={(e) => setAno(e.target.value)} placeholder="2024/2025" />
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
          <Campo rotulo="Km atual">
            <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
          </Campo>
          <Campo rotulo="Próx. revisão (km)">
            <Input type="number" value={rev} onChange={(e) => setRev(e.target.value)} />
          </Campo>
          <Campo rotulo="Consumo (km/l)">
            <Input type="number" step="0.1" value={cons} onChange={(e) => setCons(e.target.value)} />
          </Campo>
          <Campo rotulo="Preço do combustível">
            <Input type="number" step="0.01" value={comb} onChange={(e) => setComb(e.target.value)} />
          </Campo>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Botao type="submit" variante="sucesso" disabled={salvando}>
            {salvando ? "Criando…" : "Criar veículo"}
          </Botao>
          {erro && <Aviso>{erro}</Aviso>}
        </div>
      </form>
    </Cartao>
  );
}
