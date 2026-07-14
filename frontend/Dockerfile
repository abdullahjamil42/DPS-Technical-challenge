FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (dev required for build steps)
RUN npm ci

# Copy frontend source code
COPY . .

# Build Vite / TanStack Start assets for production
RUN npm run build

# Expose server port
EXPOSE 3000

# Start production server in preview mode
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
