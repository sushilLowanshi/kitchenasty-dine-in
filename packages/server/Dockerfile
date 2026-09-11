FROM node:22 AS builder

WORKDIR /app

# Trust Netskope SSL inspection CA (required on corp networks)
COPY certs/netskope-ca-bundle.crt /usr/local/share/ca-certificates/netskope-ca-bundle.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/netskope-ca-bundle.crt

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/admin/package.json packages/admin/
COPY packages/storefront/package.json packages/storefront/
COPY packages/docs/package.json packages/docs/
COPY packages/mobile/package.json packages/mobile/
COPY scripts/ scripts/
COPY prisma/ prisma/
COPY tsconfig.json ./

RUN npm ci --no-audit --no-fund

COPY packages/shared/ packages/shared/
RUN npm run build -w packages/shared

COPY packages/server/ packages/server/
RUN npx -w packages/server prisma generate --schema ../../prisma/schema.prisma
RUN npm run build -w packages/server

FROM node:22

WORKDIR /app

COPY certs/netskope-ca-bundle.crt /usr/local/share/ca-certificates/netskope-ca-bundle.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/netskope-ca-bundle.crt

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/admin/package.json packages/admin/
COPY packages/storefront/package.json packages/storefront/
COPY packages/docs/package.json packages/docs/
COPY packages/mobile/package.json packages/mobile/
COPY scripts/ scripts/
ENV SKIP_PRISMA_GENERATE=1

RUN npm ci --omit=dev --no-audit --no-fund

COPY prisma/ prisma/
RUN npx -w packages/server prisma generate --schema ../../prisma/schema.prisma

COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/server/dist/ packages/server/dist/

EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
