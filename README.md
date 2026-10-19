<h1 align="center">HLTV API</h1>
<p align="center">🛠️ API REST não oficial para HLTV</p>

<p align="center">
  <img src="./.github/logo.png" width=150 />
</p>

---

## ⚙️ Tecnologias utilizadas  

- [Express](https://expressjs.com/) → Framework para aplicações web em Node.js  
- [Puppeteer](https://github.com/puppeteer/puppeteer) → Biblioteca para automação de navegação em browsers  
- [Redis](https://redis.io/) → Sistema de cache para otimizar o desempenho  

---

## 🔧 Como usar  

### 🔍 Requisitos  

- Docker e Docker Compose instalados  
- Node.js na versão LTS ou superior  

### 🏃️ Passos  

1. Clone este repositório e abra o terminal dentro do diretório do projeto.  
2. Instale as dependências com o comando:  
   ```sh
   pnpm install
   ```
3. Gere o diretório *build*:  
   ```sh
   pnpm build
   ```
4. Inicie a aplicação compilada:  
   ```sh
   pnpm start
   ```

---

## ☁️ Cloudflare e modo headless

A HLTV fica atrás do Cloudflare. Para tornar o scraping viável:

- **Perfil persistente**: o Chromium usa `data/chrome-profile`; o token de passagem do
  Cloudflare (`__cf_bm`, válido ~30 min) resolvido uma vez é reusado por todas as
  requisições e sobrevive a restarts do processo.
- **Espera do desafio**: ao detectar o desafio ("Just a moment..."), a API espera até
  `CF_CHALLENGE_WAIT_MS` (padrão 30s) pelo auto-pass do Cloudflare — ou pela resolução
  manual na janela do browser quando `HEADLESS=false`. Depois disso responde **503**
  (nunca feed vazio com 200) e serve a última cópia boa do cache com o header `X-Stale: true`.
- **Use `HEADLESS=false`**: testes empíricos mostraram que o headless do Chromium é
  desafiado por fingerprint mesmo com token válido no perfil — já o browser headed
  auto-passa (janela de ~10-50s) e as chamadas seguintes saem em ~10s sem desafio.
  Em servidor Linux sem display, execute sob `xvfb-run` com `HEADLESS=false`.
- **Instância única**: o browser é compartilhado pelo processo — não rode duas instâncias
  da API apontando para o mesmo `data/chrome-profile` (lock de perfil).

## ❤️ Agradecimentos  

- [HLTV](https://www.hltv.org/) pelo trabalho incrível no cenário de CS  

---
