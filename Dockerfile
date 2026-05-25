# syntax=docker/dockerfile:1.6

# ---- Build stage ----------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (incl. dev) for the TypeScript compile step.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev deps after build to slim the production node_modules.
RUN npm prune --omit=dev

# ---- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
