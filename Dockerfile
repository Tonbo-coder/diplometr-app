###############################################################################
# 1) Build Expo web (statické soubory)
###############################################################################
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY app.json tsconfig.json ./
RUN npx expo export -p web

###############################################################################
# 2) Server dependencies (production only)
###############################################################################
FROM node:20-slim AS server-deps
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

###############################################################################
# 3) Runtime image
###############################################################################
FROM node:20-slim
WORKDIR /app

# server source + node_modules
COPY --from=server-deps /app/node_modules ./node_modules
COPY server/*.js server/package.json ./
COPY server/instructions ./instructions

# statický web build pod /app/public
COPY --from=web-builder /app/dist ./public

ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/public
ENV DATA_DIR=/data

EXPOSE 8080
CMD ["node", "index.js"]
