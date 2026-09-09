"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, Truck, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { diaDe, intervaloUTC, periodoPadrao } from "@/lib/frota/tempo";
import {
  Badge,
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

// Consulta do gestor: tudo que a equipe registrou, com as fotos. As tres fontes
// de foto que ja existem viram uma linha do tempo so — checklist (semanais,
// avaria, bloqueio), roteiro (painel/hodometro) e ocorrencia (o dano).

type Veiculo = { id: string; placa: string; modelo: string };

type Foto = { url: string; legenda: string };

type Registro = {
  id: string;
  tipo: "CHECKLIST" | "ROTEIRO" | "OCORRÊNCIA";
  data: string; // YYYY-MM-DD
  placa: string;
  modelo: string;
  tecnico: string;
  resumo: string;
  detalhe: string | null;
  alerta: boolean; // pinta a borda: checklist nao apto, pendencia, ocorrencia grave
  fotos: Foto[];
};

const TOM_TIPO: Record<string, Tom> = {
  CHECKLIST: "info",
  ROTEIRO: "ok",
  "OCORRÊNCIA": "critico",
};
const FAIXA_TIPO: Record<string, string> = {
  CHECKLIST: "border-l-brand-600",
  ROTEIRO: "border-l-emerald-600",
  "OCORRÊNCIA": "border-l-red-600",
};
const ICONE: Record<string, LucideIcon> = {
  CHECKLIST: ClipboardCheck,
  ROTEIRO: Truck,
  "OCORRÊNCIA": AlertTriangle,
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}
// Aceita so o que parece URL: o jsonb e livre e ja passou por versoes diferentes
// do formulario.
function urls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.startsWith("http"));
}

export default function HistoricoPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [veiculoId, setVeiculoId] = useState("");
  const [de, setDe] = useState(() => periodoPadrao(30).de);
  const [ate, setAte] = useState(() => periodoPadrao(30).ate);
  const [tipo, setTipo] = useState("TODOS");
  const [soComFoto, setSoComFoto] = useState(false);

  // A ficha do veiculo (modal do painel) manda pra ca com ?placa=XXX.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data } = await supabase.from("veiculos").select("id, placa, modelo").order("placa");
      const lista = (data as Veiculo[]) ?? [];
      setVeiculos(lista);

      const placa = new URLSearchParams(window.location.search).get("placa");
      if (placa) {
        const achou = lista.find((v) => v.placa === placa);
        if (achou) setVeiculoId(achou.id);
      }
    })();
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const supabase = createClient();

    let qChk = supabase
      .from("checklists")
      .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)")
      .gte("data", de)
      .lte("data", ate);
    // `saida_em` e timestamptz: o recorte precisa ser o dia de Sao Paulo virado
    // em UTC, senao o filtro corta as 21h e some com o roteiro das 22h.
    const janela = intervaloUTC(de, ate);
    let qRot = supabase
      .from("v_roteiros")
      .select("*")
      .gte("saida_em", janela.de)
      .lte("saida_em", janela.ate);
    let qOco = supabase
      .from("ocorrencias")
      .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)")
      .gte("data", de)
      .lte("data", ate);

    if (veiculoId) {
      qChk = qChk.eq("veiculo_id", veiculoId);
      qRot = qRot.eq("veiculo_id", veiculoId);
      qOco = qOco.eq("veiculo_id", veiculoId);
    }

    const [chk, rot, oco] = await Promise.all([qChk, qRot, qOco]);
    const linhas: Registro[] = [];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const c of (chk.data as any[]) ?? []) {
      const v = one(c.veiculo as { placa: string; modelo: string } | null);
      const t = one(c.tecnico as { nome: string } | null);
      const itens = (c.itens ?? {}) as any;
      const fotos: Foto[] = [
        ...urls(itens.fotos_semanais).map((u) => ({ url: u, legenda: "semanal" })),
        ...urls(itens?.avaria?.fotos).map((u) => ({ url: u, legenda: "avaria" })),
        ...urls(itens.fotos_bloqueio).map((u) => ({ url: u, legenda: "bloqueio" })),
      ];
      // foto_url e a primeira das semanais; so entra se nao veio na lista.
      if (typeof c.foto_url === "string" && c.foto_url && !fotos.some((f) => f.url === c.foto_url)) {
        fotos.unshift({ url: c.foto_url, legenda: "semanal" });
      }
      linhas.push({
        id: "chk-" + c.id,
        tipo: "CHECKLIST",
        data: c.data,
        placa: v?.placa ?? "—",
        modelo: v?.modelo ?? "",
        tecnico: t?.nome ?? "—",
        resumo: c.apto ? "Apto para operação" : "NÃO APTO — " + (c.motivo_bloqueio || "sem motivo informado"),
        detalhe: [c.descricao, c.km_atual != null ? `${c.km_atual} km` : null].filter(Boolean).join(" · ") || null,
        alerta: !c.apto,
        fotos,
      });
    }

    for (const r of (rot.data as any[]) ?? []) {
      const fotos: Foto[] = [];
      if (typeof r.foto_painel_saida === "string" && r.foto_painel_saida) {
        fotos.push({ url: r.foto_painel_saida, legenda: "saída" });
      }
      if (typeof r.foto_painel_chegada === "string" && r.foto_painel_chegada) {
        fotos.push({ url: r.foto_painel_chegada, legenda: "chegada" });
      }
      linhas.push({
        id: "rot-" + r.id,
        tipo: "ROTEIRO",
        data: diaDe(r.saida_em) ?? "",
        placa: r.placa ?? "—",
        modelo: r.modelo ?? "",
        tecnico: r.tecnico_saida ?? "—",
        resumo: r.situacao + (r.km_rodado != null ? ` · ${r.km_rodado} km rodados` : ""),
        detalhe: [
          r.km_saida != null ? `saiu com ${r.km_saida} km` : null,
          r.km_chegada != null ? `voltou com ${r.km_chegada} km` : null,
          r.descricao_pendencias,
        ].filter(Boolean).join(" · ") || null,
        alerta: r.situacao === "SEM FECHAMENTO" || !!r.houve_pendencia,
        fotos,
      });
    }

    for (const o of (oco.data as any[]) ?? []) {
      const v = one(o.veiculo as { placa: string; modelo: string } | null);
      const t = one(o.tecnico as { nome: string } | null);
      linhas.push({
        id: "oco-" + o.id,
        tipo: "OCORRÊNCIA",
        data: o.data,
        placa: v?.placa ?? "—",
        modelo: v?.modelo ?? "",
        tecnico: t?.nome ?? "—",
        resumo: `${o.tipo} · ${o.gravidade} · ${o.status}`,
        detalhe: [o.descricao, o.local].filter(Boolean).join(" · ") || null,
        alerta: o.gravidade === "GRAVE",
        fotos: urls(o.fotos).map((u) => ({ url: u, legenda: "dano" })),
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    linhas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    setRegistros(linhas);
    setCarregando(false);
  }, [de, ate, veiculoId]);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const lista = registros
    .filter((r) => (tipo === "TODOS" ? true : r.tipo === tipo))
    .filter((r) => (soComFoto ? r.fotos.length > 0 : true));
  const totalFotos = lista.reduce((s, r) => s + r.fotos.length, 0);

  return (
    <Pagina
      titulo="Histórico e fotos"
      subtitulo={`${lista.length} registro(s) · ${totalFotos} foto(s)`}
    >
      <Cartao className="mb-3 p-3.5">
        <div className="flex flex-wrap gap-2.5">
          <Campo rotulo="Veículo" className="min-w-[180px] flex-[2_1_220px]">
            <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              <option value="">Todos os veículos</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.modelo} — {v.placa}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="De" className="min-w-[130px] flex-[1_1_130px]">
            <Input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até" className="min-w-[130px] flex-[1_1_130px]">
            <Input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
          </Campo>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {["TODOS", "CHECKLIST", "ROTEIRO", "OCORRÊNCIA"].map((f) => (
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
              {f === "TODOS" ? "Tudo" : f.charAt(0) + f.slice(1).toLowerCase() + "s"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[12.5px] text-slate-600">
            <Checkbox checked={soComFoto} onChange={(e) => setSoComFoto(e.target.checked)} />
            Só com foto
          </label>
        </div>
      </Cartao>

      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : lista.length === 0 ? (
        <Vazio
          titulo="Nenhum registro nesse filtro."
          texto="Tente ampliar o período ou tirar o filtro de veículo."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((r) => (
            <CartaoRegistro key={r.id} r={r} />
          ))}
        </div>
      )}
    </Pagina>
  );
}

function CartaoRegistro({ r }: { r: Registro }) {
  const Icone = ICONE[r.tipo];
  return (
    <Cartao
      className={cx("border-l-4 p-4", r.alerta ? "border-l-red-600" : FAIXA_TIPO[r.tipo])}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icone size={16} className="shrink-0 text-slate-400" />
        <Placa>{r.placa}</Placa>
        <span className="text-[13px] text-slate-500">{r.modelo}</span>
        <Badge tom={TOM_TIPO[r.tipo]}>{r.tipo}</Badge>
        <span className="ml-auto text-[12.5px] tabular-nums text-slate-500">{dataBR(r.data)}</span>
      </div>

      <div
        className={cx(
          "mb-1 mt-2.5 text-sm font-semibold",
          r.alerta ? "text-red-700" : "text-slate-900",
        )}
      >
        {r.resumo}
      </div>
      <div className="text-[12px] text-slate-500">
        {r.tecnico}
        {r.detalhe ? " · " + r.detalhe : ""}
      </div>

      {r.fotos.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {r.fotos.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={`Foto ${f.legenda}`}
                loading="lazy"
                className="block h-[84px] w-[84px] rounded-lg object-cover ring-1 ring-slate-200 transition hover:ring-brand-400"
              />
              <span className="mt-1 block text-center text-[10.5px] text-slate-400">{f.legenda}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11.5px] text-slate-400">sem foto</div>
      )}
    </Cartao>
  );
}
