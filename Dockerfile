# Build the static app, then run a tiny Bun server that serves it and
# proxies /api/jev to TypeSafe with the TYPESAFE_API_KEY secret.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/dist ./dist
COPY server/index.ts server/jev-upstream.ts ./server/
EXPOSE 8080
USER bun
CMD ["bun", "server/index.ts"]
