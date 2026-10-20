// Os dados da empresa que vão em todo papel da frota: o cabeçalho que se
// repete em cada folha e o rodapé.
//
// Num lugar só pelo motivo de sempre: o dia em que o telefone comercial mudar,
// muda uma vez. Espalhados por quatro folhas, mudam em três.
//
// São os MESMOS do app de Estoque (`lib/estoque/empresa.ts`), que os tirou de
// uma proposta emitida pelo Sisloc — o sistema fiscal da casa. Não foram
// digitados de memória: papel que sai da empresa com CNPJ errado é problema de
// verdade, não de layout. Se algum deles mudar, o lugar de conferir continua
// sendo o Sisloc, e muda nos dois apps.

export const EMPRESA = {
  razaoSocial: "NOVA OPÇÃO 2008 MÁQUINAS E SERVIÇOS LTDA",
  cnpj: "10.459.750/0001-80",
  endereco: "Est. Dep. Darcílio Ayres Raunhetti, 289 · Vila Operária",
  cidade: "Nova Iguaçu",
  uf: "RJ",
  telefones: ["(21) 3773-4358", "(21) 97879-4214"],
} as const;

/** As três linhas do canto direito do cabeçalho, embaixo da razão social. */
export const LINHAS_DO_CABECALHO: string[] = [
  `Grupo Nova Opção · CNPJ ${EMPRESA.cnpj}`,
  `${EMPRESA.endereco} · ${EMPRESA.cidade} (${EMPRESA.uf})`,
  EMPRESA.telefones.join(" · "),
];
