import type { ColumnType, Generated } from "kysely";

/* Escrito à mão para o start. Depois de subir o banco, `pnpm tipos`
   gera este arquivo a partir do schema real e ele passa a ser derivado. */

type Data = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsuarioAdmin {
  id: Generated<number>;
  nome: string;
  email: string;
  senha_hash: string;
  papel: "ADMIN" | "CURADOR";
  ativo: boolean;
  ultimo_login_em: Data | null;
  criado_em: Generated<Data>;
}

export interface Sessao {
  id: string;
  usuario_id: number;
  expira_em: Data;
  criado_em: Generated<Data>;
}

export interface Categoria {
  id: Generated<number>;
  slug: string;
  nome: string;
  ordem: number;
  ativa: boolean;
  criado_em: Generated<Data>;
}

export interface Tema {
  id: Generated<number>;
  categoria_id: number;
  slug: string;
  nome: string;
  descricao: string | null;
  instrucao_extra: string | null;
  situacao: "RASCUNHO" | "PUBLICADO" | "ARQUIVADO";
  criado_por: number | null;
  criado_em: Generated<Data>;
  atualizado_em: Generated<Data>;
}

export interface Assunto {
  id: Generated<number>;
  codigo: string;
  tema_id: number;
  referencia: string;
  titulo: string;
  provocacao: string;
  tags: string[];
  nivel: number;
  sazonal: string | null;
  situacao: "RASCUNHO" | "PUBLICADO" | "ARQUIVADO";
  hash_conteudo: string;
  origem: "ADMIN" | "PUBLICO" | "IA" | "IMPORTACAO";
  sugestao_id: number | null;
  criado_por: number | null;
  criado_em: Generated<Data>;
  publicado_em: Data | null;
  atualizado_em: Generated<Data>;
}

export interface SugestaoTabela {
  id: Generated<number>;
  tipo: "TEMA" | "ASSUNTO";
  origem: "PUBLICO" | "ADMIN" | "IA" | "IMPORTACAO";
  situacao: "PENDENTE" | "APROVADA" | "REPROVADA" | "DUPLICADA" | "ARQUIVADA";
  tema_id: number | null;
  categoria_id: number | null;
  referencia: string | null;
  titulo: string | null;
  provocacao: string | null;
  observacao: string | null;
  autor_nome: string | null;
  autor_contato: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  assunto_similar_id: number | null;
  similaridade: number | null;
  moderado_por: number | null;
  moderado_em: Data | null;
  motivo_reprovacao: string | null;
  nota_moderacao: string | null;
  assunto_gerado_id: number | null;
  tema_gerado_id: number | null;
  geracao_id: number | null;
  criado_em: Generated<Data>;
}

export interface Publicacao {
  id: Generated<number>;
  versao: number;
  hash_conteudo: string;
  total_assuntos: number;
  total_temas: number;
  publicado_por: number | null;
  criado_em: Generated<Data>;
}

export interface Auditoria {
  id: Generated<number>;
  usuario_id: number | null;
  entidade: string;
  entidade_id: number;
  acao: string;
  dados_antes: unknown | null;
  dados_depois: unknown | null;
  criado_em: Generated<Data>;
}

export interface Banco {
  usuario_admin: UsuarioAdmin;
  sessao: Sessao;
  categoria: Categoria;
  tema: Tema;
  assunto: Assunto;
  sugestao: SugestaoTabela;
  publicacao: Publicacao;
  auditoria: Auditoria;
}
