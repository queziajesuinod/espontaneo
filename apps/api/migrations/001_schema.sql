-- V1__schema.sql
-- Em Verso: esquema inicial
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------
-- Administração
-- ---------------------------------------------------------------

CREATE TABLE usuario_admin (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome            VARCHAR(120)  NOT NULL,
    email           VARCHAR(180)  NOT NULL UNIQUE,
    senha_hash      VARCHAR(120)  NOT NULL,
    papel           VARCHAR(20)   NOT NULL DEFAULT 'CURADOR',
    ativo           BOOLEAN       NOT NULL DEFAULT TRUE,
    ultimo_login_em TIMESTAMPTZ,
    criado_em       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT ck_usuario_papel CHECK (papel IN ('ADMIN', 'CURADOR'))
);

-- ---------------------------------------------------------------
-- Acervo
-- ---------------------------------------------------------------

CREATE TABLE categoria (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug      VARCHAR(60)  NOT NULL UNIQUE,
    nome      VARCHAR(80)  NOT NULL,
    ordem     SMALLINT     NOT NULL DEFAULT 0,
    ativa     BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE tema (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    categoria_id    BIGINT       NOT NULL REFERENCES categoria (id),
    slug            VARCHAR(80)  NOT NULL UNIQUE,
    nome            VARCHAR(120) NOT NULL,
    descricao       TEXT,
    -- instrução adicional usada só na geração por IA deste tema
    instrucao_extra TEXT,
    situacao        VARCHAR(20)  NOT NULL DEFAULT 'RASCUNHO',
    criado_por      BIGINT       REFERENCES usuario_admin (id),
    criado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_tema_situacao CHECK (situacao IN ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO'))
);

CREATE INDEX ix_tema_categoria ON tema (categoria_id) WHERE situacao <> 'ARQUIVADO';

CREATE TABLE assunto (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo         VARCHAR(20)  NOT NULL UNIQUE,   -- ev-023, usado na URL /p/{codigo}
    tema_id        BIGINT       NOT NULL REFERENCES tema (id),
    referencia     VARCHAR(80)  NOT NULL,          -- "Lucas 15:11-32"
    titulo         VARCHAR(120) NOT NULL,
    provocacao     VARCHAR(160) NOT NULL,
    tags           TEXT[]       NOT NULL DEFAULT '{}',
    nivel          SMALLINT     NOT NULL DEFAULT 1,
    sazonal        VARCHAR(30),                    -- natal, pascoa, pentecostes
    situacao       VARCHAR(20)  NOT NULL DEFAULT 'RASCUNHO',
    -- md5(referencia || provocacao normalizada): barreira final contra duplicata exata
    hash_conteudo  CHAR(32)     NOT NULL,
    origem         VARCHAR(20)  NOT NULL DEFAULT 'ADMIN',
    sugestao_id    BIGINT,                         -- FK adicionada depois de criar sugestao
    criado_por     BIGINT       REFERENCES usuario_admin (id),
    criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    publicado_em   TIMESTAMPTZ,
    atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_assunto_situacao CHECK (situacao IN ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO')),
    CONSTRAINT ck_assunto_origem   CHECK (origem IN ('ADMIN', 'PUBLICO', 'IA', 'IMPORTACAO')),
    CONSTRAINT ck_assunto_nivel    CHECK (nivel BETWEEN 1 AND 3),
    CONSTRAINT ck_assunto_provoc   CHECK (char_length(provocacao) BETWEEN 10 AND 160)
);

CREATE UNIQUE INDEX ux_assunto_hash
    ON assunto (hash_conteudo) WHERE situacao <> 'ARQUIVADO';

CREATE INDEX ix_assunto_tema      ON assunto (tema_id);
CREATE INDEX ix_assunto_situacao  ON assunto (situacao);
CREATE INDEX ix_assunto_sazonal   ON assunto (sazonal) WHERE sazonal IS NOT NULL;
CREATE INDEX ix_assunto_provoc_trgm
    ON assunto USING gin (provocacao gin_trgm_ops);

-- ---------------------------------------------------------------
-- Fila única de moderação
-- ---------------------------------------------------------------

CREATE TABLE sugestao (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo               VARCHAR(20)  NOT NULL,
    origem             VARCHAR(20)  NOT NULL,
    situacao           VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',

    -- campos livres: sem constraint de negócio, o formulário público é frouxo
    tema_id            BIGINT       REFERENCES tema (id),   -- quando tipo = ASSUNTO
    categoria_id       BIGINT       REFERENCES categoria (id), -- quando tipo = TEMA
    referencia         VARCHAR(80),
    titulo             VARCHAR(160),
    provocacao         VARCHAR(300),
    observacao         TEXT,

    -- autor: tudo opcional
    autor_nome         VARCHAR(120),
    autor_contato      VARCHAR(180),

    -- rastro técnico, expurgado em 30 dias
    ip_hash            CHAR(64),
    user_agent         VARCHAR(300),

    -- duplicata provável detectada na entrada
    assunto_similar_id BIGINT       REFERENCES assunto (id),
    similaridade       NUMERIC(4,3),

    -- moderação
    moderado_por       BIGINT       REFERENCES usuario_admin (id),
    moderado_em        TIMESTAMPTZ,
    motivo_reprovacao  VARCHAR(40),
    nota_moderacao     TEXT,
    assunto_gerado_id  BIGINT       REFERENCES assunto (id),
    tema_gerado_id     BIGINT       REFERENCES tema (id),

    geracao_id         BIGINT,      -- FK adicionada depois de criar geracao_ia
    criado_em          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_sugestao_tipo     CHECK (tipo IN ('TEMA', 'ASSUNTO')),
    CONSTRAINT ck_sugestao_origem   CHECK (origem IN ('PUBLICO', 'ADMIN', 'IA', 'IMPORTACAO')),
    CONSTRAINT ck_sugestao_situacao CHECK (situacao IN ('PENDENTE', 'APROVADA', 'REPROVADA', 'DUPLICADA', 'ARQUIVADA')),
    CONSTRAINT ck_sugestao_motivo   CHECK (motivo_reprovacao IS NULL OR motivo_reprovacao IN (
        'FORA_DO_ESCOPO', 'TEOLOGIA_QUESTIONAVEL', 'DUPLICADA',
        'MAL_ESCRITA', 'REFERENCIA_INCORRETA', 'SPAM')),
    CONSTRAINT ck_sugestao_moderada CHECK (
        (situacao = 'PENDENTE' AND moderado_em IS NULL)
        OR (situacao <> 'PENDENTE' AND moderado_em IS NOT NULL)),
    CONSTRAINT ck_sugestao_reprovada CHECK (
        situacao <> 'REPROVADA' OR motivo_reprovacao IS NOT NULL)
);

CREATE INDEX ix_sugestao_fila
    ON sugestao (situacao, origem, criado_em) WHERE situacao = 'PENDENTE';
CREATE INDEX ix_sugestao_ip_janela
    ON sugestao (ip_hash, criado_em) WHERE ip_hash IS NOT NULL;

ALTER TABLE assunto
    ADD CONSTRAINT fk_assunto_sugestao FOREIGN KEY (sugestao_id) REFERENCES sugestao (id);

-- ---------------------------------------------------------------
-- IA
-- ---------------------------------------------------------------

CREATE TABLE instrucao_ia (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome       VARCHAR(120) NOT NULL,
    escopo     VARCHAR(30)  NOT NULL,
    texto      TEXT         NOT NULL,
    versao     SMALLINT     NOT NULL DEFAULT 1,
    ativa      BOOLEAN      NOT NULL DEFAULT FALSE,
    criado_por BIGINT       REFERENCES usuario_admin (id),
    criado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_instrucao_escopo CHECK (escopo IN ('GERAR_ASSUNTOS', 'REVISAR_PROVOCACAO', 'SUGERIR_TAGS')),
    CONSTRAINT ux_instrucao_versao UNIQUE (nome, versao)
);

-- só uma instrução ativa por escopo
CREATE UNIQUE INDEX ux_instrucao_ativa ON instrucao_ia (escopo) WHERE ativa;

CREATE TABLE geracao_ia (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tema_id        BIGINT      NOT NULL REFERENCES tema (id),
    instrucao_id   BIGINT      NOT NULL REFERENCES instrucao_ia (id),
    modelo         VARCHAR(60) NOT NULL,
    solicitados    SMALLINT    NOT NULL,
    gerados        SMALLINT    NOT NULL DEFAULT 0,
    descartados    SMALLINT    NOT NULL DEFAULT 0,  -- falha de validação ou duplicata
    tokens_entrada INTEGER,
    tokens_saida   INTEGER,
    custo_usd      NUMERIC(10,5),
    erro           TEXT,
    solicitado_por BIGINT      REFERENCES usuario_admin (id),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_geracao_solicitados CHECK (solicitados BETWEEN 1 AND 20)
);

ALTER TABLE sugestao
    ADD CONSTRAINT fk_sugestao_geracao FOREIGN KEY (geracao_id) REFERENCES geracao_ia (id);

-- ---------------------------------------------------------------
-- Publicação e auditoria
-- ---------------------------------------------------------------

CREATE TABLE publicacao (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    versao         INTEGER     NOT NULL UNIQUE,
    hash_conteudo  CHAR(64)    NOT NULL,
    total_assuntos INTEGER     NOT NULL,
    total_temas    INTEGER     NOT NULL,
    publicado_por  BIGINT      REFERENCES usuario_admin (id),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id  BIGINT      REFERENCES usuario_admin (id),
    entidade    VARCHAR(40) NOT NULL,
    entidade_id BIGINT      NOT NULL,
    acao        VARCHAR(30) NOT NULL,
    dados_antes  JSONB,
    dados_depois JSONB,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_auditoria_entidade ON auditoria (entidade, entidade_id, criado_em DESC);
CREATE INDEX ix_auditoria_usuario  ON auditoria (usuario_id, criado_em DESC);

-- ---------------------------------------------------------------
-- Consultas de apoio
-- ---------------------------------------------------------------

-- duplicata provável na entrada de uma sugestão
-- SELECT id, provocacao, similarity(unaccent(lower(provocacao)), unaccent(lower(:texto))) AS s
--   FROM assunto
--  WHERE situacao <> 'ARQUIVADO'
--    AND unaccent(lower(provocacao)) % unaccent(lower(:texto))
--  ORDER BY s DESC
--  LIMIT 3;

-- rate limit por janela
-- SELECT count(*) FROM sugestao
--  WHERE ip_hash = :hash AND criado_em > now() - INTERVAL '1 hour';

-- ---------------------------------------------------------------
-- Sessão do painel
-- ---------------------------------------------------------------

CREATE TABLE sessao (
    id         CHAR(43)    PRIMARY KEY,          -- 32 bytes em base64url
    usuario_id BIGINT      NOT NULL REFERENCES usuario_admin (id) ON DELETE CASCADE,
    expira_em  TIMESTAMPTZ NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_sessao_expira ON sessao (expira_em);
