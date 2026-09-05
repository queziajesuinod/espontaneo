import { useCallback, useRef, useState } from "react";
import type { Pauta } from "@espontaneo/shared";

/* saco embaralhado: sorteio aleatório puro repete e mata a sensação de acervo */
function embaralhar<T>(itens: T[]): T[] {
  const s = [...itens];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

export function useSaco(pautas: Pauta[], filtro: string) {
  const saco = useRef<Pauta[]>([]);
  const filtroDoSaco = useRef<string | null>(null);
  const [atual, setAtual] = useState<Pauta | null>(null);

  const proxima = useCallback(() => {
    const elegiveis = filtro === "tudo" ? pautas : pautas.filter((p) => p.categoria === filtro);
    if (!elegiveis.length) return null;

    if (!saco.current.length || filtroDoSaco.current !== filtro) {
      saco.current = embaralhar(elegiveis);
      filtroDoSaco.current = filtro;
      const topo = saco.current[saco.current.length - 1];
      if (atual && saco.current.length > 1 && topo.codigo === atual.codigo) {
        const n = saco.current.length;
        [saco.current[n - 1], saco.current[n - 2]] = [saco.current[n - 2], saco.current[n - 1]];
      }
    }
    const p = saco.current.pop()!;
    setAtual(p);
    return p;
  }, [pautas, filtro, atual]);

  return { atual, proxima };
}
