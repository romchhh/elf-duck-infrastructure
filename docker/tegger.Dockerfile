FROM node:20-alpine AS build

WORKDIR /app

# npm 10.8 can crash with "Cannot read properties of null (reading 'edgesOut')"
# on this dependency tree without a lockfile / with older npm.
RUN npm install -g npm@11.5.2

COPY tegger/tegger_ui/package.json tegger/tegger_ui/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY tegger/tegger_ui/ ./

ENV TEGGER_SKIP_BASE44=1
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx-tegger.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
