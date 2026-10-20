FROM postgres:16.15-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
RUN apk add --no-cache openssl rsync openssh-client tzdata
COPY backup.sh restore-test.sh entrypoint.sh /scripts/
RUN chmod 0555 /scripts/*.sh
ENTRYPOINT ["/scripts/entrypoint.sh"]
