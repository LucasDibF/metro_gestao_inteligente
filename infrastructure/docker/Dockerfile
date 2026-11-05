FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build MIGRATION_DATABASE_URL=postgresql://build:build@localhost:5432/build npm run db:generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api ./apps/api
USER node
EXPOSE 3000
CMD ["node","apps/api/dist/main.js"]

FROM api AS worker
USER root
COPY --from=build --chown=node:node /app/apps/worker ./apps/worker
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN node node_modules/playwright/cli.js install --with-deps chromium && chmod -R a+rX /ms-playwright
USER node
CMD ["node","apps/worker/dist/main.js"]

FROM nginx:stable-alpine AS web
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid
USER nginx
EXPOSE 8080
