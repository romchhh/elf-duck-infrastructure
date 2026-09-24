FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_CRM_API_URL=http://localhost:3000
ENV VITE_CRM_API_URL=$VITE_CRM_API_URL

COPY elfduck.crm/package.json elfduck.crm/package-lock.json ./
RUN npm ci

COPY elfduck.crm/ .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
