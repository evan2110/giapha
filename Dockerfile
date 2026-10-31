FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js index.html ./
COPY css ./css
COPY js ./js
RUN mkdir -p /app/data
ENV PORT=3000
ENV GIAPHA_DATA=/app/data/giapha.json
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
