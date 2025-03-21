# syntax=docker/dockerfile:1

FROM python:3.11-slim-bookworm

WORKDIR /usr/src/river

RUN pip install uv==0.6.8

COPY pyproject.toml .
COPY uv.lock .
COPY README.md .
COPY src src

RUN uv sync

# bash is required for "time" in python:3.11-slim-bookworm
CMD ["bash", "-c", "time timeout 120 uv run python -u -m river_python_test.client --log-cli-level=debug"]
