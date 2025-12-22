FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

EXPOSE 4004

CMD ["node", "server.js"]

