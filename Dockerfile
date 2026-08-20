FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY src ./src/
RUN npm run build && cp -r generated dist/generated

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated

EXPOSE 8080

CMD ["node", "dist/src/main"]
