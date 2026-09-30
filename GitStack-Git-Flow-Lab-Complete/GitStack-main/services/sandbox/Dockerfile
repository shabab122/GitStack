FROM debian:bookworm-slim

LABEL io.gitstack.sandbox.schema="2"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       bash \
       ca-certificates \
       coreutils \
       git \
       procps \
       util-linux \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 student \
    && useradd \
       --uid 10001 \
       --gid 10001 \
       --create-home \
       --shell /bin/bash \
       student \
    && mkdir -p /workspace \
    && chown -R 10001:10001 /workspace /home/student \
    && git config --system init.defaultBranch main \
    && git config --system user.name "GitStack Student" \
    && git config --system user.email "student@gitstack.local" \
    && printf '%s\n' \
       '#!/bin/bash' \
       'export HOME=/home/student' \
       'export HISTFILE=/workspace/.bash_history' \
       'export PS1="student@gitstack:\\w\\$ "' \
       'export PROMPT_COMMAND=""' \
       'cd /workspace' \
       'exec /bin/bash --noprofile --norc -i' \
       > /usr/local/bin/gitstack-shell \
    && chmod 0755 /usr/local/bin/gitstack-shell

ENV HOME=/home/student
WORKDIR /workspace
USER 10001:10001

CMD ["tail", "-f", "/dev/null"]
