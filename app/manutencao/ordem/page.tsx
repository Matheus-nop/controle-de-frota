"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Botao, BotaoLink, Carregando } from "@/components/ui";
import { emKm, emReais } from "@/lib/frota/numero";
import { itensDoMarco, regrasDoMarco, type Escopo } from "@/lib/frota/escopo";
import { avisoDaGarantia, ehGarantia } from "@/lib/frota/garantia";

// Ordem de serviço para imprimir e entregar ao técnico.
//
// O papel serve para uma coisa: alguém que não está olhando o app saber o que
// levar, o que fazer e o que anotar de volta. Por isso ele tem duas metades —
// o que o sistema já sabe (veículo, km, o que foi pedido) vem impresso, e o
// que só vai existir na oficina (peças, valor, km de entrega) vem em branco,
// com linha para escrever à mão.
//
// Fica FORA do route group `(app)`: a casca do app (topo colorido, abas, menu)
// não tem o que fazer numa folha A4 que vai para a oficina.
//
// Nada aqui grava nada. Depois de executado, quem lança o resultado é o
// gestor/PCM em /manutencao — é lá que o dado entra no banco. O papel é o
// caminho de ida, não uma segunda fonte de verdade.

type Manut = {
  id: string;
  aberta_em: string | null;
  km_abertura: number | null;
  origem: string | null;
  tipo: string | null;
  descricao_problema: string;
  prioridade: string | null;
  oficina: string | null;
  orcamento: number | null;
  status: string;
  proxima_revisao_km: number | null;
  revisao_km: number | null;
  garantia: string | null;
  veiculo: Veic | Veic[] | null;
  responsavel: { nome: string } | { nome: string }[] | null;
};
type Veic = {
  placa: string; modelo: string; ano: string | null;
  km_atual: number | null; proxima_revisao_km: number | null;
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "__/__/____";
}
// No papel, número que não existe vira linha para escrever à mão — é o único
// motivo de a formatação daqui não ser a de tela.
const LINHA = "____________";
const nkm = (n: number | null | undefined) => emKm(n, LINHA);
const brl = (n: number | null | undefined) => emReais(n, LINHA);
// Nº da ordem: os 8 primeiros do uuid, em maiúsculas. Curto o bastante para
// alguém ditar no telefone e ainda achar a ordem certa numa frota de 9.
function numero(id: string) {
  return id.slice(0, 8).toUpperCase();
}

const ROTULO = "text-[10px] font-bold uppercase tracking-[0.05em] text-slate-400";

/** Bloco com linha para preencher à mão na oficina. */
function ParaPreencher({ rotulo, largo, linhas = 1 }: { rotulo: string; largo?: boolean; linhas?: number }) {
  return (
    <div className={largo ? "col-span-2" : undefined}>
      <div className={`${ROTULO} text-slate-500`}>{rotulo}</div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="mt-1.5 h-[22px] border-b border-slate-400" />
      ))}
    </div>
  );
}

// "ACIDENTE/AVARIA" é uma palavra só para o navegador: não tem espaço onde
// quebrar a linha. Em tela estreita ela saía da coluna e passava por cima da
// vizinha. O <wbr> diz que depois da barra (e do hífen) pode quebrar, para a
// linha partir em "ACIDENTE/" em vez de no meio de "AVARIA".
function comQuebra(valor: string) {
  const pedacos = valor.split(/(?<=[/-])/);
  return pedacos.map((pedaco, i) => (
    <Fragment key={i}>
      {pedaco}
      {i < pedacos.length - 1 && <wbr />}
    </Fragment>
  ));
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className={ROTULO}>{rotulo}</div>
      {/* break-words é a rede: nome de oficina comprido quebra em vez de
          invadir a coluna do lado. */}
      <div className="mt-0.5 break-words text-sm font-semibold text-slate-900">
        {comQuebra(valor)}
      </div>
    </div>
  );
}

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

function Ordem() {
  const params = useSearchParams();
  const id = params.get("id");
  const [m, setM] = useState<Manut | null>(null);
  const [escopos, setEscopos] = useState<Escopo[]>([]);
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
        .from("manutencoes")
        .select(
          "*, veiculo:veiculo_id(placa,modelo,ano,km_atual,proxima_revisao_km), responsavel:responsavel_id(nome)",
        )
        .eq("id", id)
        .maybeSingle();
      const manut = (data as Manut) ?? null;
      setM(manut);
      setEstado(data ? "ok" : "vazio");

      // O escopo é montado na hora, a partir do modelo e do marco — não foi
      // copiado para a manutenção. É a regra do projeto: nada de derivado
      // gravado, uma fonte de verdade só. Reimprimir uma ordem depois de o
      // plano mudar mostra o plano de agora, que é o que a oficina deve seguir.
      const modelo = (Array.isArray(manut?.veiculo) ? manut?.veiculo[0] : manut?.veiculo)?.modelo;
      if (modelo) {
        const { data: esc } = await supabase
          .from("escopos_manutencao")
          .select("*")
          .eq("modelo", modelo)
          .eq("ativo", true);
        setEscopos((esc as Escopo[]) ?? []);
      }
    })();
  }, [id]);

  if (estado === "carregando") return <Carregando texto="Carregando a ordem…" />;

  if (!m) {
    return (
      <div className="mx-auto max-w-[820px] p-6">
        <p className="mb-3 text-sm text-slate-500">
          {id ? "Ordem de serviço não encontrada." : "Nenhuma ordem indicada no endereço."}
        </p>
        <BotaoLink href="/manutencao">
          <ArrowLeft size={14} />
          Voltar para Manutenções
        </BotaoLink>
      </div>
    );
  }

  const v = one(m.veiculo);
  const servicos = itensDoMarco(escopos, m.revisao_km);
  const regras = regrasDoMarco(escopos, m.revisao_km);
  const resp = one(m.responsavel);
  const programada = m.origem === "PREVENTIVA PROGRAMADA" || m.tipo === "PREVENTIVA";

  return (
    <>
      {/* A4 de verdade: margem de 14mm e a folha ocupando a página inteira. */}
      <style>{`@media print { @page { size: A4; margin: 14mm } }`}</style>

      <div className="mx-auto flex max-w-[820px] items-center gap-3 px-5 pt-4 print:hidden">
        <BotaoLink href="/manutencao">
          <ArrowLeft size={14} />
          Manutenções
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
              Ordem de serviço {programada ? "— manutenção programada" : "— manutenção"}
            </h1>
            <div className="mt-0.5 text-[11.5px] text-slate-500">Frota · Grupo Nova Opção</div>
          </div>
          <div className="ml-auto text-right">
            <div className={ROTULO}>Ordem nº</div>
            <div className="text-[19px] font-bold tracking-[0.03em] tabular-nums">{numero(m.id)}</div>
            <div className={ROTULO}>Aberta em {dataBR(m.aberta_em)}</div>
          </div>
        </header>

        {/* A tarja vem antes de tudo, e com moldura preta em vez de cor: a
            ordem sai em impressora monocromática, e um fundo colorido viraria
            cinza claro. Quem está com o papel na mão é quem emite a cobrança —
            se o aviso passar batido, a frota paga um serviço que não devia. */}
        {ehGarantia(m.garantia) && (
          <div className="mb-[18px] break-inside-avoid border-2 border-slate-900 px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              Atenção — serviço em garantia
            </div>
            <div className="mt-0.5 text-[14.5px] font-bold leading-snug text-slate-900">
              {avisoDaGarantia(m.garantia)}
            </div>
          </div>
        )}

        <Bloco titulo="Veículo">
          <div className="grid grid-cols-2 gap-x-[18px] gap-y-3 sm:grid-cols-4 print:grid-cols-4">
            <Dado rotulo="Placa" valor={v?.placa ?? "—"} />
            <Dado rotulo="Modelo" valor={v?.modelo ?? "—"} />
            <Dado rotulo="Ano" valor={v?.ano ?? "—"} />
            <Dado rotulo="Km na abertura" valor={nkm(m.km_abertura ?? v?.km_atual)} />
          </div>
        </Bloco>

        <Bloco titulo="A ordem">
          <div className="grid grid-cols-2 gap-x-[18px] gap-y-3 sm:grid-cols-4 print:grid-cols-4">
            <Dado rotulo="Tipo" valor={m.tipo ?? "—"} />
            <Dado rotulo="Origem" valor={m.origem ?? "—"} />
            <Dado rotulo="Prioridade" valor={m.prioridade ?? "—"} />
            <Dado rotulo="Situação" valor={m.status} />
            <Dado rotulo="Oficina" valor={m.oficina ?? "a definir"} />
            <Dado rotulo="Solicitante" valor={resp?.nome ?? "—"} />
            <Dado rotulo="Orçamento aprovado" valor={ehGarantia(m.garantia) ? "EM GARANTIA" : brl(m.orcamento)} />
            <Dado rotulo="Próxima revisão" valor={nkm(m.proxima_revisao_km ?? v?.proxima_revisao_km)} />
          </div>
        </Bloco>

        <Bloco titulo="O que fazer">
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{m.descricao_problema}</p>
        </Bloco>

        {/* O escopo da revisão. É o pedido da equipe: "sigam aquele escopo, que
            será descrito na OS". Vem com caixa para marcar, porque papel que a
            oficina devolve marcado é a conferência de que o serviço foi feito —
            e é o que o PCM lança depois em Serviços realizados. */}
        {servicos.length > 0 && (
          <Bloco titulo={`Escopo da revisão de ${nkm(m.revisao_km)} — ${v?.modelo ?? ""}`}>
            <ul className="grid grid-cols-2 gap-x-[18px] gap-y-2">
              {servicos.map((i) => (
                <li key={i} className="flex items-start gap-2 break-inside-avoid">
                  <span className="mt-[3px] inline-block h-[13px] w-[13px] shrink-0 border border-slate-500" />
                  <span className="text-[13.5px] leading-snug">{i}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[10.5px] text-slate-500">
              Plano do modelo {v?.modelo}, regras de{" "}
              {regras.map((r) => nkm(r.km_intervalo)).join(", ")}. Marque o que foi executado.
            </p>
          </Bloco>
        )}

        <Bloco titulo="Para a oficina preencher">
          <div className="grid grid-cols-2 gap-x-[18px] gap-y-3">
            <ParaPreencher rotulo="Serviços realizados" largo linhas={4} />
            <ParaPreencher rotulo="Peças substituídas (descrição e quantidade)" largo linhas={4} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-[18px] gap-y-3 sm:grid-cols-4 print:grid-cols-4">
            <ParaPreencher rotulo="Entrada na oficina (data e hora)" />
            <ParaPreencher rotulo="Saída da oficina (data e hora)" />
            <ParaPreencher rotulo="Km na entrega" />
            {/* A linha do valor continua existindo em garantia: a oficina
                anota quanto custaria, que é o número que vira argumento depois
                ("a FULL PNEUS refez R$ 1.400 de serviço este ano"). O que muda
                é que ninguém emite a cobrança. */}
            <ParaPreencher
              rotulo={ehGarantia(m.garantia) ? "Valor final (R$) — em garantia, não cobrar" : "Valor final (R$)"}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-[18px]">
            <ParaPreencher rotulo="Pendências / o que ficou para a próxima" largo linhas={2} />
          </div>
        </Bloco>

        <section className="mt-9 grid break-inside-avoid grid-cols-3 gap-6">
          {[
            "Responsável pela oficina",
            "Técnico que entregou o veículo",
            "Conferido por (PCM / gestor)",
          ].map((quem) => (
            <div key={quem}>
              <div className="mb-1.5 border-t border-slate-900" />
              <div className={ROTULO}>{quem}</div>
            </div>
          ))}
        </section>

        <footer className="mt-6 border-t border-slate-200 pt-2.5 text-[10.5px] leading-relaxed text-slate-400">
          Ordem {numero(m.id)} · {v?.placa ?? "—"} · impressa em{" "}
          {dataBR(new Date().toISOString().slice(0, 10))}. Depois de executada, lance o resultado em
          Manutenções — o papel não atualiza o sistema.
        </footer>
      </div>
    </>
  );
}

export default function OrdemPage() {
  // useSearchParams exige Suspense na build estática do App Router.
  return (
    <Suspense fallback={<Carregando />}>
      <Ordem />
    </Suspense>
  );
}
