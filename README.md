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

### 🐳 Docker

Sobe API + Redis de uma vez (a API escuta na `API_PORT`, padrão `8080`):

```sh
docker compose up -d --build
```

- **Multi-stage** sobre `node:22-bookworm-slim`, rodando como usuário `node` com o
  **Chrome for Testing** baixado pelo próprio puppeteer (mesmo build validado contra o
  Cloudflare — nada de Chromium de distro).
- `HEADLESS=true` já é o padrão no container; o perfil do Chromium persiste no volume
  `chrome-profile`, então o token de passagem sobrevive a restarts.
- Redis acessível dentro da rede como `REDIS_URL=redis://redis:6379`.

### 🗺️ Rotas

Base URL: `http://localhost:8080/api/v1` (Swagger UI em `/api-docs`).

| Rota | Descrição |
|------|-----------|
| `GET /match` | Partidas ao vivo + futuras: `{ live: MatchItem[], upcoming: MatchItem[] }`. Cada item traz `eventId`, `event`, placar do mapa atual (`team1Score`/`team2Score`), série (`team1SeriesScore`/`team2SeriesScore`), `currentMap`, `format`, `stars` e `date` (unix ms). Duplicadas (destaque/pinada vs agenda) são deduplicadas |
| `GET /match/info/:matchId` | Detalhe da partida: times (logo, url, score, nacionalidade), data, veto/maps, evento |
| `GET /match/score/:matchId` | Estado/placar da partida: status, times com série, mapas com half-scores |
| `GET /match/results?offset=` | Partidas encerradas (mais recentes primeiro), `{ matches, pagination }` — `offset` em múltiplos de 100 |
| `GET /event` | `{ ongoing: EventItem[], upcoming: (EventItem & { location, prizePool, teamsCount, big, banner })[] }`, com `startDate`/`endDate` ISO |
| `GET /event/info/:eventId` | Detalhe do evento: status (`upcoming/live/finished`), datas ISO, prize pool, local, placements, times participantes (rank HLTV/VRS), eventos relacionados |
| `GET /team/info/:teamId` · `GET /team/matches/:teamId` · `GET /team/search/:name` | Times |
| `GET /player/info/:playerId` · `GET /player/search/:name` | Jogadores |
| `GET /ranking/{year}/{month}/{day}[/{country}]` | Ranking |
| `GET /search?query=` | Busca geral |
| `GET /util/expire-all` | Limpa o cache |

Documentação completa dos schemas no Swagger UI (`/api-docs`).

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
- **Puppeteer 25 / Chrome atual**: com o Chrome em versão corrente (modo `--headless=new`),
  o fingerprint headless deixou de ser desafiado — `HEADLESS=true` funciona direto.
  Se algum path voltar a ser desafiado no seu IP, rode `HEADLESS=false` (local ou sob
  `xvfb-run` em Linux) que o desafio auto-passa na janela de espera.
- **Instância única**: o browser é compartilhado pelo processo — não rode duas instâncias
  da API apontando para o mesmo `data/chrome-profile` (lock de perfil).
- **CapSolver (opcional)**: válvula de escape paga para quando o desafio resiste à espera
  passiva. Ative com `CAPSOLVER_API_KEY` + `CAPSOLVER_PROXY` (proxy **estático/sticky** —
  o `cf_clearance` devolvido fica atado ao IP do solve, então o browser também passa a
  sair por esse proxy). Sem as variáveis, nada muda: a espera passiva e o 503+stale
  seguem como padrão, e o solve só acontece depois dela falhar (single-flight, 1 solve
  pago por ~10 min no máximo).

## ❤️ Agradecimentos  

- [HLTV](https://www.hltv.org/) pelo trabalho incrível no cenário de CS  

---
