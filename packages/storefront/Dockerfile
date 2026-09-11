FROM node:22 AS builder

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
COPY tsconfig.json ./

ENV SKIP_PRISMA_GENERATE=1

RUN npm ci --no-audit --no-fund

COPY packages/shared/ packages/shared/
RUN npm run build -w packages/shared

COPY packages/storefront/ packages/storefront/
ENV VITE_API_URL=
RUN npm run build -w packages/storefront

FROM nginx:alpine

COPY --from=builder /app/packages/storefront/dist/ /usr/share/nginx/html/
COPY packages/storefront/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
