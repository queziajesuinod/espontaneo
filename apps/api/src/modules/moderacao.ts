import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  criacaoTemaSchema,
  edicaoAssuntoSchema,
  edicaoAssuntoParcialSchema,
  edicaoTemaSchema,
  MOTIVOS_REPROVACAO,
} from "@espontaneo/shared";
import { db } from "../db/index.ts";
import { exigirSessao } from "../plugins/auth.ts";
import { auditar } from "../lib/auditoria.ts";
import { normalizar } from "../lib/referencia.ts";
import { regenerarPublicacao } from "./publicacao.ts";

const PREFIXO: Record<string, string> = {
  evangelhos: "ev", salmos: "sl", cartas: "ct", "antigo-testamento": "at",
  doutrina: "dt", "vida-crista": "vc", juventude: "jv",
};

export const hashConteudo = (referencia: string, provocacao: string) =>
  createHash("md5").update(normalizar(referencia) + "|" + normalizar(provocacao)).digest("hex");

const slugificar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const filtroSchema = z.object({
  situacao: z.string().default("PENDENTE"),
  origem: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});

export default async function moderacao(app: FastifyInstance) {
  app.addHook("preHandler", exigirSessao);

  /* o site vive de snapshot: toda mudança que mexe no que está publicado
     regenera o acervo na hora, sem gesto manual. Idempotente e tolerante. */
  const sincronizar = (usuarioId: number | null) =>
    regenerarPublicacao(usuarioId).catch((e) => app.log.error(e, "falha ao regenerar snapshot"));

  /* fila: humano antes de máquina, gente esperando resposta vem primeiro */
  app.get("/api/admin/sugestoes", async (req) => {
    const f = filtroSchema.parse(req.query);
    const tamanho = 30;

    let q = db
      .selectFrom("sugestao")
      .leftJoin("assunto as similar", "similar.id", "sugestao.assunto_similar_id")
      .select([
        "sugestao.id", "sugestao.tipo", "sugestao.origem", "sugestao.situacao",
        "sugestao.tema_id", "sugestao.referencia", "sugestao.titulo",
        "sugestao.provocacao", "sugestao.autor_nome", "sugestao.similaridade",
        "sugestao.criado_em",
        "similar.provocacao as similarProvocacao",
        "similar.referencia as similarReferencia",
      ])
      .where("sugestao.situacao", "=", f.situacao as never)
      .orderBy((eb) => eb.case().when("sugestao.origem", "=", "IA").then(1).else(0).end())
      .orderBy("sugestao.criado_em")
      .limit(tamanho)
      .offset((f.pagina - 1) * tamanho);

    if (f.origem) q = q.where("sugestao.origem", "=", f.origem as never);
    return q.execute();
  });

  /* aprovar materializa o assunto em RASCUNHO: aprovar não é publicar */
  app.post("/api/admin/sugestoes/:id/aprovar", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const edicao = edicaoAssuntoSchema.parse(req.body);
    const usuarioId = req.usuarioId!;

    try {
      const assuntoId = await db.transaction().execute(async (trx) => {
        const s = await trx
          .selectFrom("sugestao")
          .selectAll()
          .where("id", "=", id)
          .where("situacao", "=", "PENDENTE")
          .forUpdate()                       // dois curadores, um clique cada, um assunto só
          .executeTakeFirst();
        if (!s) throw new Error("JA_MODERADA");

        const tema = await trx
          .selectFrom("tema")
          .innerJoin("categoria", "categoria.id", "tema.categoria_id")
          .select(["tema.id", "categoria.slug"])
          .where("tema.id", "=", edicao.temaId)
          .executeTakeFirstOrThrow();

        const prefixo = PREFIXO[tema.slug] ?? tema.slug.slice(0, 2);
        const { proximo } = await trx
          .selectFrom("assunto")
          .select((eb) => eb.fn.countAll<number>().as("proximo"))
          .where("codigo", "like", `${prefixo}-%`)
          .executeTakeFirstOrThrow();
        const codigo = `${prefixo}-${String(Number(proximo) + 1).padStart(3, "0")}`;

        const criado = await trx
          .insertInto("assunto")
          .values({
            codigo,
            tema_id: edicao.temaId,
            referencia: "",
            titulo: edicao.titulo,
            provocacao: edicao.provocacao,
            tags: [],
            nivel: 1,
            sazonal: null,
            situacao: "RASCUNHO",
            hash_conteudo: hashConteudo("", edicao.provocacao),
            origem: s.origem === "IA" ? "IA" : s.origem === "PUBLICO" ? "PUBLICO" : "ADMIN",
            sugestao_id: s.id,
            criado_por: usuarioId,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        await trx
          .updateTable("sugestao")
          .set({
            situacao: "APROVADA",
            moderado_por: usuarioId,
            moderado_em: new Date(),
            assunto_gerado_id: criado.id,
          })
          .where("id", "=", id)
          .execute();

        await auditar(trx, usuarioId, "assunto", criado.id, "APROVAR", s, edicao);
        return criado.id;
      });

      return { assuntoId };
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "JA_MODERADA") return reply.code(409).send({ erro: "sugestão já moderada" });
      if (msg.includes("ux_assunto_hash")) return reply.code(409).send({ erro: "assunto duplicado" });
      throw e;
    }
  });

  app.post("/api/admin/sugestoes/:id/reprovar", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const corpo = z
      .object({ motivo: z.enum(MOTIVOS_REPROVACAO), nota: z.string().max(500).optional() })
      .parse(req.body);

    const r = await db
      .updateTable("sugestao")
      .set({
        situacao: "REPROVADA",
        motivo_reprovacao: corpo.motivo,
        nota_moderacao: corpo.nota ?? null,
        moderado_por: req.usuarioId!,
        moderado_em: new Date(),
      })
      .where("id", "=", id)
      .where("situacao", "=", "PENDENTE")
      .executeTakeFirst();

    if (!Number(r.numUpdatedRows)) return reply.code(409).send({ erro: "sugestão já moderada" });
    return { ok: true };
  });

  /* listagem de assuntos, com filtros de situação, tema e categoria */
  app.get("/api/admin/assuntos", async (req) => {
    const f = z
      .object({
        situacao: z.string().optional(),
        temaId: z.coerce.number().int().optional(),
        categoriaId: z.coerce.number().int().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const tamanho = 100;

    let q = db
      .selectFrom("assunto")
      .innerJoin("tema", "tema.id", "assunto.tema_id")
      .innerJoin("categoria", "categoria.id", "tema.categoria_id")
      .select([
        "assunto.id", "assunto.codigo", "assunto.titulo", "assunto.provocacao",
        "assunto.situacao", "assunto.origem", "assunto.criado_em",
        "assunto.tema_id", "tema.nome as tema",
        "categoria.id as categoria_id", "categoria.slug as categoria",
      ])
      .orderBy("assunto.criado_em", "desc")
      .limit(tamanho)
      .offset((f.pagina - 1) * tamanho);

    if (f.situacao) q = q.where("assunto.situacao", "=", f.situacao as never);
    if (f.temaId) q = q.where("assunto.tema_id", "=", f.temaId);
    if (f.categoriaId) q = q.where("tema.categoria_id", "=", f.categoriaId);
    return q.execute();
  });

  /* editar assunto (título/provocação/tema) ou mudar a situação */
  app.patch("/api/admin/assuntos/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const dados = edicaoAssuntoParcialSchema.parse(req.body);
    const usuarioId = req.usuarioId!;

    const atual = await db
      .selectFrom("assunto")
      .select(["id", "provocacao", "situacao"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!atual) return reply.code(404).send({ erro: "assunto não encontrado" });

    const mudanca: Record<string, unknown> = { atualizado_em: new Date() };
    if (dados.titulo !== undefined) mudanca.titulo = dados.titulo;
    if (dados.temaId !== undefined) mudanca.tema_id = dados.temaId;
    if (dados.provocacao !== undefined) {
      mudanca.provocacao = dados.provocacao;
      mudanca.hash_conteudo = hashConteudo("", dados.provocacao);
    }
    if (dados.situacao !== undefined) {
      mudanca.situacao = dados.situacao;
      if (dados.situacao === "PUBLICADO") mudanca.publicado_em = new Date();
    }

    try {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable("assunto").set(mudanca).where("id", "=", id).execute();
        await auditar(trx, usuarioId, "assunto", id, "EDITAR", atual, dados);
      });
      await sincronizar(usuarioId);
      return { ok: true };
    } catch (e) {
      if ((e as Error).message.includes("ux_assunto_hash")) {
        return reply.code(409).send({ erro: "já existe um assunto com essa provocação" });
      }
      throw e;
    }
  });

  /* excluir assunto: solta as referências das sugestões antes */
  app.delete("/api/admin/assuntos/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const del = await db.transaction().execute(async (trx) => {
      await trx.updateTable("sugestao").set({ assunto_similar_id: null }).where("assunto_similar_id", "=", id).execute();
      await trx.updateTable("sugestao").set({ assunto_gerado_id: null }).where("assunto_gerado_id", "=", id).execute();
      return trx.deleteFrom("assunto").where("id", "=", id).executeTakeFirst();
    });
    if (!Number(del.numDeletedRows)) return reply.code(404).send({ erro: "assunto não encontrado" });
    await sincronizar(req.usuarioId ?? null);
    return { ok: true };
  });

  /* publicar é um segundo gesto, e em lote */
  app.post("/api/admin/assuntos/publicar", async (req) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).min(1).max(200) }).parse(req.body);
    const r = await db
      .updateTable("assunto")
      .set({ situacao: "PUBLICADO", publicado_em: new Date() })
      .where("id", "in", ids)
      .where("situacao", "=", "RASCUNHO")
      .executeTakeFirst();
    await sincronizar(req.usuarioId ?? null);
    return { publicados: Number(r.numUpdatedRows) };
  });

  /* mudar o tema de vários assuntos de uma vez */
  app.post("/api/admin/assuntos/mover-tema", async (req, reply) => {
    const { ids, temaId } = z
      .object({ ids: z.array(z.number().int()).min(1).max(500), temaId: z.number().int().positive() })
      .parse(req.body);

    const tema = await db.selectFrom("tema").select("id").where("id", "=", temaId).executeTakeFirst();
    if (!tema) return reply.code(400).send({ erro: "tema inexistente" });

    const mudanca: Record<string, unknown> = { tema_id: temaId, atualizado_em: new Date() };
    const r = await db.updateTable("assunto").set(mudanca).where("id", "in", ids).executeTakeFirst();
    await sincronizar(req.usuarioId ?? null);
    return { movidos: Number(r.numUpdatedRows) };
  });

  /* todas as categorias (inclusive inativas) para gerir e alimentar os forms */
  app.get("/api/admin/categorias", async () =>
    db
      .selectFrom("categoria")
      .select(["id", "slug", "nome", "ordem", "ativa"])
      .orderBy("ordem")
      .orderBy("nome")
      .execute(),
  );

  /* criar categoria */
  app.post("/api/admin/categorias", async (req, reply) => {
    const dados = z
      .object({ nome: z.string().trim().min(2).max(80), ordem: z.number().int().optional() })
      .parse(req.body);

    const base = slugificar(dados.nome) || "categoria";
    let slug = base;
    for (let i = 2; ; i++) {
      const existe = await db.selectFrom("categoria").select("id").where("slug", "=", slug).executeTakeFirst();
      if (!existe) break;
      slug = `${base}-${i}`;
    }

    const { ordem } =
      dados.ordem != null
        ? { ordem: dados.ordem }
        : await db
            .selectFrom("categoria")
            .select((eb) => eb.fn.coalesce(eb.fn.max("ordem"), eb.lit(-1)).as("ordem"))
            .executeTakeFirstOrThrow()
            .then((r) => ({ ordem: Number(r.ordem) + 1 }));

    const criada = await db
      .insertInto("categoria")
      .values({ slug, nome: dados.nome, ordem, ativa: true })
      .returning(["id", "slug"])
      .executeTakeFirstOrThrow();

    return { categoriaId: criada.id, slug: criada.slug };
  });

  /* editar categoria: renomear, reordenar ou (des)ativar por um tempo */
  app.patch("/api/admin/categorias/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const dados = z
      .object({
        ativa: z.boolean().optional(),
        nome: z.string().trim().min(2).max(80).optional(),
        ordem: z.number().int().optional(),
      })
      .parse(req.body);

    if (dados.ativa === undefined && dados.nome === undefined && dados.ordem === undefined) {
      return reply.code(400).send({ erro: "nada para mudar" });
    }

    const r = await db
      .updateTable("categoria")
      .set({
        ...(dados.ativa !== undefined ? { ativa: dados.ativa } : {}),
        ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
        ...(dados.ordem !== undefined ? { ordem: dados.ordem } : {}),
      })
      .where("id", "=", id)
      .executeTakeFirst();

    if (!Number(r.numUpdatedRows)) return reply.code(404).send({ erro: "categoria não encontrada" });
    await sincronizar(req.usuarioId ?? null);
    return { ok: true };
  });

  /* deletar categoria: leva junto todos os temas e assuntos dela.
     Solta as referências das sugestões antes, para os FKs não travarem. */
  app.delete("/api/admin/categorias/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const usuarioId = req.usuarioId!;

    try {
    const resultado = await db.transaction().execute(async (trx) => {
      const temas = await trx.selectFrom("tema").select("id").where("categoria_id", "=", id).execute();
      const temaIds = temas.map((t) => t.id);

      let assuntoIds: number[] = [];
      if (temaIds.length) {
        const assuntos = await trx.selectFrom("assunto").select("id").where("tema_id", "in", temaIds).execute();
        assuntoIds = assuntos.map((a) => a.id);
      }

      if (assuntoIds.length) {
        await trx
          .updateTable("sugestao")
          .set({ assunto_similar_id: null })
          .where("assunto_similar_id", "in", assuntoIds)
          .execute();
        await trx
          .updateTable("sugestao")
          .set({ assunto_gerado_id: null })
          .where("assunto_gerado_id", "in", assuntoIds)
          .execute();
        await trx.deleteFrom("assunto").where("id", "in", assuntoIds).execute();
      }

      if (temaIds.length) {
        await trx.updateTable("sugestao").set({ tema_id: null }).where("tema_id", "in", temaIds).execute();
        await trx
          .updateTable("sugestao")
          .set({ tema_gerado_id: null })
          .where("tema_gerado_id", "in", temaIds)
          .execute();
        await trx.deleteFrom("tema").where("id", "in", temaIds).execute();
      }

      await trx.updateTable("sugestao").set({ categoria_id: null }).where("categoria_id", "=", id).execute();

      const del = await trx.deleteFrom("categoria").where("id", "=", id).executeTakeFirst();
      if (!Number(del.numDeletedRows)) throw new Error("NAO_ENCONTRADA");

      await auditar(trx, usuarioId, "categoria", id, "DELETAR", { temas: temaIds.length, assuntos: assuntoIds.length }, null);
      return { temas: temaIds.length, assuntos: assuntoIds.length };
    });

      await sincronizar(req.usuarioId ?? null);
      return resultado;
    } catch (e) {
      if ((e as Error).message === "NAO_ENCONTRADA") {
        return reply.code(404).send({ erro: "categoria não encontrada" });
      }
      throw e;
    }
  });

  /* criar tema à mão: já nasce publicado para servir de agrupador */
  app.post("/api/admin/temas", async (req, reply) => {
    const dados = criacaoTemaSchema.parse(req.body);
    const usuarioId = req.usuarioId!;

    const cat = await db
      .selectFrom("categoria")
      .select("id")
      .where("id", "=", dados.categoriaId)
      .executeTakeFirst();
    if (!cat) return reply.code(400).send({ erro: "categoria inexistente" });

    /* slug único: parte do nome e desempata com sufixo */
    const base = slugificar(dados.nome) || "tema";
    let slug = base;
    for (let i = 2; ; i++) {
      const existe = await db.selectFrom("tema").select("id").where("slug", "=", slug).executeTakeFirst();
      if (!existe) break;
      slug = `${base}-${i}`;
    }

    const criado = await db
      .insertInto("tema")
      .values({
        categoria_id: dados.categoriaId,
        slug,
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        instrucao_extra: null,
        situacao: "PUBLICADO",
        criado_por: usuarioId,
      })
      .returning(["id", "slug"])
      .executeTakeFirstOrThrow();

    return { temaId: criado.id, slug: criado.slug };
  });

  /* listagem de temas com a categoria e a contagem de assuntos */
  app.get("/api/admin/temas", async () =>
    db
      .selectFrom("tema")
      .innerJoin("categoria", "categoria.id", "tema.categoria_id")
      .leftJoin("assunto", "assunto.tema_id", "tema.id")
      .select([
        "tema.id", "tema.nome", "tema.situacao",
        "tema.categoria_id", "categoria.nome as categoria", "categoria.slug as categoriaSlug",
        (eb) => eb.fn.count("assunto.id").as("assuntos"),
      ])
      .groupBy(["tema.id", "categoria.id"])
      .orderBy("categoria.ordem")
      .orderBy("tema.nome")
      .execute(),
  );

  /* editar tema (nome/categoria) ou (des)ativar */
  app.patch("/api/admin/temas/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const dados = edicaoTemaSchema.parse(req.body);

    if (dados.nome === undefined && dados.categoriaId === undefined && dados.situacao === undefined) {
      return reply.code(400).send({ erro: "nada para mudar" });
    }

    const mudanca: Record<string, unknown> = { atualizado_em: new Date() };
    if (dados.nome !== undefined) mudanca.nome = dados.nome;
    if (dados.categoriaId !== undefined) mudanca.categoria_id = dados.categoriaId;
    if (dados.situacao !== undefined) mudanca.situacao = dados.situacao;

    const r = await db.updateTable("tema").set(mudanca).where("id", "=", id).executeTakeFirst();

    if (!Number(r.numUpdatedRows)) return reply.code(404).send({ erro: "tema não encontrado" });
    await sincronizar(req.usuarioId ?? null);
    return { ok: true };
  });

  /* excluir tema: leva junto os assuntos dele */
  app.delete("/api/admin/temas/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const usuarioId = req.usuarioId!;

    const resultado = await db.transaction().execute(async (trx) => {
      const assuntos = await trx.selectFrom("assunto").select("id").where("tema_id", "=", id).execute();
      const assuntoIds = assuntos.map((a) => a.id);

      if (assuntoIds.length) {
        await trx.updateTable("sugestao").set({ assunto_similar_id: null }).where("assunto_similar_id", "in", assuntoIds).execute();
        await trx.updateTable("sugestao").set({ assunto_gerado_id: null }).where("assunto_gerado_id", "in", assuntoIds).execute();
        await trx.deleteFrom("assunto").where("id", "in", assuntoIds).execute();
      }
      await trx.updateTable("sugestao").set({ tema_id: null }).where("tema_id", "=", id).execute();
      await trx.updateTable("sugestao").set({ tema_gerado_id: null }).where("tema_gerado_id", "=", id).execute();

      const del = await trx.deleteFrom("tema").where("id", "=", id).executeTakeFirst();
      if (!Number(del.numDeletedRows)) return null;

      await auditar(trx, usuarioId, "tema", id, "DELETAR", { assuntos: assuntoIds.length }, null);
      return { assuntos: assuntoIds.length };
    });

    if (!resultado) return reply.code(404).send({ erro: "tema não encontrado" });
    await sincronizar(req.usuarioId ?? null);
    return resultado;
  });

  /* criar assunto à mão: materializa direto em rascunho, sem sugestão */
  app.post("/api/admin/assuntos", async (req, reply) => {
    const edicao = edicaoAssuntoSchema.parse(req.body);
    const usuarioId = req.usuarioId!;

    try {
      const criado = await db.transaction().execute(async (trx) => {
        const tema = await trx
          .selectFrom("tema")
          .innerJoin("categoria", "categoria.id", "tema.categoria_id")
          .select(["categoria.slug"])
          .where("tema.id", "=", edicao.temaId)
          .executeTakeFirst();
        if (!tema) throw new Error("TEMA_INEXISTENTE");

        const prefixo = PREFIXO[tema.slug] ?? tema.slug.slice(0, 2);
        const { proximo } = await trx
          .selectFrom("assunto")
          .select((eb) => eb.fn.countAll<number>().as("proximo"))
          .where("codigo", "like", `${prefixo}-%`)
          .executeTakeFirstOrThrow();
        const codigo = `${prefixo}-${String(Number(proximo) + 1).padStart(3, "0")}`;

        const novo = await trx
          .insertInto("assunto")
          .values({
            codigo,
            tema_id: edicao.temaId,
            referencia: "",
            titulo: edicao.titulo,
            provocacao: edicao.provocacao,
            tags: [],
            nivel: 1,
            sazonal: null,
            situacao: "RASCUNHO",
            hash_conteudo: hashConteudo("", edicao.provocacao),
            origem: "ADMIN",
            sugestao_id: null,
            criado_por: usuarioId,
          })
          .returning(["id", "codigo"])
          .executeTakeFirstOrThrow();

        await auditar(trx, usuarioId, "assunto", novo.id, "CRIAR", null, edicao);
        return novo;
      });

      return { assuntoId: criado.id, codigo: criado.codigo };
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "TEMA_INEXISTENTE") return reply.code(400).send({ erro: "tema inexistente" });
      if (msg.includes("ux_assunto_hash")) return reply.code(409).send({ erro: "assunto duplicado" });
      throw e;
    }
  });

  app.get("/api/admin/metricas", async () => {
    const fila = await db
      .selectFrom("sugestao")
      .select(["origem", (eb) => eb.fn.countAll<number>().as("total")])
      .where("situacao", "=", "PENDENTE")
      .groupBy("origem")
      .execute();

    const acervo = await db
      .selectFrom("assunto")
      .select(["situacao", (eb) => eb.fn.countAll<number>().as("total")])
      .groupBy("situacao")
      .execute();

    return { fila, acervo };
  });
}
