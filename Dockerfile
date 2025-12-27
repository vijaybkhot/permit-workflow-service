FROM node:18-bookworm-slim

WORKDIR /usr/src/app

# 1. Install Chromium and dependencies
# We use 'apt-get' because this is Debian, not Alpine.
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxkbcommon0 \
    libpangoft2-1.0-0 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# 2. Tell Puppeteer: "Do not download Chrome, use the one I installed"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3000

CMD [ "npm", "start" ]