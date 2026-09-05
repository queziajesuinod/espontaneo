import type {
  CriacaoTema,
  CriacaoUsuario,
  EdicaoAssunto,
  EdicaoAssuntoParcial,
  EdicaoTema,
} from "@espontaneo/shared";

/* o painel fala só com /api/admin (e lê /api/publico/temas para o form).
   O cookie de sessão vai junto; um 401 sobe como ErroApi.status = 401. */

export class ErroApi extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const temCorpo = typeof init?.body === "string";
  const r = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...(temCorpo ? { "content-type": "application/json" } : {}), ...init?.headers },
  });

  if (!r.ok) {
    let mensagem = `erro ${r.status}`;
    try {
      const j = (await r.json()) as { erro?: string };
      if (j?.erro) mensagem = j.erro;
    } catch {
      /* corpo vazio ou não-JSON */
    }
    throw new ErroApi(r.status, mensagem);
  }

  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export type Origem = "PUBLICO" | "IA" | "ADMIN";

export type Sugestao = {
  id: number;
  tipo: "TEMA" | "ASSUNTO";
  origem: Origem;
  situacao: string;
  tema_id: number | null;
  referencia: string | null;
  titulo: string | null;
  provocacao: string;
  autor_nome: string | null;
  similaridade: number | string | null;
  criado_em: string;
  similarProvocacao: string | null;
  similarReferencia: string | null;
};

export type Tema = { id: number; nome: string; categoria: string };

export type Categoria = { id: number; slug: string; nome: string; ordem: number; ativa: boolean };

export type AssuntoAdmin = {
  id: number;
  codigo: string;
  titulo: string;
  provocacao: string;
  situacao: string;
  origem: Origem;
  criado_em: string;
  tema_id: number;
  tema: string;
  categoria_id: number;
  categoria: string;
};

export type TemaAdmin = {
  id: number;
  nome: string;
  situacao: string;
  categoria_id: number;
  categoria: string;
  categoriaSlug: string;
  assuntos: number | string;
};

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  papel: "ADMIN" | "CURADOR";
  ativo: boolean;
  ultimo_login_em: string | null;
};

export type Metricas = {
  fila: { origem: string; total: number | string }[];
  acervo: { situacao: string; total: number | string }[];
};

export type ResultadoPublicacao =
  | { versao: number; total: number }
  | { semMudanca: true; versao: number };

/* o Postgres serializa bigint como string; aqui os ids voltam a ser number,
   senão selects, cascatas e payloads quebram (categoriaId "1" ≠ 1) */
function numerar<T extends Record<string, unknown>>(o: T, campos: (keyof T)[]): T {
  const c = { ...o } as Record<keyof T, unknown>;
  for (const f of campos) if (c[f] != null) c[f] = Number(c[f]);
  return c as T;
}

export const api = {
  entrar: (email: string, senha: string) =>
    pedir<{ nome: string; papel: string }>("/api/admin/sessao", {
      method: "POST",
      body: JSON.stringify({ email, senha }),
    }),

  sair: () => pedir<{ ok: true }>("/api/admin/sessao", { method: "DELETE" }),

  metricas: () => pedir<Metricas>("/api/admin/metricas"),

  eu: () => pedir<{ id: number; nome: string; papel: "ADMIN" | "CURADOR" }>("/api/admin/eu"),

  usuarios: () => pedir<Usuario[]>("/api/admin/usuarios").then((l) => l.map((u) => numerar(u, ["id"]))),

  criarUsuario: (dados: CriacaoUsuario) =>
    pedir<{ id: number; nome: string; papel: string }>("/api/admin/usuarios", {
      method: "POST",
      body: JSON.stringify(dados),
    }),

  atualizarUsuario: (id: number, ativo: boolean) =>
    pedir<{ ok: true }>(`/api/admin/usuarios/${id}`, { method: "PATCH", body: JSON.stringify({ ativo }) }),

  temas: () => pedir<Tema[]>("/api/publico/temas").then((l) => l.map((t) => numerar(t, ["id"]))),

  categorias: () =>
    pedir<Categoria[]>("/api/admin/categorias").then((l) => l.map((c) => numerar(c, ["id", "ordem"]))),

  criarCategoria: (nome: string) =>
    pedir<{ categoriaId: number; slug: string }>("/api/admin/categorias", {
      method: "POST",
      body: JSON.stringify({ nome }),
    }),

  atualizarCategoria: (id: number, mudanca: { ativa?: boolean; nome?: string; ordem?: number }) =>
    pedir<{ ok: true }>(`/api/admin/categorias/${id}`, {
      method: "PATCH",
      body: JSON.stringify(mudanca),
    }),

  deletarCategoria: (id: number) =>
    pedir<{ temas: number; assuntos: number }>(`/api/admin/categorias/${id}`, {
      method: "DELETE",
    }),

  criarTema: (dados: CriacaoTema) =>
    pedir<{ temaId: number; slug: string }>("/api/admin/temas", {
      method: "POST",
      body: JSON.stringify(dados),
    }),

  criarAssunto: (edicao: EdicaoAssunto) =>
    pedir<{ assuntoId: number; codigo: string }>("/api/admin/assuntos", {
      method: "POST",
      body: JSON.stringify(edicao),
    }),

  sugestoes: (situacao: string, origem: string, pagina = 1) => {
    const q = new URLSearchParams({ situacao, pagina: String(pagina) });
    if (origem) q.set("origem", origem);
    return pedir<Sugestao[]>(`/api/admin/sugestoes?${q}`).then((l) => l.map((s) => numerar(s, ["id", "tema_id"])));
  },

  aprovar: (id: number, edicao: EdicaoAssunto) =>
    pedir<{ assuntoId: number }>(`/api/admin/sugestoes/${id}/aprovar`, {
      method: "POST",
      body: JSON.stringify(edicao),
    }),

  reprovar: (id: number, motivo: string, nota?: string) =>
    pedir<{ ok: true }>(`/api/admin/sugestoes/${id}/reprovar`, {
      method: "POST",
      body: JSON.stringify({ motivo, nota }),
    }),

  assuntos: (filtros: { situacao?: string; temaId?: number; categoriaId?: number } = {}) => {
    const q = new URLSearchParams();
    if (filtros.situacao) q.set("situacao", filtros.situacao);
    if (filtros.temaId) q.set("temaId", String(filtros.temaId));
    if (filtros.categoriaId) q.set("categoriaId", String(filtros.categoriaId));
    const qs = q.toString();
    return pedir<AssuntoAdmin[]>(`/api/admin/assuntos${qs ? `?${qs}` : ""}`).then((l) =>
      l.map((a) => numerar(a, ["id", "tema_id", "categoria_id"])),
    );
  },

  editarAssunto: (id: number, mudanca: EdicaoAssuntoParcial) =>
    pedir<{ ok: true }>(`/api/admin/assuntos/${id}`, { method: "PATCH", body: JSON.stringify(mudanca) }),

  deletarAssunto: (id: number) =>
    pedir<{ ok: true }>(`/api/admin/assuntos/${id}`, { method: "DELETE" }),

  moverTema: (ids: number[], temaId: number) =>
    pedir<{ movidos: number }>("/api/admin/assuntos/mover-tema", {
      method: "POST",
      body: JSON.stringify({ ids, temaId }),
    }),

  temasAdmin: () =>
    pedir<TemaAdmin[]>("/api/admin/temas").then((l) => l.map((t) => numerar(t, ["id", "categoria_id"]))),

  editarTema: (id: number, mudanca: EdicaoTema) =>
    pedir<{ ok: true }>(`/api/admin/temas/${id}`, { method: "PATCH", body: JSON.stringify(mudanca) }),

  deletarTema: (id: number) =>
    pedir<{ assuntos: number }>(`/api/admin/temas/${id}`, { method: "DELETE" }),

  publicarAssuntos: (ids: number[]) =>
    pedir<{ publicados: number }>("/api/admin/assuntos/publicar", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  gerarPublicacao: () =>
    pedir<ResultadoPublicacao>("/api/admin/publicacoes", { method: "POST" }),
};
