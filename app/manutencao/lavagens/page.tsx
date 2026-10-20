"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Carregando } from "@/components/ui";
import {
  Assinaturas,
  FaixaDoTitulo,
  FolhaA4,
  QuadroDePares,
  RodapeDaFolha,
  Secao,
  TABELA_DOC,
  TDC,
  TDN,
  THC,
  THN,
} from "@/components/folha-a4";
import { emReais } from "@/lib/frota/numero";
import { dataBR, hojeBR, nomeDoMes } from "@/lib/frota/tempo";
import { mesDe, TIPO_LAVAGEM } from "@/lib/frota/limpeza";

// O papel das lavagens do mês, para apresentar na reunião.
//
// Responde três perguntas numa folha: quantos veículos foram lavados, quanto
// custou, e quem ficou de fora. A última é a que interessa numa reunião — a
// lista de quem foi é parabéns, a de quem não foi é pauta.
//
// Mesma folha do formulário de lavagem e da ordem de serviço (o kit em
// `components/folha-a4.tsx`): o gestor leva os dois para a mesma mesa.
//
// Fica FORA do route group `(app)`: a casca do app não tem o que fazer numa
// folha A4. Nada aqui grava nada.

type Veiculo = { id: string; placa: string; modelo: string };
type Lavagem = {
  id: string;
  veiculo_id: string;
  status: string;
  agendada_para: string | null;
  concluida_em: string | null;
  oficina: string | null;
  orcamento: number | null;
  valor_final: number | null;
};

// No papel, o que ainda não existe vira linha para escrever à mão.
const LINHA = "________";
const dia = (s: string | null) => {
  const d = dataBR(s);
  return d === "—" ? LINHA : d;
};

function Lavagens() {
  const params = useSearchParams();
  const mes = params.get("mes") || mesDe(hojeBR());
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [lavagens, setLavagens] = useState<Lavagem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const [v, l] = await Promise.all([
        supabase.from("veiculos").select("id, placa, modelo").neq("status", "VENDIDO").order("placa"),
        supabase
          .from("manutencoes")
          .select("id, veiculo_id, status, agendada_para, concluida_em, oficina, orcamento, valor_final")
          .eq("tipo", TIPO_LAVAGEM),
      ]);
      setVeiculos((v.data as Veiculo[]) ?? []);
      setLavagens((l.data as Lavagem[]) ?? []);
      setCarregando(false);
    })();
  }, [mes]);

  if (carregando) return <Carregando texto="Carregando as lavagens…" />;

  // A lavagem conta no mês em que ACONTECEU; não tendo acontecido, no mês para
  // o qual está marcada. Lavou dia 2 de outubro o que estava agendado para 30
  // de setembro: é lavagem de outubro.
  const doMes = lavagens.filter((l) => {
    if (l.status === "CANCELADA") return false;
    const quando = l.concluida_em ?? l.agendada_para;
    return !!quando && mesDe(quando) === mes;
  });
  const porVeiculo = new Map(doMes.map((l) => [l.veiculo_id, l]));

  const feitas = doMes.filter((l) => l.status === "CONCLUÍDA");
  const pago = feitas.reduce((s, l) => s + (l.valor_final ?? 0), 0);
  const comprometido = doMes
    .filter((l) => l.status !== "CONCLUÍDA")
    .reduce((s, l) => s + (l.orcamento ?? 0), 0);
  const semLavagem = veiculos.filter((v) => !porVeiculo.has(v.id));

  return (
    <FolhaA4>
      <FaixaDoTitulo
        sobre="Lavagem mensal · frota"
        titulo="Lavagens do mês"
        linha={`${nomeDoMes(mes)} · ${feitas.length} de ${veiculos.length} veículos lavados`}
        rotuloDoNumero="Mês"
        numero={`${mes.slice(5, 7)}/${mes.slice(0, 4)}`}
        data={`impresso em ${dataBR(hojeBR())}`}
      />

      <Secao compacta n="1" titulo="O mês">
        <QuadroDePares
          pares={[
            ["Frota ativa", `${veiculos.length} veículos`],
            ["Lavagens feitas", `${feitas.length} de ${veiculos.length}`],
            ["Pago", emReais(pago)],
            ["Comprometido", comprometido > 0 ? emReais(comprometido) : "—"],
          ]}
        />
      </Secao>

      <Secao compacta n="2" titulo="Veículo por veículo">
        <table className={TABELA_DOC}>
          <thead>
            <tr>
              <th className={`${THC} w-[22mm]`}>Placa</th>
              <th className={THC}>Modelo</th>
              <th className={`${THN} w-[20mm]`}>Prevista</th>
              <th className={`${THN} w-[20mm]`}>Lavada em</th>
              <th className={`${THC} w-[34mm]`}>Lava-jato</th>
              <th className={`${THN} w-[26mm]`}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {veiculos.map((v) => {
              const l = porVeiculo.get(v.id);
              const feita = l?.status === "CONCLUÍDA";
              return (
                <tr key={v.id} className="break-inside-avoid">
                  <td className={`${TDC} font-mono font-semibold`}>{v.placa}</td>
                  <td className={TDC}>{v.modelo}</td>
                  <td className={TDN}>{dia(l?.agendada_para ?? null)}</td>
                  <td className={TDN}>{feita ? dia(l?.concluida_em ?? null) : LINHA}</td>
                  <td className={TDC}>{l?.oficina ?? LINHA}</td>
                  <td className={TDN}>
                    {feita && l?.valor_final != null
                      ? emReais(l.valor_final)
                      : l?.orcamento != null
                        ? `${emReais(l.orcamento)} prev.`
                        : LINHA}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate-500">
          Valor com “prev.” é orçamento, e não gasto: a lavagem ainda não foi concluída. Lavagem cancelada não aparece
          como feita — o veículo volta a contar como pendente, que é o que ele é.
        </p>
      </Secao>

      {/* A pauta da reunião é esta lista, não a de quem foi lavado. Por isso ela
          vem destacada, com moldura preta e não cor: o papel sai em impressora
          monocromática, e um fundo colorido viraria cinza claro. */}
      {semLavagem.length > 0 && (
        <section className="mt-5 break-inside-avoid border-2 border-slate-900 px-3.5 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Sem lavagem em {nomeDoMes(mes)} — {semLavagem.length} de {veiculos.length}
          </p>
          <p className="mt-1 text-[14px] font-bold leading-snug text-slate-900">
            {semLavagem.map((v) => v.placa).join(" · ")}
          </p>
        </section>
      )}

      <div className="break-inside-avoid">
        <Secao compacta n="3" titulo="Assinaturas">
          <Assinaturas quem={["Responsável pela frota", "Conferido por"]} />
        </Secao>
        <RodapeDaFolha>
          Lavagens de {nomeDoMes(mes)} · frota de {veiculos.length} veículos · impresso em {dataBR(hojeBR())}
        </RodapeDaFolha>
      </div>
    </FolhaA4>
  );
}

export default function LavagensPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <Lavagens />
    </Suspense>
  );
}
