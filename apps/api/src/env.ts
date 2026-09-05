import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/* .env sem dependência: são seis variáveis. Procura da pasta atual para
   cima porque os scripts rodam em apps/api mas o .env fica na raiz. */
const acharEnv = (): string | undefined => {
  let dir = process.cwd()
  for (;;) {
    const caminho = join(dir, '.env')
    if (existsSync(caminho)) return caminho
    const pai = dirname(dir)
    if (pai === dir) return undefined
    dir = pai
  }
}

const arquivoEnv = acharEnv()
if (arquivoEnv) {
  for (const linha of readFileSync(arquivoEnv, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const exigir = (chave: string, padrao?: string): string => {
  const v = process.env[chave] ?? padrao
  if (!v) throw new Error(`falta ${chave} no .env`)
  return v
}

export const env = {
  databaseUrl: exigir('DATABASE_URL'),
  porta: Number(process.env.PORT ?? 3335),
  sessionSecret: exigir('SESSION_SECRET', 'dev-inseguro-troque'),
  ipSalt: exigir('IP_SALT', 'dev-salt'),
  acervoDir: process.env.ACERVO_DIR ?? './.acervo',
  turnstileSecret: process.env.TURNSTILE_SECRET ?? '',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@espontaneo.local',
  adminSenha: process.env.ADMIN_SENHA ?? 'espontaneo'
}
