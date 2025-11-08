# Multi-stage build for SignalLoop backend

FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# Build application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN cd packages/database && npx prisma generate

# Build backend
RUN npm run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 signalloop

COPY --from=builder --chown=signalloop:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=signalloop:nodejs /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder --chown=signalloop:nodejs /app/packages/database/node_modules/.prisma ./packages/database/node_modules/.prisma
COPY --from=builder --chown=signalloop:nodejs /app/package.json ./package.json

USER signalloop

EXPOSE 3000

CMD ["node", "packages/backend/dist/index.js"]
