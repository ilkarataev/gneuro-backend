FROM alpine:3.21 as build

RUN apk add --no-cache curl
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.1/supercronic-linux-amd64 \
    SUPERCRONIC=supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=d7f4c0886eb85249ad05ed592902fa6865bb9d70

RUN curl -fsSLO "$SUPERCRONIC_URL" \
 && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
 && chmod +x "$SUPERCRONIC" \
 && mv "$SUPERCRONIC" "/usr/local/bin/${SUPERCRONIC}" \
 && ln -s "/usr/local/bin/${SUPERCRONIC}" /usr/local/bin/supercronic

FROM docker.io/alpine:3.22
COPY --from=build /usr/local/bin/supercronic /usr/local/bin/supercronic
WORKDIR /app
RUN apk add --no-cache curl s3cmd mariadb-client
COPY docker/cron/crontabs/cron /etc/crontabs/cron
COPY docker/cron/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

CMD ["supercronic", "/etc/crontabs/cron"]