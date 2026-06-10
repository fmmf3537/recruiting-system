# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build

# 生产阶段
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json ./

# 安装生产依赖 + tsx（ESM 项目运行时需要，与 pnpm start 一致）
RUN npm install --production && npm install tsx

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN npx prisma generate

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npx", "tsx", "src/index.ts"]
