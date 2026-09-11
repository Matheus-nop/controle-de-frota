import type { SupabaseClient } from "@supabase/supabase-js";
import { reduzirFoto } from "./imagem";
import { falhaDeRede } from "./erro";

// Quantas vezes insistir quando a conexão cai. Três tentativas cobrem o buraco
// de sinal na saída do galpão sem deixar o técnico esperando um minuto por uma
// foto que não vai subir de jeito nenhum.
const TENTATIVAS = 3;

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Sobe um arquivo, reduzindo a imagem antes e insistindo se a conexão cair.
 *
 *  O reenvio usa o MESMO caminho de propósito: se a primeira tentativa chegou
 *  ao Storage e só a resposta se perdeu, a segunda esbarra no arquivo já
 *  gravado — e isso é sucesso, não erro. Sem esse cuidado, o reenvio duplicaria
 *  a foto no balde a cada oscilação de sinal. */
async function subir(
  supabase: SupabaseClient,
  balde: string,
  caminhoSemExtensao: string,
  arquivo: File,
): Promise<string> {
  const menor = await reduzirFoto(arquivo);
  const ext = (menor.name.split(".").pop() || "jpg").toLowerCase();
  const caminho = `${caminhoSemExtensao}.${ext}`;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const { error } = await supabase.storage.from(balde).upload(caminho, menor, { upsert: false });
    if (!error) break;
    if (/already exists|duplicate/i.test(error.message)) break; // subiu na tentativa anterior
    // Recusa do servidor (tamanho, permissão) não melhora insistindo.
    if (!falhaDeRede(error) || tentativa === TENTATIVAS) throw error;
    await espera(700 * tentativa);
  }
  return supabase.storage.from(balde).getPublicUrl(caminho).data.publicUrl;
}

/**
 * Sobe uma foto para o Storage e devolve a URL pública.
 *
 * Toda tela de campo faz a mesma coisa: pega o arquivo do `<input type=file>`,
 * monta um caminho com carimbo de hora para dois envios não se sobrescreverem,
 * e guarda a URL na linha. Estava copiado em quatro páginas.
 *
 * Fica fora dos componentes de propósito: `Date.now()` é impuro, e chamá-lo
 * dentro de um componente é justamente o que a regra de pureza do React proíbe.
 *
 * `null` quando não veio arquivo — a coluna aceita nulo, foto é opcional.
 */
export async function enviarFoto(
  supabase: SupabaseClient,
  balde: string,
  prefixo: string,
  arquivo: File | null | undefined,
): Promise<string | null> {
  if (!arquivo) return null;
  return subir(supabase, balde, `${prefixo}-${Date.now()}`, arquivo);
}

/**
 * Mesma coisa, para os `<input type=file multiple>` do checklist. O índice
 * entra no nome porque `Date.now()` é o mesmo para o lote inteiro — sem ele a
 * segunda foto sobrescreveria a primeira.
 *
 * Aceita `File[]` além de `FileList`: o `CampoFotos` do kit acumula as escolhas
 * numa lista própria, porque o input nativo substitui a seleção a cada vez.
 */
export async function enviarFotos(
  supabase: SupabaseClient,
  balde: string,
  prefixo: string,
  arquivos: FileList | File[] | null,
  aoEnviarCada?: () => void,
): Promise<string[]> {
  if (!arquivos || arquivos.length === 0) return [];
  const carimbo = Date.now();
  const urls: string[] = [];
  // Uma de cada vez, e não todas juntas: num 4G fraco, cinco envios simultâneos
  // disputam a mesma banda e caem os cinco. Em fila, cada um tem a linha
  // inteira e o técnico vê o contador andar.
  for (let i = 0; i < arquivos.length; i++) {
    urls.push(await subir(supabase, balde, `${prefixo}-${carimbo}-${i}`, arquivos[i]));
    aoEnviarCada?.();
  }
  return urls;
}
