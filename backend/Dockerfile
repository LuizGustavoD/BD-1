FROM python:3.10-slim

WORKDIR /app

# Instala dependências de compilação mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 3001

ENV PYTHONUNBUFFERED=1
ENV PORT=3001
ENV DATABASE_URL="postgresql://neondb_owner:npg_cRhzOY0uelr3@ep-damp-night-bd483xlh-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3001"]
