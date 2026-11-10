FROM node:22.12.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash git ca-certificates curl=7.88.1-* python3=3.11.2-* \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global pnpm@10.33.4

USER node
ENV HOME=/home/node
WORKDIR /home/node

# Proves the non-root user runs the pinned pnpm and node offline.
RUN test "$(pnpm --version)" = "10.33.4" \
  && test "$(node --version)" = "v22.12.0" \
  && test "$(curl --version | head -n1 | cut -d' ' -f2)" = "7.88.1" \
  && python3 --version | grep -q '^Python 3\.11\.2$'
