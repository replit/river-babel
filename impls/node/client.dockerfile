FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci
RUN npx tsc

# sh provides "time" in node:22-alpine, bash is not installed
CMD ["sh", "-c", "time timeout 120 npm run --silent start:client"]
