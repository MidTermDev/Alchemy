FROM node:18-alpine

# Install dcron for cron jobs
RUN apk add --no-cache dcron

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --production

# Copy source files
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p logs

# Copy keypair (must be provided at runtime or mounted as volume)
# COPY keypair_distro.json ./

# Set up cron job (runs daily at midnight)
RUN echo "0 0 * * * cd /app && node dist/distribute-tokens.js >> logs/distribution.log 2>&1" | crontab -

# Expose no ports (this is a scheduled job)

# Start cron in foreground
CMD ["crond", "-f", "-l", "2"]

# Alternative: Run once without cron
# CMD ["node", "dist/distribute-tokens.js"]

# Build: docker build -t alchemy-distributor .
# Run with volume for keypair: docker run -v /path/to/keypair_distro.json:/app/keypair_distro.json alchemy-distributor
# Run once: docker run alchemy-distributor node dist/distribute-tokens.js
