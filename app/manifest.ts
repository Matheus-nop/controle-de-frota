import type { MetadataRoute } from "next";

/**
 * Manifesto do PWA de campo.
 *
 * `id` e `scope` são explícitos de propósito. O `id` é a identidade do app para
 * o navegador: sem ele o Chrome usa a `start_url`, e mudar a start_url um dia
 * faria o celular tratar isto como um app NOVO — o técnico ficaria com dois
 * ícones iguais na tela inicial e a instalação antiga órfã.
 *
 * Os ícones são o símbolo do sistema (o veículo sobre a estrada), o mesmo
 * desenho do `Simbolo` em `components/Logo.tsx`. Antes daqui saía a logomarca
 * do grupo encolhida: em 48px na tela inicial ela é uma mancha escura ilegível,
 * e ficava idêntica à de qualquer outro sistema do grupo. Ícone de app existe
 * para diferenciar à distância de um polegar, não para repetir a marca.
 *
 * O `maskable` é um arquivo separado, e tem que ser: o Android recorta o ícone
 * na forma do aparelho (círculo, quadrado, squircle), e só respeita o círculo
 * central de 80% do lado. Reaproveitar o ícone comum como maskable — que era o
 * que este manifesto fazia — corta as bordas do desenho.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Frota — Grupo Nova Opção",
    short_name: "Frota",
    description: "Gestão de frota do Grupo Nova Opção.",
    lang: "pt-BR",
    scope: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7fa",
    theme_color: "#12365a",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Atalhos do ícone (segurar o app na tela inicial): o que o técnico abre
    // no pátio, sem passar pelo painel.
    shortcuts: [
      { name: "Registrar saída", short_name: "Saída", url: "/roteiro/saida" },
      { name: "Registrar chegada", short_name: "Chegada", url: "/roteiro/chegada" },
      { name: "Checklist semanal", short_name: "Checklist", url: "/checklist" },
    ],
  };
}
