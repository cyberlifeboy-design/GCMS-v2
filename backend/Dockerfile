# Backend Dockerfile
FROM node:20-bookworm
WORKDIR /app

# Azure App Service (custom Linux container) SSH support — the portal's "SSH"
# console proxies through Kudu into this container on port 2222, authenticating
# with the fixed root login Microsoft's own tooling expects for this feature
# (only reachable over that authenticated tunnel, never the public ingress):
# https://learn.microsoft.com/azure/app-service/configure-custom-container?pivots=container-linux#enable-ssh
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-server \
    && echo root:Docker! | chpasswd \
    && rm -rf /var/lib/apt/lists/*
COPY sshd_config /etc/ssh/sshd_config
COPY init.sh /usr/local/bin/init.sh
RUN chmod +x /usr/local/bin/init.sh

# System Chromium for report PDF rendering (puppeteer-core drives it — no bundled
# Chromium download, keeps the image smaller and the build reliable behind firewalls).
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install
RUN npm install -g tsx
COPY . .
RUN npx prisma generate

EXPOSE 3005 2222
ENTRYPOINT ["/usr/local/bin/init.sh"]
CMD ["tsx", "src/server.ts"]
