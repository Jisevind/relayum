FROM node:20-alpine AS frontend-build

# Accept build args for React environment variables
ARG REACT_APP_API_URL
ARG REACT_APP_API_TIMEOUT_MS
ARG REACT_APP_VIRUS_SCANNER_POLL_INTERVAL
ARG REACT_APP_VIRUS_SCANNER_STATS_INTERVAL

# Set environment variables for React build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_API_TIMEOUT_MS=$REACT_APP_API_TIMEOUT_MS
ENV REACT_APP_VIRUS_SCANNER_POLL_INTERVAL=$REACT_APP_VIRUS_SCANNER_POLL_INTERVAL
ENV REACT_APP_VIRUS_SCANNER_STATS_INTERVAL=$REACT_APP_VIRUS_SCANNER_STATS_INTERVAL

RUN npm install -g npm@11.4.2

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS production

RUN npm install -g npm@11.4.2

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .
COPY --from=frontend-build /app/client/build ./client/build

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

RUN mkdir -p uploads && chown -R nodejs:nodejs uploads
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]