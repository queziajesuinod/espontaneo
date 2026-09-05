import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { env } from "../env.ts";
import type { Banco } from "./tipos.ts";

/* numeric volta como string por padrão no driver; o campo similaridade é numérico */
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
export const db = new Kysely<Banco>({ dialect: new PostgresDialect({ pool }) });
export type BD = typeof db;
