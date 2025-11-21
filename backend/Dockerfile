# --- Build Stage ---
FROM node:22-alpine AS build

WORKDIR /app

# Nur package-Dateien zuerst kopieren für besseren Cache
COPY package.json package-lock.json* ./

RUN npm install

# Restlicher Code
COPY tsconfig.json ./
COPY src ./src

# TypeScript bauen
RUN npm run build

# --- Runtime Stage ---
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Nur nötige Files rüberziehen
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

# Port (aus .env: APP_PORT, default 3000)
EXPOSE 3000

CMD ["node", "dist/index.js"]
