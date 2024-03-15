FROM debian:bullseye

RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections \
    && echo steam steam/question select "I AGREE" | debconf-set-selections \
    && echo steam steam/license note '' | debconf-set-selections \
    && dpkg --add-architecture i386

RUN sed -i /etc/apt/sources.list -e 's/main/main contrib non-free/'

RUN echo 'deb http://deb.debian.org/debian bullseye-backports main non-free' >> /etc/apt/sources.list

RUN apt update && apt -y upgrade 
RUN apt -y install --no-install-recommends \
    curl \
    ca-certificates \
    libsdl2-2.0-0 \
    libcap2 \
    python3-pip \
    steamcmd \
    build-essential 

RUN rm -f /etc/ssl/certs/ca-bundle.crt && apt reinstall -y ca-certificates && update-ca-certificates

RUN mkdir /usr/local/nvm
ENV NVM_DIR /usr/local/nvm
ENV NODE_VERSION 18.18.2

RUN curl https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash \
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
