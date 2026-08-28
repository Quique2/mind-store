# Un solo contenedor: API Express + build web de Expo (patrón continental)
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY api/package.json api/
RUN npm ci
COPY . .
RUN npm run build -w app && npm run build -w api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/api/package.json api/
RUN npm ci --omit=dev -w api
COPY --from=build /repo/api/dist api/dist
COPY --from=build /repo/app/dist app/dist
COPY --from=build /repo/cuentas cuentas
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
