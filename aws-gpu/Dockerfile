FROM container.img.ly/imgly/cesdk-renderer-avlicensed:latest

USER root

ARG NODE_VERSION=20.19.4
RUN mkdir -p /opt/node \
 && cd /opt/node \
 && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz -o node.tar.xz \
 && tar -Jxf node.tar.xz --strip-components=1 \
 && rm node.tar.xz \
 && /opt/node/bin/node --version

ENV PATH="/opt/node/bin:$PATH"

COPY package.json /app/
WORKDIR /app
RUN npm install --production

COPY src/ /app/src/

USER containeruser
EXPOSE 8080

ENTRYPOINT ["/opt/node/bin/node", "src/app.mjs"]
