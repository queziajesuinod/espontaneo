import { useCallback, useEffect, useRef, useState } from "react";

export type Fase = null | "estudo" | "fala" | "fim-estudo" | "fim-fala";

type Opcoes = {
  aoIniciar?: (fase: "estudo" | "fala") => void;
  aoTempoEsgotado?: (fase: "estudo" | "fala") => void; // só quando o relógio zera sozinho
  aoContagem?: (segundos: number) => void; // 10, 9, ... 1 nos últimos dez segundos
};

/* Regras do design system que moram aqui:
   nada avança sozinho, parar é pausar, e o fim é um instante e não um contador. */
export function useSessao(opcoes: Opcoes = {}) {
  const opcoesRef = useRef(opcoes);
  opcoesRef.current = opcoes;
  const [fase, setFase] = useState<Fase>(null);
  const [restante, setRestante] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [rotuloFim, setRotuloFim] = useState("Deu o tempo");

  const fimEm = useRef(0);
  const total = useRef(1);
  const faseRef = useRef<Fase>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const ultimoSeg = useRef(Infinity); // último segundo já anunciado na contagem

  const parar = () => {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
  };

  const rodar = useCallback(() => {
    parar();
    const tick = () => {
      const resta = Math.max(0, fimEm.current - Date.now());
      setRestante(resta);
      if (resta > 0) {
        const seg = Math.ceil(resta / 1000);
        if (seg <= 10 && seg < ultimoSeg.current) {
          ultimoSeg.current = seg;
          opcoesRef.current.aoContagem?.(seg); // 10, 9, ... 1
        }
      }
      if (resta <= 0) {
        parar();
        const qual = faseRef.current === "estudo" ? "estudo" : "fala";
        setFase(qual === "estudo" ? "fim-estudo" : "fim-fala");
        setRotuloFim("Deu o tempo");
        opcoesRef.current.aoTempoEsgotado?.(qual);
      }
    };
    tick();
    relogio.current = setInterval(tick, 200);
  }, []);

  const iniciar = useCallback(
    (minutos: number, id: Exclude<Fase, null>) => {
      total.current = minutos * 60_000;
      fimEm.current = Date.now() + total.current;
      ultimoSeg.current = Infinity;
      faseRef.current = id;
      setFase(id);
      setPausado(false);
      setRestante(total.current);
      rodar();
      if (id === "estudo" || id === "fala") opcoesRef.current.aoIniciar?.(id);
    },
    [rodar],
  );

  const pausar = useCallback(() => {
    setRestante(Math.max(0, fimEm.current - Date.now()));
    setPausado(true);
    parar();
  }, []);

  const retomar = useCallback(() => {
    fimEm.current = Date.now() + restante;
    ultimoSeg.current = Infinity;
    setPausado(false);
    rodar();
  }, [restante, rodar]);

  const encerrarAntes = useCallback(() => {
    parar();
    setFase(faseRef.current === "estudo" ? "fim-estudo" : "fim-fala");
    setRotuloFim(faseRef.current === "estudo" ? "Fim do estudo" : "Fim da fala");
    setRestante(0);
  }, []);

  const sair = useCallback(() => {
    parar();
    faseRef.current = null;
    setFase(null);
    setPausado(false);
  }, []);

  useEffect(() => () => parar(), []);

  const proporcao = total.current ? restante / total.current : 0;
  return { fase, restante, proporcao, pausado, rotuloFim, iniciar, pausar, retomar, encerrarAntes, sair };
}
