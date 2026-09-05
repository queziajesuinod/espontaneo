import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Acervo } from "@espontaneo/shared";
import { ROTULO_CATEGORIA } from "@espontaneo/shared";
import { db } from "../db/index.ts";
import { env } from "../env.ts";
import { exigirSessao } from "../plugins/auth.ts";
import { hashJson } from "./publico.ts";

export async function montarAcervo(versao: number): Promise<Acervo> {
  const linhas = await db
    .selectFrom("assunto")
    .innerJoin("tema", "tema.id", "assunto.tema_id")
    .innerJoin("categoria", "categoria.id", "tema.categoria_id")
    .select([
      "assunto.codigo",
      "assunto.referencia",
      "assunto.titulo",
      "assunto.provocacao",
      "assunto.tags",
      "assunto.nivel",
      "assunto.sazonal",
      "tema.nome as tema",
      "categoria.slug as categoria",
    ])
    .where("assunto.situacao", "=", "PUBLICADO")
    .where("tema.situacao", "=", "PUBLICADO")
    .where("categoria.ativa", "=", true)
    .orderBy("categoria.ordem")
    .orderBy("assunto.codigo")
    .execute();

  const categorias = [...new Set(linhas.map((l) => l.categoria))].map((id) => ({
    id,
    nome: ROTULO_CATEGORIA[id] ?? id,
  }));

  return { versao, geradoEm: new Date().toISOString(), categorias, pautas: linhas };
}

/* Regenera o snapshot do acervo. Idempotente: se nada mudou desde a última
   versão, não escreve arquivo nem cria versão. Chamada automaticamente
   depois de qualquer mudança que afete o que está publicado. */
export type ResultadoRegen =
  | { vazio: true }
  | { semMudanca: true; versao: number }
  | { versao: number; total: number };

export async function regenerarPublicacao(usuarioId: number | null = null): Promise<ResultadoRegen> {
  const ultima = await db
    .selectFrom("publicacao")
    .select(["versao", "hash_conteudo"])
    .orderBy("versao", "desc")
    .limit(1)
    .executeTakeFirst();

  const versao = (ultima?.versao ?? 0) + 1;
  const acervo = await montarAcervo(versao);
  if (!acervo.pautas.length) return { vazio: true };

  /* hash sem o carimbo de tempo, senão toda publicação parece diferente */
  const hash = hashJson(JSON.stringify({ ...acervo, geradoEm: null, versao: null }));
  if (ultima?.hash_conteudo === hash) return { semMudanca: true, versao: ultima.versao };

  await mkdir(env.acervoDir, { recursive: true });
  await writeFile(join(env.acervoDir, `acervo-v${versao}.json`), JSON.stringify(acervo), "utf8");

  await db
    .insertInto("publicacao")
    .values({
      versao,
      hash_conteudo: hash,
      total_assuntos: acervo.pautas.length,
      total_temas: new Set(acervo.pautas.map((p) => p.tema)).size,
      publicado_por: usuarioId,
    })
    .execute();

  return { versao, total: acervo.pautas.length };
}

export default async function publicacao(app: FastifyInstance) {
  app.post("/api/admin/publicacoes", { preHandler: exigirSessao }, async (req, reply) => {
    const r = await regenerarPublicacao(req.usuarioId ?? null);
    if ("vazio" in r) return reply.code(409).send({ erro: "nenhum assunto publicado" });
    return r;
  });
}
