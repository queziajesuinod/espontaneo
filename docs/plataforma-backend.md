# Em Verso: plataforma de curadoria

Especificação da versão com backend. Substitui a seção 4 do manual de construção (a arquitetura estática) e mantém tudo o mais: mecânica, tom, marca e regras editoriais continuam valendo.

---

## 1. As três decisões que definem o sistema

Antes de qualquer tabela, três escolhas que mudam o resto.

**Fila única de moderação.** Sugestão do público, rascunho do admin e candidato gerado por IA entram todos na mesma tabela `sugestao`, mudando só o campo `origem`. O curador tem um lugar só para trabalhar, e o dia em que você adicionar uma quarta origem (importação de planilha, formulário do Instagram) nada muda. Sugestão aprovada **materializa** uma linha em `tema` ou `assunto`; ela não vira o registro de produção por mudança de status.

Por que não usar a própria tabela `assunto` com `situacao = PENDENTE`: porque 90% do que chega pelo formulário aberto é lixo, e você não quer lixo, ip hash e texto não revisado convivendo com a tabela que alimenta o site. Separar mantém o acervo limpo, permite guardar spam para análise sem sujar nada, e deixa a tabela de produção com constraints rígidas (referência obrigatória, provocação validada) que o formulário público jamais conseguiria satisfazer.

**Snapshot publicado.** O site público **não** consulta o banco. Ao publicar, o backend gera um JSON versionado com todo o acervo, e o front consome esse arquivo. Isso mantém o app instantâneo, offline e imune a queda do backend, e o custo é um endpoint de publicação. O contrato do JSON é o mesmo `pautas-seed.json` da v1, então o front atual continua funcionando sem alteração.

**IA nunca publica.** Ela só enfileira candidatos com `origem = IA`. Uma provocação teologicamente torta publicada sozinha custa a reputação do projeto, e isso não tem rollback.

---

## 2. Modelo de domínio

```
categoria 1 ── N tema 1 ── N assunto
                  │
sugestao (fila) ──┘ materializa tema ou assunto
instrucao_ia 1 ── N geracao_ia ── N sugestao (origem = IA)
publicacao (snapshots versionados)
auditoria (tudo que o admin alterou)
```

**categoria** é o eixo de navegação do site (Evangelhos, Salmos, Cartas). Poucas, estáveis, só admin cria.

**tema** é a unidade de curadoria (Medo, Graça, Perdão, Chamado). É o que a IA recebe para gerar assuntos, e é o que o público pode sugerir. Carrega uma `instrucao_extra` própria, porque o jeito de escrever pauta sobre luto não é o mesmo de escrever sobre juventude.

**assunto** é a pauta que gira: referência, título, provocação. Herda a categoria pelo tema, o que evita o estado inconsistente clássico de assunto na categoria A com tema da categoria B.

**sugestao** é a fila. Um `tipo` (TEMA ou ASSUNTO), campos frouxos, sem constraint de negócio, com rastro de origem.

---

## 3. Máquina de estados

```
sugestao.situacao
  PENDENTE ──aprovar──> APROVADA   (materializa tema/assunto)
     │
     ├──reprovar──> REPROVADA      (exige motivo)
     ├──duplicar──> DUPLICADA      (aponta para o assunto existente)
     └──expirar──> ARQUIVADA       (job, 180 dias sem moderação)

assunto.situacao
  RASCUNHO ──publicar──> PUBLICADO ──arquivar──> ARQUIVADO
                              ↑                       │
                              └───────republicar──────┘
```

Aprovar uma sugestão cria o assunto em `RASCUNHO`, não em `PUBLICADO`. São dois gestos diferentes: "esse conteúdo presta" e "esse conteúdo entra no ar agora". Manter os dois separados permite aprovar 40 pautas numa sessão e publicar o lote depois de uma segunda leitura, que é exatamente o que você vai querer fazer com saída de IA.

---

## 4. Sugestão pública sem login

O formulário aberto é a porta de entrada e o maior risco operacional. Cinco camadas, todas baratas:

1. **Honeypot.** Campo escondido por CSS. Preenchido, responde 201 e descarta. Pega bot burro, que é a maioria.
2. **Cloudflare Turnstile.** Gratuito, sem quebra-cabeça para o usuário, valida no backend antes de gravar. Pega bot esperto.
3. **Rate limit por hash de IP.** Cinco sugestões por hora, vinte por dia. Guarde `sha256(ip + salt)`, nunca o IP puro, e apague o hash depois de 30 dias. Uma contagem sobre a própria `sugestao` na janela resolve, sem tabela extra.
4. **Limites de tamanho e conteúdo.** Provocação de 10 a 140 caracteres, referência validada contra a lista canônica de livros da Bíblia com regex de capítulo e versículo, sem HTML, sem URL no corpo.
5. **Detecção de duplicata na entrada.** Antes de gravar, compare com o acervo por `pg_trgm`. Acima de 0,6 de similaridade na provocação com a mesma referência, a sugestão entra já marcada como provável duplicata e aparece no fim da fila, com o assunto parecido ao lado.

Dados do autor são opcionais: nome e um contato (Instagram ou e-mail), só para você poder agradecer ou avisar que publicou. Nada obrigatório, nada de campo de igreja, cidade ou telefone. Menos dado coletado, menos exposição em LGPD, mais gente enviando.

Resposta ao usuário depois do envio: "Recebido. Um curador vai ler." Não prometa prazo e não deixe rastreável, porque abre porta para pressão e para descoberta de conteúdo reprovado.

---

## 5. Esquema do banco

O DDL completo está em `V1__schema.sql`, pronto para Flyway. Pontos que merecem explicação:

- **Enums como `varchar` + `check`**, não tipo enum do Postgres. Combina com `@Enumerated(EnumType.STRING)` no JPA e evita a dor de alterar tipo enum em migração.
- **`pg_trgm` com índice GIN** em `assunto.provocacao`. É o que faz a detecção de duplicata rodar em milissegundos com 5 mil linhas.
- **`auditoria` com `jsonb` antes e depois.** Em conteúdo religioso, "quem aprovou isso e o que estava escrito antes de você editar" vira pergunta real. Vale a tabela.
- **`assunto.hash_conteudo`** guarda `md5(referencia || provocacao normalizada)` com índice único parcial entre os não arquivados. É a barreira final contra duplicata exata, no banco, independente da aplicação.
- **Sem exclusão física.** `ARQUIVADO` em vez de `DELETE`, em todo lugar.

## 6. API

### Público

| Método | Rota | Notas |
|---|---|---|
| GET | `/api/publico/acervo` | Snapshot da última publicação. ETag, `Cache-Control: max-age=3600`, resposta 304 quando não mudou |
| GET | `/api/publico/temas` | Só id, nome e categoria, para o select do formulário |
| POST | `/api/publico/sugestoes` | Turnstile + honeypot + rate limit. Sempre 201, mesmo quando descarta |

### Administração

| Método | Rota | Notas |
|---|---|---|
| POST | `/api/admin/sessao` | Cookie de sessão `HttpOnly` `SameSite=Strict`. Não use JWT aqui, é painel interno, sessão é mais simples e revogável |
| GET | `/api/admin/sugestoes` | Filtros: situacao, origem, tipo, tema, busca textual. Paginado |
| PATCH | `/api/admin/sugestoes/{id}` | Editar antes de aprovar |
| POST | `/api/admin/sugestoes/{id}/aprovar` | Materializa tema ou assunto, retorna o id criado |
| POST | `/api/admin/sugestoes/{id}/reprovar` | Motivo obrigatório, de uma lista fechada mais campo livre |
| POST | `/api/admin/sugestoes/aprovar-lote` | Recebe lista de ids. Essencial para saída de IA |
| GET POST PATCH | `/api/admin/temas`, `/assuntos`, `/categorias` | CRUD |
| POST | `/api/admin/temas/{id}/gerar` | Dispara geração por IA |
| GET POST | `/api/admin/instrucoes` | Prompts versionados |
| POST | `/api/admin/publicacoes` | Gera novo snapshot e invalida cache |
| GET | `/api/admin/metricas` | Fila pendente, aprovados na semana, taxa de aprovação por origem |

Motivos de reprovação fechados (`FORA_DO_ESCOPO`, `TEOLOGIA_QUESTIONAVEL`, `DUPLICADA`, `MAL_ESCRITA`, `REFERENCIA_INCORRETA`, `SPAM`) valem mais que texto livre: viram métrica. Se 40% da saída de IA é reprovada por `MAL_ESCRITA`, o problema é a instrução, e você só descobre isso se o motivo for categorizado.

---

## 7. Geração por IA

### Fluxo

```
admin escolhe tema + instrução + quantidade
        ↓
backend monta o prompt:
  regras editoriais fixas (system)
  + descrição do tema
  + instrucao_extra do tema
  + 5 assuntos já aprovados desse tema (few-shot)
  + lista de referências já usadas (para não repetir)
        ↓
chamada à API, saída em JSON estrito
        ↓
validação: schema, tamanho, referência existe, similaridade < 0,6
        ↓
insere na fila como origem = IA, situacao = PENDENTE
        ↓
curador aprova, edita ou reprova em lote
```

### Prompt de sistema (base)

Guarde em `instrucao_ia`, versionado, nunca no código. Conteúdo base:

```
Você escreve pautas de treino para pessoas que vão falar em público
sobre um texto bíblico. Cada pauta tem uma referência e uma provocação.

A provocação:
- tem no máximo 12 palavras
- começa com verbo no imperativo
- dá UM ângulo específico, nunca um resumo do texto
- não conclui pelo leitor, não entrega a aplicação pronta
- não usa jargão religioso (unção, nível, revelação, portal, chave)
- funciona para qualquer tradição cristã histórica

Bom:  "Fale sobre o pai que correu."
Ruim: "Fale sobre a parábola do filho pródigo e o amor do pai."

Devolva apenas JSON, sem texto em volta:
[{"referencia":"","titulo":"","provocacao":"","tags":[]}]
```

### Guardas obrigatórias

- **Teto por operação e por dia.** 20 candidatos por chamada, teto diário configurável. Sem isso, um clique distraído gera 500 linhas na fila e você desiste de moderar.
- **Registro de custo.** `geracao_ia` grava modelo, tokens de entrada e saída, e o id da instrução. Sem isso você não sabe se a curadoria por IA está mais barata que escrever à mão.
- **Validação de referência.** O modelo erra capítulo e versículo com naturalidade. Valide contra a tabela canônica de livros e faixas de capítulos antes de enfileirar, e descarte o que não bater.
- **Nada de auto-aprovação**, nem para "instrução muito boa", nem com limiar de confiança. Nunca.

### Onde rodar

Dentro do Spring Boot, com `RestClient` e timeout curto, é o suficiente e mantém tudo num lugar só. Se você quiser geração agendada (varrer temas com menos de 10 assuntos toda segunda e encher a fila), aí o n8n que você já mantém é o lugar certo: ele chama `/api/admin/temas/{id}/gerar` com uma chave de serviço, e você não escreve scheduler nenhum.

---

## 8. Painel administrativo

React em SPA separada, no mesmo monorepo do site público e da API. Como tudo é TypeScript, o schema Zod de um assunto é escrito uma vez e serve para validar no servidor, tipar o formulário e gerar as mensagens de erro no painel. Isso é a vantagem real de manter uma linguagem só, e é o que compensa o custo de sustentar um build de front para um CRUD interno.

A tela que importa é a fila. Ela precisa de:

- Cartão com a sugestão, o assunto parecido ao lado quando houver duplicata provável, e a origem visível
- Edição em linha da provocação, sem abrir modal
- Atalhos de teclado: `A` aprova, `R` reprova, `E` edita, `J` e `K` navegam. Moderar 50 itens com mouse cansa e você para de moderar
- Seleção múltipla com aprovação em lote
- Filtro padrão em `PENDENTE` ordenado por origem: humano primeiro, IA depois. Gente esperando resposta vem antes de máquina.

As outras telas (temas, assuntos, categorias, instruções, publicação, auditoria) podem ser CRUD comum.

---

## 9. Publicação e cache

```
POST /api/admin/publicacoes
  → seleciona assuntos PUBLICADOS
  → monta o JSON no contrato da v1
  → calcula hash; se igual ao último, não cria versão nova
  → grava linha em publicacao (versao, hash, total, gerado_em, por quem)
  → escreve o arquivo e invalida o cache do CDN
```

O front pede `/api/publico/acervo`, recebe ETag, e no service worker guarda a última versão boa. Site continua funcionando com o backend fora do ar, que é o cenário mais provável num domingo de manhã.

Publique manualmente. Publicação automática a cada aprovação tira de você o último ponto de leitura antes do ar.

---

## 10. Stack e operação

- Node 22 LTS, TypeScript, Fastify, Zod, Kysely
- PostgreSQL 16 com `pg_trgm` e `unaccent`
- React + Vite no painel e no site público, monorepo pnpm com pacote de schemas compartilhado
- Vitest e Testcontainers para os testes de repositório, principalmente das consultas de similaridade
- Docker Compose com app, banco e reverse proxy. Cabe folgado numa VPS pequena, e você já opera nesse modelo

O detalhamento da stack, com estrutura de pastas e os trechos de código que resolvem as partes chatas, está em `stack-node.md`.
- Backup diário do Postgres com restauração testada. O acervo curado é o ativo do projeto; perder o banco é perder o produto, o código se reescreve

Observabilidade mínima que vale a pena: contador de sugestões recebidas por origem, tamanho da fila, tempo médio até moderação, taxa de aprovação por origem, e custo de IA por assunto aprovado. Cinco números, um painel.

---

## 11. Ordem de implementação

1. Schema, Flyway, entidades JPA, carga do `pautas-seed.json` como migração de dados
2. Endpoint público de acervo e publicação de snapshot. Já dá para plugar o front da v1 e ter site no ar
3. Login e CRUD de categoria, tema, assunto
4. Fila de moderação e materialização, com auditoria desde o primeiro commit
5. Formulário público de sugestão com as cinco camadas de proteção
6. Geração por IA e instruções versionadas
7. Métricas e aprovação em lote

Cada etapa entrega algo utilizável. A etapa 2 já coloca o produto no ar, e as outras cinco podem levar o tempo que precisarem.
