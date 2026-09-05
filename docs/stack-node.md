# Em Verso: implementação em Node

Complementa `plataforma-backend.md`. O modelo de domínio, a máquina de estados e o `V1__schema.sql` não mudam: o DDL é Postgres puro e serve a qualquer runtime.

---

## 1. Escolhas de biblioteca

| Camada | Escolha | Por quê |
|---|---|---|
| HTTP | **Fastify** | Validação por schema nativa, rápido, plugins oficiais para cookie, sessão, rate limit e CORS. Express funciona, mas você acabaria montando à mão o que aqui já vem pronto |
| Banco | **Kysely** + `pg` | Query builder tipado, sem ORM no caminho. Você escreve SQL, com autocomplete e checagem em tempo de compilação |
| Tipos do banco | **kysely-codegen** | Lê o banco real e gera os tipos. O DDL continua sendo a fonte da verdade, e não existe um segundo modelo em TypeScript para manter sincronizado |
| Migração | **node-pg-migrate** em modo SQL | Mantém arquivos `.sql` versionados, do mesmo jeito que o Flyway faria |
| Validação | **Zod** | Um schema por entidade, usado no servidor e no formulário React |
| Fila | **pg-boss** | Filas no Postgres que você já tem, sem Redis. Geração por IA demora 15 a 40 segundos e não pode segurar uma requisição HTTP |
| Sessão | `@fastify/session` + `@fastify/cookie`, store no Postgres | Painel interno. Sessão revogável vale mais que JWT aqui |
| Senha | **argon2** | Padrão atual, melhor que bcrypt para nova implementação |
| IA | `@anthropic-ai/sdk` | Cliente oficial |
| Testes | **Vitest** + **Testcontainers** | As consultas de similaridade precisam de Postgres de verdade com `pg_trgm`, mock não serve |

Sobre não usar Prisma: ele quer ser dono do schema e das migrações, e o coração desse sistema são consultas com `similarity()`, índice GIN e `unaccent`, que acabam em `$queryRaw` de qualquer jeito. Kysely lê o schema que você escreveu e te devolve tipos, o que é a direção certa aqui. Se você preferir algo mais parecido com o que Prisma entrega em DX mantendo SQL de perto, Drizzle é a alternativa razoável.

## 2. Estrutura

```
em-verso/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── db/            # kysely, tipos gerados, migrações
│   │   │   ├── modules/
│   │   │   │   ├── publico/   # acervo, sugestão
│   │   │   │   ├── moderacao/ # fila, aprovar, reprovar
│   │   │   │   ├── acervo/    # categoria, tema, assunto
│   │   │   │   ├── ia/        # geração e instruções
│   │   │   │   └── publicacao/
│   │   │   ├── jobs/          # pg-boss workers
│   │   │   ├── plugins/       # auth, rate limit, turnstile, auditoria
│   │   │   └── server.ts
│   │   └── migrations/
│   │       └── 1__schema.sql
│   ├── admin/                 # React, painel
│   └── site/                  # React, o app que gira
├── packages/
│   └── shared/                # schemas Zod + tipos do contrato público
└── docker-compose.yml
```

O pacote `shared` é o que justifica o monorepo. Ele exporta `assuntoSchema`, `sugestaoPublicaSchema` e o tipo do snapshot. A API valida com ele, o painel monta o formulário com ele, o site tipa o JSON com ele. Um lugar só.

## 3. Sugestão pública, com as cinco camadas

```ts
// apps/api/src/modules/publico/sugestao.route.ts
import { createHash } from "node:crypto";
import { sugestaoPublicaSchema } from "@em-verso/shared";

export default async function rotas(app: FastifyInstance) {
  app.post("/api/publico/sugestoes", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }, // camada de borda
  }, async (req, reply) => {
    const corpo = sugestaoPublicaSchema.safeParse(req.body);

    // 1. honeypot: bot preencheu o campo escondido
    if (!corpo.success || corpo.data.website) return reply.code(201).send({ ok: true });

    // 2. turnstile
    if (!(await validarTurnstile(corpo.data.token, req.ip))) {
      return reply.code(201).send({ ok: true });
    }

    // 3. rate limit persistente por hash de IP
    const ipHash = createHash("sha256").update(req.ip + env.IP_SALT).digest("hex");
    const { count } = await db
      .selectFrom("sugestao")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("ip_hash", "=", ipHash)
      .where("criado_em", ">", sql<Date>`now() - interval '1 hour'`)
      .executeTakeFirstOrThrow();
    if (Number(count) >= 5) return reply.code(201).send({ ok: true });

    // 4. duplicata provável
    const similar = await buscarSimilar(corpo.data.provocacao);

    // 5. grava
    await db.insertInto("sugestao").values({
      tipo: corpo.data.tipo,
      origem: "PUBLICO",
      situacao: "PENDENTE",
      tema_id: corpo.data.temaId,
      referencia: corpo.data.referencia,
      provocacao: corpo.data.provocacao,
      autor_nome: corpo.data.autorNome ?? null,
      autor_contato: corpo.data.autorContato ?? null,
      ip_hash: ipHash,
      user_agent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      assunto_similar_id: similar?.id ?? null,
      similaridade: similar?.s ?? null,
    }).execute();

    return reply.code(201).send({ ok: true });
  });
}
```

Repare que **toda saída é 201**, inclusive quando descarta. Resposta diferente para bot bloqueado é um oráculo: ele ajusta e volta.

```ts
// busca de similar, o SQL que o índice GIN atende
async function buscarSimilar(texto: string) {
  return db
    .selectFrom("assunto")
    .select(["id", "provocacao"])
    .select(sql<number>`similarity(unaccent(lower(provocacao)), unaccent(lower(${texto})))`.as("s"))
    .where("situacao", "<>", "ARQUIVADO")
    .where(sql<boolean>`unaccent(lower(provocacao)) % unaccent(lower(${texto}))`)
    .orderBy("s", "desc")
    .limit(1)
    .executeTakeFirst();
}
```

## 4. Aprovação, em transação

Aprovar faz três coisas que precisam acontecer juntas ou nenhuma: cria o assunto, marca a sugestão e grava auditoria.

```ts
export async function aprovarSugestao(id: number, edicao: EdicaoAssunto, usuarioId: number) {
  return db.transaction().execute(async (trx) => {
    const s = await trx.selectFrom("sugestao").selectAll()
      .where("id", "=", id).where("situacao", "=", "PENDENTE")
      .forUpdate()                       // evita dois curadores aprovando o mesmo item
      .executeTakeFirst();
    if (!s) throw new ConflitoError("Sugestão já moderada");

    const hash = md5(normalizar(edicao.referencia + edicao.provocacao));

    const assunto = await trx.insertInto("assunto").values({
      codigo: await proximoCodigo(trx, edicao.temaId),
      tema_id: edicao.temaId,
      referencia: edicao.referencia,
      titulo: edicao.titulo,
      provocacao: edicao.provocacao,
      tags: edicao.tags,
      nivel: edicao.nivel,
      situacao: "RASCUNHO",             // aprovar não publica
      hash_conteudo: hash,
      origem: s.origem,
      sugestao_id: s.id,
      criado_por: usuarioId,
    }).returning("id").executeTakeFirstOrThrow();

    await trx.updateTable("sugestao").set({
      situacao: "APROVADA",
      moderado_por: usuarioId,
      moderado_em: new Date(),
      assunto_gerado_id: assunto.id,
    }).where("id", "=", id).execute();

    await auditar(trx, usuarioId, "assunto", assunto.id, "APROVAR", s, edicao);
    return assunto.id;
  });
}
```

O `forUpdate()` importa mais do que parece: em aprovação em lote de saída de IA, com dois curadores online, dois cliques quase simultâneos gerariam dois assuntos idênticos. O índice único em `hash_conteudo` pega o caso, mas o erro chega feio na tela. O lock resolve antes.

## 5. Geração por IA, como job

A rota só enfileira e devolve o id do job. O painel acompanha por polling curto.

```ts
// apps/api/src/jobs/gerar-assuntos.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function gerarAssuntos({ temaId, instrucaoId, quantidade, usuarioId }: Entrada) {
  const tema = await carregarTema(temaId);
  const instrucao = await carregarInstrucao(instrucaoId);
  const exemplos = await melhoresAssuntos(temaId, 5);      // few-shot do que já foi aprovado
  const usadas = await referenciasDoTema(temaId);          // para não repetir

  const geracao = await registrarGeracao({ temaId, instrucaoId, quantidade, usuarioId });

  try {
    const resposta = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: instrucao.texto,
      messages: [{
        role: "user",
        content: [
          `Tema: ${tema.nome}`,
          tema.descricao && `Contexto: ${tema.descricao}`,
          tema.instrucao_extra && `Orientação específica: ${tema.instrucao_extra}`,
          `Exemplos aprovados deste tema:\n${exemplos.map(formatarExemplo).join("\n")}`,
          `Não use estas referências, já existem: ${usadas.join(", ")}`,
          `Gere ${quantidade} pautas novas.`,
        ].filter(Boolean).join("\n\n"),
      }],
    });

    const texto = resposta.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const candidatos = candidatoSchema.array().parse(JSON.parse(extrairJson(texto)));

    let descartados = 0;
    for (const c of candidatos) {
      if (!referenciaValida(c.referencia)) { descartados++; continue; }
      const similar = await buscarSimilar(c.provocacao);
      if (similar && similar.s > 0.6) { descartados++; continue; }
      await enfileirar({ ...c, temaId, origem: "IA", geracaoId: geracao.id });
    }

    await fecharGeracao(geracao.id, {
      gerados: candidatos.length - descartados,
      descartados,
      tokensEntrada: resposta.usage.input_tokens,
      tokensSaida: resposta.usage.output_tokens,
    });
  } catch (e) {
    await falharGeracao(geracao.id, e);
    throw e;
  }
}
```

Três detalhes que não são opcionais:

- **`referenciaValida`** confere livro, capítulo e faixa de versículos contra uma tabela canônica em código. O modelo erra capítulo com naturalidade e confiança, e uma referência errada publicada é o tipo de erro que alguém printa.
- **`extrairJson`** tolera o modelo devolver o JSON dentro de cerca de código. Se preferir garantia estrutural, use tool use com o schema como definição de ferramenta em vez de pedir JSON no texto.
- **`resposta.usage`** vai para a tabela. Sem isso você não sabe se a IA sai mais barata que escrever à mão.

## 6. Snapshot publicado

```ts
export async function publicar(usuarioId: number) {
  const acervo = await montarAcervo();                 // mesmo contrato do pautas-seed.json
  const json = JSON.stringify(acervo);
  const hash = sha256(json);

  const ultima = await ultimaPublicacao();
  if (ultima?.hash_conteudo === hash) return { semMudanca: true, versao: ultima.versao };

  const versao = (ultima?.versao ?? 0) + 1;
  await escreverArquivo(`acervo-v${versao}.json`, json);
  await registrarPublicacao({ versao, hash, usuarioId, total: acervo.pautas.length });
  await invalidarCache();
  return { versao };
}
```

O endpoint público serve com ETag e `Cache-Control: max-age=3600, stale-while-revalidate=86400`. O service worker do site guarda a última versão boa, então o app roda mesmo com a API fora do ar.

## 7. Auditoria sem repetir código

Um plugin do Fastify que envolve as rotas de escrita e grava `dados_antes` e `dados_depois` em `jsonb` resolve, mas o caminho mais confiável é chamar `auditar(trx, ...)` dentro da própria transação, como no exemplo de aprovação. Auditoria em plugin roda fora da transação e mente quando o commit falha.

## 8. Variáveis de ambiente

```
DATABASE_URL=postgres://...
SESSION_SECRET=
IP_SALT=
TURNSTILE_SECRET=
ANTHROPIC_API_KEY=
IA_TETO_DIARIO=200
ACERVO_DIR=/var/em-verso/acervo
```

## 9. Ordem de implementação, adaptada

1. `docker-compose` com Postgres, migração do `V1__schema.sql`, `kysely-codegen` gerando os tipos
2. Carga do `pautas-seed.json` como migração de dados
3. `GET /api/publico/acervo` e publicação de snapshot. Com o site React da v1 apontando para lá, você já tem produto no ar
4. Sessão, login e CRUD de categoria, tema e assunto no painel React
5. Fila de moderação, aprovação com transação e auditoria
6. Formulário público com as cinco camadas
7. pg-boss e geração por IA
8. Métricas e aprovação em lote

Da etapa 3 em diante, tudo é incremento sobre um sistema que já está funcionando.
