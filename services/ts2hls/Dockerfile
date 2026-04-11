# ── Build stage ──
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Prune dev dependencies for smaller runtime image
RUN npm prune --omit=dev

# ── Runtime stage ──
FROM node:22-alpine

# Install ffmpeg from Alpine repos — we only need -c copy (no transcode),
# so the stock Alpine build is fine.
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy built JS and production dependencies from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3103

CMD ["node", "dist/index.js"]
