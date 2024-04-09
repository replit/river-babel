FROM oven/bun
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "run", "client.ts"]