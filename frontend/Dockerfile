# Stage 1: Builder
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
# Copy package.json and lock file
COPY package.json ./
COPY bun.lockb ./
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js application
# Environment variables needed for build can be passed here using ARG and --build-arg
# For example: ARG NEXT_PUBLIC_API_BASE_URL
# ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN bun run build

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy built assets from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lockb ./bun.lockb
# If using next.config.js with output: 'standalone', it handles this differently.
# For default 'next start', we might need next.config.js if it has runtime config.
# COPY --from=builder /app/next.config.js ./next.config.js

# Install production dependencies using bun (if necessary)
# For Next.js standalone output or if all deps are bundled, this might be minimal.
# RUN bun install --production --frozen-lockfile

EXPOSE 3000

# Command to run the Next.js application
CMD ["bun", "run", "start"] 