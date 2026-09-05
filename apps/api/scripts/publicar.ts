import { regenerarPublicacao } from "../src/modules/publicacao.ts";
import { pool } from "../src/db/index.ts";

/* gera/atualiza o snapshot do acervo. Idempotente: se nada mudou desde a
   última versão, não escreve nada. Roda no boot para o site já subir com o
   acervo publicado (o seed cria as pautas, mas não gera o snapshot). */
const r = await regenerarPublicacao(null);
console.log("snapshot:", JSON.stringify(r));
await pool.end();
