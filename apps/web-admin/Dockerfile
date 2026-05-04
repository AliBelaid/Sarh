# syntax=docker/dockerfile:1.7
# Sijilli — admin console (apps/web-admin).
# Build from the repo root.

FROM node:20-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter @sijilli/web-admin... --frozen-lockfile

COPY packages/shared-types ./packages/shared-types
COPY apps/web-admin ./apps/web-admin

WORKDIR /workspace/apps/web-admin
RUN pnpm exec ng build --configuration production

FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/web-admin/dist/web-admin/browser /usr/share/nginx/html
COPY infra/nginx/spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
