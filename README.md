# FactAI

Extensão de navegador (Chrome, Edge e Firefox) que analisa a notícia aberta
na aba e mostra um **semáforo de confiabilidade**:

- 🟢 **Verde** — sem sinais relevantes de desinformação
- 🟡 **Amarelo** — sinais parciais, vale checar com cuidado
- 🔴 **Vermelho** — sinais graves de desinformação — não acredite sem checar

```
projeto-senac/
├── backend/     → API na nuvem que faz a análise (Node.js/Express)
└── extension/   → extensão para Chrome, Edge e Firefox
```

## Por que tem duas partes?

A extensão sozinha, rodando só no navegador, não teria como cruzar a
notícia com checagens de fatos em tempo real nem mandar o texto para uma
IA analisar — por isso existe o `backend/`, que você hospeda **na nuvem**
(nunca em `localhost`) e a extensão consulta a cada análise.

## Como a análise funciona

O backend combina até 4 sinais independentes (quanto mais configurados,
mais preciso o resultado — mas ele já funciona com zero configuração):

1. **Domínio** — lista local de fontes conhecidas como confiáveis, com
   viés forte, já desmentidas ou de sátira. Sempre ativo, grátis.
2. **Heurísticas de texto** — clickbait, CAIXA ALTA, ausência de
   autor/data. Sempre ativo, grátis.
3. **Google Fact Check Tools API** — cruza com checagens reais de milhares
   de agências no mundo todo (Aos Fatos, Lupa, Boatos.org, etc.), em tempo
   real. Opcional, gratuito, precisa de uma chave.
4. **IA (Anthropic/Claude)** — lê o texto do artigo e aponta sinais de
   desinformação mesmo em sites nunca vistos antes. Opcional, uso pago,
   precisa de uma chave.

Veja o passo a passo completo de deploy e de como conseguir cada chave em
[`backend/README.md`](backend/README.md).

## Começando

1. **Deploy do backend** (obrigatório, é o que faz a extensão funcionar de
   verdade e não só em localhost): siga
   [`backend/README.md`](backend/README.md) — o caminho mais rápido é o
   Render, com um Blueprint pronto (`backend/render.yaml`).
2. **Build e instalação da extensão**: siga
   [`extension/README.md`](extension/README.md) — `npm run build` gera os
   pacotes para Chrome/Edge e Firefox.
3. **Configurar**: cole a URL do backend hospedado nas opções da extensão.

## Segurança e privacidade

- Nenhum dado pessoal é coletado — só o texto público da notícia aberta,
  usado apenas durante a requisição (nada é salvo em banco de dados).
- Chaves de API ficam só no servidor (variáveis de ambiente), nunca na
  extensão nem expostas ao navegador.
- CORS restrito à extensão, rate limiting, validação de entrada, cabeçalhos
  de segurança (`helmet`) e mitigação de prompt injection na chamada à IA.
- Detalhes completos, incluindo o alinhamento com os princípios da LGPD
  (Lei 13.709/2018) e do Marco Civil da Internet (Lei 12.965/2014):
  [`backend/PRIVACY.md`](backend/PRIVACY.md).

## Limitações importantes

- **Não é um veredito jornalístico absoluto.** É um conjunto de sinais
  (domínio + heurísticas + fact-check + IA) para te ajudar a desconfiar na
  hora certa — sempre verifique em mais de uma fonte antes de acreditar ou
  compartilhar.
- O Google Fact Check Tools só encontra boatos que alguma agência já
  checou; para desinformação muito nova, o peso da IA e das heurísticas
  aumenta automaticamente (os pesos são recalculados entre os sinais
  disponíveis a cada análise).
- A lista local de domínios é um ponto de partida, não uma lista
  definitiva — está em `backend/src/data/domains.json` e pode/deve ser
  editada e ampliada.
