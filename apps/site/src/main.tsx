import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import Sugerir from "./Sugerir.tsx";
import "./estilos.css";

/* o painel puxa o Material UI; só carrega quando alguém abre /admin */
const PainelAdmin = lazy(() => import("./admin/PainelAdmin.tsx"));

/* rota sem biblioteca: /admin abre a curadoria, /sugerir o formulário público */
const caminho = window.location.pathname;
const tela = caminho.startsWith("/admin") ? (
  <Suspense fallback={null}>
    <PainelAdmin />
  </Suspense>
) : caminho.startsWith("/sugerir") ? (
  <Sugerir />
) : (
  <App />
);

createRoot(document.getElementById("raiz")!).render(<StrictMode>{tela}</StrictMode>);
