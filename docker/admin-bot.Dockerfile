FROM node:20-alpine

WORKDIR /app

COPY elf.duck.admin-bot.clean/package.json elf.duck.admin-bot.clean/package-lock.json ./
RUN npm ci --omit=dev

COPY elf.duck.admin-bot.clean/ .

ENV NODE_ENV=production

CMD ["node", "index.js"]
