# syntax=docker/dockerfile:1

FROM python:3.11-slim-bookworm

WORKDIR /usr/src/river

RUN pip install poetry==1.6.1 && poetry config virtualenvs.create false

COPY pyproject.toml .
COPY poetry.lock .
COPY ./river-python /usr/src/river/river-python

RUN poetry install

COPY ./ .

CMD ["poetry", "run", "python", "-u", "client.py", "--log-cli-level=debug"]
