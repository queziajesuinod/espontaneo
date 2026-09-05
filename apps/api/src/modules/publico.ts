import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { sugestaoPublicaSchema } from "@espontaneo/shared";
import { db } from "../db/index.ts";
import { env } from "../env.ts";
import { hashIp } from "../plugins/auth.ts";
import { assuntoSimilar } from "../lib/similaridade.ts";
import { referenciaValida } from "../lib/referencia.ts";

const TETO_HORA = 5;
const TETO_DIA = 20;

async function validarTurnstile(token: string | undefined, ip: string) {
  if (!env.turnstileSecret) return true; // desligado em desenvolvimento
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.turnstileSecret, response: token, remoteip: ip }),
  });
  const j = (await r.json()) as { success: boolean };
  return j.success === true;
}

export default async function publico(app: FastifyInstance) {
  /* o site não consulta o banco: lê o snapshot publicado */
  app.get("/api/publico/acervo", async (req, reply) => {
    const ultima = await db
      .selectFrom("publicacao")
      .select(["versao", "hash_conteudo"])
      .orderBy("versao", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!ultima) return reply.code(404).send({ erro: "nada publicado ainda" });

    const etag = `"${ultima.hash_conteudo.slice(0, 16)}"`;
    if (req.headers["if-none-match"] === etag) return reply.code(304).send();

    const corpo = await readFile(join(env.acervoDir, `acervo-v${ultima.versao}.json`), "utf8");
    return reply
      .header("etag", etag)
      .header("cache-control", "max-age=3600, stale-while-revalidate=86400")
      .type("application/json")
      .send(corpo);
  });

  app.get("/api/publico/temas", async () =>
    db
      .selectFrom("tema")
      .innerJoin("categoria", "categoria.id", "tema.categoria_id")
      .select(["tema.id", "tema.nome", "categoria.slug as categoria"])
      .where("tema.situacao", "=", "PUBLICADO")
      .where("categoria.ativa", "=", true)
      .orderBy("categoria.ordem")
      .orderBy("tema.nome")
      .execute(),
  );

  /* Cinco camadas. Toda saída é 201, inclusive quando descarta:
     resposta diferente para bot bloqueado vira oráculo. */
  app.post(
    "/api/publico/sugestoes",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const ok = reply.code(201).send({ ok: true });

      const corpo = sugestaoPublicaSchema.safeParse(req.body);
      if (!corpo.success) return ok;
      if (corpo.data.website) return ok;                       // 1. honeypot
      if (!(await validarTurnstile(corpo.data.token, req.ip))) return ok; // 2. turnstile

      const ipHash = hashIp(req.ip);                            // 3. teto por IP
      const { hora, dia } = await db
        .selectFrom("sugestao")
        .select([
          sql<number>`count(*) filter (where criado_em > now() - interval '1 hour')`.as("hora"),
          sql<number>`count(*) filter (where criado_em > now() - interval '1 day')`.as("dia"),
        ])
        .where("ip_hash", "=", ipHash)
        .executeTakeFirstOrThrow();
      if (Number(hora) >= TETO_HORA || Number(dia) >= TETO_DIA) return ok;

      if (corpo.data.referencia && !referenciaValida(corpo.data.referencia)) return ok; // 4.

      const similar = await assuntoSimilar(corpo.data.provocacao);                       // 5.

      await db
        .insertInto("sugestao")
        .values({
          tipo: corpo.data.tipo,
          origem: "PUBLICO",
          situacao: "PENDENTE",
          tema_id: corpo.data.temaId ?? null,
          categoria_id: corpo.data.categoriaId ?? null,
          referencia: corpo.data.referencia ?? null,
          titulo: corpo.data.titulo ?? null,
          provocacao: corpo.data.provocacao,
          autor_nome: corpo.data.autorNome ?? null,
          autor_contato: corpo.data.autorContato ?? null,
          ip_hash: ipHash,
          user_agent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
          assunto_similar_id: similar?.id ?? null,
          similaridade: similar?.s ?? null,
        })
        .execute();

      return ok;
    },
  );
}

export const hashJson = (s: string) => createHash("sha256").update(s).digest("hex");
