// Quem entra no app: o papel, o usuário de login e a senha do primeiro acesso.
//
// Estas regras moravam dentro de `app/api/usuarios/route.ts`, onde a tela não
// alcançava. O resultado era que o gestor digitava o nome e só descobria o
// usuário depois de gravar — e usuário de login é coisa que a pessoa vai
// digitar todo dia e que ninguém troca depois. Agora as duas pontas usam a
// mesma função, e o que a tela mostra é o que o servidor grava.

/** O domínio interno de quem não tem e-mail de verdade. */
export const DOMINIO_INTERNO = "@frota.local";

/** Os quatro papéis, com o que cada um faz. A ajuda é o que o gestor lê para
 *  escolher — e escolher errado aqui abre ou fecha porta no sistema inteiro. */
export const PAPEIS: { valor: string; rotulo: string; ajuda: string }[] = [
  {
    valor: "TECNICO",
    rotulo: "Técnico",
    ajuda: "Lança roteiro, checklist e ocorrência. Vê só o que é dele.",
  },
  {
    valor: "GESTOR",
    rotulo: "Gestor",
    ajuda: "Painel completo, veículos, ocorrências e cadastro de acesso.",
  },
  {
    valor: "PCM",
    rotulo: "PCM",
    ajuda:
      "Manutenção, checklists, alertas e cadastro de veículo. Não lança roteiro nem mexe em quem entra no app.",
  },
  {
    valor: "PONTO",
    rotulo: "Ponto",
    ajuda: "Só lê o horário dos roteiros, em /ponto. Não escreve em nada.",
  },
];

/** Só os valores — é o que a rota confere antes de gravar. */
export const VALORES_DE_PAPEL = PAPEIS.map((p) => p.valor);

export function papelValido(valor: unknown): boolean {
  return typeof valor === "string" && VALORES_DE_PAPEL.includes(valor);
}

/**
 * "Márcia Souza" -> "marcia.souza".
 *
 * Sem acento e sem espaço porque é o que a pessoa vai digitar, muitas vezes num
 * teclado de celular no meio da rua. Dois nomes bastam: "José Carlos da Silva
 * Pereira" vira `jose.carlos`, que é curto o suficiente para alguém ditar no
 * telefone.
 */
export function sugerirUsuario(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(".");
}

/** "marcia.souza" -> "marcia.souza@frota.local". Quem já tem e-mail de verdade
 *  digita o e-mail inteiro e ele passa direto. */
export function paraEmail(usuario: string): string {
  const v = usuario.trim().toLowerCase();
  return v.includes("@") ? v : v.replace(/\s+/g, "") + DOMINIO_INTERNO;
}

/** "marcia.souza@frota.local" -> "marcia.souza". É o que a pessoa digita. */
export function soUsuario(email: string): string {
  return email.replace(new RegExp(DOMINIO_INTERNO.replace(".", "\\.") + "$", "i"), "");
}

/** "marcia.souza" -> "Marcia Souza". Chute de nome para o gestor corrigir, não
 *  para gravar às cegas: o nome é o que aparece em todo roteiro dela. */
export function chutarNome(email: string): string {
  return soUsuario(email)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** O mínimo que o Supabase aceita, e o que a tela cobra antes de enviar. */
export const SENHA_MINIMA = 8;

const CONSOANTES = "bdfgjklmnprstvz";
const VOGAIS = "aeiou";

/**
 * Uma senha de primeiro acesso: sílabas que dá para ditar no telefone, e três
 * dígitos no fim.
 *
 * Legível de propósito. A alternativa real não é uma senha forte — é o gestor
 * digitando "12345678" nas cinco pessoas, porque ele precisa repetir isso em
 * voz alta para cada uma. Sorteada com `crypto`, e não com `Math.random()`,
 * que é previsível.
 */
export function senhaSugerida(aleatorio: (n: number) => number[] = sorteioSeguro): string {
  const n = aleatorio(11);
  let silabas = "";
  for (let i = 0; i < 4; i++) {
    silabas += CONSOANTES[n[i * 2] % CONSOANTES.length] + VOGAIS[n[i * 2 + 1] % VOGAIS.length];
  }
  const digitos = [8, 9, 10].map((i) => n[i] % 10).join("");
  return `${silabas}-${digitos}`;
}

function sorteioSeguro(n: number): number[] {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf);
}
