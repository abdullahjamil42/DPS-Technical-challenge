FROM node:22-alpine

WORKDIR /app

# Copy workspace dependency manifests
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install only backend production dependencies using the workspace lockfile
RUN npm ci --workspace=backend --omit=dev

# Copy backend source code
COPY backend/ ./backend/

# Expose backend port
EXPOSE 3001

ENV NODE_ENV=production

# Run index entrypoint from backend directory
CMD ["node", "backend/src/index.js"]
