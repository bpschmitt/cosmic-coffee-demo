# Multi-stage build for Java Spring Boot application
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/products-service-1.0.0.jar app.jar

# Set environment to production for JSON logging
ENV SPRING_PROFILES_ACTIVE=production

EXPOSE 4001

# Disable class data sharing to avoid JVM warnings in containers
ENTRYPOINT ["java", "-Xshare:off", "-jar", "app.jar"]
