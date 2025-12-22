#!/bin/bash

# Cosmic Coffee Demo Stop Script

set -e

echo "🛑 Stopping Cosmic Coffee Demo Application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

# Use docker compose (newer syntax) or docker-compose (older syntax)
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "📦 Stopping containers..."
$COMPOSE_CMD down

echo "✅ All services have been stopped!"
echo ""
echo "💡 To remove volumes as well, run: $COMPOSE_CMD down -v"
echo "💡 To start again, run: ./scripts/start.sh"

