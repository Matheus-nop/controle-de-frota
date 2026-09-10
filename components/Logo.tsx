/**
 * Identidade visual. São três peças, com papéis distintos — as mesmas do app de
 * Roteiros, para que os dois sistemas se leiam como uma família:
 *
 * - `Logo`    — a logomarca oficial do Grupo Nova Opção (PNG).
 * - `Simbolo` — o símbolo do produto: o veículo sobre a estrada. Vetorial,
 *               escala de 16px (favicon) a 128px (tela de login) sem borrar.
 * - `Marca`   — o conjunto que vai na barra superior: logomarca da empresa +
 *               divisória + nome do sistema. A empresa é a âncora; "Frota" é o
 *               nome do sistema, subordinado a ela.
 */

export function Logo({
  claro = false,
  altura = 30,
  className = "",
}: {
  claro?: boolean;
  altura?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={claro ? "/logowhite.png" : "/logo.png"}
      alt="Grupo Nova Opção"
      height={altura}
      style={{ height: altura, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}

/**
 * Símbolo do sistema: o veículo da frota sobre a estrada.
 *
 * É **o mesmo desenho do ícone do app** (`public/icone.svg` e os PNGs do
 * manifesto), e isso não é coincidência: no Roteiros o símbolo do topo e o
 * ícone da tela inicial são a mesma marca, e quem tem os dois instalados
 * reconhece cada um pelo ícone antes de ler o nome. Mudou aqui, tem que mudar
 * lá — o `docs/handoff.md` explica como os PNGs são gerados.
 *
 * O veículo é branco sobre o azul, como o cubo do Estoque; a estrada âmbar é o
 * que amarra no pin do Roteiros. Os três ícones do grupo não seguem um sistema
 * único — o Roteiros tem um motivo âmbar sólido, o Estoque um traço branco — e
 * este fica no meio de propósito, para não destoar de nenhum dos dois.
 *
 * O desenho encolheu (ocupa 330 de 512, contra os 400 de antes): em 32px o
 * veículo grande virava uma mancha branca sem forma reconhecível.
 */
export function Simbolo({ tamanho = 28, className = "" }: { tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="url(#simbolo-frota)" />
      <g transform="translate(1.599 -0.604) scale(0.9086)">
        {/* carroceria */}
        <path
          d="M4.5 11.5A1.5 1.5 0 0 1 6 10h9.5a1.5 1.5 0 0 1 1.5 1.5V13h3.9a1.5 1.5 0 0 1 1.24.66l2.1 3.1a1.5 1.5 0 0 1 .26.84V19a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-7.5Z"
          fill="#ffffff"
        />
        {/* janela da cabine */}
        <path d="M17 13h3.6l2.2 3.3H17V13Z" fill="#12365a" />
        {/* rodas */}
        <circle cx="10" cy="20.6" r="2.6" fill="#ffffff" />
        <circle cx="10" cy="20.6" r="1.15" fill="#0d2a47" />
        <circle cx="21.6" cy="20.6" r="2.6" fill="#ffffff" />
        <circle cx="21.6" cy="20.6" r="1.15" fill="#0d2a47" />
        {/* estrada */}
        <path
          d="M5 25.6h3.2M12 25.6h8M23.8 25.6h3.2"
          stroke="#f59e0b"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </g>
      <defs>
        <linearGradient id="simbolo-frota" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1f4f7f" />
          <stop offset="1" stopColor="#0d2a47" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Lockup da barra superior. Em telas estreitas some a logomarca da empresa e
 * fica só o símbolo + "Frota" — o suficiente para saber onde se está.
 */
export function Marca({ claro = true }: { claro?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Logo claro={claro} altura={26} className="hidden shrink-0 md:block" />
      <span className={`hidden h-7 w-px shrink-0 md:block ${claro ? "bg-white/25" : "bg-slate-300"}`} />
      <Simbolo tamanho={26} className="shrink-0 md:hidden" />
      <span className="flex flex-col items-start leading-none">
        <span
          className={`whitespace-nowrap text-[15px] font-bold tracking-tight ${claro ? "text-white" : "text-brand-800"}`}
        >
          Frota
        </span>
        <span
          className={`mt-[3px] hidden whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] sm:block ${
            claro ? "text-acento-400" : "text-acento-600"
          }`}
        >
          Veículos &amp; manutenção
        </span>
      </span>
    </span>
  );
}
