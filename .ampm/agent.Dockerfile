FROM node:22.12.0-bookworm

# Keep in step with the root package.json `packageManager` field.
ARG PNPM_VERSION=10.33.4

# Install the pinned pnpm directly: Node 22.12.0's bundled corepack cannot verify
# npm's current signing keys, and newer corepack releases do not support this Node.
RUN npm install -g "pnpm@${PNPM_VERSION}"

USER node
WORKDIR /home/node
