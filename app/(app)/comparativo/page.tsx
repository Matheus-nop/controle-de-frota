"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Camera, GitCompareArrows } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avariasDe, resumoDaAvaria, urls, type Avaria } from "@/lib/frota/avarias";
import { dataBR } from "@/lib/frota/tempo";
import { emKm } from "@/lib/frota/numero";
import {
  Badge,
  Campo,
  Cartao,
  Carregando,
  Pagina,
  Placa,
  Select,
  Vazio,
  cx,
} from "@/components/ui";

// Duas vistorias do mesmo veículo, lado a lado.
//
// Serve para uma coisa que a planilha nunca conseguiu fazer: PROVAR quando um
// dano apareceu. O técnico diz que o amassado já estava lá; a vistoria de duas
// semanas atrás diz que não. Aqui as duas ficam na mesma tela, com as fotos de
// cada uma, e a diferença aparece marcada.
//
// Não julga ninguém e não guarda nada: é leitura de dois registros que já
// existem. A conclusão é de quem olha.

type Veiculo = { id: string; placa: string; modelo: string };

type Vistoria = {
  id: string;
  data: string;
  km_atual: number | null;
  apto: boolean;
  motivo_bloqueio: string | null;
  tecnico: string | null;
  avarias: Avaria[];
  fotosSemanais: string[];
};

/** Duas avarias são "a mesma" quando batem onde e tipo. Não é perfeito — dois
 *  amassados na traseira contam como um — mas é o que o formulário permite
 *  afirmar, e errar para menos é melhor do que apontar dano novo que não é. */
function chave(a: Avaria): string {
  return `${a.onde ?? "?"}|${a.tipo ?? "?"}`;
}

function Coluna({
  v,
  novas,
  rotulo,
}: {
  v: Vistoria;
  novas: Set<string>;
  rotulo: string;
}) {
  return (
    <Cartao className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</span>
        <Badge tom={v.apto ? "ok" : "critico"}>{v.apto ? "APTO" : "NÃO APTO"}</Badge>
      </div>
      <div className="mt-1 text-[15px] font-bold text-slate-900">{dataBR(v.data)}</div>
      <div className="text-[12.5px] text-slate-500">
        {v.tecnico ?? "—"}
        {v.km_atual != null ? ` · ${emKm(v.km_atual)}` : ""}
      </div>
      {!v.apto && v.motivo_bloqueio && (
        <div className="mt-1.5 text-[12.5px] font-medium text-red-700">{v.motivo_bloqueio}</div>
      )}

      <div className="mt-3.5 border-t border-slate-100 pt-3">
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
          {v.avarias.length === 0
            ? "Nenhuma avaria"
            : v.avarias.length === 1
              ? "1 avaria"
              : `${v.avarias.length} avarias`}
        </div>
        <div className="flex flex-col gap-2">
          {v.avarias.map((a, i) => {
            const nova = novas.has(chave(a));
            return (
              <div
                key={i}
                className={cx(
                  "rounded-lg p-2.5 ring-1 ring-inset",
                  nova ? "bg-amber-50 ring-amber-300" : "bg-slate-50 ring-slate-200",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-800">{resumoDaAvaria(a)}</span>
                  {nova && <Badge tom="atencao">NOVA</Badge>}
                  {/* Avaria que o gestor reconheceu depois, na mesa, não é
                      avaria vista na rua. A tela não esconde a diferença. */}
                  {a.reclassificada_por && (
                    <Badge tom="mudo">reclassificada por {a.reclassificada_por}</Badge>
                  )}
                  {a.ja_existia && (
                    <span className="text-[11px] text-slate-500">disse: {a.ja_existia}</span>
                  )}
                </div>
                {a.descricao && (
                  <div className="mt-0.5 text-[12px] text-slate-600">{a.descricao}</div>
                )}
                {a.fotos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.fotos.map((u, k) => (
                      <a key={k} href={u} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={u}
                          alt={`avaria ${i + 1} foto ${k + 1}`}
                          className="h-20 w-20 rounded object-cover ring-1 ring-slate-300"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {v.fotosSemanais.length > 0 && (
        <div className="mt-3.5 border-t border-slate-100 pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            <Camera size={13} />
            Fotos da volta do veículo
          </div>
          <div className="flex flex-wrap gap-1.5">
            {v.fotosSemanais.map((u, k) => (
              <a key={k} href={u} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u}
                  alt={`semanal ${k + 1}`}
                  className="h-20 w-20 rounded object-cover ring-1 ring-slate-300"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </Cartao>
  );
}

function Comparativo() {
  const params = useSearchParams();
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data } = await supabase.from("veiculos").select("id, placa, modelo").order("placa");
      const lista = (data as Veiculo[]) ?? [];
      setVeiculos(lista);
      // O alerta de avaria nova manda para cá com ?placa=XXX, já no veículo certo.
      const placa = params.get("placa");
      const achou = placa ? lista.find((v) => v.placa === placa) : undefined;
      if (achou) setVeiculoId(achou.id);
    })();
  }, [params]);

  const carregar = useCallback(async () => {
    if (!veiculoId) return;
    setCarregando(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("checklists")
      .select("id, data, km_atual, apto, motivo_bloqueio, itens, tecnico:tecnico_id(nome)")
      .eq("veiculo_id", veiculoId)
      .order("data", { ascending: false })
      .limit(30);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const lista: Vistoria[] = ((data as any[]) ?? []).map((c) => {
      const t = Array.isArray(c.tecnico) ? c.tecnico[0] : c.tecnico;
      const itens = (c.itens ?? {}) as any;
      return {
        id: c.id,
        data: c.data,
        km_atual: c.km_atual,
        apto: c.apto,
        motivo_bloqueio: c.motivo_bloqueio,
        tecnico: t?.nome ?? null,
        avarias: avariasDe(itens),
        fotosSemanais: urls(itens.fotos_semanais),
      };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    setVistorias(lista);
    // O par que interessa por padrão é o mais recente contra o anterior — é a
    // pergunta que traz alguém a esta tela.
    setIdB(lista[0]?.id ?? "");
    setIdA(lista[1]?.id ?? "");
    setCarregando(false);
  }, [veiculoId]);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const a = vistorias.find((v) => v.id === idA);
  const b = vistorias.find((v) => v.id === idB);

  // O que existe em B e não existia em A. É a coluna da direita que ganha marca:
  // a esquerda é o retrato de antes, e nada nela é novo por definição.
  const novas = new Set<string>();
  if (a && b) {
    const antes = new Set(a.avarias.map(chave));
    for (const av of b.avarias) if (!antes.has(chave(av))) novas.add(chave(av));
  }

  const rotuloVistoria = (v: Vistoria) =>
    `${dataBR(v.data)} · ${v.avarias.length} avaria(s)${v.tecnico ? ` · ${v.tecnico}` : ""}`;

  const veiculo = veiculos.find((v) => v.id === veiculoId);

  return (
    <Pagina
      titulo="Comparar vistorias"
      subtitulo="Duas vistorias do mesmo veículo lado a lado, com as fotos — para saber quando um dano apareceu"
    >
      <Cartao className="mb-3 p-3.5">
        <div className="flex flex-wrap gap-2.5">
          <Campo rotulo="Veículo" className="min-w-[200px] flex-[2_1_240px]">
            <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.modelo} — {v.placa}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Vistoria anterior" className="min-w-[200px] flex-[2_1_240px]">
            <Select value={idA} onChange={(e) => setIdA(e.target.value)} disabled={!vistorias.length}>
              <option value="">—</option>
              {vistorias.map((v) => (
                <option key={v.id} value={v.id}>
                  {rotuloVistoria(v)}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Vistoria mais recente" className="min-w-[200px] flex-[2_1_240px]">
            <Select value={idB} onChange={(e) => setIdB(e.target.value)} disabled={!vistorias.length}>
              <option value="">—</option>
              {vistorias.map((v) => (
                <option key={v.id} value={v.id}>
                  {rotuloVistoria(v)}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
      </Cartao>

      {!veiculoId ? (
        <Vazio
          titulo="Escolha um veículo"
          texto="A comparação é sempre entre duas vistorias do mesmo veículo."
        />
      ) : carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : vistorias.length < 2 ? (
        <Vazio
          titulo="Ainda não há duas vistorias deste veículo"
          texto="Com uma vistoria só não há o que comparar — a comparação começa na segunda."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {veiculo && <Placa>{veiculo.placa}</Placa>}
            <span className="text-[13px] text-slate-500">{veiculo?.modelo}</span>
            {a && b && (
              <span
                className={cx(
                  "ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold ring-1 ring-inset",
                  novas.size
                    ? "bg-amber-50 text-amber-800 ring-amber-300"
                    : "bg-emerald-50 text-emerald-800 ring-emerald-200",
                )}
              >
                <GitCompareArrows size={13} />
                {novas.size === 0
                  ? "Nenhuma avaria nova entre as duas"
                  : novas.size === 1
                    ? "1 avaria nova"
                    : `${novas.size} avarias novas`}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_auto_1fr]">
            {a ? <Coluna v={a} novas={new Set()} rotulo="Antes" /> : <Vazio titulo="Escolha a vistoria anterior" />}
            <div className="hidden self-center text-slate-300 lg:block">
              <ArrowRight size={22} />
            </div>
            {b ? <Coluna v={b} novas={novas} rotulo="Depois" /> : <Vazio titulo="Escolha a vistoria mais recente" />}
          </div>
        </>
      )}
    </Pagina>
  );
}

// `useSearchParams` exige Suspense no App Router: sem ele a página inteira vira
// renderização sob demanda e o build reclama.
export default function ComparativoPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <Comparativo />
    </Suspense>
  );
}
