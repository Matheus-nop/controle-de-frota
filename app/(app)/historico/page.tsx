"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  ImageOff,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { diaDe, intervaloUTC, periodoPadrao } from "@/lib/frota/tempo";
import { emKm } from "@/lib/frota/numero";
import {
  avariasDe,
  desfazerReclassificacao,
  reclassificarComoAvaria,
  resumoDaAvaria,
  urls,
  type Avaria,
} from "@/lib/frota/avarias";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Checkbox,
  Input,
  Pagina,
  Placa,
  Modal,
  Select,
  Vazio,
  cx,
  type Tom,
} from "@/components/ui";

// Consulta do gestor: tudo que a equipe registrou, com as fotos. As tres fontes
// de foto que ja existem viram uma linha do tempo so — checklist (semanais,
// avaria, bloqueio), roteiro (painel/hodometro) e ocorrencia (o dano).

type Veiculo = { id: string; placa: string; modelo: string };

type Foto = { url: string; legenda: string; semanal?: boolean };

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
  /** As avarias da vistoria. Vazio nos outros tipos — é o que o filtro usa. */
  avarias: Avaria[];
  /** Só no CHECKLIST: o id da linha e o `itens` cru, que a reclassificação
   *  precisa para reescrever. Nos outros tipos fica nulo. */
  checklistId: string | null;
  itens: unknown;
};

// As mesmas opções do formulário do técnico. Se divergirem, o filtro por
// onde/tipo passa a ter valores que nunca casam entre si.
const AVARIA_ONDE = ["FRENTE", "TRASEIRA", "LATERAL DIREITA", "LATERAL ESQUERDA", "INTERIOR", "RODAS/PNEUS", "OUTRO"];
const AVARIA_TIPO = ["AMASSADO", "ARRANHÃO", "QUEBRA", "LANTERNA/FAROL", "PNEU", "RETROVISOR", "OUTRO"];

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
export default function HistoricoPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  // Quem assina a reclassificação. Sai da mesma consulta que o resto do app usa
  // para saber o papel — `tecnicos` pelo `user_id` do login.
  const [quem, setQuem] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [veiculoId, setVeiculoId] = useState("");
  const [de, setDe] = useState(() => periodoPadrao(30).de);
  const [ate, setAte] = useState(() => periodoPadrao(30).ate);
  const [tipo, setTipo] = useState("TODOS");
  const [soComFoto, setSoComFoto] = useState(false);
  // Filtro de avaria: "só com avaria" mais o recorte por onde e por tipo. É a
  // pergunta que o gestor faz depois de um sinistro — "quantas vezes a traseira
  // desta Strada já apareceu amassada?" — e que antes exigia abrir vistoria por
  // vistoria.
  const [soComAvaria, setSoComAvaria] = useState(false);
  const [avOnde, setAvOnde] = useState("");
  const [avTipo, setAvTipo] = useState("");

  // A ficha do veiculo (modal do painel) manda pra ca com ?placa=XXX.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data } = await supabase.from("veiculos").select("id, placa, modelo").order("placa");
      const lista = (data as Veiculo[]) ?? [];
      setVeiculos(lista);

      const { data: sessao } = await supabase.auth.getUser();
      if (sessao?.user) {
        const { data: eu } = await supabase
          .from("tecnicos")
          .select("nome")
          .eq("user_id", sessao.user.id)
          .maybeSingle();
        setQuem((eu as { nome: string | null } | null)?.nome ?? sessao.user.email ?? null);
      }

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
      // As avarias saem do leitor compartilhado, que entende a forma antiga (uma
      // avaria) e a nova (lista). Sem ele, a vistoria com três danos entraria
      // aqui sem nenhuma foto de avaria.
      const avarias = avariasDe(itens);
      const fotos: Foto[] = [
        ...urls(itens.fotos_semanais).map((u) => ({ url: u, legenda: "semanal", semanal: true })),
        ...avarias.flatMap((a, i) =>
          a.fotos.map((u) => ({
            url: u,
            // A marca importa: numa discussão sobre quando o dano apareceu,
            // "o técnico registrou na rua" e "o gestor reconheceu depois" não
            // valem a mesma coisa.
            legenda: a.reclassificada_por
              ? "avaria (reclassificada)"
              : avarias.length > 1
                ? `avaria ${i + 1}`
                : "avaria",
          })),
        ),
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
        detalhe:
          [
            c.descricao,
            c.km_atual != null ? emKm(c.km_atual) : null,
            avarias.length ? avarias.map(resumoDaAvaria).join(" | ") : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        alerta: !c.apto,
        fotos,
        avarias,
        checklistId: c.id,
        itens,
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
        avarias: [],
        checklistId: null,
        itens: null,
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
        avarias: [],
        checklistId: null,
        itens: null,
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

  // As opções de onde/tipo saem do que existe no período, e não de uma lista
  // fixa: filtro que oferece opção sem resultado faz a pessoa duvidar do dado.
  const ondesVistos = Array.from(
    new Set(registros.flatMap((r) => r.avarias.map((a) => a.onde).filter((x): x is string => !!x))),
  ).sort();
  const tiposVistos = Array.from(
    new Set(registros.flatMap((r) => r.avarias.map((a) => a.tipo).filter((x): x is string => !!x))),
  ).sort();

  const filtrandoAvaria = soComAvaria || !!avOnde || !!avTipo;
  const lista = registros
    .filter((r) => (tipo === "TODOS" ? true : r.tipo === tipo))
    .filter((r) => (soComFoto ? r.fotos.length > 0 : true))
    // Escolher onde ou tipo já implica "só com avaria": pedir traseira e receber
    // roteiro sem avaria nenhuma seria uma lista que não responde a pergunta.
    .filter((r) =>
      !filtrandoAvaria
        ? true
        : r.avarias.some(
            (a) => (!avOnde || a.onde === avOnde) && (!avTipo || a.tipo === avTipo),
          ),
    );
  const totalFotos = lista.reduce((s, r) => s + r.fotos.length, 0);
  const totalAvarias = lista.reduce((s, r) => s + r.avarias.length, 0);

  return (
    <Pagina
      titulo="Histórico e fotos"
      subtitulo={
        `${lista.length} registro(s) · ${totalFotos} foto(s)` +
        (totalAvarias ? ` · ${totalAvarias} avaria(s)` : "")
      }
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
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
            <Checkbox
              checked={soComAvaria}
              onChange={(e) => {
                setSoComAvaria(e.target.checked);
                if (!e.target.checked) {
                  setAvOnde("");
                  setAvTipo("");
                }
              }}
            />
            Só com avaria
          </label>
        </div>

        {(soComAvaria || filtrandoAvaria) && (
          <div className="mt-2.5 flex flex-wrap gap-2.5 border-t border-slate-100 pt-2.5">
            <Campo rotulo="Onde" className="min-w-[160px] flex-[1_1_180px]">
              <Select value={avOnde} onChange={(e) => setAvOnde(e.target.value)}>
                <option value="">Qualquer lugar</option>
                {ondesVistos.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Tipo de avaria" className="min-w-[160px] flex-[1_1_180px]">
              <Select value={avTipo} onChange={(e) => setAvTipo(e.target.value)}>
                <option value="">Qualquer tipo</option>
                {tiposVistos.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
        )}
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
            <CartaoRegistro key={r.id} r={r} quem={quem} onMudou={carregar} />
          ))}
        </div>
      )}
    </Pagina>
  );
}

/**
 * O gestor corrige a classificação de uma foto.
 *
 * O caso real: o técnico mandou onze fotos, todas marcadas como "semanal", e
 * várias eram dano — farol quebrado, porta amassada. A vistoria ficou com zero
 * avaria: o alerta não dispara, o comparativo da semana seguinte não tem com o
 * que comparar, e o filtro de avaria não acha nada.
 *
 * Pedir para o técnico refazer não resolve: ele já entregou o veículo e foi
 * para a rua. Quem consegue olhar a foto e dizer "isto é a traseira amassada" é
 * o gestor, depois.
 *
 * A foto não muda e não se apaga nada — muda a classificação, e a mudança fica
 * assinada. Só quem tem papel de gestor chega aqui, porque só ele passa pela
 * policy de update de `checklists`.
 */
function ReclassificarFotos({
  r,
  quem,
  onFechar,
  onSalvo,
}: {
  r: Registro;
  quem: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const semanais = r.fotos.filter((f) => f.semanal).map((f) => f.url);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [onde, setOnde] = useState("");
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const reclassificadas = r.avarias
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.reclassificada_por);

  async function gravar(novoItens: Record<string, unknown>) {
    if (!r.checklistId) return;
    setSalvando(true);
    setErro(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("checklists")
      .update({ itens: novoItens })
      .eq("id", r.checklistId);
    setSalvando(false);
    if (error) {
      setErro(
        error.code === "42501" || error.message.toLowerCase().includes("policy")
          ? "Só o gestor pode reclassificar foto de vistoria."
          : error.message,
      );
      return;
    }
    onSalvo();
  }

  return (
    <Modal aberto titulo={`Reclassificar fotos · ${r.placa} · ${dataBR(r.data)}`} onFechar={onFechar}>
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Escolha as fotos que são avaria e diga o que é. Elas saem das fotos semanais e passam a
          contar como avaria desta vistoria — e ficam marcadas como reclassificadas por você.
        </p>

        {semanais.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-[13px] text-slate-500">
            <ImageOff size={15} />
            Nenhuma foto semanal sobrando nesta vistoria.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {semanais.map((u) => {
                const marcada = escolhidas.includes(u);
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() =>
                      setEscolhidas((l) => (l.includes(u) ? l.filter((x) => x !== u) : [...l, u]))
                    }
                    className={cx(
                      "relative block rounded-lg ring-2 transition",
                      marcada ? "ring-amber-500" : "ring-transparent hover:ring-slate-300",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt="foto da vistoria"
                      loading="lazy"
                      className={cx(
                        "block h-[84px] w-[84px] rounded-lg object-cover",
                        !marcada && "opacity-70",
                      )}
                    />
                    {marcada && (
                      <span className="absolute right-1 top-1 rounded bg-amber-500 px-1 text-[10px] font-bold text-white">
                        avaria
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Campo rotulo="Onde?">
                <Select value={onde} onChange={(e) => setOnde(e.target.value)}>
                  <option value="">Selecione…</option>
                  {AVARIA_ONDE.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo rotulo="Tipo de avaria">
                <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {AVARIA_TIPO.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
            <Campo rotulo="Descrição (opcional)">
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </Campo>

            <div className="flex flex-wrap items-center gap-3">
              <Botao
                variante="primario"
                disabled={salvando || escolhidas.length === 0 || (!onde && !tipo)}
                onClick={() =>
                  gravar(
                    reclassificarComoAvaria(
                      r.itens,
                      escolhidas,
                      { onde, tipo, descricao: descricao.trim() || null },
                      quem,
                    ),
                  )
                }
              >
                {salvando
                  ? "Salvando…"
                  : `Marcar ${escolhidas.length || ""} foto(s) como avaria`.replace("  ", " ")}
              </Botao>
              {escolhidas.length > 0 && !onde && !tipo && (
                <span className="text-[12.5px] text-slate-500">Diga ao menos onde ou o tipo.</span>
              )}
            </div>
          </>
        )}

        {reclassificadas.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              Já reclassificadas por alguém
            </div>
            <div className="flex flex-col gap-2">
              {reclassificadas.map(({ a, i }) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2.5 ring-1 ring-inset ring-amber-200"
                >
                  <span className="text-[13px] font-semibold text-slate-800">{resumoDaAvaria(a)}</span>
                  <span className="text-[11.5px] text-slate-500">
                    {a.fotos.length} foto(s) · por {a.reclassificada_por}
                  </span>
                  <Botao
                    tamanho="sm"
                    className="ml-auto"
                    disabled={salvando}
                    onClick={() => gravar(desfazerReclassificacao(r.itens, i))}
                  >
                    <Undo2 size={13} />
                    Desfazer
                  </Botao>
                </div>
              ))}
            </div>
          </div>
        )}

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}

function CartaoRegistro({
  r,
  quem,
  onMudou,
}: {
  r: Registro;
  quem: string | null;
  onMudou: () => void;
}) {
  const [reclassificando, setReclassificando] = useState(false);
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

      {/* Reclassificar é ação de gestor. O botão aparece para todo mundo que
          chega no histórico (gestor e PCM), e a RLS de `checklists` é quem
          decide de verdade: o PCM recebe o aviso em vez de um erro cru. */}
      {r.tipo === "CHECKLIST" && r.checklistId && (
        <div className="mt-2.5">
          <Botao tamanho="sm" onClick={() => setReclassificando(true)}>
            <ImageOff size={13} />
            Reclassificar fotos
          </Botao>
        </div>
      )}

      {reclassificando && (
        <ReclassificarFotos
          r={r}
          quem={quem}
          onFechar={() => setReclassificando(false)}
          onSalvo={() => {
            setReclassificando(false);
            onMudou();
          }}
        />
      )}

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
