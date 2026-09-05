import type { Transaction } from "kysely";
import type { Banco } from "../db/tipos.ts";

/* chamada dentro da transação de propósito: auditoria em plugin roda
   fora dela e mente quando o commit falha */
export async function auditar(
  trx: Transaction<Banco>,
  usuarioId: number | null,
  entidade: string,
  entidadeId: number,
  acao: string,
  antes: unknown,
  depois: unknown,
) {
  await trx
    .insertInto("auditoria")
    .values({
      usuario_id: usuarioId,
      entidade,
      entidade_id: entidadeId,
      acao,
      dados_antes: antes ? JSON.stringify(antes) : null,
      dados_depois: depois ? JSON.stringify(depois) : null,
    })
    .execute();
}
