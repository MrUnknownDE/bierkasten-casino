# frontend/Dockerfile

FROM node:22-alpine

WORKDIR /app

# Nur package-Dateien zuerst für Cache
COPY package.json package-lock.json* ./
RUN npm install

# Rest kopieren
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

EXPOSE 5173

# Vite Dev-Server nach außen freigeben
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
