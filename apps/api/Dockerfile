FROM python:3.12-slim

WORKDIR /src

RUN pip install --no-cache-dir uv

COPY packages/shared-types/python /src/packages/shared-types/python
COPY apps/api/pyproject.toml apps/api/uv.lock* /src/apps/api/
WORKDIR /src/apps/api
RUN uv sync --no-dev || uv sync

WORKDIR /src/apps/api
COPY apps/api/app ./app
COPY apps/api/alembic.ini ./
COPY apps/api/migrations ./migrations

ENV PYTHONPATH=/src/apps/api
EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
