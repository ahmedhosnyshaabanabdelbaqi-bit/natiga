# syntax=docker/dockerfile:1.7
# EV Car News backend — multi-stage image (NestJS + Prisma 7, Node 22 LTS).
# Build:  docker build -t evcar-backend ./backend
# Run:    see /docker-compose.yml (runs migrations + reference seed, then the API).

ARG NODE_IMAGE=node:22.23.3-bookworm-slim

# ---- deps: install all dependencies (postinstall runs `prisma generate`) ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build: compile TypeScript, then drop dev dependencies ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    LOG_PRETTY=false \
    STORAGE_LOCAL_ROOT=/app/storage
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/evcar-entrypoint
RUN chmod 0755 /usr/local/bin/evcar-entrypoint && mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["evcar-entrypoint"]
CMD ["node", "dist/main.js"]
