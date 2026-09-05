import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { db, pool } from "../src/db/index.ts";
import { ROTULO_CATEGORIA } from "@espontaneo/shared";
import { env } from "../src/env.ts";
import { hashConteudo } from "../src/modules/moderacao.ts";
import { referenciaValida } from "../src/lib/referencia.ts";

type Semente = {
  categorias: { id: string; nome: string }[];
  pautas: {
    id: string; categoria: string; referencia: string; titulo: string;
    provocacao: string; tags: string[]; nivel: number; sazonal: string | null;
  }[];
};

const arquivo = fileURLToPath(new URL("../seed/pautas-seed.json", import.meta.url));
const semente: Semente = JSON.parse(await readFile(arquivo, "utf8"));

const admin = await db
  .insertInto("usuario_admin")
  .values({
    nome: "Curadoria",
    email: env.adminEmail.toLowerCase(),
    senha_hash: await argon2.hash(env.adminSenha),
    papel: "ADMIN",
  })
  .onConflict((oc) => oc.column("email").doUpdateSet({ ativo: true }))
  .returning("id")
  .executeTakeFirstOrThrow();

const idCategoria = new Map<string, number>();
for (const [i, c] of semente.categorias.entries()) {
  const linha = await db
    .insertInto("categoria")
    .values({ slug: c.id, nome: ROTULO_CATEGORIA[c.id] ?? c.nome, ordem: i })
    .onConflict((oc) => oc.column("slug").doUpdateSet({ nome: c.nome }))
    .returning("id")
    .executeTakeFirstOrThrow();
  idCategoria.set(c.id, linha.id);
}

/* a primeira tag de cada pauta vira o tema: é o agrupador de curadoria
   que a IA recebe depois para gerar assuntos novos */
const idTema = new Map<string, number>();
for (const p of semente.pautas) {
  const nome = p.tags[0] ?? "geral";
  const slug = `${p.categoria}-${nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`;
  if (idTema.has(slug)) continue;
  const linha = await db
    .insertInto("tema")
    .values({
      categoria_id: idCategoria.get(p.categoria)!,
      slug,
      nome,
      situacao: "PUBLICADO",
      criado_por: admin.id,
    })
    .onConflict((oc) => oc.column("slug").doNothing())
    .returning("id")
    .executeTakeFirst();
  idTema.set(
    slug,
    linha?.id ??
      (await db.selectFrom("tema").select("id").where("slug", "=", slug).executeTakeFirstOrThrow()).id,
  );
}

let inseridos = 0;
let recusados = 0;
for (const p of semente.pautas) {
  if (!referenciaValida(p.referencia)) {
    console.warn("referência recusada:", p.referencia);
    recusados++;
    continue;
  }
  const nome = p.tags[0] ?? "geral";
  const slug = `${p.categoria}-${nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`;
  const r = await db
    .insertInto("assunto")
    .values({
      codigo: p.id,
      tema_id: idTema.get(slug)!,
      referencia: p.referencia,
      titulo: p.titulo,
      provocacao: p.provocacao,
      tags: p.tags,
      nivel: p.nivel,
      sazonal: p.sazonal,
      situacao: "PUBLICADO",
      publicado_em: new Date(),
      hash_conteudo: hashConteudo(p.referencia, p.provocacao),
      origem: "IMPORTACAO",
      criado_por: admin.id,
    })
    .onConflict((oc) => oc.column("codigo").doNothing())
    .executeTakeFirst();
  inseridos += Number(r.numInsertedOrUpdatedRows ?? 0);
}

console.log(`temas: ${idTema.size}, assuntos inseridos: ${inseridos}, recusados: ${recusados}`);
console.log(`admin: ${env.adminEmail}`);
await pool.end();
