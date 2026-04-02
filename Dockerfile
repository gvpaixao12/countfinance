# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Build backend ----
FROM node:20-alpine AS backend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/
RUN npx prisma generate
RUN npx tsc

# ---- Stage 3: Production ----
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY prisma/ ./prisma/
RUN npx prisma generate

# Backend compilado
COPY --from=backend-build /app/dist ./dist

# Frontend compilado (servido pelo Express)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
