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
COPY src/ ./src/
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
