import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/index.ts";

/* migração em SQL puro, versionada por arquivo. O DDL continua sendo a
   fonte da verdade e os tipos do Kysely são gerados a partir dele. */
const DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

const cliente = await pool.connect();
try {
  await cliente.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      arquivo TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const aplicadas = new Set(
    (await cliente.query<{ arquivo: string }>("SELECT arquivo FROM schema_migrations")).rows.map((r) => r.arquivo),
  );

  const arquivos = (await readdir(DIR)).filter((a) => a.endsWith(".sql")).sort();

  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    const sql = await readFile(join(DIR, arquivo), "utf8");
    await cliente.query("BEGIN");
    try {
      await cliente.query(sql);
      await cliente.query("INSERT INTO schema_migrations (arquivo) VALUES ($1)", [arquivo]);
      await cliente.query("COMMIT");
      console.log("aplicada:", arquivo);
    } catch (e) {
      await cliente.query("ROLLBACK");
      throw e;
    }
  }
  console.log("banco em dia");
} finally {
  cliente.release();
  await pool.end();
}
