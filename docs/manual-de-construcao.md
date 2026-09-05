# Em Verso: manual de construção

Um gerador de pautas para quem vai falar da Palavra. Gira um texto, estuda 10 minutos, fala 1 minuto.

Este manual assume que o produto de referência é o [empauta.co](https://empauta.co) e descreve como construir o equivalente para o nicho cristão sem copiar código, só a mecânica.

---

## 1. A mecânica desmontada

O Em Pauta parece um brinquedo, mas é um aparelho de treino com quatro peças:

| Peça | Função real |
|---|---|
| Roleta de assuntos | Tira do usuário a decisão do "sobre o que falar", que é onde a maioria trava |
| Filtro por categoria | Deixa o usuário treinar o repertório que ele quer melhorar |
| Timer de pesquisa (10 min) | Cria pressão e ensina a sintetizar rápido |
| Timer de fala (1 min) | Força entrega, não preparo infinito |
| Salvos | Faz o usuário voltar |

Não existe backend, login, nem conteúdo gerado por IA em tempo real. O valor está inteiro no **banco de pautas curado**. Isso é bom: significa que o produto é barato de manter e difícil de copiar bem.

## 2. A tradução para o nicho

O erro óbvio seria trocar "moda" por "fé" e manter o resto. A adaptação boa muda a natureza do exercício:

| Em Pauta | Em Verso |
|---|---|
| Assunto solto | Texto bíblico + provocação (um ângulo específico) |
| Pesquisar 10 min | Estudar 10 min (contexto, quem escreveu, para quem) |
| Falar 1 min | Falar 1 min (o corte curto é o exercício: obriga a escolher uma ideia só) |
| Categorias de nicho editorial | Blocos bíblicos e temáticos |
| Uso individual | Uso individual **e em grupo** |

**Modo grupo** é a maior diferença competitiva e não existe no original: um líder gira, projeta ou lê em voz alta, todos estudam 10 minutos, e uma pessoa sorteada fala. Isso transforma o site numa dinâmica pronta de célula, classe e reunião de jovens. É o que vai fazer o link circular em grupo de WhatsApp de liderança.

Público primário, em ordem: quem já fala (professores de classe, líderes de célula, pregadores iniciantes), quem quer começar a falar, e quem só quer meditar com direção.

## 3. Escopo da v1

Corte impiedoso. A v1 é:

- Roleta com sorteio sem repetição
- Filtro por categoria
- Timer de estudo e timer de fala
- Salvar pautas (localStorage, sem conta)
- Compartilhar pauta como imagem ou link
- Funciona offline
- Modo grupo (só uma variação de tempos e um botão de "sortear quem fala")

Não entra na v1: login, contas, gravação de áudio, comentários, ranking, IA, versículo completo dentro do app.

Sobre o último item: exibir o **texto integral** de uma tradução como ARA, NVI ou NAA é conteúdo licenciado. Na v1, exiba **só a referência** (ex: Lucas 15:11-32) e um botão que abre a passagem em um site externo. Se quiser o texto embutido depois, use uma tradução de domínio público em português (Almeida Corrigida Fiel / ACF e a Almeida Revista e Corrigida de 1911 são as saídas usuais) ou negocie permissão com a sociedade bíblica correspondente. Não pule esse detalhe, é o único risco jurídico real do projeto.

## 4. Stack e arquitetura

Site estático. Sem servidor, sem banco.

```
em-verso/
├── public/
│   ├── icons/            # PWA
│   └── og/               # imagens de compartilhamento
├── src/
│   ├── data/
│   │   ├── pautas.json   # o produto de verdade
│   │   └── categorias.json
│   ├── lib/
│   │   ├── shuffle.ts    # sorteio sem repetição
│   │   ├── timer.ts      # timer resistente a tela apagada
│   │   ├── storage.ts    # salvos + estado
│   │   └── share.ts      # imagem + Web Share API
│   ├── components/
│   └── App.tsx
└── vite.config.ts
```

Recomendação: **Vite + React + TypeScript + Tailwind**. Se preferir zero framework, Vite + TS puro dá conta, o app tem uns 6 estados. Astro só compensa se você planeja páginas de conteúdo (blog, SEO) desde o início.

Você não precisa de backend agora. Se em algum momento quiser um painel de curadoria (várias pessoas sugerindo pautas, moderação, versionamento), aí sim cabe um Spring Boot + Postgres que gera o `pautas.json` num build. Mas isso é v3, e só se a curadoria virar trabalho de time. Enquanto for você editando, um JSON no Git é melhor: tem histórico, revisão e deploy automático.

Deploy: Cloudflare Pages ou Vercel, build no push. Se preferir manter na sua própria infra, um Nginx servindo o `dist` resolve, mas para estático o CDN gratuito é mais rápido e menos trabalho.

## 5. Modelo de dados

```json
{
  "id": "ev-023",
  "categoria": "evangelhos",
  "referencia": "Lucas 15:11-32",
  "titulo": "O filho que voltou",
  "provocacao": "Fale sobre o pai que correu.",
  "tags": ["graça", "arrependimento", "parábola"],
  "nivel": 1,
  "sazonal": null
}
```

Campos e por quê:

- `provocacao` é o coração. Sem ela, você tem um sorteador de versículos, que já existe aos montes. Com ela, você tem um exercício. A provocação deve dar **um ângulo**, não um resumo.
- `nivel` de 1 a 3 permite um filtro "estou começando" mais tarde, sem remodelar nada.
- `sazonal` recebe `natal`, `pascoa`, `pentecostes`, `fim-de-ano`. Alimenta a aba "Em alta" com datas do calendário cristão, que é conteúdo de graça e faz o site parecer vivo.
- `id` com prefixo de categoria facilita revisão manual e URLs compartilháveis (`/p/ev-023`).

Categorias sugeridas: Evangelhos, Salmos, Cartas, Antigo Testamento, Doutrina, Vida cristã, Juventude, Em alta.

Anexei um `pautas-seed.json` com 40 pautas prontas para você começar.

## 6. Os estados da tela

```
[ Ocioso ]  título + categorias + botão "Girar"
     ↓ girar
[ Girando ]  animação curta (600ms), respeitando prefers-reduced-motion
     ↓
[ Pauta ]  referência grande, provocação, 3 botões: Estudar / Falar / Salvar
     ↓ estudar
[ Estudando ]  contagem regressiva 10:00, botão "Já estudei"
     ↓
[ Falando ]  contagem regressiva 1:00, barra que esvazia
     ↓
[ Fim ]  "Girar de novo" ou "Salvar essa"
```

Uma tela, um foco por vez, sem menu. Tudo cabe num viewport de celular sem scroll, porque a pessoa vai usar isso em pé, no corredor da igreja, cinco minutos antes.

## 7. Detalhes que separam o feito do bem feito

**Sorteio sem repetição.** Sorteio aleatório puro repete pauta e mata a sensação de acervo. Use saco embaralhado: embaralhe os ids da categoria, consuma um por vez, persista o índice, reembaralhe quando acabar garantindo que o último da rodada anterior não seja o primeiro da nova.

```ts
export function novoSaco(ids: string[], ultimo?: string): string[] {
  const s = [...ids];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  if (s[0] === ultimo && s.length > 1) [s[0], s[1]] = [s[1], s[0]];
  return s;
}
```

**Timer que sobrevive à tela apagada.** `setInterval` decrementando contador quebra quando o celular bloqueia ou a aba vai para segundo plano. Guarde o instante final, não o restante:

```ts
const fim = Date.now() + minutos * 60_000;
localStorage.setItem("timer.fim", String(fim));
// no tick e no visibilitychange:
const restante = Math.max(0, fim - Date.now());
```

Ative `navigator.wakeLock` quando o timer de estudo começa, com fallback silencioso. E toque o som final só se o usuário já interagiu na página, senão o navegador bloqueia o áudio.

**Compartilhar.** Duas rotas: `navigator.share` com um link `/p/ev-023` no celular, e geração de imagem 1080x1350 via canvas para o feed. A imagem compartilhada é seu principal canal de aquisição, então ela merece mais capricho que a home. Coloque a marca discreta no rodapé e a provocação em destaque.

**Offline e instalável.** Manifest + service worker com cache do app shell e do `pautas.json`. Wi-fi de igreja é ruim, isso não é detalhe.

**Acessibilidade.** Contraste conferido, foco visível, `prefers-reduced-motion` desligando a animação da roleta, tamanho de fonte que dá para ler a três metros se alguém projetar no telão do modo grupo.

## 8. O banco de conteúdo é o produto

Meta: 200 pautas para lançar, 400 no primeiro semestre. Abaixo de 150 a repetição aparece rápido e o site morre.

Como produzir sem enlouquecer:

1. **Mineração do que você já tem.** Devocionais escritos, material de aula, esboços antigos. Cada esboço rende de 3 a 5 pautas, porque cada ponto do esboço já é um ângulo. Esse é o caminho mais rápido para os primeiros 100.
2. **Varredura por livro.** Escolha um livro, percorra por perícope, e para cada uma pergunte "qual é a pergunta incômoda aqui?". A pergunta incômoda vira a provocação.
3. **Curadoria, nunca geração em massa.** Você pode usar IA para rascunhar variações, mas cada pauta precisa passar pelo seu olho. Uma provocação teologicamente torta em 300 é o suficiente para queimar o projeto no meio evangélico, e a correção é pública.

Regras de escrita da provocação:

- Verbo no imperativo, uma frase, no máximo 12 palavras.
- Dá um ângulo, não um resumo: "Fale sobre o pai que correu" e não "Fale sobre a parábola do filho pródigo".
- Nunca conclui pelo usuário. A pauta abre a porta, quem prega atravessa.
- Sem jargão de púlpito ("unção", "nível", "revelação profunda"). Português comum.
- Nada que dependa de uma única tradição para funcionar. Se a pauta só faz sentido para um segmento, ela não entra.

Faça uma revisão teológica com duas ou três pessoas de confiança antes de publicar o lote inicial. É barato agora e caro depois.

## 9. Antes de publicar

- Título e descrição que expliquem o exercício em uma frase, não a categoria do app
- Imagem de OG específica, não um print da home
- `/p/:id` renderizando a pauta, para que link compartilhado abra direto naquela pauta
- Analytics sem cookie (Umami ou Plausible). Métricas que importam: giros por sessão, taxa de conclusão do ciclo estudo e fala, pautas salvas, categorias mais giradas. Essa última guia sua próxima leva de conteúdo.
- Uma linha de crédito honesta, como o próprio Em Pauta faz. Citar a inspiração é o padrão da cena e evita atrito.

## 10. Roadmap depois do lançamento

**v2**
- Modo grupo com sorteio de quem fala e projeção em tela cheia
- Sequência de dias seguidos (streak), que é o que traz de volta
- "Em Classe": variação com perguntas de discussão em vez de pauta de fala, para professores
- Filtro por nível

**v3**
- Contas e sincronização entre dispositivos
- Gravação de áudio local com playback, para a pessoa se ouvir
- Painel de curadoria com sugestões da comunidade e moderação
- Trilhas: 30 dias em Salmos, 21 dias nos Evangelhos

## 11. Cuidados próprios deste nicho

- **Não prometa resultado espiritual.** O site treina articulação, não substitui preparo, oração ou vida com Deus. Diga isso em algum lugar, com humildade e sem sermão.
- **Não vire ferramenta de improviso preguiçoso.** Deixe claro que o exercício é treino, não método de preparo de pregação. A diferença entre as duas coisas é a sua reputação.
- **Neutralidade de tradição.** Sem posições sobre temas que dividem denominações. O produto é um ginásio, não um púlpito com opinião.
- **Nada de gatilho de culpa** na cópia. "Você não estudou hoje" é o tipo de frase que faz desinstalar.

## 12. Checklist de lançamento

- [ ] 200 pautas revisadas e aprovadas por pelo menos duas pessoas
- [ ] Domínio registrado e HTTPS ativo
- [ ] Testado em Android e iPhone reais, não só no responsivo do navegador
- [ ] Timer testado com tela bloqueada por 10 minutos
- [ ] PWA instalando e funcionando em modo avião
- [ ] Imagem de compartilhamento gerando corretamente nos três tamanhos
- [ ] Referências bíblicas conferidas uma a uma (capítulo e versículo)
- [ ] Página de crédito e contato
- [ ] Analytics ativo antes do primeiro link divulgado
- [ ] Um grupo de 10 pessoas usando por uma semana antes da divulgação aberta
