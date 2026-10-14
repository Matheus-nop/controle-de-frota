"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeBR } from "@/lib/frota/tempo";
import { emReais } from "@/lib/frota/numero";
import {
  adesaoDeRoteiro,
  adesaoDeVistoria,
  avariasPorVeiculo,
  semanasNoPeriodo,
  taxaGeral,
  type VistoriaComItens,
} from "@/lib/frota/indicadores";
import {
  Barras,
  BarrasEmpilhadas,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Contador,
  Input,
  Pagina,
  cx,
} from "@/components/ui";

// Os números da frota, para a reunião.
//
// A tela existe separada de /relatorios de propósito: lá se exporta linha a
// linha para conferir um caso; aqui se olha o conjunto e se discute. São duas
// perguntas diferentes, e misturá-las deixaria as duas piores.
//
// Toda taxa mostra o denominador. Porcentagem sem denominador é um número que
// ninguém consegue contestar numa reunião — e é exatamente ali que ela precisa
// aguentar pergunta.

type Veiculo = { id: string; placa: string; modelo: string; status: string };
type Roteiro = { tecnico_saida: string | null; chegada_em: string | null; saida_em: string | null };
type Manut = {
  veiculo_id: string; status: string; valor_final: number | null; orcamento: number | null;
};

const META = 95;

function inicioDoMes() {
  return hojeBR().slice(0, 8) + "01";
}
function dataBR(s: string) {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

export default function IndicadoresPage() {
  const [de, setDe] = useState(() => inicioDoMes());
  const [ate, setAte] = useState(() => hojeBR());
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [vistorias, setVistorias] = useState<VistoriaComItens[]>([]);
  const [manuts, setManuts] = useState<Manut[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [v, r, c, m] = await Promise.all([
      supabase.from("veiculos").select("id, placa, modelo, status").neq("status", "VENDIDO").order("placa"),
      supabase
        .from("v_roteiros")
        .select("tecnico_saida, chegada_em, saida_em")
        .gte("saida_em", de).lte("saida_em", ate + "T23:59:59"),
      // A vistoria anulada não conta: ela foi feita errado e o gestor desfez.
      // Contá-la inflaria a adesão com trabalho que não valeu.
      supabase
        .from("checklists")
        .select("id, veiculo_id, data, itens")
        .is("anulada_em", null)
        .gte("data", de).lte("data", ate),
      supabase
        .from("manutencoes")
        .select("veiculo_id, status, valor_final, orcamento")
        .gte("aberta_em", de).lte("aberta_em", ate),
    ]);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setRoteiros((r.data as Roteiro[]) ?? []);
    setVistorias((c.data as VistoriaComItens[]) ?? []);
    setManuts((m.data as Manut[]) ?? []);
    setCarregando(false);
  }, [de, ate]);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const ativos = useMemo(() => veiculos.filter((v) => v.status !== "VENDIDO"), [veiculos]);
  const semanas = useMemo(() => semanasNoPeriodo(de, ate), [de, ate]);

  const porTecnico = useMemo(() => adesaoDeRoteiro(roteiros), [roteiros]);
  const porVeiculo = useMemo(
    () => adesaoDeVistoria(vistorias, ativos, semanas),
    [vistorias, ativos, semanas],
  );
  const avarias = useMemo(() => avariasPorVeiculo(vistorias, ativos), [vistorias, ativos]);

  const gastos = useMemo(() => {
    const mapa = new Map<string, { gasto: number; previsto: number }>();
    for (const m of manuts) {
      const l = mapa.get(m.veiculo_id) ?? { gasto: 0, previsto: 0 };
      // Pago e comprometido separados: somar os dois contaria o mesmo serviço
      // duas vezes quando a ordem já foi paga.
      if (m.valor_final != null) l.gasto += m.valor_final;
      else if (m.status !== "CANCELADA") l.previsto += m.orcamento ?? 0;
      mapa.set(m.veiculo_id, l);
    }
    return ativos
      .map((v) => ({ placa: v.placa, ...(mapa.get(v.id) ?? { gasto: 0, previsto: 0 }) }))
      .filter((l) => l.gasto > 0 || l.previsto > 0)
      .sort((a, b) => b.gasto + b.previsto - (a.gasto + a.previsto));
  }, [manuts, ativos]);

  const geralRoteiro = taxaGeral(porTecnico);
  const geralVistoria = taxaGeral(porVeiculo);
  const totalGasto = gastos.reduce((s, g) => s + g.gasto, 0);
  const totalAvarias = avarias.reduce((s, a) => s + a.avarias, 0);
  const periodo = `${dataBR(de)} a ${dataBR(ate)}`;

  return (
    <Pagina
      titulo="Indicadores"
      subtitulo={carregando ? "carregando…" : `${periodo} · ${semanas} semana${semanas === 1 ? "" : "s"}`}
    >
      <Cartao className="mb-5 p-3.5 print:hidden">
        <div className="flex flex-wrap items-end gap-2.5">
          <Campo rotulo="De" className="min-w-[145px]">
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até" className="min-w-[145px]">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Campo>
          <Botao className="ml-auto" onClick={() => window.print()}>
            <Printer size={14} />
            Imprimir / PDF
          </Botao>
        </div>
      </Cartao>

      <div className="mb-3.5 hidden text-[12px] text-slate-500 print:block">Período: {periodo}</div>

      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Contador
              rotulo="Adesão ao roteiro"
              valor={geralRoteiro.pct != null ? `${geralRoteiro.pct}%` : "—"}
              legenda={`${geralRoteiro.feito} de ${geralRoteiro.esperado} com chegada · meta ${META}%`}
              tom={corDaMeta(geralRoteiro.pct)}
            />
            <Contador
              rotulo="Adesão à vistoria"
              valor={geralVistoria.pct != null ? `${geralVistoria.pct}%` : "—"}
              legenda={`${geralVistoria.feito} de ${geralVistoria.esperado} semanas-veículo · meta ${META}%`}
              tom={corDaMeta(geralVistoria.pct)}
            />
            <Contador
              rotulo="Avarias em aberto"
              valor={totalAvarias}
              legenda={`em ${avarias.length} de ${ativos.length} veículos`}
            />
            <Contador rotulo="Gasto no período" valor={emReais(totalGasto)} legenda="manutenções pagas" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Painel
              titulo="Adesão ao registro de roteiro"
              explica={`Dos roteiros que cada técnico abriu, quantos tiveram a chegada registrada. Meta de ${META}%.`}
            >
              <Barras
                dados={porTecnico.map((t) => ({
                  chave: t.chave,
                  valor: t.pct ?? 0,
                  rotulo: t.pct != null ? `${t.pct}%` : "—",
                  detalhe: `${t.feito} de ${t.esperado} roteiros fechados`,
                }))}
                max={100}
                vazio="Nenhum roteiro no período."
              />
            </Painel>

            <Painel
              titulo="Adesão à vistoria semanal"
              explica={`De ${semanas} semana${semanas === 1 ? "" : "s"} no período, em quantas cada veículo foi vistoriado. Vistoria anulada não conta.`}
            >
              <Barras
                dados={porVeiculo.map((t) => ({
                  chave: t.chave,
                  valor: t.pct ?? 0,
                  rotulo: t.pct != null ? `${t.pct}%` : "—",
                  detalhe: `${t.feito} de ${t.esperado} semanas`,
                }))}
                max={100}
                vazio="Nenhuma vistoria no período."
              />
            </Painel>

            <Painel
              titulo="Veículos com mais avaria"
              explica="O estado de agora: conta a última vistoria de cada veículo, não a soma do histórico — senão o mesmo amassado contaria dez vezes."
            >
              <Barras
                dados={avarias.map((a) => ({
                  chave: a.placa,
                  valor: a.avarias,
                  detalhe: a.em ? `vistoria de ${dataBR(a.em)}` : undefined,
                }))}
                vazio="Nenhuma avaria registrada no período."
              />
            </Painel>

            <Painel
              titulo="Veículos que mais custaram"
              explica="Pago é dinheiro que saiu; comprometido é orçamento de ordem ainda aberta. Separados para não contar o mesmo serviço duas vezes."
            >
              <BarrasEmpilhadas
                dados={gastos.map((g) => ({
                  chave: g.placa,
                  partes: [
                    { valor: g.gasto, rotulo: "Pago" },
                    { valor: g.previsto, rotulo: "Comprometido" },
                  ],
                  detalhe: `${emReais(g.gasto)} pagos · ${emReais(g.previsto)} comprometidos`,
                }))}
                series={["Pago", "Comprometido"]}
                formatar={emReais}
                vazio="Nenhuma manutenção no período."
              />
            </Painel>
          </div>
        </>
      )}
    </Pagina>
  );
}

/** Âmbar quando está abaixo da meta — e a meta vai escrita na legenda do
 *  cartão, porque cor sozinha não pode carregar significado: quem não
 *  distingue o âmbar do preto precisa ler "meta 95%" ao lado do 83%.
 *
 *  Verde não entra. O número já diz que está bom; pintar de verde o que está
 *  certo só gasta o canal de cor e deixa a tela parecendo um semáforo.
 *
 *  O número tem 26px em negrito, que o WCAG conta como texto grande: o
 *  acento-600 dá 3,19:1 sobre o branco, acima do 3:1 exigido nesse tamanho. */
function corDaMeta(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  return pct >= META ? "text-slate-900" : "text-acento-600";
}

function Painel({
  titulo,
  explica,
  children,
}: {
  titulo: string;
  explica: string;
  children: React.ReactNode;
}) {
  return (
    <Cartao className={cx("break-inside-avoid p-4")}>
      <h2 className="text-[14px] font-semibold text-slate-900">{titulo}</h2>
      {/* A explicação fica no gráfico, não numa legenda de rodapé: a pergunta
          "como isso foi calculado?" vem na reunião, e a resposta precisa estar
          na mesma tela que está sendo projetada. */}
      <p className="mb-3.5 mt-1 text-[12px] leading-relaxed text-slate-500">{explica}</p>
      {children}
    </Cartao>
  );
}
