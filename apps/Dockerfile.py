# Market-data worker (Python, requires >=3.14 per pyproject.toml).
# Uses Docker networking at runtime; connects to db/redis via service names.
FROM python:3.14-slim

WORKDIR /app/apps/market-data-worker

# Install runtime deps directly (pyproject has no lockfile)
RUN pip install --no-cache-dir \
    asyncpg>=0.31.0 \
    python-dotenv>=1.1.0 \
    redis>=8.0.1 \
    schedule>=1.2.2 \
    yfinance>=1.5.1

COPY apps/market-data-worker/ /app/apps/market-data-worker/

CMD ["python", "src/main.py"]
