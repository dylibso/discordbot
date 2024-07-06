FROM node:22-slim as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app
COPY . .
RUN rm -rf node_modules
COPY --from=builder /app/node_modules /app/node_modules
RUN npm run build

EXPOSE 8124

CMD ["npm", "start"]
