FROM docker.io/imgly/cesdk-processor:latest

USER root

ARG NODE_VERSION=20.19.4
RUN mkdir -p /opt/node
WORKDIR /opt/node
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz -o node.tar.xz \
 && tar -Jxf node.tar.xz --strip-components=1 \
 && rm node.tar.xz \
 && /opt/node/bin/node --version

ENV PATH="/opt/node/bin:$PATH"

COPY . /app
WORKDIR /app
RUN npm install --production
RUN mkdir -p /uploads /exports
RUN chmod 0777 /uploads /exports

USER containeruser
EXPOSE 8080
ENTRYPOINT [ "/bin/sh", "-c", "/opt/node/bin/node src/app.mjs" ]
