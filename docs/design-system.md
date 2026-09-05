# Espontâneo: design system

Substitui o manual de marca anterior. O nome mudou, e com ele a âncora visual.

---

## 1. O nome

**Espontâneo**

Tem uma tensão produtiva dentro dele: o produto ensina preparo (dez minutos de estudo) para produzir naturalidade. O nome promete o resultado, não o método, que é como nome de produto deve funcionar.

**Tagline: espontâneo se treina.**

Domínios: `espontaneo.co`, `espontaneo.com.br`. O acento cai na URL, como sempre cai, e isso não atrapalha.

O acento circunflexo é a marca. Sozinho, ele funciona como ícone: lê como telhado, como faísca, como seta subindo, e ninguém mais está usando um circunflexo solto como símbolo. Logotipo é a palavra em caixa baixa com o circunflexo em azul de caneta. Ícone do app é só o circunflexo sobre o fundo.

---

## 2. A âncora: a caixinha de promessas

Toda igreja brasileira tem uma. Caixinha com papelzinhos dobrados, cada um com um versículo, e você tira um sem escolher. É exatamente a mecânica do produto, e é de onde sai o visual inteiro.

Consequências diretas:

- A pauta não é um card. É **um papelzinho**: papel claro sobre o fundo, com vinco de dobra, sombra dura de objeto físico e uma inclinação de menos de um grau que **muda a cada sorteio**. Essa micro-rotação aleatória é o detalhe que faz a tela não parecer gerada por template, porque template não desalinha nada de propósito.
- Papelzinho de caixinha é de papel colorido. Então a cor do papel **codifica a categoria**. Cor carregando informação, não decorando.
- O fundo não é branco nem preto: é o verde-acinzentado de parede de salão de igreja. Cor específica, escolhida, que ninguém usa por padrão.

## 3. Cores

| Token | Hex | Papel |
|---|---|---|
| `--sala` | `#DBDED4` | Fundo. Verde-cinza de parede de salão |
| `--papel` | `#FBFAF6` | O papelzinho |
| `--tinta` | `#10193B` | Texto. Azul-preto de caneta, não um preto disfarçado |
| `--caneta` | `#1C34A8` | Ação e estado ativo. Azul de esferográfica |
| `--carmim` | `#A81C2E` | Alerta sobre fundo claro |
| `--alerta` | `#FF6A54` | O mesmo papel sobre a tela invertida. O carmim não tem contraste sobre `--tinta`, então a contagem final e a frase de fim usam este |
| `--traco` | `rgba(16,25,59,.14)` | Linhas e bordas |

Tintas de papel por categoria, todas a um passo do `--papel`: evangelhos `#F7F3E8`, salmos `#EDF1FA`, cartas `#F8EFEF`, antigo testamento `#EEF4EE`, doutrina `#F3EFF8`, vida cristã `#FAF2E9`, juventude `#EBF4F4`.

Regras:

- Azul é ação, vermelho é urgência, e nenhum dos dois decora. Se o vermelho aparecer fora dos dez segundos finais, perde a função.
- Sem gradiente em superfície nenhuma.
- Sombra é dura e deslocada (`10px 12px 0`), como objeto sobre mesa. Nada de borrão cinza suave embaixo de tudo.
- O estado ativo (estudando, falando) **inverte a tela inteira**: fundo `--tinta`, texto `--papel`. Sem cor nova para sinalizar mudança de modo, a inversão já é o sinal.

## 4. Tipografia

**Familjen Grotesk** para interface, botões, cronômetro e logotipo. Grotesca com detalhes irregulares no "a" e no "g", o que dá personalidade sem custar legibilidade. Não é Inter, não é Poppins, não é Space Grotesk.

**Petrona** para o texto do papelzinho: referência e provocação. Serifada variável, um pouco estreita, com calor de coisa impressa. Segura corpo grande sem virar convite de casamento.

Escala, base 17px, razão 1,333:

| Papel | Fonte | Tamanho | Peso | Entrelinha |
|---|---|---|---|---|
| Provocação no papelzinho | Petrona | 34 a 49px | 500 | 1,15 |
| Referência | Petrona | 21px | 600 | 1,2 |
| Cronômetro | Familjen Grotesk | 96 a 140px | 500 | 0,9 |
| Botão principal | Familjen Grotesk | 19px | 600 | 1 |
| Categoria | Familjen Grotesk | 17px | 500 | 1,3 |
| Apoio | Familjen Grotesk | 14px | 400 | 1,5 |

Proibido, e isso é específico:

- **Nada de caixa alta** em rótulo, categoria, botão ou etiqueta. Nenhuma.
- Nada de destacar uma palavra do título em cor, itálico ou peso diferente.
- Nada de rótulo em cima de conteúdo que já se explica. Se a provocação está lá, ela não precisa de "sua pauta" em cima.
- Nada de seta no fim do texto do botão.
- Serifada só no papelzinho. Fora dele, nunca.

Os dígitos do cronômetro andam em caixa de largura fixa, senão eles dançam a cada segundo e a tela inteira treme.

## 5. Layout

Composição centrada, em eixo. E ela é centrada por um motivo do próprio objeto: papelzinho de caixinha de promessas vem **dobrado em quatro**, e a cruz dos dois vincos define o centro. A referência fica acima do vinco horizontal, a provocação abaixo. O layout obedece à dobra.

Atrás do papel sorteado ficam duas folhas da pilha, cada uma com sua própria inclinação aleatória. É o que faz a tela parecer uma caixinha com papéis dentro, e não um card com sombra.

```
                    espontâneo^

     tudo  evangelhos  salmos  cartas  antigo testamento

                 ┌─────────┬─────────┐
                 │         │         │
                 │   Lucas 15:11-32  │
                 ├─────────┼─────────┤
                 │  Fale sobre o pai │
                 │    que correu.    │
                 └─────────┴─────────┘
                   (duas folhas atrás,
                    cada uma torta)

                    ( Sortear )
              estudar 10 min   falar 1 min
```

As categorias são uma linha corrida de palavras centralizada, não uma fileira de pílulas. A ativa fica em azul de caneta com um traço fino embaixo.

No celular vira coluna única: categorias roláveis no topo sangrando até a borda, papel ocupando o meio da tela, botão de sortear com a largura inteira. Sem rolagem, porque a pessoa usa isso em pé, cinco minutos antes de falar.

Raio de canto varia por função, de propósito: papel tem 3px (papel cortado), botão é pílula (botão de máquina), a lista de categorias não tem raio nenhum. Um raio só para tudo é justamente o que faz interface parecer kit.

O papel leva grão: uma textura de ruído a 4,5% de opacidade, em multiply. Não aparece de longe, mas tira o plástico da superfície.

## 6. Movimento

**Um** momento animado no produto inteiro: o sorteio. O papel atual sai para baixo, o novo entra e assenta numa rotação aleatória entre -1,2° e 1,2°, as folhas da pilha se reacomodam, e o circunflexo do logotipo dá um pulo curto. Três coisas, um gesto só, 220ms, curva firme, sem quique longo.

Fora isso: nenhuma entrada com fade e subida por seção, nenhuma transição em hover de cartão, nenhuma animação que a pessoa não pediu. `prefers-reduced-motion` troca o sorteio por uma troca de opacidade de 120ms.

**O cronômetro colapsa.** Nos últimos dez segundos, o relógio abandona o formato `mm:ss` e vira um numeral só, gigante: 10, 9, 8, até 1. A contagem deixa de ser leitura e vira presença periférica, que é o que serve para quem está falando e não pode olhar para a tela.

**No zero, número vira frase.** O contador não para em 0: ele é substituído por "Deu o tempo", na serifada da provocação, no mesmo vermelho da contagem. O relógio some quando não há mais tempo para contar, e o que fica na tela é a informação que importa. Se a pessoa encerrou antes do tempo, a frase é outra ("Fim da fala"), porque a interface não inventa um estouro que não houve.

**Nada avança sozinho.** No zero, a tela para e fica lá: o numeral em 0, o rótulo dizendo que deu o tempo, e um botão para começar a etapa seguinte. Estudo esgotado não empurra ninguém para o microfone, e fala esgotada não volta para a pilha antes da hora. A transição entre etapas é sempre um gesto da pessoa.

**Parar é pausar.** O botão congela o tempo e mantém a tela, com o cronômetro em 40% de opacidade sinalizando a pausa sem precisar da palavra "pausado" escrita em lugar nenhum. Sair da sessão é uma ação separada e discreta.

**A pauta nunca sai da tela.** Nos dois cronômetros, o tema, a referência e a provocação continuam visíveis acima do tempo, na mesma hierarquia do papelzinho. Quem está falando não pode depender da memória do que sorteou, e quem está estudando não deveria precisar voltar para conferir.

## 7. Escrita

Frase normal, verbo ativo, sem filete. O nome da ação é o mesmo do começo ao fim: o botão diz "Sortear", e o que acontece é um sorteio.

| Escreva | Não escreva |
|---|---|
| Sortear | Descubra sua pauta |
| Estudar 10 min | Iniciar imersão |
| Já estudei | Concluí minha preparação |
| Sua vez de falar | Solte o que Deus colocou no seu coração |
| Nada salvo ainda. Sorteia uma. | Você ainda não tem pautas salvas :( |
| Deu o tempo | Que pena, o tempo acabou |

Tela vazia convida para a ação seguinte. Erro diz o que aconteceu e o que fazer, sem pedir desculpa. Nada de emoji na interface.

## 8. Tokens

```css
:root {
  --sala:   #DBDED4;
  --papel:  #FBFAF6;
  --tinta:  #10193B;
  --caneta: #1C34A8;
  --carmim: #A81C2E;
  --alerta: #FF6A54;
  --traco:  rgba(16, 25, 59, .14);

  --ui:    "Familjen Grotesk", system-ui, sans-serif;
  --serif: "Petrona", Georgia, serif;

  --u: 8px;              /* toda medida é múltiplo */
  --raio-papel: 3px;
  --sombra-papel: 10px 12px 0 rgba(16, 25, 59, .10);
}
```

O protótipo em `prototipo.html` implementa tudo isso funcionando: sorteio, cronômetros, inversão de tela e o especimen dos tokens no fim da página.

## 9. O que foi descartado, e por quê

Registro para não voltar atrás sem querer:

- **Quadro de hinos** como âncora: bom, mas a caixinha de promessas é mais próxima da mecânica e mais afetiva.
- **Fundo creme com serifada de alto contraste e acento terracota**: é a combinação que toda interface gerada por IA está usando neste momento. Foi por isso que o fundo virou verde-acinzentado e o acento virou azul de caneta.
- **Preto quase preto (#111) como fundo com um acento vermelho vivo**: mesmo problema, virou padrão. O escuro daqui é azul de verdade, `#10193B`, e só aparece no estado invertido.
- **Rótulos em caixa alta espaçada** e cartões arredondados iguais: os dois maiores denunciadores de layout de template.
