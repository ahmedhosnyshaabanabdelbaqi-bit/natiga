# EV Car News admin — static SPA served by nginx.
# NOTE: not built in the dev container (no Docker daemon); see docs/decisions/admin.md.
FROM node:22.22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same-origin API by default (nginx proxies /api to the backend).
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Backend upstream used by the /api proxy (compose service name by default).
ENV API_UPSTREAM=http://backend:3000
EXPOSE 8080
