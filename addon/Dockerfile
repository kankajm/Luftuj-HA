ARG BUILD_FROM
FROM ${BUILD_FROM}

ARG PYTHON_VENV_PATH=/opt/venv

ENV \
  PYTHONUNBUFFERED=1 \
  PATH="${PYTHON_VENV_PATH}/bin:${PATH}"

RUN apk add --no-cache python3 py3-pip \
  && python3 -m venv ${PYTHON_VENV_PATH} \
  && ${PYTHON_VENV_PATH}/bin/pip install --no-cache-dir --upgrade pip

COPY rootfs /

RUN chmod +x /etc/services.d/luftujha/run

WORKDIR /usr/src/app
RUN pip install --no-cache-dir -r requirements.txt
