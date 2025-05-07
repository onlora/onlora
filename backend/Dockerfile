# Stage 1: Install dependencies and build the application
FROM oven/bun:1 as build

WORKDIR /app

# Copy package.json and bun.lockb
COPY package.json bun.lockb ./

# Install dependencies using bun
# Use --frozen-lockfile for reproducible installs in CI/CD
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the application using TypeScript compiler (tsc)
# Ensure your tsconfig.json has the correct `outDir` (e.g., ./dist)
RUN bun run build

# Stage 2: Create the final production image
# Use a minimal Node.js base image
FROM node:20-slim

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy built application from the build stage
COPY --from=build /app/dist ./dist

# Copy production dependencies configuration (needed if node_modules is pruned)
# If bun produces a pruned node_modules, copy that instead. 
# For simplicity now, we'll copy package.json and assume we might run `npm ci --omit=dev` or similar
# Or, if bun doesn't need node_modules in production runtime and runs from compiled JS, skip node_modules copy.
# Let's assume for now the compiled JS in dist/ runs directly via node without needing runtime node_modules
# COPY --from=build /app/node_modules ./node_modules 
COPY package.json .

# Expose the port the application will run on (default 8080)
EXPOSE 8080

# Define the command to run the application
# Uses the `start` script from package.json which is `node dist/index.js`
CMD ["bun", "run", "start"] 