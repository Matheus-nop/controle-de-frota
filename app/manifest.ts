import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frota — Grupo Nova Opção",
    short_name: "Frota",
    description: "Gestão de frota do Grupo Nova Opção.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7fa",
    theme_color: "#12365a",
    icons: [
      { src: "/icon192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
