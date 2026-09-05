import { useState } from "react";
import { sugestaoPublicaSchema } from "@espontaneo/shared";
import "./sugerir.css";

export default function Sugerir() {
  const [provocacao, setProvocacao] = useState("");
  const [autorNome, setAutorNome] = useState("");
  const [autorContato, setAutorContato] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: gente não vê
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({});
  const [estado, setEstado] = useState<"editando" | "enviando" | "enviado">("editando");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErros({});

    const bruto = {
      tipo: "ASSUNTO" as const,
      provocacao,
      autorNome: autorNome.trim() || undefined,
      autorContato: autorContato.trim() || undefined,
      website: website || undefined,
    };

    const parseado = sugestaoPublicaSchema.safeParse(bruto);
    if (!parseado.success) {
      setErros(parseado.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }

    setEstado("enviando");
    try {
      /* a API sempre responde 201, mesmo quando descarta — então a
         única resposta possível para quem envia é: obrigado */
      await fetch("/api/publico/sugestoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parseado.data),
      });
    } catch {
      /* sem rede: ainda assim agradece, não trava a pessoa */
    }
    setEstado("enviado");
  }

  return (
    <main className="sug">
      <a className="sug-marca" href="/">
        espont<span className="sug-chapeu">â</span>neo
      </a>

      {estado === "enviado" ? (
        <div className="sug-cartao sug-obrigado">
          <p className="sug-titulo">Recebido. Obrigado.</p>
          <p className="sug-texto">
            A curadoria vai ler com calma. Se entrar no baralho, uma hora ela é sorteada por aí.
          </p>
          <div className="sug-acoes">
            <a className="btn" href="/">Voltar ao início</a>
            <button
              className="btn vazado"
              onClick={() => {
                setProvocacao("");
                setEstado("editando");
              }}
            >
              Sugerir outra
            </button>
          </div>
        </div>
      ) : (
        <form className="sug-cartao" onSubmit={enviar}>
          <h1 className="sug-titulo">Sugira um assunto</h1>
          <p className="sug-texto">
            Um assunto que desperte curiosidade — algo que dê vontade de estudar e conversar.
            Curto e direto.
          </p>

          <label className="sug-campo">
            <span className="sug-rotulo">O assunto</span>
            <span className="sug-conta">{provocacao.length}/140</span>
            <textarea
              className="sug-input sug-textarea"
              value={provocacao}
              maxLength={140}
              rows={3}
              placeholder="Ex.: o peso do perdão no dia a dia"
              onChange={(e) => setProvocacao(e.target.value)}
              autoFocus
            />
            <CampoErro erros={erros.provocacao} />
          </label>

          <div className="sug-linha">
            <label className="sug-campo">
              <span className="sug-rotulo">Seu nome <span className="sug-opcional">opcional</span></span>
              <input
                className="sug-input"
                value={autorNome}
                onChange={(e) => setAutorNome(e.target.value)}
                placeholder="como te chamar"
              />
            </label>
            <label className="sug-campo">
              <span className="sug-rotulo">Contato <span className="sug-opcional">opcional</span></span>
              <input
                className="sug-input"
                value={autorContato}
                onChange={(e) => setAutorContato(e.target.value)}
                placeholder="e-mail, se quiser retorno"
              />
            </label>
          </div>

          {/* honeypot: fora da tela, só bot preenche */}
          <input
            className="sug-fora"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />

          <div className="sug-acoes">
            <button className="btn" type="submit" disabled={estado === "enviando"}>
              {estado === "enviando" ? "enviando…" : "Enviar"}
            </button>
            <a className="btn vazado" href="/">Voltar</a>
          </div>
        </form>
      )}
    </main>
  );
}

function CampoErro({ erros }: { erros?: string[] }) {
  if (!erros?.length) return null;
  return <span className="sug-erro">{erros[0]}</span>;
}
