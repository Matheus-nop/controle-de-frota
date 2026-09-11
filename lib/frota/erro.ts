// O que a tela diz quando o envio falha.
//
// "Failed to fetch" foi o que o técnico viu no primeiro checklist guiado. É a
// frase que o navegador usa quando a requisição não chegou ao fim, e ela não
// diz nada para quem está em pé ao lado do veículo: não diz o que houve, não
// diz se o registro foi perdido, não diz o que fazer.
//
// Cada caso aqui é uma frase que responde as três coisas.

function texto(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const partes = [o.message, o.error, o.statusCode, o.code].filter((x) => typeof x === "string" || typeof x === "number");
    if (partes.length) return partes.join(" ");
  }
  return "";
}

/** Se a falha foi a conexão, e não o servidor dizendo não.
 *
 *  Cada navegador escreve isto com outras palavras — Chrome "Failed to fetch",
 *  Safari "Load failed", Firefox "NetworkError". Os três são a mesma coisa. */
export function falhaDeRede(err: unknown): boolean {
  return /failed to fetch|load failed|networkerror|network error|network request failed|err_network|timeout|aborted/i.test(
    texto(err),
  );
}

/** Se o servidor recusou por tamanho. */
function grandeDemais(err: unknown): boolean {
  const t = texto(err);
  return /413|payload too large|exceeded the maximum|too large|entity too large/i.test(t);
}

/**
 * A mensagem que vai para a tela.
 *
 * A parte que mais importa é "nada se perdeu": o formulário continua
 * preenchido, e quem acabou de responder trinta campos precisa saber disso
 * antes de decidir se recomeça.
 */
export function mensagemDeErro(err: unknown, oQue = "o envio"): string {
  if (falhaDeRede(err)) {
    // "de" + "o envio" é "do envio". Sem a contração sai "caiu no meio de o
    // envio", que é o tipo de frase que faz quem lê desconfiar do sistema
    // inteiro — ainda mais numa tela que acabou de dar erro.
    const doQue = oQue.replace(/^o /, "do ").replace(/^a /, "da ");
    return `A conexão caiu no meio ${doQue}. Nada do que você preencheu se perdeu — procure um lugar com sinal e toque em enviar de novo.`;
  }
  if (grandeDemais(err)) {
    return "Alguma foto ficou grande demais para o envio. Tire a foto de novo pelo próprio app e tente outra vez.";
  }
  const t = texto(err);
  if (/42501|row-level security|violates policy|not authorized/i.test(t)) {
    return "Seu acesso não permite esta ação. Fale com o gestor da frota.";
  }
  return t || "Não foi possível concluir. Tente de novo.";
}
