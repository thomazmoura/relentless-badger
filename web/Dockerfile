# Production image of the PWA, served under /badger/ behind the Pi's gateway. The build
# stage runs on the build host's architecture (the output is plain static files), so an
# arm64 image builds from an amd64 machine without QEMU:
#
#   docker buildx build --platform linux/arm64 --load -t relentlessbadger-web web/
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# environment.ts is baked in at build time, so the deploy's values are written here, inside
# the build container, rather than into the checked-in file. A relative API base keeps the
# app same-origin with the API (the gateway serves both), so no CORS is involved.
ARG API_BASE_URL=/badger-api
ARG GOOGLE_WEB_CLIENT_ID=
RUN printf "export const environment = {\n  apiBaseUrl: '%s',\n  googleWebClientId: '%s',\n};\n" \
      "$API_BASE_URL" "$GOOGLE_WEB_CLIENT_ID" > src/environments/environment.ts \
 && npx ng build --base-href /badger/

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/web/browser /usr/share/nginx/html/badger
