# syntax=docker/dockerfile:1.7
# Sijilli API — multi-stage Node 20 LTS image.
#
# Stage 1 builds the Nest app inside a slim node image with the full pnpm
# workspace context. Stage 2 trims to the runtime artifacts only.
#
# IMPORTANT: this Dockerfile is built FROM the repo root so it can resolve
# the pnpm workspace and the @sijilli/shared-types package. Build with:
#
#   docker build -f apps/api/Dockerfile -t sijilli/api:latest .

FROM node:20-bookworm-slim AS deps
WORKDIR /workspace
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter @sijilli/api... --frozen-lockfile

# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable

COPY --from=deps /workspace/node_modules /workspace/node_modules
COPY --from=deps /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=deps /workspace/packages/shared-types/node_modules /workspace/packages/shared-types/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig*.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

WORKDIR /workspace/apps/api
RUN pnpm exec nest build
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter @sijilli/api --prod --frozen-lockfile

# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# Non-root runtime user.
RUN groupadd --system sijilli && useradd --system --gid sijilli sijilli

COPY --from=build /workspace/apps/api/dist /app/dist
COPY --from=build /workspace/apps/api/node_modules /app/node_modules
COPY --from=build /workspace/apps/api/package.json /app/package.json
COPY --from=build /workspace/packages/shared-types /workspace/packages/shared-types

USER sijilli
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
