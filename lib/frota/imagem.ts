// Reduzir a foto ANTES de enviar.
//
// POR QUE ISTO EXISTE
//
// Foto de celular hoje sai com 4000 px de largura e 4 a 10 MB. A vistoria
// precisa mostrar um amassado na lataria — 1600 px resolvem isso com folga, e é
// o que a tela do gestor mostra de qualquer jeito.
//
// A conta que quebrou: o checklist guiado pede cinco fotos. Cinco fotos de
// 8 MB são 40 MB saindo de um celular, na rua, subindo pelo 4G. A conexão cai
// no meio e o navegador diz "Failed to fetch" — que não é erro do técnico nem
// do banco: é a foto grande demais para o caminho que ela tem que percorrer.
// Reduzidas, as mesmas cinco fotos somam algo perto de 1,5 MB.
//
// QUANDO NÃO MEXE
//
// Em tudo que não é imagem (a nota fiscal em PDF da manutenção), em GIF, e
// quando o resultado não ficaria menor que o original. Na dúvida, devolve o
// arquivo como veio: enviar a foto grande é ruim, não enviar foto nenhuma é
// pior.

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.72;
/** Abaixo disto não vale reprocessar: já cabe no envio. */
const JA_PEQUENA = 700 * 1024;

type Desenhavel = ImageBitmap | HTMLImageElement;

async function carregar(arquivo: File): Promise<Desenhavel> {
  // `from-image` respeita a orientação do EXIF. Sem isso a foto tirada em pé
  // chega deitada no histórico, que é como o celular grava de verdade.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    } catch {
      // Formato que o navegador não decodifica por aqui (HEIC em alguns
      // aparelhos): cai no caminho do `<img>`, que às vezes dá conta.
    }
  }
  const endereco = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((ok, falhou) => {
      img.onload = () => ok();
      img.onerror = () => falhou(new Error("não decodificou"));
      img.src = endereco;
    });
    return img;
  } finally {
    URL.revokeObjectURL(endereco);
  }
}

/** O mesmo nome, com a extensão do que realmente vai subir. */
function comExtensaoJpg(nome: string): string {
  const base = nome.replace(/\.[^.]+$/, "") || "foto";
  return `${base}.jpg`;
}

/**
 * A mesma foto, pequena o bastante para caber no envio.
 *
 * Nunca falha: qualquer tropeço devolve o arquivo original.
 */
export async function reduzirFoto(arquivo: File, ladoMaximo = LADO_MAXIMO): Promise<File> {
  if (typeof document === "undefined") return arquivo;
  if (!arquivo.type.startsWith("image/") || arquivo.type === "image/gif") return arquivo;
  if (arquivo.size <= JA_PEQUENA && arquivo.type === "image/jpeg") return arquivo;

  try {
    const fonte = await carregar(arquivo);
    const largura = "naturalWidth" in fonte ? fonte.naturalWidth : fonte.width;
    const altura = "naturalHeight" in fonte ? fonte.naturalHeight : fonte.height;
    if (!largura || !altura) return arquivo;

    const escala = Math.min(1, ladoMaximo / Math.max(largura, altura));
    const l = Math.max(1, Math.round(largura * escala));
    const a = Math.max(1, Math.round(altura * escala));

    const tela = document.createElement("canvas");
    tela.width = l;
    tela.height = a;
    const ctx = tela.getContext("2d");
    if (!ctx) return arquivo;
    ctx.drawImage(fonte, 0, 0, l, a);
    if ("close" in fonte) fonte.close();

    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/jpeg", QUALIDADE));
    if (!blob || blob.size >= arquivo.size) return arquivo;

    return new File([blob], comExtensaoJpg(arquivo.name), {
      type: "image/jpeg",
      lastModified: arquivo.lastModified,
    });
  } catch {
    return arquivo;
  }
}
