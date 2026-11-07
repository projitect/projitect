FROM node:22.12.0-bookworm

# Keep in step with the root package.json `packageManager` field.
ARG PNPM_VERSION=10.33.4

ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable --install-directory /usr/local/bin \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && chmod -R a+rX "$COREPACK_HOME"

USER node
WORKDIR /home/node
