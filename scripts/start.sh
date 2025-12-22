#!/bin/bash

# Cosmic Coffee Demo Startup Script

set -e

echo "🚀 Starting Cosmic Coffee Demo Application..."

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

echo "📦 Building and starting containers..."
$COMPOSE_CMD up --build -d

echo "⏳ Waiting for services to be ready..."
sleep 10

echo "✅ Services are starting up!"
echo ""
echo "📍 Access points:"
echo "   Frontend:       http://localhost:3000"
echo "   Products API:   http://localhost:4001"
echo "   Payment API:    http://localhost:4002"
echo "   Cart API:       http://localhost:4003"
echo "   Checkout API:   http://localhost:4004"
echo "   Orders API:     http://localhost:4000"
echo "   Fulfillment API: http://localhost:5000"
echo "   PostgreSQL:     localhost:5432"
echo ""
echo "📊 Check service status with: $COMPOSE_CMD ps"
echo "📋 View logs with: $COMPOSE_CMD logs -f [service-name]"
echo "   Available services: frontend, products, cart, payment, checkout, orders, fulfillment, postgres"
echo "🛑 Stop services with: ./scripts/stop.sh or $COMPOSE_CMD down"
echo ""

