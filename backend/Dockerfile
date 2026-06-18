FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY uploads/ ./uploads/

EXPOSE 5050

CMD ["node", "src/server.js"]
