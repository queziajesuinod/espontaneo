import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.ts";
import publico from "./modules/publico.ts";
import sessao from "./modules/sessao.ts";
import moderacao from "./modules/moderacao.ts";
import publicacao from "./modules/publicacao.ts";

const app = Fastify({ logger: { level: "info" }, trustProxy: true });

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie, { secret: env.sessionSecret });
await app.register(rateLimit, { global: false });

await app.register(publico);
await app.register(sessao);
await app.register(publicacao);
await app.register(moderacao);

app.get("/saude", async () => ({ ok: true }));

app.setErrorHandler((erro, _req, reply) => {
  if ((erro as { name?: string }).name === "ZodError") {
    return reply.code(400).send({ erro: "dados inválidos", detalhe: erro.message });
  }
  app.log.error(erro);
  return reply.code(500).send({ erro: "erro interno" });
});

await app.listen({ port: env.porta, host: "0.0.0.0" });
