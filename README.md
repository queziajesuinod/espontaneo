# Espontâneo

Gira um texto. Estuda dez minutos. Fala um.

Monorepo com três partes: a API de curadoria, o site que gira as pautas, e o pacote
de schemas que os dois compartilham. O painel de moderação em React vive na rota
`/admin` do próprio site e consome as rotas de `/api/admin`: fila de sugestões,
aprovar (edita e materializa em rascunho), reprovar, publicar rascunhos e gerar o snapshot.

```
apps/api        Fastify + Kysely + PostgreSQL
apps/site       React + Vite, o app que gira
packages/shared schemas Zod usados pelos dois lados
docs/           design system, arquitetura e o protótipo em HTML
```

## Subir em cinco comandos

```bash
cp .env.example .env
pnpm install
pnpm banco:up   # Postgres local (docker-compose.dev.yml) em localhost:5433
pnpm migrar     # aplica apps/api/migrations/*.sql
pnpm semear     # carrega as 47 pautas do seed e cria o admin
pnpm dev        # api em :3335, site em :5173
```

O site pede `/api/publico/acervo`, que serve o snapshot publicado. Como o seed já entra
com os assuntos em `PUBLICADO`, basta publicar uma vez para o site ter conteúdo:

```bash
# entrar (guarda o cookie de sessão)
curl -c /tmp/c.txt -X POST localhost:3335/api/admin/sessao \
  -H 'content-type: application/json' \
  -d '{"email":"admin@espontaneo.local","senha":"espontaneo"}'

# gerar o snapshot
curl -b /tmp/c.txt -X POST localhost:3335/api/admin/publicacoes
```

## O que já funciona

| Rota | O que faz |
|---|---|
| `GET /api/publico/acervo` | Snapshot publicado, com ETag e 304 |
| `GET /api/publico/temas` | Lista para o formulário de sugestão |
| `POST /api/publico/sugestoes` | Sugestão sem login, com as cinco camadas de proteção |
| `POST /api/admin/sessao` | Login, cookie assinado e sessão no banco |
| `GET /api/admin/sugestoes` | Fila de moderação, humano antes de máquina |
| `POST /api/admin/sugestoes/:id/aprovar` | Materializa o assunto em transação, com auditoria |
| `POST /api/admin/sugestoes/:id/reprovar` | Motivo de lista fechada, obrigatório |
| `POST /api/admin/assuntos/publicar` | Publicação em lote |
| `POST /api/admin/publicacoes` | Gera o snapshot versionado |
| `GET /api/admin/metricas` | Fila por origem e acervo por situação |

## Deploy na VPS (Docker)

Dois serviços: `api` (Fastify) e `web` (nginx servindo o site estático e fazendo proxy de
`/api`). O **Postgres é o que você já tem na VPS** — o stack não sobe um banco. A API
**migra e semeia sozinha na primeira subida** (admin + 47 pautas), então não há comando
manual: é só subir o stack.

### Portainer (Stack a partir do repositório)

1. **Stacks → Add stack → Repository**.
2. **Repository URL**: `https://github.com/queziajesuinod/espontaneo.git`
   · **Reference**: `refs/heads/main` · **Compose path**: `docker-compose.yml`.
3. Em **Environment variables**, defina:
   - `DATABASE_URL` — o seu Postgres, ex.: `postgres://usuario:senha@nome-do-container:5432/espontaneo`
   - `SESSION_SECRET` — `openssl rand -hex 32`
   - `IP_SALT` — `openssl rand -hex 16`
   - `ADMIN_EMAIL` / `ADMIN_SENHA` — o primeiro login da curadoria
   - `WEB_PORT` — porta do site na VPS (padrão `80`; troque se já estiver ocupada)
   - `NODE_ENV` — `production` (exige HTTPS; use `development` só para testar em `http://IP`)
4. **Deploy the stack**. O Portainer builda as imagens; a `api` migra + semeia e o `web`
   começa a servir.

> Se o Postgres for **outro container**, a `api` precisa alcançá-lo: use o nome do container
> no `DATABASE_URL` e coloque os dois na mesma rede Docker (ou aponte para o host).
> Crie antes o banco de dados `espontaneo` (`CREATE DATABASE espontaneo;`) — as tabelas a
> API cria sozinha nas migrações.

Para atualizar depois: no stack, **Pull and redeploy**.

### Ou por linha de comando

```bash
git clone https://github.com/queziajesuinod/espontaneo.git espontaneo && cd espontaneo
cp .env.example .env        # edite DATABASE_URL, SESSION_SECRET, IP_SALT, ADMIN_*
docker compose up -d --build
```

O snapshot do acervo vive no volume `acervo` — sobrevive a `up`/`down`.

- **HTTPS em produção**: o cookie de sessão é `secure` quando `NODE_ENV=production`.
  Ponha um proxy TLS na frente (Caddy/Traefik/nginx + certbot) apontando para a `WEB_PORT`.
- Publicar de novo o snapshot não é preciso — a API regenera sozinha a cada mudança.

## Decisões que o código carrega

- **Fila única.** Sugestão do público, rascunho do admin e candidato de IA entram na
  mesma tabela `sugestao`, mudando só `origem`. Aprovar materializa a linha em `assunto`.
- **Aprovar não é publicar.** Aprovação cria em `RASCUNHO`. Publicar é outro gesto, em lote.
- **O site não consulta o banco.** Ele lê um snapshot versionado, então continua de pé
  com a API fora do ar, que é o cenário provável num domingo de manhã.
- **Toda resposta do formulário público é 201**, inclusive quando descarta. Resposta
  diferente para bot bloqueado vira oráculo.
- **`forUpdate()` na aprovação.** Dois curadores aprovando em lote ao mesmo tempo não
  geram dois assuntos iguais.
- **Auditoria dentro da transação.** Em plugin ela roda fora e mente quando o commit falha.
- **Referência bíblica validada contra tabela canônica.** Livro, capítulo e faixa de
  versículos. Testado: aceita as 47 do seed, recusa Lucas 25, Obadias 2 e Salmo 151.

## Próximos passos

1. Painel React em `apps/admin`, começando pela fila (atalhos `A` aprova, `R` reprova)
2. Geração por IA como job com pg-boss, alimentando a fila com `origem = IA`
3. `kysely-codegen` substituindo `src/db/tipos.ts` pelo tipo derivado do banco real
4. Testcontainers nos testes das consultas de similaridade
5. Service worker no site, para funcionar sem rede

`docs/` tem o design system, a arquitetura completa e o protótipo em HTML.
