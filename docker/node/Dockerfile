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
RUN npm run build
# COPY middlewares ./middlewares
# COPY controllers ./controllers
# COPY routes ./routes
# COPY migrations ./migrations

ENTRYPOINT [ "npm", "run","start" ]

