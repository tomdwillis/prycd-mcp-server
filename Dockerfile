FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY dist/ ./dist/

ENV TRANSPORT=http
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
