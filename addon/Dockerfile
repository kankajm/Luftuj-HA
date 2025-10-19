ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache python3 py3-pip

COPY rootfs /

WORKDIR /usr/src/app
RUN pip3 install --no-cache-dir -r requirements.txt
