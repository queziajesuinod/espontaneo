import { useEffect, useMemo, useRef, useState } from "react";
import { acervoSchema, ROTULO_CATEGORIA, TINTA_CATEGORIA, type Acervo, type Pauta } from "@espontaneo/shared";
import { useSaco } from "./useSaco.ts";
import { useSessao } from "./useSessao.ts";
import { tocarSorteio, tocarInicio, tocarFim } from "./som.ts";

const giro = (amplitude: number) => `${(Math.random() * amplitude * 2 - amplitude).toFixed(2)}deg`;

/* nos últimos dez segundos o relógio colapsa num numeral só */
function Digitos({ restante, fim, rotuloFim }: { restante: number; fim: boolean; rotuloFim: string }) {
  if (fim) return <div className="digitos fim"><span>{rotuloFim}</span></div>;

  const s = Math.ceil(restante / 1000);
  if (restante <= 10_000) return <div className="digitos unico acabando"><span>{s}</span></div>;

  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <div className="digitos">
      {[mm[0], mm[1], ":", ss[0], ss[1]].map((ch, i) => (
        <span key={i} className={ch === ":" ? "sep" : undefined}>{ch}</span>
      ))}
    </div>
  );
}

export default function App() {
  const [acervo, setAcervo] = useState<Acervo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("tudo");
  const [girando, setGirando] = useState(false);
  const [previa, setPrevia] = useState<Pauta | null>(null);
  const [inclinacao, setInclinacao] = useState({ papel: "-.7deg", f1: "2.4deg", f2: "-3.1deg" });

  const pautas = useMemo(() => acervo?.pautas ?? [], [acervo]);
  const { atual, proxima } = useSaco(pautas, filtro);
  const sessao = useSessao({ aoIniciar: tocarInicio, aoTempoEsgotado: tocarFim });

  const giroRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrando = girando ? previa : atual; // durante a roleta, o papel pisca prévias

  const emCronometro = sessao.fase !== null;
  const acabou = sessao.fase === "fim-estudo" || sessao.fase === "fim-fala";

  useEffect(() => {
    fetch("/api/publico/acervo")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("acervo não publicado"))))
      .then((j) => setAcervo(acervoSchema.parse(j)))
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    document.body.classList.toggle("rodando", emCronometro);
    document.body.classList.toggle("invertido", emCronometro);
    document.body.classList.toggle("esgotado", acabou);
    document.body.classList.toggle("pausado", sessao.pausado);
  }, [emCronometro, acabou, sessao.pausado]);

  useEffect(() => {
    const risco = document.getElementById("risco");
    if (risco) risco.style.width = `${sessao.proporcao * 100}%`;
  }, [sessao.proporcao]);

  useEffect(() => {
    if (pautas.length && !atual) assentar();
  }, [pautas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (giroRef.current) clearTimeout(giroRef.current); }, []);

  /* pousa direto num sorteio: primeira carga e quem pediu menos movimento */
  function assentar() {
    proxima();
    setInclinacao({ papel: giro(1.2), f1: giro(2.6), f2: giro(4) });
  }

  /* roleta: pisca prévias aleatórias desacelerando, para curto mas randômico,
     e assenta no sorteio de verdade — o saco é quem decide onde para */
  function girar() {
    if (girando || !pautas.length) return;
    const elegiveis = filtro === "tudo" ? pautas : pautas.filter((p) => p.categoria === filtro);
    if (!elegiveis.length) return;

    tocarSorteio(); // o plic de tirar um papelzinho

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      assentar();
      return;
    }

    setGirando(true);
    const inicio = performance.now();
    const duracao = 700 + Math.random() * 800; // ~0,7s a ~1,5s
    let anterior: Pauta | null = null;

    const passo = () => {
      const t = (performance.now() - inicio) / duracao;
      if (t >= 1) {
        setGirando(false);
        setPrevia(null);
        assentar();
        return;
      }
      let p = elegiveis[Math.floor(Math.random() * elegiveis.length)];
      if (elegiveis.length > 1) {
        while (p === anterior) p = elegiveis[Math.floor(Math.random() * elegiveis.length)];
      }
      anterior = p;
      setPrevia(p);
      setInclinacao((i) => ({ ...i, papel: giro(1.6) }));
      giroRef.current = setTimeout(passo, 55 + 250 * t * t); // desacelera
    };
    passo();
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.code === "Space" && !emCronometro) { e.preventDefault(); girar(); }
      if (e.key === "Escape") sessao.sair();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const categorias = [{ id: "tudo", nome: "tudo" }, ...(acervo?.categorias ?? [])];
  const noFiltro = filtro === "tudo" ? pautas.length : pautas.filter((p) => p.categoria === filtro).length;

  return (
    <main className="app">
      <header className="marca">
        espont<span className="chapeu">â</span>neo
      </header>

      {!emCronometro && (
        <div className="palco">
          <nav className="categorias" aria-label="Categorias">
            {categorias.map((c) => (
              <button
                key={c.id}
                className="cat"
                aria-pressed={filtro === c.id}
                onClick={() => setFiltro(c.id)}
              >
                {ROTULO_CATEGORIA[c.id] ?? c.nome}
              </button>
            ))}
          </nav>

          <div className="mesa">
            <div className="carta">
              <div className="folha" style={{ transform: `rotate(${inclinacao.f2})` }} />
              <div className="folha" style={{ transform: `rotate(${inclinacao.f1})` }} />
              <article
                className={`papelzinho${girando ? " girando" : ""}`}
                aria-live={girando ? "off" : "polite"}
                style={{
                  transform: `rotate(${inclinacao.papel})`,
                  backgroundColor: mostrando ? TINTA_CATEGORIA[mostrando.categoria] : undefined,
                }}
              >
                {mostrando ? (
                  <>
                    <span className="fita fita--no" aria-hidden="true" />
                    <span className="fita fita--ne" aria-hidden="true" />
                    <span className="fita fita--so" aria-hidden="true" />
                    <span className="fita fita--se" aria-hidden="true" />
                    <div className="giro-conteudo" key={mostrando.codigo}>
                      {mostrando.referencia && <p className="ref">{mostrando.referencia}</p>}
                      <p className="prov">{mostrando.provocacao}</p>
                      <p className="cat-papel">{mostrando.tema}</p>
                    </div>
                  </>
                ) : (
                  <p className="vazio">{erro ? "Acervo ainda não publicado." : "Sorteia uma e vê no que dá."}</p>
                )}
              </article>
            </div>
          </div>

          <div className="acoes">
            <button className="btn" onClick={girar} disabled={!pautas.length || girando}>Sortear</button>
            <button className="btn vazado" disabled={!atual || girando} onClick={() => sessao.iniciar(10, "estudo")}>
              Estudar 10 min
            </button>
            <button className="btn vazado" disabled={!atual || girando} onClick={() => sessao.iniciar(1, "fala")}>
              Falar 1 min
            </button>
          </div>
          <p className="contagem">
            {noFiltro === 1 ? "1 pauta" : `${noFiltro} pautas`}
            <span className="contagem-sep"> · </span>
            <a className="contagem-link" href="/sugerir">sugira uma</a>
          </p>
        </div>
      )}

      {emCronometro && atual && (
        <section className={`cronometro fase-${sessao.fase ?? ""}`} aria-live="polite">
          <p className="fase">
            {acabou ? "" : sessao.fase === "estudo" ? "Estudando" : "Sua vez de falar"}
          </p>

          <div className="pauta-ativa">
            {atual.referencia && <p className="ref-t">{atual.referencia}</p>}
            <p className="prov-t">{atual.provocacao}</p>
          </div>

          <div
            className={`anel${acabou ? " anel--fim" : ""}${
              !acabou && sessao.restante <= 10_000 ? " anel--acabando" : ""
            }`}
          >
            <svg className="anel-svg" viewBox="0 0 100 100" aria-hidden="true">
              <circle className="anel-trilho" cx="50" cy="50" r="46" />
              <circle
                className="anel-progresso"
                cx="50"
                cy="50"
                r="46"
                style={{ strokeDasharray: 289.03, strokeDashoffset: 289.03 * (1 - sessao.proporcao) }}
              />
            </svg>
            <div className="anel-centro">
              <Digitos restante={sessao.restante} fim={acabou} rotuloFim={sessao.rotuloFim} />
            </div>
          </div>

          <div className="acoes">
            {sessao.fase === "estudo" && (
              <button className="btn" onClick={() => sessao.iniciar(1, "fala")}>Já estudei</button>
            )}
            {sessao.fase === "fala" && (
              <button className="btn" onClick={sessao.encerrarAntes}>Terminei</button>
            )}
            {sessao.fase === "fim-estudo" && (
              <button className="btn" onClick={() => sessao.iniciar(1, "fala")}>Falar 1 min</button>
            )}
            {sessao.fase === "fim-fala" && (
              <button className="btn" onClick={() => { sessao.sair(); girar(); }}>Sortear outra</button>
            )}

            {acabou ? (
              <button className="btn vazado" onClick={sessao.sair}>
                {sessao.fase === "fim-estudo" ? "Voltar" : "Fechar"}
              </button>
            ) : (
              <button className="btn vazado" onClick={sessao.pausado ? sessao.retomar : sessao.pausar}>
                {sessao.pausado ? "Continuar" : "Parar"}
              </button>
            )}

            {!acabou && <button className="btn texto" onClick={sessao.sair}>Sair</button>}
          </div>
        </section>
      )}
    </main>
  );
}
