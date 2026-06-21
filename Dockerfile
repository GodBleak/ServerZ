FROM docker.io/oven/bun:1.3.14-debian AS runtime-base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt update && apt -y install --no-install-recommends \
    git \
    ca-certificates \
    libsdl2-2.0-0 \
    libcap2 \
    rsync \
    fuse-overlayfs \
    util-linux \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /serverz /dayz /install /overrides /data /root/.steam

WORKDIR /serverz

# Copy lockfile and package.json first for better layer caching
COPY package.json bun.lock* ./
COPY src/lib/steamapi/depot-client/package.json ./src/lib/steamapi/depot-client/

RUN bun install --frozen-lockfile --production

# Copy source after deps so source changes don't bust the install layer
COPY healthcheck.sh ./
COPY jsx-runtime.ts ./
COPY tsconfig.json ./
COPY templates/ templates/
COPY config/ config/
COPY src/ src/

RUN chmod +x healthcheck.sh

# Default Game port
EXPOSE 2302/udp
# Default BattlEye port
EXPOSE 2304/udp
# Default RCon port
EXPOSE 2305/udp
# Default Steam query port
EXPOSE 27015/udp 

HEALTHCHECK --interval=30s --timeout=10s --start-period=20m --retries=3 CMD [ "/serverz/healthcheck.sh" ]

ENV ALLOW_CONFIG_MUTATIONS=true
ENV USE_USERXATTR=false
ENV NODE_CONFIG_PARSER=/serverz/src/config/node-config-parser.js


FROM runtime-base AS rootful

CMD ["bun", "src/index.ts"]


FROM runtime-base AS rootless

ENV USE_USERXATTR=true

CMD ["unshare", "--user", "--map-root-user", "--mount", "bun", "src/index.ts"]
