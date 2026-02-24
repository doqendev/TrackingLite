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
ENV NODE_OPTIONS="--max-old-space-size=1024"

CMD ["sh", "-c", "pnpm prisma migrate resolve --applied 0_init 2>&1 || true; pnpm prisma migrate deploy && exec node .next/standalone/server.js"]
