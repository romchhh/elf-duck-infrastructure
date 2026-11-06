# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_CRM_API_URL=http://localhost:3000
ARG VITE_TEGGER_URL=https://tegger.telebots.site
ENV VITE_CRM_API_URL=$VITE_CRM_API_URL
ENV VITE_TEGGER_URL=$VITE_TEGGER_URL
# HMR / visual-edit від Base44 у проді не потрібні і роздувають Vite.
ENV CRM_SKIP_BASE44=1

COPY elfduck.crm/package.json elfduck.crm/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY elfduck.crm/ .
RUN --mount=type=cache,target=/app/node_modules/.vite \
    npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
