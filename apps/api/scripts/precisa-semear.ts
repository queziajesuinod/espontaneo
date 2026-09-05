import { db, pool } from "../src/db/index.ts";

/* imprime "sim" se o banco ainda não tem nenhum admin — o entrypoint usa isso
   para semear só na primeira subida e nunca sobrescrever o que já existe. */
const { n } = await db
  .selectFrom("usuario_admin")
  .select((eb) => eb.fn.countAll<number>().as("n"))
  .executeTakeFirstOrThrow();

process.stdout.write(Number(n) === 0 ? "sim" : "nao");
await pool.end();
