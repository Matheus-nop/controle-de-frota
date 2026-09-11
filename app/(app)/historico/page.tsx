"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardCheck,
  ImageOff,
  ImagePlus,
  RotateCcw,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { legendaDoAngulo } from "@/lib/frota/angulos";
import { faltaMigracaoDaAnulacao } from "@/lib/frota/anulacao";
import { fotoAnexada } from "@/lib/frota/anexo";
import { correcoesDe, resumoDaCorrecao } from "@/lib/frota/correcao";
import { mensagemDeErro } from "@/lib/frota/erro";
import { diaDe, diaHoraDe, intervaloUTC, periodoPadrao } from "@/lib/frota/tempo";
import { emKm } from "@/lib/frota/numero";
import { avariasDe, resumoDaAvaria, urls, type Avaria } from "@/lib/frota/avarias";
import {
  AnexarFotos,
  ExcluirVistoria,
  ReclassificarFotos,
  TrocarVeiculo,
  type FotoDaVistoria,
  type Vistoria,
} from "@/components/vistoria";
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
  Select,
  TiraDeFotos,
  Vazio,
  cx,
  type Tom,
} from "@/components/ui";

// Consulta do gestor: tudo que a equipe registrou, com as fotos. As tres fontes
// de foto que ja existem viram uma linha do tempo so — checklist (semanais,
// avaria, bloqueio), roteiro (painel/hodometro) e ocorrencia (o dano).

type Veiculo = { id: string; placa: string; modelo: string };

type Foto = FotoDaVistoria;

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
  veiculoId: string | null;
  /** Só no CHECKLIST: o hodômetro registrado, que a troca de veículo confere. */
  km: number | null;
  itens: unknown;
  /** O que o gestor já corrigiu nesta vistoria. Fica à vista no cartão: uma
   *  vistoria que mudou de veículo não é a mesma coisa que uma que sempre foi
   *  daquele veículo, e quem lê o histórico depois precisa saber disso. */
  correcoes: { campo: string; de: string | null; para: string | null; por: string | null; em: string | null }[];
  /** Só no CHECKLIST: a vistoria que o gestor tirou do ar. */
  anulada: { por: string | null; em: string; motivo: string | null } | null;
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
export default function HistoricoPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  // Quem assina a reclassificação. Sai da mesma consulta que o resto do app usa
  // para saber o papel — `tecnicos` pelo `user_id` do login.
  const [quem, setQuem] = useState<string | null>(null);
  // O id, além do nome: `anulada_por` é FK para tecnicos, como todo nome de
  // pessoa neste sistema.
  const [quemId, setQuemId] = useState<string | null>(null);
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
  // As anuladas ficam escondidas: para quem usa, elas foram excluídas. Este é o
  // caminho de volta, para o dia em que o gestor anular a vistoria errada.
  const [verAnuladas, setVerAnuladas] = useState(false);
  // Enquanto a 0017 não rodar, excluir vistoria não existe — e a tela diz isso,
  // em vez de oferecer um botão que devolve erro.
  const [faltaMigracao, setFaltaMigracao] = useState(false);
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
          .select("id, nome")
          .eq("user_id", sessao.user.id)
          .maybeSingle();
        const pessoa = eu as { id: string; nome: string | null } | null;
        setQuem(pessoa?.nome ?? sessao.user.email ?? null);
        setQuemId(pessoa?.id ?? null);
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
    let semMigracao = false;
    const supabase = createClient();

    // Antes da 0017 não há coluna de anulação nem relação `anulada_por`: a
    // consulta volta a ser a de sempre, e a tela funciona sem o recurso novo em
    // vez de ficar em branco.
    const montarChk = (comAnulacao: boolean) => {
      const q = supabase
        .from("checklists")
        .select(
          comAnulacao
            ? "*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome), quem_anulou:anulada_por(nome)"
            : "*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)",
        )
        .gte("data", de)
        .lte("data", ate);
      const comVeiculo = veiculoId ? q.eq("veiculo_id", veiculoId) : q;
      return comAnulacao && !verAnuladas ? comVeiculo.is("anulada_em", null) : comVeiculo;
    };
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
      qRot = qRot.eq("veiculo_id", veiculoId);
      qOco = qOco.eq("veiculo_id", veiculoId);
    }

    const [primeiraChk, rot, oco] = await Promise.all([montarChk(true), qRot, qOco]);
    let chk = primeiraChk;
    if (faltaMigracaoDaAnulacao(chk.error)) {
      chk = await montarChk(false);
      semMigracao = true;
    }
    setFaltaMigracao(semMigracao);
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
        // O ângulo, quando a vistoria foi feita no formulário guiado. Vistoria
        // antiga não tem o mapa e continua saindo como "semanal".
        ...urls(itens.fotos_semanais).map((u) => ({
          url: u,
          legenda: legendaDoAngulo(itens, u),
          semanal: true,
          anexadaPor: fotoAnexada(itens, u)?.por,
        })),
        ...avarias.flatMap((a, i) =>
          a.fotos.map((u) => ({
            url: u,
            anexadaPor: fotoAnexada(itens, u)?.por,
            // A marca importa: numa discussão sobre quando o dano apareceu,
            // "o técnico registrou na rua" e "o gestor reconheceu depois" não
            // valem a mesma coisa.
            legenda: a.reclassificada_por
              ? "avaria (reclassificada)"
              : a.anexada_por
                ? "avaria (anexada)"
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
        km: c.km_atual ?? null,
        correcoes: correcoesDe(itens),
        veiculoId: c.veiculo_id,
        itens,
        anulada: c.anulada_em
          ? {
              por: one(c.quem_anulou as { nome: string } | null)?.nome ?? null,
              em: c.anulada_em,
              motivo: c.motivo_anulacao ?? null,
            }
          : null,
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
        veiculoId: null,
        km: null,
        correcoes: [],
        itens: null,
        anulada: null,
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
        veiculoId: null,
        km: null,
        correcoes: [],
        itens: null,
        anulada: null,
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    linhas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    setRegistros(linhas);
    setCarregando(false);
  }, [de, ate, veiculoId, verAnuladas]);

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
          {/* Anulada some do histórico por padrão — para quem usa, ela foi
              excluída. Esta é a porta de volta, e ela precisa existir: o dia em
              que o gestor anular a vistoria errada é o dia em que ele vem
              procurar por aqui. */}
          {!faltaMigracao && (
            <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
              <Checkbox checked={verAnuladas} onChange={(e) => setVerAnuladas(e.target.checked)} />
              Ver anuladas
            </label>
          )}
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
            <CartaoRegistro
              key={r.id}
              r={r}
              veiculos={veiculos}
              quem={quem}
              quemId={quemId}
              podeExcluir={!faltaMigracao}
              onMudou={carregar}
            />
          ))}
        </div>
      )}
    </Pagina>
  );
}




function CartaoRegistro({
  r,
  veiculos,
  quem,
  quemId,
  podeExcluir,
  onMudou,
}: {
  r: Registro;
  veiculos: Veiculo[];
  quem: string | null;
  quemId: string | null;
  podeExcluir: boolean;
  onMudou: () => void;
}) {
  const [reclassificando, setReclassificando] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const Icone = ICONE[r.tipo];
  // O registro do histórico é mais largo do que as peças de correção precisam.
  // Aqui ele vira o recorte delas — e é este `if` que garante que só vistoria
  // chega nas três: roteiro e ocorrência não têm o que reclassificar.
  const vistoria: Vistoria | null = r.checklistId
    ? {
        checklistId: r.checklistId,
        veiculoId: r.veiculoId,
        placa: r.placa,
        modelo: r.modelo,
        km: r.km,
        data: r.data,
        tecnico: r.tecnico,
        itens: r.itens,
        fotos: r.fotos,
        avarias: r.avarias,
      }
    : null;

  async function restaurar() {
    if (!r.checklistId) return;
    setRestaurando(true);
    setErro(null);
    const supabase = createClient();
    // O `.select` confere que alterou mesmo: UPDATE barrado pela RLS volta sem
    // erro e com zero linhas, e aí o botão fingiria ter funcionado.
    const { data, error } = await supabase
      .from("checklists")
      .update({ anulada_em: null, anulada_por: null, motivo_anulacao: null })
      .eq("id", r.checklistId)
      .select("id");
    setRestaurando(false);
    if (error || !data || data.length === 0) {
      setErro(
        error
          ? mensagemDeErro(error, "a restauração")
          : "Nada foi alterado: só o gestor da frota pode restaurar vistoria.",
      );
      return;
    }
    onMudou();
  }

  return (
    <Cartao
      className={cx(
        "border-l-4 p-4",
        r.anulada
          ? "border-l-slate-300 bg-slate-50/60"
          : r.alerta
            ? "border-l-red-600"
            : FAIXA_TIPO[r.tipo],
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icone size={16} className="shrink-0 text-slate-400" />
        <Placa>{r.placa}</Placa>
        <span className="text-[13px] text-slate-500">{r.modelo}</span>
        <Badge tom={TOM_TIPO[r.tipo]}>{r.tipo}</Badge>
        {r.anulada && <Badge tom="mudo">ANULADA</Badge>}
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

      {r.anulada && (
        <div className="mt-2.5 rounded-lg bg-slate-100 p-2.5 text-[12.5px] text-slate-600 ring-1 ring-inset ring-slate-200">
          Excluída por <strong>{r.anulada.por ?? "alguém"}</strong> em{" "}
          {diaHoraDe(r.anulada.em) ?? "—"}
          {r.anulada.motivo ? ` · ${r.anulada.motivo}` : ""}. Não conta em nenhuma tela.
        </div>
      )}

      {r.correcoes.length > 0 && (
        <div className="mt-2.5 rounded-lg bg-amber-50 p-2.5 text-[12.5px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
          {r.correcoes.map((c, i) => (
            <div key={i}>
              Corrigido: <strong>{resumoDaCorrecao(c)}</strong>
              {c.por ? ` · por ${c.por}` : ""}
              {c.em ? ` em ${diaHoraDe(c.em) ?? "—"}` : ""}
            </div>
          ))}
        </div>
      )}

      {/* Reclassificar é ação de gestor. O botão aparece para todo mundo que
          chega no histórico (gestor e PCM), e a RLS de `checklists` é quem
          decide de verdade: o PCM recebe o aviso em vez de um erro cru. */}
      {r.tipo === "CHECKLIST" && r.checklistId && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {r.anulada ? (
            <Botao tamanho="sm" disabled={restaurando} onClick={restaurar}>
              <RotateCcw size={13} />
              {restaurando ? "Restaurando…" : "Restaurar vistoria"}
            </Botao>
          ) : (
            <>
              <Botao tamanho="sm" onClick={() => setReclassificando(true)}>
                <ImageOff size={13} />
                Reclassificar fotos
              </Botao>
              <Botao tamanho="sm" onClick={() => setAnexando(true)}>
                <ImagePlus size={13} />
                Anexar fotos
              </Botao>
              <Botao tamanho="sm" onClick={() => setTrocando(true)}>
                <ArrowLeftRight size={13} />
                Trocar veículo
              </Botao>
              {podeExcluir && (
                <Botao tamanho="sm" variante="perigo" onClick={() => setExcluindo(true)}>
                  <Trash2 size={13} />
                  Excluir vistoria
                </Botao>
              )}
            </>
          )}
        </div>
      )}

      {erro && (
        <div className="mt-2">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      {reclassificando && vistoria && (
        <ReclassificarFotos
          r={vistoria}
          quem={quem}
          onFechar={() => setReclassificando(false)}
          onSalvo={() => {
            setReclassificando(false);
            onMudou();
          }}
        />
      )}

      {anexando && vistoria && (
        <AnexarFotos
          r={vistoria}
          quem={quem}
          onFechar={() => setAnexando(false)}
          onSalvo={() => {
            setAnexando(false);
            onMudou();
          }}
        />
      )}

      {trocando && vistoria && (
        <TrocarVeiculo
          r={vistoria}
          veiculos={veiculos}
          quem={quem}
          onFechar={() => setTrocando(false)}
          onSalvo={() => {
            setTrocando(false);
            onMudou();
          }}
        />
      )}

      {excluindo && vistoria && (
        <ExcluirVistoria
          r={vistoria}
          quemId={quemId}
          onFechar={() => setExcluindo(false)}
          onSalvo={() => {
            setExcluindo(false);
            onMudou();
          }}
        />
      )}

      {r.fotos.length > 0 ? (
        // A tira abre a galeria com a vistoria INTEIRA: quem clica na traseira
        // quer ver a lateral em seguida, na seta, e não voltar e clicar de novo.
        <TiraDeFotos
          className="mt-2.5"
          fotos={r.fotos.map((f) => ({
            url: f.url,
            legenda: f.legenda + (f.anexadaPor ? " · anexada" : ""),
            destaque: !!f.anexadaPor,
          }))}
        />
      ) : (
        <div className="mt-2 text-[11.5px] text-slate-400">sem foto</div>
      )}
    </Cartao>
  );
}
