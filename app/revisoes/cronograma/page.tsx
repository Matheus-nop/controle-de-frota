"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Botao, BotaoLink, Carregando } from "@/components/ui";
import { emKm } from "@/lib/frota/numero";
import { saldoDoPacote, type Pacote } from "@/lib/frota/pacote";

// O cronograma do pacote, para imprimir.
//
// Serve para duas conversas que acontecem fora do app: combinar as datas com o
// prestador, e a oficina carimbar cada revisão feita. É o "cartão de revisões"
// que esses pacotes costumam vir em papel — só que com os dados da frota e sem
// depender de o prestador lembrar de preencher o dele.
//
// Fica FORA do route group `(app)`: a casca do app não tem o que fazer numa
// folha A4 que vai para o balcão.
//
// Nada aqui grava nada. Quem lança a revisão feita é o gestor em /manutencao.

type Revisao = {
  id: string;
  descricao_problema: string;
  status: string;
  agendada_para: string | null;
  concluida_em: string | null;
  km_abertura: number | null;
  oficina: string | null;
};

const ROTULO = "text-[10px] font-bold uppercase tracking-[0.05em] text-slate-400";
const LINHA = "____________";

function dataBR(s: string | null) {
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "__/__/____";
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className={ROTULO}>{rotulo}</div>
      <div className="mt-0.5 break-words text-sm font-semibold text-slate-900">{valor}</div>
    </div>
  );
}

function Cronograma() {
  const params = useSearchParams();
  const id = params.get("id");
  const [p, setP] = useState<Pacote | null>(null);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "vazio">("carregando");

  useEffect(() => {
    (async () => {
      if (!id) {
        setEstado("vazio");
        return;
      }
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data } = await supabase
        .from("v_pacotes_revisao")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      setP((data as Pacote) ?? null);
      setEstado(data ? "ok" : "vazio");
      if (data) {
        const { data: r } = await supabase
          .from("manutencoes")
          .select("id, descricao_problema, status, agendada_para, concluida_em, km_abertura, oficina")
          .eq("pacote_id", id)
          .neq("status", "CANCELADA")
          // A ordem é a do calendário, não a de cadastro: o papel é lido de
          // cima para baixo como uma agenda.
          .order("agendada_para", { nullsFirst: false });
        setRevisoes((r as Revisao[]) ?? []);
      }
    })();
  }, [id]);

  if (estado === "carregando") return <Carregando texto="Carregando o cronograma…" />;
  if (estado === "vazio" || !p)
    return (
      <div className="mx-auto max-w-[820px] p-6 text-slate-600">
        Pacote não encontrado. Abra pelo botão <strong>Cronograma</strong> na tela de Revisões.
      </div>
    );

  // As revisões já registradas, seguidas das linhas em branco das que ainda
  // nem foram marcadas — o papel mostra o pacote inteiro, não só o que já
  // aconteceu. É assim que se vê, de relance, quantas ainda há para usar.
  const emBranco = Math.max(0, p.revisoes_gratuitas - revisoes.length);

  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 14mm } }`}</style>

      <div className="mx-auto flex max-w-[820px] items-center gap-3 px-5 pt-4 print:hidden">
        <BotaoLink href="/revisoes">
          <ArrowLeft size={14} />
          Revisões
        </BotaoLink>
        <Botao variante="primario" className="ml-auto" onClick={() => window.print()}>
          <Printer size={14} />
          Imprimir
        </Botao>
      </div>

      <div className="mx-auto my-4 mb-10 max-w-[820px] rounded-xl bg-white px-[30px] py-7 text-slate-900 ring-1 ring-slate-200 print:my-0 print:max-w-none print:rounded-none print:p-0 print:ring-0">
        <header className="mb-[18px] flex items-start gap-[18px] border-b-2 border-slate-900 pb-3.5">
          <Logo altura={38} />
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Cronograma de revisões — {p.servico.toLowerCase()}
            </h1>
            <div className="mt-0.5 text-[11.5px] text-slate-500">Frota · Grupo Nova Opção</div>
          </div>
          <div className="ml-auto text-right">
            <div className={ROTULO}>Revisões gratuitas</div>
            <div className="text-[19px] font-bold tracking-[0.03em] tabular-nums">
              {p.feitas}/{p.revisoes_gratuitas}
            </div>
            <div className={ROTULO}>já realizadas</div>
          </div>
        </header>

        <section className="mb-[18px]">
          <h2 className="mb-2 border-b border-slate-200 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Veículo e pacote
          </h2>
          <div className="grid grid-cols-2 gap-x-[18px] gap-y-3 sm:grid-cols-4 print:grid-cols-4">
            <Dado rotulo="Placa" valor={p.placa} />
            <Dado rotulo="Modelo" valor={p.modelo} />
            <Dado rotulo="Prestador" valor={p.prestador} />
            <Dado rotulo="Contratado em" valor={dataBR(p.contratado_em)} />
            <Dado rotulo="Km na contratação" valor={p.km_contratado != null ? emKm(p.km_contratado) : LINHA} />
            <Dado rotulo="Hodômetro hoje" valor={p.km_atual != null ? emKm(p.km_atual) : LINHA} />
            <Dado
              rotulo="Cadência combinada"
              valor={
                [p.cada_km ? emKm(p.cada_km) : null, p.cada_dias ? `${p.cada_dias} dias` : null]
                  .filter(Boolean)
                  .join(" ou ") || "a combinar"
              }
            />
            <Dado rotulo="Benefício vence em" valor={p.vence_em ? dataBR(p.vence_em) : "sem prazo"} />
          </div>
          <div className="mt-2.5 text-[12.5px] text-slate-600">{saldoDoPacote(p)}</div>
          {p.observacao && (
            <div className="mt-1.5 text-[12.5px] text-slate-600">{p.observacao}</div>
          )}
        </section>

        <section className="break-inside-avoid">
          <h2 className="mb-2 border-b border-slate-200 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            As revisões
          </h2>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th className={`${ROTULO} w-[8%] pb-1.5`}>Nº</th>
                <th className={`${ROTULO} w-[18%] pb-1.5`}>Prevista</th>
                <th className={`${ROTULO} w-[18%] pb-1.5`}>Realizada</th>
                <th className={`${ROTULO} w-[18%] pb-1.5`}>Km</th>
                <th className={`${ROTULO} pb-1.5`}>Carimbo e assinatura da oficina</th>
              </tr>
            </thead>
            <tbody>
              {revisoes.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-200">
                  <td className="py-2.5 font-semibold tabular-nums">{i + 1}</td>
                  <td className="py-2.5 tabular-nums">{dataBR(r.agendada_para)}</td>
                  <td className="py-2.5 tabular-nums">
                    {r.status === "CONCLUÍDA" ? dataBR(r.concluida_em) : LINHA}
                  </td>
                  <td className="py-2.5 tabular-nums">
                    {r.status === "CONCLUÍDA" && r.km_abertura != null ? emKm(r.km_abertura) : LINHA}
                  </td>
                  <td className="py-2.5" />
                </tr>
              ))}
              {Array.from({ length: emBranco }).map((_, i) => (
                <tr key={`branco-${i}`} className="border-b border-slate-200">
                  <td className="py-2.5 font-semibold tabular-nums text-slate-400">
                    {revisoes.length + i + 1}
                  </td>
                  <td className="py-2.5 text-slate-400">{LINHA}</td>
                  <td className="py-2.5 text-slate-400">{LINHA}</td>
                  <td className="py-2.5 text-slate-400">{LINHA}</td>
                  <td className="py-2.5" />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-500">
            As revisões deste pacote não são cobradas da frota: estão incluídas no serviço
            contratado em {dataBR(p.contratado_em)} junto à {p.prestador}.
            {p.vence_em ? ` O benefício vale até ${dataBR(p.vence_em)}.` : ""}
          </p>
        </section>

        <section className="mt-9 grid break-inside-avoid grid-cols-2 gap-6">
          {["Responsável pela oficina", "Conferido por (PCM / gestor)"].map((t) => (
            <div key={t}>
              <div className="h-[34px] border-b border-slate-400" />
              <div className={`${ROTULO} mt-1.5`}>{t}</div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

export default function CronogramaPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <Cronograma />
    </Suspense>
  );
}
