import type { SupabaseClient } from "@supabase/supabase-js";

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
  const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase();
  const caminho = `${prefixo}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(balde).upload(caminho, arquivo);
  if (error) throw error;
  return supabase.storage.from(balde).getPublicUrl(caminho).data.publicUrl;
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
): Promise<string[]> {
  if (!arquivos || arquivos.length === 0) return [];
  const carimbo = Date.now();
  const urls: string[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const f = arquivos[i];
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const caminho = `${prefixo}-${carimbo}-${i}.${ext}`;
    const { error } = await supabase.storage.from(balde).upload(caminho, f, { upsert: false });
    if (error) throw error;
    urls.push(supabase.storage.from(balde).getPublicUrl(caminho).data.publicUrl);
  }
  return urls;
}
