# FactAI — extensão

Extensão de navegador que analisa a notícia aberta na aba e mostra um
semáforo de confiabilidade direto no ícone e no popup:

- 🟢 **Verde** — sem sinais relevantes de desinformação
- 🟡 **Amarelo** — sinais parciais / vale checar com cuidado
- 🔴 **Vermelho** — sinais graves de desinformação, não acredite sem checar

A análise é feita pelo [backend do FactAI](../backend) — **você precisa
fazer o deploy dele na nuvem primeiro** (não funciona só com localhost) e
colar a URL nas configurações da extensão. Veja `backend/README.md`.

## 1. Gerar os pacotes

```bash
cd extension
npm run build
```

Isso cria `dist/chrome` (funciona em **Chrome e Edge**, mesmo pacote — os
dois usam o mesmo formato Manifest V3) e `dist/firefox`, além dos arquivos
`dist/factai-chrome.zip` e `dist/factai-firefox.zip` prontos para
publicação nas lojas.

## 2. Instalar

### Chrome

1. Acesse `chrome://extensions`.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta
   `extension/dist/chrome`.

### Microsoft Edge

1. Acesse `edge://extensions`.
2. Ative o **Modo de desenvolvedor** (menu lateral esquerdo).
3. Clique em **Carregar sem pacote** e selecione a mesma pasta
   `extension/dist/chrome` (Edge usa o formato Chromium, não precisa de
   build separado).

### Firefox

1. Acesse `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária**.
3. Selecione o arquivo `extension/dist/firefox/manifest.json`.

> No Firefox, "extensão temporária" some ao reiniciar o navegador — isso é
> uma limitação do próprio Firefox para extensões não assinadas pela AMO
> (addons.mozilla.org). Para uso permanente, publique o
> `dist/factai-firefox.zip` na AMO (mesmo que "não listado", para uso
> pessoal) — o Firefox então instala normalmente e mantém entre reinícios.

## 3. Configurar o backend

1. Clique no ícone do FactAI na barra de extensões → ⚙ (configurações), ou
   clique com o botão direito no ícone → **Opções**.
2. Cole a URL pública do backend que você hospedou (ex.:
   `https://factai-backend.onrender.com`).
3. Clique em **Salvar** e depois em **Testar conexão** para confirmar.

Pronto — abra qualquer notícia e o ícone vai colorir automaticamente.
Clique no ícone para ver o score, os motivos e (quando configurado) as
checagens de fatos e o resumo da IA.

## Como funciona por baixo dos panos

- `src/content.js` roda em toda página, extrai título/texto/autor/data
  (sem enviar nada para lugar nenhum por conta própria) e manda para o
  background.
- `src/background.js` (service worker) chama `POST {backendUrl}/api/analyze`
  no seu backend, guarda o resultado da aba atual e pinta o badge do ícone.
- `src/popup/` mostra o resultado guardado; `src/options/` guarda a URL do
  backend em `chrome.storage.local` / `browser.storage.local` (fica só no
  seu navegador, nunca é sincronizado com nenhum servidor do FactAI).

## Por que a extensão pede permissão para ler todas as páginas?

Para extrair o título/texto do artigo em qualquer site de notícia que você
abrir — é o mínimo necessário para a funcionalidade principal funcionar.
Nenhum dado é coletado além do que é enviado, por requisição, ao seu
próprio backend (ver `backend/PRIVACY.md`); não há analytics nem
telemetria embutida na extensão.

## Publicando nas lojas

- **Chrome Web Store / Edge Add-ons**: use `dist/factai-chrome.zip`
  (mesmo pacote serve para as duas lojas).
- **Firefox Add-ons (AMO)**: use `dist/factai-firefox.zip`. Troque o
  `gecko.id` em `manifest.firefox.json` antes de publicar (o valor padrão
  `factai@factai.app` é só um placeholder de desenvolvimento).
