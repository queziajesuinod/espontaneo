import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { criacaoUsuarioSchema } from "@espontaneo/shared";
import { db } from "../db/index.ts";
import { abrirSessao, COOKIE, exigirSessao } from "../plugins/auth.ts";

/* algumas ações são só de quem é ADMIN */
async function exigirAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.papel !== "ADMIN") return reply.code(403).send({ erro: "só um ADMIN pode fazer isso" });
}

export default async function sessao(app: FastifyInstance) {
  app.post(
    "/api/admin/sessao",
    { config: { rateLimit: { max: 8, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      const { email, senha } = z
        .object({ email: z.string().email(), senha: z.string().min(6) })
        .parse(req.body);

      const u = await db
        .selectFrom("usuario_admin")
        .selectAll()
        .where("email", "=", email.toLowerCase())
        .where("ativo", "=", true)
        .executeTakeFirst();

      /* mesma resposta e mesmo custo para usuário inexistente e senha errada */
      const confere = u ? await argon2.verify(u.senha_hash, senha) : await argon2.hash(senha).then(() => false);
      if (!u || !confere) return reply.code(401).send({ erro: "credenciais inválidas" });

      await abrirSessao(reply, u.id);
      await db.updateTable("usuario_admin").set({ ultimo_login_em: new Date() }).where("id", "=", u.id).execute();
      return { nome: u.nome, papel: u.papel };
    },
  );

  app.delete("/api/admin/sessao", { preHandler: exigirSessao }, async (req, reply) => {
    const bruto = req.cookies[COOKIE];
    const aberto = bruto ? req.unsignCookie(bruto) : null;
    if (aberto?.value) await db.deleteFrom("sessao").where("id", "=", aberto.value).execute();
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  /* quem sou eu: o painel usa para saber o papel mesmo após recarregar */
  app.get("/api/admin/eu", { preHandler: exigirSessao }, async (req) =>
    db
      .selectFrom("usuario_admin")
      .select(["id", "nome", "papel"])
      .where("id", "=", req.usuarioId!)
      .executeTakeFirstOrThrow(),
  );

  /* equipe de curadoria — só ADMIN gerencia */
  app.get("/api/admin/usuarios", { preHandler: [exigirSessao, exigirAdmin] }, async () =>
    db
      .selectFrom("usuario_admin")
      .select(["id", "nome", "email", "papel", "ativo", "ultimo_login_em"])
      .orderBy("nome")
      .execute(),
  );

  app.post("/api/admin/usuarios", { preHandler: [exigirSessao, exigirAdmin] }, async (req, reply) => {
    const dados = criacaoUsuarioSchema.parse(req.body);
    const senha_hash = await argon2.hash(dados.senha);
    try {
      const criado = await db
        .insertInto("usuario_admin")
        .values({
          nome: dados.nome,
          email: dados.email.toLowerCase(),
          senha_hash,
          papel: dados.papel,
          ativo: true,
        })
        .returning(["id", "nome", "papel"])
        .executeTakeFirstOrThrow();
      return criado;
    } catch (e) {
      if ((e as Error).message.includes("usuario_admin_email")) {
        return reply.code(409).send({ erro: "já existe alguém com esse e-mail" });
      }
      throw e;
    }
  });

  app.patch("/api/admin/usuarios/:id", { preHandler: [exigirSessao, exigirAdmin] }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const dados = z.object({ ativo: z.boolean() }).parse(req.body);

    if (id === req.usuarioId && !dados.ativo) {
      return reply.code(400).send({ erro: "não dá para desativar a si mesmo" });
    }

    const r = await db.updateTable("usuario_admin").set({ ativo: dados.ativo }).where("id", "=", id).executeTakeFirst();
    if (!Number(r.numUpdatedRows)) return reply.code(404).send({ erro: "usuário não encontrado" });
    return { ok: true };
  });
}
