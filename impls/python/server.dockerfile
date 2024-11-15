# syntax=docker/dockerfile:1

FROM python:3.11-slim-bookworm

WORKDIR /usr/src/river

RUN pip install poetry==1.6.1 && poetry config virtualenvs.create false

COPY pyproject.toml .
COPY poetry.lock .
COPY river-python river-python
COPY src src

RUN poetry install

# bash is required for "time" in python:3.11-slim-bookworm
CMD ["bash", "-c", "time timeout 120 poetry run python -u -m river_python_test.server --log-cli-level=debug"]
