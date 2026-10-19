FROM postgres:16.4-alpine3.20
RUN apk add --no-cache openssl rsync openssh-client tzdata
COPY backup.sh restore-test.sh entrypoint.sh /scripts/
RUN chmod 0555 /scripts/*.sh
ENTRYPOINT ["/scripts/entrypoint.sh"]
