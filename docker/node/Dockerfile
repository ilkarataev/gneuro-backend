FROM node:22.19.0-alpine3.22 as build
WORKDIR /app

# Устанавливаем curl для health check
RUN apk add --no-cache curl 

COPY package.json package-lock.json ./
RUN npm install \
    && npm cache clean --force \
    && mkdir -p /app/uploads/ /app/uploads/

COPY *.js ./
COPY *.json ./
COPY services ./services
COPY src ./src
COPY images ./images
RUN npm run build
ENTRYPOINT [ "npm", "run","start" ]