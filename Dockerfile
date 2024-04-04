FROM debian:bookworm

RUN apt update && apt -y upgrade
RUN apt -y install --no-install-recommends \
    wget \
    git \
    ca-certificates \
    libsdl2-2.0-0 \
    libcap2 \
    python3-pip \
    build-essential    

RUN wget https://gist.githubusercontent.com/hakerdefo/5e1f51fa93ff37871b9ff738b05ba30f/raw/7b5a0ff76b7f963c52f2b33baa20d8c4033bce4d/sources.list -O /etc/apt/sources.list

RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections \
    && echo steam steam/question select "I AGREE" | debconf-set-selections \
    && echo steam steam/license note '' | debconf-set-selections \
    && dpkg --add-architecture i386

RUN apt update && apt -y install --no-install-recommends steamcmd

RUN mkdir /usr/local/nvm
ENV NVM_DIR /usr/local/nvm
ENV NODE_VERSION 18.18.2

RUN wget -O- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN groupadd ctrusr && \
    useradd -l -g ctrusr ctrusr && \
    mkdir -p /home/ctrusr /dayz /serverz /profiles && \
    chown -R ctrusr:ctrusr /home/ctrusr /dayz /serverz /profiles

USER ctrusr
WORKDIR /serverz

COPY --chown=ctrusr:ctrusr package.json package-lock.json ./
COPY --chown=ctrusr:ctrusr dist/ dist/

EXPOSE 2302/udp
EXPOSE 2303/udp
EXPOSE 2304/udp
EXPOSE 2305/udp
EXPOSE 8766/udp
EXPOSE 27016/udp
EXPOSE 2310

RUN npm install

CMD ["node", "dist/index.js"]
