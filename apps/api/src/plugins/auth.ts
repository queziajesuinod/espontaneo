import { randomBytes, createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/index.ts";
import { env } from "../env.ts";

export const COOKIE = "espontaneo_sessao";
const DURACAO_H = 12;

declare module "fastify" {
  interface FastifyRequest {
    usuarioId?: number;
    papel?: "ADMIN" | "CURADOR";
  }
}

export async function abrirSessao(reply: FastifyReply, usuarioId: number) {
  const id = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DURACAO_H * 3600_000);
  await db.insertInto("sessao").values({ id, usuario_id: usuarioId, expira_em: expira }).execute();
  reply.setCookie(COOKIE, id, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    signed: true,
    path: "/",
    expires: expira,
  });
}

export async function exigirSessao(req: FastifyRequest, reply: FastifyReply) {
  const bruto = req.cookies[COOKIE];
  const aberto = bruto ? req.unsignCookie(bruto) : null;
  if (!aberto?.valid || !aberto.value) return reply.code(401).send({ erro: "sem sessão" });

  const s = await db
    .selectFrom("sessao")
    .innerJoin("usuario_admin", "usuario_admin.id", "sessao.usuario_id")
    .select(["sessao.id", "usuario_admin.id as usuarioId", "usuario_admin.papel", "usuario_admin.ativo"])
    .where("sessao.id", "=", aberto.value)
    .where("sessao.expira_em", ">", new Date())
    .executeTakeFirst();

  if (!s || !s.ativo) return reply.code(401).send({ erro: "sessão expirada" });
  req.usuarioId = s.usuarioId;
  req.papel = s.papel;
}

export const hashIp = (ip: string) =>
  createHash("sha256").update(ip + env.ipSalt).digest("hex");
