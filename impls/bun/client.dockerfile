FROM oven/bun:1.1.8
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "run", "client.ts"]
