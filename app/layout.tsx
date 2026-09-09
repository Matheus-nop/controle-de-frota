import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// A mesma família do app de Roteiros. Carregada pelo next/font: o arquivo vem
// do nosso domínio, sem pedido ao Google no navegador de quem usa.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--fonte-inter",
});

export const metadata: Metadata = {
  title: "Frota — Grupo Nova Opção",
  description: "Gestão de frota do Grupo Nova Opção para equipe de campo.",
  appleWebApp: { capable: true, title: "Frota", statusBarStyle: "black" },
  icons: { icon: "/icon192.png", apple: "/appleicon.png" },
  // Uso interno: nada daqui deve aparecer em busca.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#12365a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
