# ---- production dependencies ----
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- build server bundle ----
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY server.ts tsconfig.json ./
COPY server/ ./server/
COPY src/ ./src/
RUN bun run build:server

# ---- minimal runtime image ----
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist-server ./dist-server
COPY config/server.json ./config/server.json
RUN mkdir -p public/replays
EXPOSE 3000
CMD ["bun", "dist-server/server.mjs"]
