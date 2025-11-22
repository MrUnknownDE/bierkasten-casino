# path: frontend/Dockerfile
# --- Build Stage ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

RUN npm run build

# --- Runtime Stage (NGINX) ---
FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# Build-Ergebnis ins Webroot
COPY --from=build /app/dist ./

# NGINX-Konfiguration für SPA + Backend-Proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]