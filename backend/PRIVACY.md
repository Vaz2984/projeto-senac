# Privacidade e segurança — FactAI backend

Este documento descreve, de forma técnica, como o backend do FactAI trata
dados. **Não é um parecer jurídico** — é uma explicação honesta do que o
código faz, escrita para se alinhar aos princípios da LGPD (Lei
13.709/2018) e do Marco Civil da Internet (Lei 12.965/2014). Se você for
distribuir esta extensão publicamente (loja de extensões, uso por
terceiros), você é o controlador desses dados perante a lei e deve publicar
sua própria política de privacidade — este arquivo é uma base, não um
substituto.

## O que o backend recebe

A cada análise, a extensão envia ao backend **apenas** o necessário para
avaliar o artigo aberto na aba ativa:

- URL e domínio da página
- Título e texto do artigo (extraídos da própria página pública)
- Autor e data de publicação, quando presentes na página

Não há login, conta de usuário, cookies de rastreamento, identificador
publicitário ou qualquer dado pessoal do usuário da extensão sendo
coletado ou enviado.

## O que o backend faz com esses dados

- Usa o texto **só em memória, durante a requisição**, para calcular o
  score. **Nada é persistido em banco de dados** — não existe banco de
  dados no backend.
- Os logs do servidor registram apenas: domínio analisado, score, veredito
  e quais sinais foram usados (ver `src/routes/analyze.js`) — nunca o texto
  completo do artigo, nem IP associado a conteúdo, nem qualquer dado do
  usuário.
- Quando configuradas, duas APIs de terceiros podem ser chamadas **com o
  texto do artigo público** (não com dados do usuário): Google Fact Check
  Tools API e Anthropic API. Consulte as políticas de privacidade desses
  provedores se for redistribuir o serviço.

## Segurança aplicada no código

- Chaves de API (`GOOGLE_FACT_CHECK_API_KEY`, `ANTHROPIC_API_KEY`) só
  existem como variáveis de ambiente do servidor — nunca aparecem em
  resposta HTTP, log, ou no código da extensão.
- Cabeçalhos de segurança HTTP via `helmet`.
- CORS restrito a origens de extensão de navegador (`chrome-extension://`,
  `moz-extension://`, `edge-extension://`) ou a uma allowlist explícita.
- Limite de tamanho de payload (200kb) e limite de requisições por IP
  (`express-rate-limit`) contra abuso/DoS básico.
- Validação e sanitização de toda entrada antes de processar
  (`src/routes/analyze.js`).
- O backend **nunca busca uma URL arbitrária informada pelo cliente**
  (SSRF): a extração do artigo acontece inteiramente no navegador do
  usuário (`extension/src/content.js`); o servidor só recebe texto já
  extraído.
- O texto do artigo é tratado estritamente como dado ao ser enviado à IA —
  o prompt instrui explicitamente o modelo a nunca obedecer instruções
  embutidas no conteúdo da notícia (mitigação de prompt injection, ver
  `src/analysis/llm.js`).
- Erros nunca vazam stack trace nem detalhes internos na resposta HTTP.

## Recomendações para quem for publicar/hospedar isto

- Sirva sempre via HTTPS (Render, Railway e Fly.io fazem isso
  automaticamente).
- Restrinja `ALLOWED_ORIGINS` ao ID real da sua extensão publicada quando
  for para produção, em vez de aceitar qualquer `*-extension://`.
- Rotacione as chaves de API periodicamente e nunca as commite no
  repositório (o `.gitignore` já ignora `.env`).
- Se for operar em escala/comercialmente, consulte um profissional
  jurídico para confirmar conformidade completa com a LGPD (base legal,
  DPO, atendimento a titulares, etc.) — este projeto cobre a parte técnica
  de proteção de dados, não a parte regulatória/administrativa.
