# syntax=docker/dockerfile:1

FROM python:3.11-slim-bookworm

WORKDIR /usr/src/python_impl

RUN pip install poetry==1.6.1 && poetry config virtualenvs.create false

COPY . /usr/src/python_impl
COPY ./schema.json /usr/src/python_impl/schema.json

RUN poetry install

CMD ["sh", "/usr/src/python_impl/generate_client.sh"]
