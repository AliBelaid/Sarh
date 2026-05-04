# syntax=docker/dockerfile:1.7
# Sijilli — officer Angular portal (apps/web-officer).
# Build from the repo root.
#
#   docker build -f apps/web-officer/Dockerfile -t sijilli/web-officer:latest .

FROM node:20-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web-officer/package.json apps/web-officer/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter @sijilli/web-officer... --frozen-lockfile

COPY packages/shared-types ./packages/shared-types
COPY apps/web-officer ./apps/web-officer

WORKDIR /workspace/apps/web-officer
RUN pnpm exec ng build --configuration production

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/web-officer/dist/web-officer/browser /usr/share/nginx/html
COPY infra/nginx/spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
