import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Minga",
    short_name: "Minga",
    description: "Tu Agente te presenta a quienes coinciden contigo cerca tuyo.",
    lang: "es-CL",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#E7E1D7",
    theme_color: "#E7E1D7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
