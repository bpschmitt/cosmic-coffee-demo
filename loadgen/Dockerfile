FROM locustio/locust:latest

WORKDIR /mnt/locust

# Install faker for generating fake data
RUN pip install faker>=20.0.0

COPY locustfile.py /mnt/locust/
COPY --chmod=755 entrypoint.sh /mnt/locust/entrypoint.sh

EXPOSE 8089 5557 5558

ENTRYPOINT ["/mnt/locust/entrypoint.sh"]

