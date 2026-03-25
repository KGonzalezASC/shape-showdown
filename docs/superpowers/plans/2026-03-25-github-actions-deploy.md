# GitHub Actions Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Настроить автоматический деплой BubbleBlitzers на VPS через GitHub Actions: сервер — Docker-контейнер, клиент — статические файлы через nginx.

**Architecture:** При пуше в `main` CI собирает клиент (Vite → `dist/`), копирует весь проект на сервер через SCP, затем по SSH копирует `dist/` в nginx-директорию и поднимает Docker-контейнер с сервером. Порт сервера и URL клиента передаются через GitHub Secrets и нигде не хардкодятся в репозитории. `docker-compose.yml` читает `SERVER_PORT` из `.env`-файла, который создаётся на сервере при каждом деплое.

**Tech Stack:** Docker (multi-stage build, node:22-alpine), docker-compose, GitHub Actions (appleboy/scp-action, appleboy/ssh-action), Node.js 22, esbuild (server bundle), Vite (client build).

---

## Файловая карта изменений

| Файл | Действие | Назначение |
|------|----------|-----------|
| `Dockerfile` | Create | Multi-stage сборка Node.js сервера |
| `docker-compose.yml` | Create | Production-контейнер с портом из env |
| `.dockerignore` | Create | Исключить клиентский код и dev-артефакты из Docker build context |
| `.github/workflows/deploy.yml` | Create | CI/CD pipeline |

`.gitignore` уже содержит `.env*` (кроме `.env.example`) — менять не нужно.

---

## GitHub Secrets (добавить вручную в настройках репозитория)

Перед выполнением плана нужно добавить в `Settings → Secrets → Actions` репозитория BubbleBlitzersJS:

| Secret | Пример | Описание |
|--------|--------|----------|
| `REMOTE_HOST` | `yourdomain.com` | IP или домен сервера |
| `REMOTE_USER` | `ubuntu` | SSH-пользователь |
| `REMOTE_PASSWORD` | `***` | SSH-пароль |
| `SERVER_PORT` | `10905` | Внутренний порт сервера (WS, plain) |
| `GAME_SERVER_URL` | `wss://yourdomain.com:10105` | WSS URL для клиента (nginx external port) |
| `CLIENT_DEPLOY_PATH` | `/var/www/bubble-blitzers` | Путь nginx для статики клиента |

---

## Task 1: Dockerfile

**Files:**
- Create: `Dockerfile`

Multi-stage сборка: `deps` (prod зависимости) → `builder` (TypeScript → `dist-server/server.mjs`) → `runner` (минимальный образ).

Почему multi-stage: итоговый образ содержит только runtime — `dist-server/`, `node_modules/` (prod only), `config/server.json`. Dev-зависимости (esbuild, vite, TypeScript и т.д.) в образ не попадают.

- [ ] **Step 1: Создать `Dockerfile`**

```dockerfile
# ---- production dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- build server bundle ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server.ts tsconfig.json ./
COPY server/ ./server/
RUN npm run build:server

# ---- minimal runtime image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist-server ./dist-server
COPY config/server.json ./config/server.json
EXPOSE 3000
CMD ["node", "dist-server/server.mjs"]
```

Заметки:
- `npm run build:server` запускает `esbuild server.ts --packages=external`, поэтому `node_modules` нужны в `runner`
- `config/server.json` монтируется для настроек `host` и `serveClient`; порт переопределяется через `PORT` env var
- `EXPOSE 3000` — документация, реальный порт задаётся в `docker-compose.yml`

- [ ] **Step 2: Проверить синтаксис**

```bash
cd /home/rariaden/.openclaw/workspace-claude-acp/BubbleBlitzersJS
docker build --no-cache -t bubble-blitzers-test . 2>&1 | head -20
```

Если Docker не доступен локально — пропустить, валидация произойдёт при первом деплое.

- [ ] **Step 3: Коммит**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile for server"
```

---

## Task 2: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

`SERVER_PORT` читается из `.env` файла (создаётся при деплое через SSH, в git не попадает).

- [ ] **Step 1: Создать `docker-compose.yml`**

```yaml
services:
  bubble-blitzers-server:
    build: .
    container_name: bubble-blitzers-server
    restart: unless-stopped
    ports:
      - "127.0.0.1:${SERVER_PORT}:${SERVER_PORT}"
    environment:
      - NODE_ENV=production
      - PORT=${SERVER_PORT}
```

Заметки:
- `127.0.0.1:` — порт доступен только локально; nginx проксирует WSS снаружи
- `PORT=${SERVER_PORT}` — `loadServerConfig()` читает этот env var и переопределяет порт из `config/server.json`
- `.env` файл с `SERVER_PORT=<значение>` создаётся SSH-шагом деплоя, docker-compose подхватывает автоматически

- [ ] **Step 2: Валидация (если docker-compose доступен локально)**

Создать временный `.env` и проверить конфиг:
```bash
echo "SERVER_PORT=10905" > .env
docker compose config
rm .env
```
Ожидаемый результат: конфиг распечатан без ошибок, порт подставился как `10905`.

- [ ] **Step 3: Коммит**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose for production server"
```

---

## Task 3: .dockerignore

**Files:**
- Create: `.dockerignore`

Исключает из Docker build context файлы, которые не нужны для сборки сервера — клиентский код, `node_modules`, `dist/` и т.д. Уменьшает размер контекста и ускоряет `docker build`.

- [ ] **Step 1: Создать `.dockerignore`**

```
node_modules/
dist/
dist-server/
.dev-server.mjs
src/
public/
index.html
vite.config.mjs
.env*
.git/
*.md
coverage/
docs/
```

Что остаётся в контексте (нужно для Dockerfile):
- `server.ts`, `server/` — исходник сервера
- `tsconfig.json` — нужен esbuild
- `package*.json` — для `npm ci` внутри Docker
- `config/server.json` — скопируется в `runner`

- [ ] **Step 2: Коммит**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for server build"
```

---

## Task 4: .github/workflows/deploy.yml

**Files:**
- Create: `.github/workflows/deploy.yml`

Workflow состоит из двух этапов:
1. **Build** (в CI runner): `npm ci` + inject `game-config.json` + `npm run build:client` → `dist/`
2. **Deploy** (на сервере): SCP исходников → SSH (создать `.env`, скопировать `dist/` в nginx, `docker compose up`)

- [ ] **Step 1: Создать директорию и файл**

```bash
mkdir -p /home/rariaden/.openclaw/workspace-claude-acp/BubbleBlitzersJS/.github/workflows
```

Создать `.github/workflows/deploy.yml`:

```yaml
name: Deploy BubbleBlitzers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Set game server URL
        run: echo '{"gameServerUrl":"${{ secrets.GAME_SERVER_URL }}"}' > public/game-config.json

      - name: Build client
        run: npm run build:client

      - name: Copy project to server
        uses: appleboy/scp-action@v0.1.4
        with:
          host: ${{ secrets.REMOTE_HOST }}
          username: ${{ secrets.REMOTE_USER }}
          password: ${{ secrets.REMOTE_PASSWORD }}
          source: "."
          target: "~/bubble-blitzers"
          rm: true
          exclude: "node_modules,.git"

      - name: Deploy server and client
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: ${{ secrets.REMOTE_HOST }}
          username: ${{ secrets.REMOTE_USER }}
          password: ${{ secrets.REMOTE_PASSWORD }}
          script: |
            echo "SERVER_PORT=${{ secrets.SERVER_PORT }}" > ~/bubble-blitzers/.env
            mkdir -p ${{ secrets.CLIENT_DEPLOY_PATH }}
            rm -rf ${{ secrets.CLIENT_DEPLOY_PATH }}/*
            cp -r ~/bubble-blitzers/dist/. ${{ secrets.CLIENT_DEPLOY_PATH }}/
            cd ~/bubble-blitzers
            docker compose up -d --build --force-recreate
```

Ключевые моменты:
- `exclude: "node_modules,.git"` — не копируем ~150MB node_modules на сервер (Docker сам делает `npm ci` при билде)
- `dist/` присутствует в SCP потому что была собрана в CI (файловая система runner, не git)
- `.env` с `SERVER_PORT` создаётся ПОСЛЕ SCP, так что `rm: true` его не удалит
- `cp -r ~/bubble-blitzers/dist/. $CLIENT_DEPLOY_PATH/` — копирует содержимое `dist/`, а не саму папку
- `docker compose up --build --force-recreate` — пересобирает образ и поднимает контейнер

- [ ] **Step 2: Коммит**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add GitHub Actions deploy workflow"
```

---

## Task 5: Push и проверка

- [ ] **Step 1: Убедиться что все коммиты на main**

```bash
cd /home/rariaden/.openclaw/workspace-claude-acp/BubbleBlitzersJS
git log --oneline -6
git branch
```

- [ ] **Step 2: Push на origin/main**

```bash
git push origin main
```

- [ ] **Step 3: Проверить что workflow запустился**

Открыть: `https://github.com/AVLitskevich/BubbleBlitzersJS/actions`

Ожидаемый результат: появился новый запуск `Deploy BubbleBlitzers`, все шаги зелёные.

---

## Итоговая схема деплоя

```
git push → main
    ↓
GitHub Actions (ubuntu-latest)
    ├─ npm ci
    ├─ inject GAME_SERVER_URL → public/game-config.json
    ├─ npm run build:client → dist/
    ├─ SCP . → ~/bubble-blitzers/ (без node_modules, .git)
    └─ SSH:
         ├─ echo "SERVER_PORT=10905" > ~/bubble-blitzers/.env
         ├─ cp -r dist/ → /var/www/bubble-blitzers/    (nginx)
         └─ docker compose up --build                   (server)
                 ↓
           Docker multi-stage build:
             deps: npm ci --omit=dev
             builder: npm run build:server → dist-server/server.mjs
             runner: node dist-server/server.mjs (PORT=10905)
                 ↓
           Container: ws://localhost:10905
                 ↓
           Nginx: wss://domain.com:10105 → ws://localhost:10905
```
