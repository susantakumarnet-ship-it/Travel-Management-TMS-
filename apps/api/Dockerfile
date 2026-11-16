# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api --include-workspace-root=false
COPY apps/api apps/api
RUN cd apps/api && npx prisma generate && npx tsc -p tsconfig.build.json

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl tini && addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
RUN mkdir -p uploads && chown -R app:app uploads
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4000/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Sync collections/indexes with the schema (non-destructive), ensure partial unique indexes, then start.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx prisma/mongo-indexes.ts && node dist/index.js"]
