FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

# Usuário não-root por padrão na imagem node:alpine (boa prática de segurança).
USER node

CMD ["node", "src/server.js"]
