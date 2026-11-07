# Node tag tracks .nvmrc.
FROM node:22.12.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Must match the packageManager field in the root package.json.
ARG PNPM_VERSION=10.33.4
RUN npm install -g pnpm@${PNPM_VERSION}

USER node
WORKDIR /home/node
CMD ["bash"]
