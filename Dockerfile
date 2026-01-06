# ---- Stage 1: Build ----------------------------------------------------------
FROM node:22-alpine AS builder

# Slightly better compatibility on alpine + TLS root store for outbound HTTPS
RUN apk add --no-cache libc6-compat ca-certificates

# Allow Vite build to use more memory inside the builder container
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Build-time args for Vite environment variables
ARG VITE_WS_URL
ENV VITE_WS_URL=${VITE_WS_URL}

# Use pnpm
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

WORKDIR /app

# Install dependencies (with lockfile)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
ENV NODE_ENV=production
# Set CLAUDE_SESSIONS_ROOT at build time so Nitro knows about it
ENV CLAUDE_SESSIONS_ROOT=/data/users
RUN pnpm run build

# ---- Stage 2: Runtime --------------------------------------------------------
FROM node:22-alpine AS runner

# Install runtime dependencies including bubblewrap for sandbox-runtime
RUN apk add --no-cache libc6-compat ca-certificates bubblewrap
RUN npm install -g pnpm@10.17.1

WORKDIR /app
ENV PORT=5000

# Install runtime dependencies (keep dev tools for migrations/worker)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production

# Copy build output and runtime assets
# TanStack Start outputs to .output/
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle

# Include source for the worker (runs via tsx in production)
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Non-root user (create before copying files that need correct ownership)
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy WebSocket server, worker, and startup script
COPY --from=builder --chown=nodejs:nodejs /app/ws-server.mjs ./ws-server.mjs
COPY --from=builder --chown=nodejs:nodejs /app/ws-query-worker.mjs ./ws-query-worker.mjs
COPY --from=builder --chown=nodejs:nodejs /app/start.sh ./start.sh
RUN chmod +x ./start.sh

# Create user sessions directory for Claude Agent
RUN mkdir -p /data/users && chown -R nodejs:nodejs /data/users

USER nodejs

# Expose main app port and WebSocket port
EXPOSE 5000 3001

# Environment variables for WebSocket
ENV WS_PORT=3001
ENV APP_URL=http://localhost:5000

# Claude Agent sessions root directory
ENV CLAUDE_SESSIONS_ROOT=/data/users

# Start both servers
CMD ["./start.sh"]
