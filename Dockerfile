# Use the official lightweight PostgreSQL image
FROM postgres:16-alpine

# Set default environment variables for PostgreSQL
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_DB=project_eryx

# Expose the default PostgreSQL port
EXPOSE 5432

# Health check to verify PostgreSQL is running and ready
HEALTHCHECK --interval=5s --timeout=5s --retries=5 \
  CMD pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
