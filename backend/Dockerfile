FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY . .

# Expose backend port
EXPOSE 3001

ENV NODE_ENV=production

# Run index entrypoint
CMD ["node", "src/index.js"]
