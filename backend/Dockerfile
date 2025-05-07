# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app

# Install dependencies based on lock file
COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts

# Stage 2: Build the application
FROM node:20-slim AS builder
WORKDIR /app

# Copy dependencies from the previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install dev dependencies needed for build
# We copy package*.json again in case build scripts need devDependencies
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# Build TypeScript
RUN npm run build

# Prune dev dependencies (optional, reduces intermediate layer size)
RUN npm prune --production

# Stage 3: Production image
FROM node:20-slim AS runner
WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV production

# Copy necessary artifacts from previous stages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
# Copy any other necessary files like static assets if they were outside src/ and not built into dist
# e.g., COPY --from=builder /app/public ./public

# Expose the port the app runs on
EXPOSE 8080

# Run the application
# Use node directly to avoid npm overhead
CMD ["node", "dist/index.js"] 