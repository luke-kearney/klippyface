# syntax=docker/dockerfile:1
# Klippyface server with the Web UI. Build from the repo root:
#   docker build -f docker/Dockerfile -t klippyface-server .
# or use docker/docker-compose.yml.

# Web UI: builds into ../server/wwwroot. Runs on the build machine's own
# architecture, since its output is the same for every target.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS ui
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# Server: a framework-dependent, architecture-neutral publish, so one build
# serves amd64 and arm64 images alike.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
COPY VERSION ./
COPY server/Klippyface.Server.csproj server/
RUN dotnet restore server
COPY server/ server/
COPY --from=ui /src/server/wwwroot server/wwwroot
RUN dotnet publish server -c Release --no-restore -m:4 -p:UseAppHost=false -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server /app ./

# The aspnet image listens on 8080 by default; Klippyface uses 5000 (nodes default to it)
ENV ASPNETCORE_HTTP_PORTS= \
    ASPNETCORE_URLS=http://0.0.0.0:5000 \
    KLIPPYFACE_DATA_DIR=/data

# Owned by the image's non-root user, so a new named volume is writable too
RUN mkdir -p /data && chown app:app /data
USER app
VOLUME /data
EXPOSE 5000

ENTRYPOINT ["dotnet", "Klippyface.Server.dll"]
