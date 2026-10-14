"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeBR } from "@/lib/frota/tempo";
import { enviarFotos } from "@/lib/frota/foto";
import { mensagemDeErro } from "@/lib/frota/erro";
import { semanaDe } from "@/lib/frota/indicadores";
import {
  CONFORME,
  faltaMigracaoDaLimpeza,
  ITENS_LIMPEZA,
  NAO_CONFORME,
  naoConformes,
  resumoDaLimpeza,
  respondidos,
  type Limpeza,
} from "@/lib/frota/limpeza";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  CampoFotos,
  Cartao,
  Carregando,
  Input,
  Pagina,
  Placa,
  Select,
  Textarea,
  TiraDeFotos,
  Vazio,
  cx,
} from "@/components/ui";

// A limpeza semanal dos veículos, conferida pela expedição.
//
// Tela própria, e não um bloco dentro do checklist do técnico: são dois
// trabalhos, de dois times, em dois momentos. A vistoria fala de segurança —
// pneu, freio, luz. A limpeza fala de apresentação. Juntá-las faria a adesão
// de uma depender da outra, que é o que não se quer medir.

type Veiculo = { id: string; placa: string; modelo: string };
type LimpezaComNome = Limpeza & { tecnico: { nome: string } | { nome: string }[] | null };

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function dataBR(s: string) {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

export default function LimpezaPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [limpezas, setLimpezas] = useState<LimpezaComNome[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semMigracao, setSemMigracao] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [v, l] = await Promise.all([
      supabase.from("veiculos").select("id, placa, modelo").neq("status", "VENDIDO").order("placa"),
      supabase
        .from("limpezas")
        .select("*, tecnico:registrado_por(nome)")
        .order("data", { ascending: false })
        .limit(120),
    ]);
    setVeiculos((v.data as Veiculo[]) ?? []);
    if (faltaMigracaoDaLimpeza(l.error)) setSemMigracao(true);
    else setLimpezas((l.data as LimpezaComNome[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  // Quem já passou pela limpeza NESTA semana. É a pergunta que a expedição faz
  // ao chegar: qual carro ainda falta. Uma lista de "faltam estes" responde
  // isso de relance; um histórico em ordem de data, não.
  const semanaAtual = semanaDe(hojeBR());
  const feitosNaSemana = useMemo(() => {
    const s = new Set<string>();
    for (const l of limpezas) if (semanaDe(l.data) === semanaAtual) s.add(l.veiculo_id);
    return s;
  }, [limpezas, semanaAtual]);
  const faltando = veiculos.filter((v) => !feitosNaSemana.has(v.id));

  return (
    <Pagina
      estreita
      titulo="Limpeza semanal"
      subtitulo={
        carregando
          ? "carregando…"
          : `${feitosNaSemana.size} de ${veiculos.length} veículos conferidos nesta semana`
      }
      acoes={
        !semMigracao && (
          <Botao variante="primario" onClick={() => setAddOpen((x) => !x)}>
            {addOpen ? "Fechar" : (<><Sparkles size={14} />Registrar limpeza</>)}
          </Botao>
        )
      }
    >
      {semMigracao ? (
        <Aviso>
          A migração <strong>0029</strong> ainda não rodou no Supabase. Rode-a no SQL Editor e esta
          tela passa a funcionar — nada do que já existe é afetado até lá.
        </Aviso>
      ) : (
        <>
          {addOpen && (
            <NovaLimpeza
              veiculos={veiculos}
              faltando={faltando}
              onCriada={() => {
                setAddOpen(false);
                void carregar();
              }}
            />
          )}

          {!carregando && faltando.length > 0 && !addOpen && (
            <Cartao className="mb-3 p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Ainda não conferidos nesta semana
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {faltando.map((v) => (
                  <Placa key={v.id}>{v.placa}</Placa>
                ))}
              </div>
            </Cartao>
          )}

          {carregando ? (
            <Cartao>
              <Carregando />
            </Cartao>
          ) : limpezas.length === 0 ? (
            <Vazio
              titulo="Nenhuma limpeza registrada."
              texto="A expedição confere a limpeza de cada veículo uma vez por semana. O primeiro registro começa o histórico."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {limpezas.map((l) => (
                <CartaoLimpeza key={l.id} l={l} veiculos={veiculos} />
              ))}
            </div>
          )}
        </>
      )}
    </Pagina>
  );
}

function CartaoLimpeza({ l, veiculos }: { l: LimpezaComNome; veiculos: Veiculo[] }) {
  const v = veiculos.find((x) => x.id === l.veiculo_id);
  const fora = naoConformes(l.itens);
  const quem = one(l.tecnico)?.nome;

  return (
    <Cartao className={cx("border-l-4 p-4", fora.length > 0 ? "border-l-acento-500" : "border-l-emerald-600")}>
      <div className="flex flex-wrap items-center gap-2">
        <Placa>{v?.placa ?? "—"}</Placa>
        <span className="text-[13px] text-slate-500">{v?.modelo}</span>
        <Badge tom={fora.length > 0 ? "atencao" : "ok"}>
          {fora.length > 0 ? `${fora.length} fora` : "tudo conforme"}
        </Badge>
        <span className="ml-auto text-[12.5px] tabular-nums text-slate-500">{dataBR(l.data)}</span>
      </div>

      <div className="mt-2 text-[12px] text-slate-500">
        {resumoDaLimpeza(l)}
        {quem ? ` · ${quem}` : ""}
      </div>

      {fora.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {fora.map((t) => (
            <li key={t} className="text-[13px] text-slate-800">
              • {t}
            </li>
          ))}
        </ul>
      )}

      {l.observacao && <div className="mt-2 text-[12.5px] text-slate-600">{l.observacao}</div>}

      {l.fotos?.length > 0 && (
        <div className="mt-2.5">
          <TiraDeFotos fotos={l.fotos.map((url, i) => ({ url, legenda: `Foto ${i + 1}` }))} />
        </div>
      )}
    </Cartao>
  );
}

function NovaLimpeza({
  veiculos,
  faltando,
  onCriada,
}: {
  veiculos: Veiculo[];
  faltando: Veiculo[];
  onCriada: () => void;
}) {
  const [veiculoId, setVeiculoId] = useState("");
  const [data, setData] = useState(hojeBR());
  const [itens, setItens] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const feitos = respondidos(itens);
  const fora = ITENS_LIMPEZA.filter(([k]) => itens[k] === NAO_CONFORME).length;

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!veiculoId) {
      setErro("Escolha o veículo.");
      return;
    }
    if (feitos === 0) {
      setErro("Responda ao menos um item — senão o registro não diz nada.");
      return;
    }
    setSalvando(true);
    try {
      const supabase = createClient();
      const { data: eu } = await supabase.auth.getUser();
      const { data: tec } = await supabase
        .from("tecnicos")
        .select("id")
        .eq("user_id", eu.user?.id ?? "")
        .maybeSingle();
      // A foto sobe antes do insert: se o envio falhar, nada é gravado pela
      // metade — e o 4G da rua faz esse envio falhar mais do que se imagina.
      const urls = await enviarFotos(supabase, "checklists", `limpeza/${veiculoId}`, fotos);
      const { error } = await supabase.from("limpezas").insert({
        veiculo_id: veiculoId,
        data,
        itens,
        observacao: observacao.trim() || null,
        fotos: urls,
        registrado_por: (tec as { id: string } | null)?.id ?? null,
      });
      if (error) throw error;
      onCriada();
    } catch (err) {
      setErro(mensagemDeErro(err, "o registro da limpeza"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao titulo="Registrar limpeza" className="mb-3 ring-brand-300">
      <form onSubmit={criar} className="p-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Campo rotulo="Veículo *">
            <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
              <option value="">—</option>
              {/* Os que faltam na semana vêm primeiro: é o que a expedição
                  procura ao abrir a tela. */}
              {faltando.length > 0 && (
                <optgroup label="Faltam nesta semana">
                  {faltando.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} · {v.modelo}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Todos">
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} · {v.modelo}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Campo>
          <Campo rotulo="Dia">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>

        <div className="mt-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Itens
            </span>
            <span className="text-[12px] tabular-nums text-slate-500">
              {feitos} de {ITENS_LIMPEZA.length}
              {fora > 0 ? ` · ${fora} fora` : ""}
            </span>
          </div>
          <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-inset ring-slate-200">
            {ITENS_LIMPEZA.map(([chave, texto]) => (
              <div key={chave} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="flex-1 text-[13.5px] text-slate-800">{texto}</span>
                {/* Dois alvos grandes em vez de um select: isso é preenchido de
                    pé, no galpão, com o celular na mão. */}
                <div className="flex gap-1.5">
                  {[CONFORME, NAO_CONFORME].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setItens((x) => ({ ...x, [chave]: x[chave] === v ? "" : v }))}
                      className={cx(
                        "toque rounded-md px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition",
                        itens[chave] === v
                          ? v === CONFORME
                            ? "bg-emerald-600 text-white ring-emerald-600"
                            : "bg-acento-600 text-white ring-acento-600"
                          : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {v === CONFORME ? "Conforme" : "Não conforme"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          <Campo rotulo="Observação">
            <Textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="o que estava sujo, o que foi combinado com quem lava…"
            />
          </Campo>
          <CampoFotos rotulo="Fotos" arquivos={fotos} onArquivos={setFotos} />
        </div>

        {erro && (
          <div className="mt-2.5">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <div className="mt-3.5">
          <Botao variante="primario" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Registrar limpeza"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
