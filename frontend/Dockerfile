# path: frontend/Dockerfile
# --- Build Stage ---
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies installieren
COPY package.json package-lock.json* ./
RUN npm install

# Source + Config kopieren
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

# Produktions-Build erzeugen
RUN npm run build

# --- Runtime Stage (NGINX) ---
FROM nginx:alpine

# Statisches Build ins NGINX-HTML-Verzeichnis
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist ./

# Eigene NGINX-Config für SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]