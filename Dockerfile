FROM node:22-slim AS builder

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY src ./src/
COPY scripts ./scripts/
RUN npm run build \
  && cp -a generated/prisma/. dist/generated/prisma/ \
  && test -f dist/generated/prisma/client.js \
  && test -f dist/generated/prisma/internal/class.js \
  && test -f dist/generated/prisma/internal/class.ts

FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=768

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated

EXPOSE 8080

CMD ["node", "dist/src/main"]
