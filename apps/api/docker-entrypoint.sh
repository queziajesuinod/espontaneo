#!/bin/sh
set -e

# 1) migrações (idempotentes — schema_migrations controla o que já rodou)
node --experimental-strip-types scripts/migrar.ts

# 2) seed só na primeira subida (quando ainda não há nenhum admin)
if [ "$(node --experimental-strip-types scripts/precisa-semear.ts)" = "sim" ]; then
  echo "banco vazio: semeando admin + pautas"
  node --experimental-strip-types scripts/semear.ts
fi

# 3) gera/atualiza o snapshot do acervo (idempotente)
node --experimental-strip-types scripts/publicar.ts

# 4) sobe o servidor
exec node --experimental-strip-types src/server.ts
