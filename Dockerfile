# ---- build stage: compile TypeScript ----
FROM node:22-bookworm-slim AS build

# Chrome is downloaded again in the runtime stage; skip it here.
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

RUN npm install -g pnpm@11.20.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ---- runtime stage: prod deps + Chrome for Testing ----
FROM node:22-bookworm-slim AS runtime

# Dependencies required by Chrome (Debian bookworm). Kept in one layer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Headless inside containers; no display available.
ENV NODE_ENV=production \
    HEADLESS=true \
    PORT=8080 \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

WORKDIR /app

RUN npm install -g pnpm@11.20.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Prod install runs puppeteer's postinstall, which downloads Chrome for
# Testing — the exact build validated against the Cloudflare fingerprint.
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/build ./build

# Persistent Chromium profile (cf tokens, cache). Mounted as a volume so the
# clearance survives container restarts.
RUN mkdir -p data/chrome-profile && chown -R node:node /app
USER node

EXPOSE 8080

CMD ["node", "build/index.js"]
