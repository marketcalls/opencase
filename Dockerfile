# OpenCase Docker Configuration
# Multi-stage build for optimal image size

# ==========================================
# Stage 1: Build
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# ==========================================
# Stage 2: Production
# ==========================================
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies and wrangler
COPY package*.json ./
RUN npm ci --only=production && \
    npm install -g wrangler && \
    rm -rf /root/.npm /tmp/*

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/seed.sql ./seed.sql
COPY --from=builder /app/wrangler.jsonc ./wrangler.jsonc

# Create directory for local D1 database
RUN mkdir -p .wrangler/state/v3/d1

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Initialize database and start server
CMD ["sh", "-c", "wrangler d1 migrations apply opencase-db --local && wrangler pages dev dist --d1=opencase-db --local --ip 0.0.0.0 --port 3000"]
