ARG NODE_VERSION
FROM harbor.threema.ch/cache/library/node:${NODE_VERSION}-bookworm

# Chromium
RUN apt-get update -qqy \
 && apt-get install -qqy --no-install-recommends \
    chromium chromium-driver chromium-sandbox \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Firefox
ARG BROWSER_VERSION=91.0.2
RUN apt-get update -qqy \
 && apt-get -qqy --no-install-recommends install libasound2 libdbus-glib-1-2 \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
 && wget --no-verbose -O /tmp/firefox.tar.bz2 https://download-installer.cdn.mozilla.net/pub/firefox/releases/$BROWSER_VERSION/linux-x86_64/en-US/firefox-$BROWSER_VERSION.tar.bz2 \
 && tar -C /opt -xjf /tmp/firefox.tar.bz2 \
 && rm /tmp/firefox.tar.bz2 \
 && mv /opt/firefox /opt/firefox-$BROWSER_VERSION \
 && ln -fs /opt/firefox-$BROWSER_VERSION/firefox /usr/bin/firefox

# Switch default user
USER node
