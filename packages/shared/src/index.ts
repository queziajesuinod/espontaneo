import { z } from "zod";

/* Contrato único do sistema. A API valida com ele, o painel monta o
   formulário com ele, o site tipa o snapshot com ele. */

export const CATEGORIAS = [
  "evangelhos",
  "salmos",
  "cartas",
  "antigo-testamento",
  "doutrina",
  "vida-crista",
  "juventude",
] as const;

export const ROTULO_CATEGORIA: Record<string, string> = {
  evangelhos: "evangelhos",
  salmos: "salmos",
  cartas: "cartas",
  "antigo-testamento": "antigo testamento",
  doutrina: "doutrina",
  "vida-crista": "vida cristã",
  juventude: "juventude",
};

/* cor do papelzinho por categoria (design system) */
export const TINTA_CATEGORIA: Record<string, string> = {
  evangelhos: "#F7F3E8",
  salmos: "#EDF1FA",
  cartas: "#F8EFEF",
  "antigo-testamento": "#EEF4EE",
  doutrina: "#F3EFF8",
  "vida-crista": "#FAF2E9",
  juventude: "#EBF4F4",
};

export const provocacaoSchema = z
  .string()
  .trim()
  .min(10, "curta demais")
  .max(140, "passou de 140 caracteres")
  .refine((v) => !/https?:\/\//i.test(v), "sem links")
  .refine((v) => !/<[^>]+>/.test(v), "sem html");

export const referenciaSchema = z
  .string()
  .trim()
  .min(4)
  .max(80)
  .regex(/^[1-3]?\s?[A-Za-zÀ-ÿ]+(\s[A-Za-zÀ-ÿ]+)?\s\d+(:\d+(-\d+)?)?$/, "formato: Livro 1:1-10");

/* o que o site consome */
export const pautaSchema = z.object({
  codigo: z.string(),
  categoria: z.string(),
  tema: z.string(),
  referencia: z.string(),
  titulo: z.string(),
  provocacao: z.string(),
  tags: z.array(z.string()),
  nivel: z.number().int().min(1).max(3),
  sazonal: z.string().nullable(),
});

export const acervoSchema = z.object({
  versao: z.number().int(),
  geradoEm: z.string(),
  categorias: z.array(z.object({ id: z.string(), nome: z.string() })),
  pautas: z.array(pautaSchema),
});

/* o que o formulário público envia */
export const sugestaoPublicaSchema = z.object({
  tipo: z.enum(["TEMA", "ASSUNTO"]).default("ASSUNTO"),
  temaId: z.number().int().positive().optional(),
  categoriaId: z.number().int().positive().optional(),
  referencia: referenciaSchema.optional(),
  titulo: z.string().trim().max(160).optional(),
  provocacao: provocacaoSchema,
  autorNome: z.string().trim().max(120).optional(),
  autorContato: z.string().trim().max(180).optional(),
  token: z.string().optional(),
  website: z.string().max(0).optional(), // honeypot: bot preenche, gente não vê
});

export const MOTIVOS_REPROVACAO = [
  "FORA_DO_ESCOPO",
  "TEOLOGIA_QUESTIONAVEL",
  "DUPLICADA",
  "MAL_ESCRITA",
  "REFERENCIA_INCORRETA",
  "SPAM",
] as const;

/* usuários da curadoria */
export const PAPEIS = ["ADMIN", "CURADOR"] as const;
export const criacaoUsuarioSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180),
  senha: z.string().min(8, "mínimo 8 caracteres").max(200),
  papel: z.enum(PAPEIS).default("CURADOR"),
});

/* criar um tema à mão na curadoria */
export const criacaoTemaSchema = z.object({
  categoriaId: z.number().int().positive(),
  nome: z.string().trim().min(3).max(120),
  descricao: z.string().trim().max(500).optional(),
});

/* assunto enxuto: só o que a curadoria realmente edita */
export const edicaoAssuntoSchema = z.object({
  temaId: z.number().int().positive(),
  titulo: z.string().trim().min(3).max(120),
  provocacao: provocacaoSchema,
});

/* edição em painel: tudo opcional, inclusive mudar a situação */
export const SITUACOES_ASSUNTO = ["RASCUNHO", "PUBLICADO", "ARQUIVADO"] as const;
export const edicaoAssuntoParcialSchema = z.object({
  temaId: z.number().int().positive().optional(),
  titulo: z.string().trim().min(3).max(120).optional(),
  provocacao: provocacaoSchema.optional(),
  situacao: z.enum(SITUACOES_ASSUNTO).optional(),
});

export const SITUACOES_TEMA = ["PUBLICADO", "ARQUIVADO"] as const;
export const edicaoTemaSchema = z.object({
  nome: z.string().trim().min(3).max(120).optional(),
  categoriaId: z.number().int().positive().optional(),
  situacao: z.enum(SITUACOES_TEMA).optional(),
});

export type Pauta = z.infer<typeof pautaSchema>;
export type Acervo = z.infer<typeof acervoSchema>;
export type SugestaoPublica = z.infer<typeof sugestaoPublicaSchema>;
export type EdicaoAssunto = z.infer<typeof edicaoAssuntoSchema>;
export type EdicaoAssuntoParcial = z.infer<typeof edicaoAssuntoParcialSchema>;
export type EdicaoTema = z.infer<typeof edicaoTemaSchema>;
export type CriacaoTema = z.infer<typeof criacaoTemaSchema>;
export type CriacaoUsuario = z.infer<typeof criacaoUsuarioSchema>;
