# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 构建生产版本
RUN npm run build

# 生产阶段 - 使用 Nginx 提供静态文件
FROM nginx:alpine AS production

# 复制构建后的文件到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
