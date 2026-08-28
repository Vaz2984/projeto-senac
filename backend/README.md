# FactAI — backend

API que recebe o texto de uma notícia (extraído pela extensão) e devolve um
veredito **verde / amarelo / vermelho** com score 0-100 e os motivos. Feito
para rodar **na nuvem**, nunca em `localhost` — a extensão só funciona
apontando para uma URL pública.

Combina 4 sinais, cada um opcional e independente (ver `src/analysis/`):

| Sinal | Sempre ativo? | O que faz |
|---|---|---|
| `domainReputation.js` | ✅ sempre | Consulta a lista local (`src/data/domains.json`) de domínios confiáveis/duvidosos/fake/sátira |
| `heuristics.js` | ✅ sempre | Detecta clickbait, CAIXA ALTA, pontuação exagerada, ausência de autor/data |
| `factcheck.js` | Requer `GOOGLE_FACT_CHECK_API_KEY` | Consulta o Google Fact Check Tools API em tempo real (Aos Fatos, Lupa, Boatos.org e milhares de outras agências) |
| `llm.js` | Requer `ANTHROPIC_API_KEY` | Manda o texto para a IA da Anthropic avaliar sinais de desinformação no conteúdo em si |

Sem nenhuma chave configurada, o backend **continua funcionando** só com os
dois primeiros sinais — fica mais preciso conforme você configura cada
chave. Nada é persistido em banco de dados (ver `PRIVACY.md`).

## Rodando localmente (para testar antes do deploy)

```bash
cd backend
cp .env.example .env   # opcional: preencha as chaves se já tiver
npm install
npm start
```

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://exemplo.com/materia","domain":"g1.globo.com","title":"Título da notícia","text":"Texto do artigo com pelo menos algumas frases..."}'
```

Isso é só para desenvolvimento — para a extensão funcionar de verdade (e não
só em `localhost`), siga o deploy abaixo.

## Deploy na nuvem (Render — recomendado, plano gratuito)

1. Suba este repositório para o seu GitHub (se ainda não estiver lá).
2. Crie uma conta em [render.com](https://render.com).
3. **New** → **Blueprint** → conecte o repositório. O Render detecta o
   arquivo `backend/render.yaml` automaticamente e já cria o serviço
   configurado (`rootDir: backend`, build e start commands corretos).
4. Depois do primeiro deploy, vá em **Environment** e preencha
   `GOOGLE_FACT_CHECK_API_KEY` e/ou `ANTHROPIC_API_KEY` (opcionais — veja
   como obter cada uma abaixo).
5. Copie a URL pública que o Render gerou (algo como
   `https://factai-backend.onrender.com`) — é isso que você vai colar nas
   opções da extensão.

> Plano gratuito do Render "dorme" depois de um tempo sem uso e demora
> alguns segundos para acordar na primeira requisição — normal, não é bug.

### Alternativas (Railway / Fly.io / servidor próprio)

- **Railway**: New Project → Deploy from GitHub → aponte a raiz para
  `backend/` → configure as mesmas variáveis de ambiente do `.env.example`
  → Railway expõe uma URL pública automaticamente.
- **Fly.io**: use o `Dockerfile` incluído — `fly launch` na pasta
  `backend/` e `fly secrets set ANTHROPIC_API_KEY=... GOOGLE_FACT_CHECK_API_KEY=...`.
- **Servidor/VPS próprio**: `docker build -t factai-backend . && docker run -p 3000:3000 --env-file .env factai-backend` (lembre de colocar um proxy HTTPS na frente, ex.: Caddy/Nginx).

## Como obter as chaves (ambas opcionais)

### Google Fact Check Tools API (gratuita)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um projeto (ou use um existente).
3. Vá em **APIs e Serviços → Biblioteca**, busque **"Fact Check Tools API"**
   e clique em **Ativar**.
4. Vá em **APIs e Serviços → Credenciais → Criar Credenciais → Chave de
   API**.
5. Copie a chave e cole em `GOOGLE_FACT_CHECK_API_KEY` no Render (ou no
   `.env` local).

### Anthropic API (Claude) — uso pago, poucos centavos por análise

1. Crie uma conta em [console.anthropic.com](https://console.anthropic.com/).
2. Vá em **API Keys → Create Key**.
3. Copie a chave (começa com `sk-ant-...`) e cole em `ANTHROPIC_API_KEY`.
4. **Nunca** cole essa chave na extensão nem em nenhum lugar público — ela
   fica só nas variáveis de ambiente do servidor.

## Variáveis de ambiente

Veja `.env.example` para a lista completa e comentada. Nenhuma é
obrigatória para o serviço subir; `GOOGLE_FACT_CHECK_API_KEY` e
`ANTHROPIC_API_KEY` são as únicas que mudam o comportamento (ativam sinais
extras).

## Segurança

Veja `PRIVACY.md` para o detalhamento completo (CORS, rate limiting,
validação de entrada, por que o backend nunca busca URLs arbitrárias, como
o texto é tratado ao ser enviado à IA, etc).
