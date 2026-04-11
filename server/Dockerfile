# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build

# 生产阶段
FROM node:20-alpine AS production

WORKDIR /app

# 安装必要依赖（用于 Prisma）
RUN apk add --no-cache openssl

# 复制 package.json
COPY package.json ./

# 只安装生产依赖
RUN npm install --production

# 复制编译后的代码
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动命令
CMD ["node", "dist/index.js"]
