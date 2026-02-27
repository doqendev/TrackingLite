# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
RUN npm install -g pnpm@10
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---- Stage 2: Build + Run ----
FROM node:20-alpine
RUN apk add --no-cache openssl
RUN npm install -g pnpm@10
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm prisma generate
RUN pnpm next build
RUN cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static && cp -r messages .next/standalone/messages

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV AUTH_TRUST_HOST=true
ENV NODE_OPTIONS="--max-old-space-size=384"

EXPOSE 3000

CMD ["sh", "-c", "\
  attempt=0; \
  until pnpm prisma migrate deploy || [ $attempt -ge 5 ]; do \
    attempt=$((attempt + 1)); \
    echo \"Migration attempt $attempt failed, retrying in 3s...\"; \
    sleep 3; \
  done; \
  exec node .next/standalone/server.js"]
