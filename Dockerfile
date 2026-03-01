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
ENV STANDALONE=true
RUN pnpm next build
RUN cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static && cp -r messages .next/standalone/messages && cp server.js .next/standalone/server-entry.js

# Cache bust: 2026-02-28T16
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV AUTH_TRUST_HOST=true
ENV NODE_OPTIONS="--max-old-space-size=1024"

EXPOSE 3000

CMD ["node", ".next/standalone/server-entry.js"]
