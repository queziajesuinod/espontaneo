import { sql } from "kysely";
import { db } from "../db/index.ts";

export const LIMIAR = 0.6;

/* pg_trgm com índice GIN: roda em milissegundos com alguns milhares de linhas */
export async function assuntoSimilar(texto: string) {
  const linha = await db
    .selectFrom("assunto")
    .select(["id", "provocacao", "referencia"])
    .select(
      sql<number>`similarity(unaccent(lower(provocacao)), unaccent(lower(${texto})))`.as("s"),
    )
    .where("situacao", "<>", "ARQUIVADO")
    .where(sql<boolean>`unaccent(lower(provocacao)) % unaccent(lower(${texto}))`)
    .orderBy("s", "desc")
    .limit(1)
    .executeTakeFirst();
  return linha ?? null;
}
