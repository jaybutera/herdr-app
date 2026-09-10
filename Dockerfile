# The hosted page, and the way it reaches the orchestrator.
#
# Two stages so what runs is node, the bundle and two small files — no
# toolchain, no Rust, none of src-tauri, which is the Android app's half of
# this repo. The tailscale binaries are copied from the official image rather
# than installed, which is how that image is meant to be used as a sidecar.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Shown in Settings > About. There is no git history in this context, so the
# hash is passed in; vite.config.ts falls back to `dev` when it is not.
ARG ORCHA_BUILD_HASH
ENV ORCHA_BUILD_HASH=$ORCHA_BUILD_HASH
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ca-certificates iptables
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=build /app/dist ./dist
COPY server.mjs entrypoint.sh ./
EXPOSE 8080
CMD ["/app/entrypoint.sh"]
