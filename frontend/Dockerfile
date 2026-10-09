FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
ARG NEXT_PUBLIC_SITE_URL=http://localhost:8088
ARG NEXT_PUBLIC_DEV_TOOLS=false
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_DEV_TOOLS=$NEXT_PUBLIC_DEV_TOOLS NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 10001 tanpoosh && adduser -D -u 10001 -G tanpoosh tanpoosh
COPY --from=build --chown=tanpoosh:tanpoosh /app/.next/standalone ./
COPY --from=build --chown=tanpoosh:tanpoosh /app/.next/static ./.next/static
COPY --from=build --chown=tanpoosh:tanpoosh /app/public ./public
USER tanpoosh
EXPOSE 3000
CMD ["node", "server.js"]
