FROM node:24-bookworm-slim AS build

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api apps/api
COPY apps/web apps/web
COPY packages/shared packages/shared

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm --filter @vineyard/web build

RUN ESBUILD="$(find node_modules/.pnpm -path '*/esbuild/bin/esbuild' -type f | head -n 1)" \
 && test -n "$ESBUILD" \
 && "$ESBUILD" apps/api/src/main.ts \
      --bundle \
      --platform=node \
      --format=esm \
      --target=node24 \
      --outfile=apps/api/dist/server.mjs \
      --external:@prisma/client \
      --external:bcryptjs \
      --external:express \
      --external:cors \
      --external:jsonwebtoken \
      --external:multer \
      --external:node-cron \
      --external:nodemailer \
      --external:zod

RUN rm -f apps/api/prisma/seed.ts apps/api/tsconfig.seed.json \
 && find apps packages -type f \( -name '.env' -o -name '.env.*' \) -delete

FROM build AS migrate

WORKDIR /app/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM build AS api

COPY deploy/scripts/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
COPY deploy/scripts/create-owner.mjs /app/apps/api/deploy/create-owner.mjs

RUN sed -i 's/\r$//' /usr/local/bin/api-entrypoint.sh /app/apps/api/deploy/create-owner.mjs \
 && chmod 0755 /usr/local/bin/api-entrypoint.sh \
 && chmod 0644 /app/apps/api/deploy/create-owner.mjs \
 && mkdir -p /data/uploads \
 && chown -R node:node /app /data/uploads

ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/data/uploads

USER node
WORKDIR /app/apps/api
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["api-entrypoint.sh"]
CMD ["node", "dist/server.mjs"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS web

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx/web-static.conf /etc/nginx/conf.d/default.conf
