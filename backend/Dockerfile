# Commerce API image. Build from the repository root (the workspace lockfile lives there):
#
#   docker build -f backend/Dockerfile -t wovenwhale-api .
#   docker run --env-file .env.demo -p 4000:4000 wovenwhale-api
#
# Runs the same long-running process as `npm run start -w backend`: HTTP server,
# job scheduler and connection pool. Migrations run before the server starts.
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Backend workspace only (dev dependencies included: the build and migrations use esbuild and tsx).
RUN npm ci --workspace=@wovenwhale/backend --ignore-scripts --no-audit --no-fund

COPY backend backend
RUN npm run build -w @wovenwhale/backend \
  && mkdir -p backend/uploads \
  && chown -R node:node backend/uploads

ENV NODE_ENV=production
WORKDIR /app/backend
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && node dist/server.js"]
