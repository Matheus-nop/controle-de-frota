"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { hojeBR, intervaloUTC } from "@/lib/frota/tempo";
import { emKmPorLitro, emReais, paraInteiro } from "@/lib/frota/numero";
import {
  baseEmTexto,
  compararConsumo,
  motivoDeFicarDeFora,
  valorDe,
  type Criterio,
  type FichaDoVeiculo,
  type OrdemRegistro,
  type RodagemRegistro,
  type Simulacao,
} from "@/lib/frota/consumo";
import {
  Badge,
  Botao,
  CampoNumero,
  Cartao,
  Carregando,
  Contador,
  Placa,
  Pagina,
  Select,
  Vazio,
  cx,
  type Tom,
} from "@/components/ui";

// "Vou rodar 180 km até a obra — em qual veículo sai mais barato?"
//
// A pergunta aparece toda semana e hoje é respondida de cabeça ("a Fiorino bebe
// menos"). De cabeça erra por dois motivos: o preço do combustível muda, e o
// veículo que bebe menos pode ser o que mais entra na oficina.
//
// Aqui os dois números ficam lado a lado para a MESMA distância. A conta mora
// em lib/frota/consumo.ts, com teste próprio — é uma conta que vai decidir qual
// veículo sai, e conta que decide merece prova, não conferência no olho.
//
// Nada é gravado: o km é digitado na hora e some quando a tela fecha.

type Opcao = { meses: number; rotulo: string };
const JANELAS: Opcao[] = [
  { meses: 6, rotulo: "últimos 6 meses" },
  { meses: 12, rotulo: "últimos 12 meses" },
  { meses: 24, rotulo: "últimos 24 meses" },
];

const TOM_STATUS: Record<string, Tom> = {
  MANUTENCAO: "atencao",
  BLOQUEADO: "critico",
};

/** O primeiro dia da janela, em "2025-10-21". Mês-calendário para trás, que é
 *  como a equipe fala ("desde o ano passado"), e não 365 dias corridos. */
function inicioDaJanela(meses: number): string {
  const hoje = hojeBR();
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const d = new Date(Date.UTC(ano, mes - 1 - meses, Number(hoje.slice(8, 10))));
  return d.toISOString().slice(0, 10);
}

export default function ConsumoPage() {
  const [km, setKm] = useState("");
  const [criterio, setCriterio] = useState<Criterio>("combustivel");
  const [meses, setMeses] = useState(12);
  const [veiculos, setVeiculos] = useState<FichaDoVeiculo[]>([]);
  const [roteiros, setRoteiros] = useState<RodagemRegistro[]>([]);
  const [ordens, setOrdens] = useState<OrdemRegistro[]>([]);
  const [carregando, setCarregando] = useState(true);

  const de = useMemo(() => inicioDaJanela(meses), [meses]);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    // `saida_em` é timestamptz: o recorte vira a janela de São Paulo em UTC,
    // senão o filtro corta às 21h e some com o roteiro das 22h.
    const janela = intervaloUTC(de, hojeBR());
    const [v, r, m] = await Promise.all([
      supabase
        .from("veiculos")
        .select("id, placa, modelo, status, consumo_km_l, valor_combustivel, custo_km")
        .neq("status", "VENDIDO")
        .order("placa"),
      supabase.from("v_roteiros").select("placa, km_rodado").gte("saida_em", janela.de).lte("saida_em", janela.ate),
      supabase
        .from("manutencoes")
        .select("veiculo_id, status, valor_final")
        .gte("aberta_em", de)
        .lte("aberta_em", hojeBR()),
    ]);
    setVeiculos((v.data as FichaDoVeiculo[]) ?? []);
    setRoteiros((r.data as RodagemRegistro[]) ?? []);
    setOrdens((m.data as OrdemRegistro[]) ?? []);
    setCarregando(false);
  }, [de]);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const kmNum = paraInteiro(km);
  const linhas = useMemo(
    () => (kmNum && kmNum > 0 ? compararConsumo(kmNum, veiculos, roteiros, ordens, criterio) : []),
    [kmNum, veiculos, roteiros, ordens, criterio],
  );

  const comparaveis = linhas.filter((l) => valorDe(l, criterio) != null);
  const forade = linhas.filter((l) => valorDe(l, criterio) == null);
  const maisBarato = comparaveis[0] ?? null;
  const maisCaro = comparaveis[comparaveis.length - 1] ?? null;
  const teto = maisCaro ? valorDe(maisCaro, criterio)! : 1;
  const semFicha = veiculos.filter((v) => !v.consumo_km_l || !v.valor_combustivel).length;

  return (
    <Pagina
      titulo="Quanto custa rodar"
      subtitulo="Digite a distância e compare os veículos lado a lado. Nada aqui é gravado."
    >
      <Cartao className="mb-4 p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <CampoNumero
            rotulo="Distância a rodar"
            unidade="km"
            valor={km}
            onValor={setKm}
            placeholder="180"
            inputMode="numeric"
            className="min-w-[170px]"
            dica="Ida e volta, se for o caso."
          />

          <div className="min-w-[230px]">
            <span className="rotulo">Comparar por</span>
            <div className="flex gap-1.5">
              <Botao
                variante={criterio === "combustivel" ? "primario" : "secundario"}
                onClick={() => setCriterio("combustivel")}
              >
                Combustível
              </Botao>
              <Botao
                variante={criterio === "total" ? "primario" : "secundario"}
                onClick={() => setCriterio("total")}
              >
                + manutenção
              </Botao>
            </div>
          </div>

          {/* A janela só aparece quando pesa na conta: no combustível ela não
              entra, e um campo que não muda nada é um campo que confunde. */}
          {criterio === "total" && (
            <div className="min-w-[180px]">
              <span className="rotulo">Histórico de manutenção</span>
              <Select value={String(meses)} onChange={(e) => setMeses(Number(e.target.value))}>
                {JANELAS.map((j) => (
                  <option key={j.meses} value={j.meses}>
                    {j.rotulo}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <p className="mt-2.5 text-[12px] leading-relaxed text-slate-500">
          {criterio === "combustivel" ? (
            <>
              Combustível estimado: a distância × o custo por km do cadastro do veículo (preço do
              combustível ÷ consumo). Não é nota de posto.
            </>
          ) : (
            <>
              Combustível do cadastro <b>mais</b> a manutenção que o veículo realmente custou por km
              — gasto em ordens concluídas ÷ km rodado na janela escolhida. Orçamento de ordem em
              aberto não entra: previsão somada a gasto não é nem uma coisa nem outra.
            </>
          )}
        </p>
      </Cartao>

      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : !kmNum || kmNum <= 0 ? (
        <Vazio
          titulo="Digite a distância"
          texto="Com o km na mão, a tela mostra quanto cada veículo da frota custaria para essa viagem — do mais barato para o mais caro."
        />
      ) : (
        <>
          {maisBarato && maisCaro && maisBarato.id !== maisCaro.id && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Contador
                rotulo="Mais barato"
                valor={emReais(valorDe(maisBarato, criterio))}
                legenda={`${maisBarato.placa} · ${maisBarato.modelo}`}
                tom="text-emerald-700"
              />
              <Contador
                rotulo="Mais caro"
                valor={emReais(valorDe(maisCaro, criterio))}
                legenda={`${maisCaro.placa} · ${maisCaro.modelo}`}
                tom="text-red-700"
              />
              <Contador
                rotulo="Diferença"
                valor={emReais(maisCaro.diferenca)}
                legenda={`em ${kmNum.toLocaleString("pt-BR")} km, escolhendo o certo`}
              />
              <Contador
                rotulo="Veículos na conta"
                valor={`${comparaveis.length} de ${veiculos.length}`}
                legenda={
                  forade.length > 0 ? `${forade.length} sem dado para comparar` : "a frota inteira"
                }
                tom={forade.length > 0 ? "text-amber-700" : "text-slate-900"}
              />
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {comparaveis.map((l, i) => (
              <LinhaVeiculo
                key={l.id}
                l={l}
                km={kmNum}
                criterio={criterio}
                teto={teto}
                primeiro={i === 0}
                referencia={maisBarato}
              />
            ))}
          </div>

          {forade.length > 0 && (
            <Cartao
              titulo={`${forade.length} veículo(s) fora da comparação`}
              className="mt-4"
            >
              <div className="px-4 py-3">
                <p className="mb-2.5 text-[12.5px] leading-relaxed text-slate-600">
                  Eles aparecem aqui em vez de sumir da tela: veículo que some é veículo de que
                  ninguém lembra de completar o cadastro.
                </p>
                <div className="flex flex-col gap-2">
                  {forade.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Placa>{l.placa}</Placa>
                      <span className="text-slate-600">{l.modelo}</span>
                      <span className="text-amber-700">{motivoDeFicarDeFora(l, criterio)}</span>
                    </div>
                  ))}
                </div>
                {semFicha > 0 && (
                  <Link
                    href="/veiculos"
                    className="mt-2.5 inline-block text-[12.5px] font-medium text-brand-700 hover:underline"
                  >
                    Completar o cadastro em Veículos →
                  </Link>
                )}
              </div>
            </Cartao>
          )}
        </>
      )}
    </Pagina>
  );
}

/** Uma linha da comparação: o valor, a barra e de onde o número saiu. */
function LinhaVeiculo({
  l,
  km,
  criterio,
  teto,
  primeiro,
  referencia,
}: {
  l: Simulacao;
  km: number;
  criterio: Criterio;
  teto: number;
  primeiro: boolean;
  referencia: Simulacao | null;
}) {
  const valor = valorDe(l, criterio)!;
  const pct = Math.max((valor / (teto || 1)) * 100, 2);

  return (
    <Cartao className={cx("p-3.5", primeiro && "ring-emerald-300")}>
      <div className="flex flex-wrap items-center gap-2">
        <Placa>{l.placa}</Placa>
        <span className="text-[13.5px] font-medium text-slate-800">{l.modelo}</span>
        {l.status !== "ATIVO" && <Badge tom={TOM_STATUS[l.status] ?? "mudo"}>{l.status}</Badge>}
        {primeiro && <Badge tom="ok">mais barato</Badge>}
        <span className="ml-auto text-[19px] font-bold tabular-nums text-slate-900">
          {emReais(valor)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <div className="h-[16px] flex-1 rounded-sm bg-slate-100">
          <div
            className={cx("h-full rounded-r-[4px]", primeiro ? "bg-emerald-600" : "bg-acao-500")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className={cx(
            "w-[128px] shrink-0 text-right text-[12px] font-semibold tabular-nums",
            primeiro ? "text-emerald-700" : "text-slate-600",
          )}
        >
          {primeiro || !l.diferenca
            ? "a referência"
            : `+ ${emReais(l.diferenca)} que a ${referencia?.placa ?? ""}`}
        </span>
      </div>

      <div className="mt-2 text-[12px] leading-relaxed text-slate-500">
        <Detalhe l={l} km={km} criterio={criterio} />
      </div>
    </Cartao>
  );
}

/** A linha de "de onde veio o número". Separada porque é ela que faz alguém
 *  confiar — ou descobrir que o cadastro está velho. */
function Detalhe({ l, km, criterio }: { l: Simulacao; km: number; criterio: Criterio }) {
  return (
    <>
      <span>
        {emKmPorLitro(l.consumo)} · {emReais(l.precoDoLitro)} o litro
        {l.litros != null && <> · {l.litros.toFixed(1).replace(".", ",")} litros</>} ·{" "}
        {emReais(l.combustivelPorKm)}/km em {km.toLocaleString("pt-BR")} km
      </span>
      {criterio === "total" && (
        <span className="mt-0.5 block">
          {l.manutencaoPorKm != null ? (
            <>
              {emReais(l.manutencaoPorKm)}/km de manutenção ({emReais(l.manutencao)} na viagem) ·
              base: {baseEmTexto(l.base)}
            </>
          ) : (
            <>manutenção fora da conta: {baseEmTexto(l.base)}</>
          )}
        </span>
      )}
    </>
  );
}
