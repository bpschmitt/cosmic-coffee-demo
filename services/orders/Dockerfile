FROM node:24-bookworm-slim

ARG ENABLE_N_PLUS_ONE_QUERIES=false
ENV ENABLE_N_PLUS_ONE_QUERIES=$ENABLE_N_PLUS_ONE_QUERIES

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["npm", "start"]

