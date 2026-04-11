# syntax=docker/dockerfile:1.7
# Multi-stage Alpine build for foundry-iptv (Next.js 16 standalone).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# sharp has platform-specific binaries; --omit=optional is safe on Alpine
# because sharp ships musl prebuilds. If the build fails, add:
#   RUN apk add --no-cache vips-dev && npm ci --include=optional
RUN npm ci --omit=optional

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Embed git SHA for the /api/health version field
ARG GIT_SHA=unknown
ENV NEXT_PUBLIC_GIT_SHA=$GIT_SHA
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3003 \
    HOSTNAME=0.0.0.0

RUN addgroup -S foundry && adduser -S -G foundry foundry \
    && apk add --no-cache curl android-tools
# android-tools provides adb — required by the Device Setup Wizard so the
# admin can push the client APK to FireSticks and other Android TV devices
# directly from the browser, without the customer ever touching a terminal.

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

USER foundry
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://localhost:3003/api/health || exit 1

CMD ["node", "server.js"]
