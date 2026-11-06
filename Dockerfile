# BlitzHash Launch-Ready Check — web UI + CLI in one image
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY public ./public
COPY fixtures ./fixtures
COPY LICENSE README.md ./
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
