FROM node:24-bookworm-slim

WORKDIR /app

# Install Chromium first so this expensive layer is cached independently of app code
COPY package*.json ./
RUN npm ci && \
    npx playwright install-deps chromium && \
    npx playwright install chromium && \
    apt-get install -y xvfb && \
    rm -rf /var/lib/apt/lists/*

COPY loadgen.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]
