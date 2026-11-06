# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

# npm 10.9+ (Node 22) already includes the arborist fix for
# "Cannot read properties of null (reading 'edgesOut')".
COPY tegger/tegger_ui/package.json tegger/tegger_ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --legacy-peer-deps

COPY tegger/tegger_ui/ .

ENV TEGGER_SKIP_BASE44=1
RUN --mount=type=cache,target=/app/node_modules/.vite \
    npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx-tegger.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
