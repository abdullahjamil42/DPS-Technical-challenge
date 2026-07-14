FROM node:22-alpine

WORKDIR /app

# Copy workspace dependency manifests
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install frontend dependencies using the workspace lockfile
RUN npm ci --workspace=frontend

# Copy frontend source code
COPY frontend/ ./frontend/

# Build Vite / TanStack Start assets for production
RUN npm run build --workspace=frontend

# Expose server port
EXPOSE 3000

# Start production server in preview mode
CMD ["npm", "run", "preview", "--workspace=frontend", "--", "--host", "0.0.0.0"]
