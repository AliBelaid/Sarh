# Sijilli .NET API — multi-stage build.
#
# Build context is the repo root (see infra/docker/docker-compose.production.yml
# `context: ../../`) so the COPY paths below are relative to D:/Sijilli.

# ---- 1) Restore + publish ---------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy only the csproj first to maximise NuGet layer caching.
COPY apps/api-dotnet/Sijilli.Api.csproj ./apps/api-dotnet/
RUN dotnet restore ./apps/api-dotnet/Sijilli.Api.csproj

# Copy the rest of the .NET source.
COPY apps/api-dotnet/ ./apps/api-dotnet/

RUN dotnet publish ./apps/api-dotnet/Sijilli.Api.csproj \
    -c Release -o /publish \
    --no-restore \
    /p:UseAppHost=false

# ---- 2) Runtime -------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

# curl ships with the debian-slim base only sometimes; install explicitly so
# the docker-compose healthcheck always works.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Run as a non-root user (uid 5678 ships in the aspnet image as `app`).
USER app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://0.0.0.0:3000 \
    DOTNET_RUNNING_IN_CONTAINER=true

COPY --from=build /publish .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/v1/health || exit 1

ENTRYPOINT ["dotnet", "Sijilli.Api.dll"]
