"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Botao, BotaoLink, Carregando } from "@/components/ui";
import { avariasDe, resumoDaAvaria, urls, type Avaria } from "@/lib/frota/avarias";
import { legendaDoAngulo } from "@/lib/frota/angulos";
import { dataBR, diaHoraDe } from "@/lib/frota/tempo";
import { emKm } from "@/lib/frota/numero";

// O comparativo em papel, para levar à reunião.
//
// A tela do comparativo responde "quando este dano apareceu?" para quem está
// olhando. A reunião é outra coisa: são cinco pessoas em volta de uma mesa, e o
// que decide a conversa é a FOTO — grande o bastante para todo mundo ver o
// amassado, com a data e o nome de quem vistoriou do lado.
//
// Fica FORA do route group `(app)`: topo colorido, abas e menu não têm o que
// fazer numa folha que vai para a mesa. Mesma decisão da ordem de serviço.
//
// Não grava nada e não conclui nada. São dois registros que já existem,
// impressos lado a lado — a conclusão é de quem está na reunião.

type Vistoria = {
  id: string;
  data: string;
  km_atual: number | null;
  apto: boolean;
  motivo_bloqueio: string | null;
  tecnico: string | null;
  itens: unknown;
  avarias: Avaria[];
  fotos: { url: string; legenda: string }[];
};
type Veic = { placa: string; modelo: string; ano: string | null };

/** Duas avarias são "a mesma" quando batem onde e tipo — a mesma regra da tela
 *  do comparativo. Se divergirem, o papel diz uma coisa e a tela diz outra. */
const chave = (a: Avaria) => `${a.onde ?? "?"}|${a.tipo ?? "?"}`;

const ROTULO = "text-[10px] font-bold uppercase tracking-[0.05em] text-slate-400";

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-[18px] break-inside-avoid">
      <h2 className="mb-2 border-b border-slate-200 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** As fotos no papel. `loading="eager"` porque foto que o navegador adiou sai
 *  como retângulo branco na impressão — e um relatório de dano sem a foto do
 *  dano não serve para nada. */
function Fotos({
  fotos,
  grande,
}: {
  fotos: { url: string; legenda: string }[];
  grande?: boolean;
}) {
  if (fotos.length === 0) return <div className="text-[11px] text-slate-400">sem foto</div>;
  return (
    <div className={grande ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-1.5"}>
      {fotos.map((f, i) => (
        <figure key={f.url + i} className="break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={f.url}
            alt={f.legenda}
            loading="eager"
            className={
              grande
                ? // Foto de dano não pode ser cortada para caber: numa reunião,
                  // o pedaço que o corte comeu é sempre o que alguém pergunta.
                  "h-[170px] w-full rounded bg-slate-100 object-contain ring-1 ring-slate-300"
                : "h-[82px] w-full rounded object-cover ring-1 ring-slate-300"
            }
          />
          <figcaption className="mt-0.5 text-center text-[9px] text-slate-500">{f.legenda}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Coluna({ v, rotulo, novas }: { v: Vistoria; rotulo: string; novas: Set<string> }) {
  return (
    <div className="break-inside-avoid rounded-lg p-3 ring-1 ring-slate-300">
      <div className={ROTULO}>{rotulo}</div>
      <div className="text-[15px] font-bold text-slate-900">{dataBR(v.data)}</div>
      <div className="text-[11.5px] text-slate-600">
        {v.tecnico ?? "—"}
        {v.km_atual != null ? ` · ${emKm(v.km_atual)}` : ""} · {v.apto ? "apto" : "NÃO APTO"}
      </div>
      {!v.apto && v.motivo_bloqueio && (
        <div className="text-[11.5px] font-semibold text-red-700">{v.motivo_bloqueio}</div>
      )}

      <div className="mt-2 border-t border-slate-200 pt-2">
        <div className={ROTULO}>
          {v.avarias.length === 0 ? "Nenhuma avaria" : `${v.avarias.length} avaria(s)`}
        </div>
        <ul className="mt-1 space-y-0.5">
          {v.avarias.map((a, i) => (
            <li key={i} className="text-[11.5px] text-slate-800">
              • {resumoDaAvaria(a)}
              {novas.has(chave(a)) ? <strong> — NOVA</strong> : ""}
              {a.reclassificada_por ? ` (reclassificada por ${a.reclassificada_por})` : ""}
              {a.anexada_por ? ` (foto anexada por ${a.anexada_por})` : ""}
              {a.descricao ? <span className="text-slate-500"> · {a.descricao}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-2 border-t border-slate-200 pt-2">
        <div className={`${ROTULO} mb-1`}>Fotos da vistoria</div>
        <Fotos fotos={v.fotos} />
      </div>
    </div>
  );
}

function Relatorio() {
  const params = useSearchParams();
  const idA = params.get("a");
  const idB = params.get("b");
  const [a, setA] = useState<Vistoria | null>(null);
  const [b, setB] = useState<Vistoria | null>(null);
  const [veic, setVeic] = useState<Veic | null>(null);
  const [quem, setQuem] = useState<string | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "vazio">("carregando");

  useEffect(() => {
    (async () => {
      if (!idA || !idB) {
        setEstado("vazio");
        return;
      }
      const supabase = createClient();
      const { data: sessao } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("checklists")
        .select("id, data, km_atual, apto, motivo_bloqueio, itens, veiculo:veiculo_id(placa,modelo,ano), tecnico:tecnico_id(nome)")
        .in("id", [idA, idB]);

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const monta = (c: any): Vistoria => {
        const itens = (c.itens ?? {}) as unknown;
        const t = Array.isArray(c.tecnico) ? c.tecnico[0] : c.tecnico;
        const avarias = avariasDe(itens);
        return {
          id: c.id,
          data: c.data,
          km_atual: c.km_atual,
          apto: c.apto,
          motivo_bloqueio: c.motivo_bloqueio,
          tecnico: t?.nome ?? null,
          itens,
          avarias,
          fotos: [
            ...urls((itens as Record<string, unknown>).fotos_semanais).map((u) => ({
              url: u,
              legenda: legendaDoAngulo(itens, u),
            })),
            ...avarias.flatMap((av, i) =>
              av.fotos.map((u) => ({ url: u, legenda: `avaria ${i + 1}` })),
            ),
          ],
        };
      };
      const linhas = ((data as any[]) ?? []).map(monta);
      const bruto = ((data as any[]) ?? [])[0];
      const v = Array.isArray(bruto?.veiculo) ? bruto.veiculo[0] : bruto?.veiculo;
      /* eslint-enable @typescript-eslint/no-explicit-any */

      setVeic((v as Veic) ?? null);
      setA(linhas.find((x) => x.id === idA) ?? null);
      setB(linhas.find((x) => x.id === idB) ?? null);
      setEstado(linhas.length === 2 ? "ok" : "vazio");

      if (sessao?.user) {
        const { data: eu } = await supabase
          .from("tecnicos")
          .select("nome")
          .eq("user_id", sessao.user.id)
          .maybeSingle();
        setQuem((eu as { nome: string } | null)?.nome ?? sessao.user.email ?? null);
      }
    })();
  }, [idA, idB]);

  if (estado === "carregando") return <Carregando texto="Montando o relatório…" />;

  if (!a || !b) {
    return (
      <div className="mx-auto max-w-[820px] p-6">
        <p className="mb-3 text-sm text-slate-500">
          {idA && idB
            ? "Não encontrei as duas vistorias. Elas podem ter sido excluídas."
            : "Escolha as duas vistorias no comparativo e clique em Imprimir."}
        </p>
        <BotaoLink href="/comparativo">
          <ArrowLeft size={14} />
          Voltar para o comparativo
        </BotaoLink>
      </div>
    );
  }

  // O que existe em B e não existia em A. É o que a reunião quer ver primeiro.
  const antes = new Set(a.avarias.map(chave));
  const novas = new Set(b.avarias.filter((x) => !antes.has(chave(x))).map(chave));
  const avariasNovas = b.avarias.filter((x) => novas.has(chave(x)));

  return (
    <>
      <div className="mx-auto flex max-w-[820px] items-center gap-3 px-5 pt-4 print:hidden">
        <BotaoLink href="/comparativo">
          <ArrowLeft size={14} />
          Comparativo
        </BotaoLink>
        <Botao variante="primario" className="ml-auto" onClick={() => window.print()}>
          <Printer size={14} />
          Imprimir
        </Botao>
      </div>

      <div className="mx-auto my-4 mb-10 max-w-[820px] rounded-xl bg-white px-[30px] py-7 text-slate-900 ring-1 ring-slate-200 print:my-0 print:max-w-none print:rounded-none print:p-0 print:ring-0">
        <header className="mb-[18px] flex items-start gap-[18px] border-b-2 border-slate-900 pb-3.5">
          <Logo className="h-9 w-auto" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-bold leading-tight">Relatório de vistoria comparativa</h1>
            <div className="text-[12px] text-slate-500">
              {veic ? `${veic.modelo} — ${veic.placa}${veic.ano ? ` · ${veic.ano}` : ""}` : "—"}
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <div>{dataBR(a.data)} → {dataBR(b.data)}</div>
            <div>
              {a.avarias.length} → {b.avarias.length} avarias
            </div>
          </div>
        </header>

        <div
          className={`mb-[18px] rounded-lg px-3.5 py-3 ring-1 ring-inset ${
            avariasNovas.length ? "bg-amber-50 ring-amber-300" : "bg-emerald-50 ring-emerald-200"
          }`}
        >
          <div className="text-[15px] font-bold">
            {avariasNovas.length === 0
              ? "Nenhuma avaria nova entre as duas vistorias"
              : avariasNovas.length === 1
                ? "1 avaria nova entre as duas vistorias"
                : `${avariasNovas.length} avarias novas entre as duas vistorias`}
          </div>
          <div className="text-[12px] text-slate-600">
            Entre {dataBR(a.data)} ({emKm(a.km_atual)}) e {dataBR(b.data)} ({emKm(b.km_atual)})
            {a.km_atual != null && b.km_atual != null
              ? ` · ${emKm(b.km_atual - a.km_atual)} rodados no período`
              : ""}
          </div>
        </div>

        {avariasNovas.length > 0 && (
          <Bloco titulo="O que apareceu no período">
            <div className="space-y-3">
              {avariasNovas.map((av, i) => (
                <div key={i} className="break-inside-avoid rounded-lg bg-slate-50 p-3 ring-1 ring-slate-300">
                  <div className="mb-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-[14px] font-bold">{resumoDaAvaria(av)}</span>
                    {av.ja_existia && (
                      <span className="text-[11px] text-slate-500">
                        técnico informou: {av.ja_existia}
                      </span>
                    )}
                    {av.reclassificada_por && (
                      <span className="text-[11px] text-slate-500">
                        reclassificada por {av.reclassificada_por}
                      </span>
                    )}
                    {av.anexada_por && (
                      <span className="text-[11px] text-slate-500">
                        foto anexada por {av.anexada_por}
                      </span>
                    )}
                  </div>
                  {av.descricao && <p className="mb-2 text-[12px] text-slate-700">{av.descricao}</p>}
                  <Fotos
                    grande
                    fotos={av.fotos.map((u, k) => ({
                      url: u,
                      legenda: `${dataBR(b.data)} · ${resumoDaAvaria(av)} (${k + 1})`,
                    }))}
                  />
                </div>
              ))}
            </div>
          </Bloco>
        )}

        <Bloco titulo="As duas vistorias">
          <div className="grid grid-cols-2 gap-3">
            <Coluna v={a} rotulo="Antes" novas={new Set()} />
            <Coluna v={b} rotulo="Depois" novas={novas} />
          </div>
        </Bloco>

        <Bloco titulo="Como ler este relatório">
          <p className="text-[11px] leading-relaxed text-slate-600">
            Uma avaria é considerada <strong>nova</strong> quando o local e o tipo não apareciam na
            vistoria anterior. Dois danos no mesmo local e do mesmo tipo contam como um — o
            formulário não permite afirmar mais do que isso, e errar para menos é melhor do que
            apontar dano novo que não é. As fotos são as das próprias vistorias, na data em que
            foram tiradas; quando alguma foi reclassificada ou anexada depois pelo gestor, está
            dito ao lado dela.
          </p>
        </Bloco>

        <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-300 pt-2.5 text-[10px] text-slate-500">
          <div>
            Gerado em {diaHoraDe(new Date()) ?? "—"}
            {quem ? ` por ${quem}` : ""} · Controle de Frota · Grupo Nova Opção
          </div>
          <div className="w-[220px] border-t border-slate-400 pt-1 text-center">
            Visto do responsável
          </div>
        </div>
      </div>
    </>
  );
}

// `useSearchParams` exige Suspense no App Router.
export default function RelatorioPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <Relatorio />
    </Suspense>
  );
}
