FROM postgres:15 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    build-essential \
    postgresql-server-dev-15 \
    && rm -rf /var/lib/apt/lists/*

# pg_stat_monitor
RUN git clone --branch 2.0.0 --depth 1 \
    https://github.com/percona/pg_stat_monitor.git /tmp/pg_stat_monitor && \
    cd /tmp/pg_stat_monitor && \
    make USE_PGXS=1 && make USE_PGXS=1 install

# pg_wait_sampling
RUN git clone --branch v1.1.4 --depth 1 \
    https://github.com/postgrespro/pg_wait_sampling.git /tmp/pg_wait_sampling && \
    cd /tmp/pg_wait_sampling && \
    make USE_PGXS=1 && make USE_PGXS=1 install

FROM postgres:15

COPY --from=builder /usr/lib/postgresql/15/lib/pg_stat_monitor.so /usr/lib/postgresql/15/lib/
COPY --from=builder /usr/share/postgresql/15/extension/pg_stat_monitor* /usr/share/postgresql/15/extension/
COPY --from=builder /usr/lib/postgresql/15/lib/pg_wait_sampling.so /usr/lib/postgresql/15/lib/
COPY --from=builder /usr/share/postgresql/15/extension/pg_wait_sampling* /usr/share/postgresql/15/extension/

COPY initdb-extensions.sql /docker-entrypoint-initdb.d/01-extensions.sql
