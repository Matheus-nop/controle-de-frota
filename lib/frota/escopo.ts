// O escopo da manutenção preventiva: o que a oficina tem que fazer, por modelo
// e por marco de revisão.
//
// A regra de resolução mora aqui e em `supabase/migrations/0015`, e as duas
// TÊM que concordar — a tela mostra o escopo antes de abrir a ordem, e a ordem
// de serviço imprime o mesmo. Mexeu numa, mexa na outra.
//
// A REGRA, EM UMA FRASE
//
// Um marco puxa a regra quando `marco >= km_inicio` e `(marco - km_inicio)` é
// múltiplo de `km_intervalo`.
//
// `km_intervalo` é "a cada quantos km", não "no km". 20.000 vale aos 20, 40, 60
// e 80 mil. É isso que faz cada item ter o próprio intervalo sem precisar de
// uma tabela por item: a pastilha de freio, que não se troca a cada 10 ou 20
// mil, mora numa regra de 40.000 e só aparece de 40 em 40. O óleo mora na de
// 10.000 e aparece em todas. Não existe uma repetição global — existe uma por
// linha, e o marco junta o que se encaixa.
//
// `km_inicio` é quase sempre 0, e aí a regra é exatamente a de cima. Ele existe
// porque o manual da Fiorino tem dois itens que não cabem sem ele: verificar o
// elemento do filtro de ar cai nas revisões ÍMPARES (10, 30, 50 mil — a cada
// 20.000 começando aos 10.000), e a verificação visual da correia dentada cai
// na 4ª, 10ª e 16ª (40, 100, 160 mil — sempre 20.000 km antes de cada troca da
// correia). Torcer esses dois para caber num intervalo redondo seria pôr na
// ordem de serviço um km que o fabricante não mandou.

export type Escopo = {
  id: string;
  modelo: string;
  km_intervalo: number;
  /** Em que km a regra começa a valer. Ausente nas linhas gravadas antes da
   *  0020, e aí vale 0 — que é o comportamento de sempre. */
  km_inicio?: number | null;
  itens: string[];
  observacao: string | null;
  ativo: boolean;
};

/** O começo da regra, tolerando linha antiga e lixo. */
export function inicioDe(e: Escopo): number {
  return typeof e.km_inicio === "number" && e.km_inicio > 0 ? e.km_inicio : 0;
}

/**
 * As regras que valem num marco, da mais frequente para a mais rara.
 *
 * Marco ausente, zero ou negativo devolve lista vazia em vez de tudo: `x % 0`
 * é NaN em JavaScript, e "não sei o marco" não pode virar "faça tudo".
 */
export function regrasDoMarco(escopos: Escopo[], marco: number | null | undefined): Escopo[] {
  if (!marco || marco <= 0) return [];
  return escopos
    .filter((e) => {
      if (!e.ativo || e.km_intervalo <= 0) return false;
      const inicio = inicioDe(e);
      return marco >= inicio && (marco - inicio) % e.km_intervalo === 0;
    })
    .sort((a, b) => a.km_intervalo - b.km_intervalo || inicioDe(a) - inicioDe(b));
}

/** Os primeiros marcos em que a regra cai. É o que a tela mostra como
 *  "vale aos 10.000, 30.000, 50.000…", e sem isso `km_inicio` seria um número
 *  no formulário que ninguém consegue conferir. */
export function marcosDaRegra(e: Escopo, quantos = 3): number[] {
  const inicio = inicioDe(e);
  const primeiro = inicio > 0 ? inicio : e.km_intervalo;
  return Array.from({ length: quantos }, (_, i) => primeiro + i * e.km_intervalo);
}

/**
 * A lista final para a ordem de serviço: os itens de todas as regras que valem,
 * sem repetir.
 *
 * Sem repetir importa de verdade: "trocar óleo" costuma estar na regra de
 * 10.000 e alguém acaba repetindo na de 20.000. Na oficina, item repetido no
 * papel é serviço cobrado duas vezes.
 *
 * A comparação ignora caixa e espaço nas pontas, mas o texto que sai é o da
 * primeira ocorrência — quem escreveu escolheu como quer ler.
 */
export function itensDoMarco(escopos: Escopo[], marco: number | null | undefined): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const regra of regrasDoMarco(escopos, marco)) {
    for (const item of regra.itens) {
      const limpo = item.trim();
      if (!limpo) continue;
      const chave = limpo.toLocaleLowerCase("pt-BR");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(limpo);
    }
  }
  return saida;
}

/**
 * O próximo marco de um veículo.
 *
 * É `proxima_revisao_km` quando existe: revisão é planejada para o marco, e é
 * esse número que a frota já usa. Sem ele, arredonda o hodômetro para cima no
 * passo dado — o odômetro quase nunca cai num múltiplo redondo (66.402 não é
 * múltiplo de nada), e propor 70.000 é mais útil do que propor nada.
 */
export function marcoSugerido(
  proximaRevisaoKm: number | null | undefined,
  kmAtual: number | null | undefined,
  passo = 10000,
): number | null {
  if (proximaRevisaoKm && proximaRevisaoKm > 0) return proximaRevisaoKm;
  if (kmAtual && kmAtual > 0) return Math.ceil(kmAtual / passo) * passo;
  return null;
}
