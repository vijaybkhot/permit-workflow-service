#!/bin/bash
set -e

echo "🧹 STARTING CLEANUP: Removing old containers and networks..."

# 1. Stop and remove Docker Compose services (if they exist)
docker compose down -v 2>/dev/null || true

# 2. Aggressively remove any lingering containers by name
echo "   - Forcing removal of conflicting containers..."
docker rm -f permit-api permit-worker permit-postgres permit-redis permit-jaeger permit-prometheus permit-grafana 2>/dev/null || true

# 3. Ask user before pruning Docker system
echo ""
echo "⚠️  WARNING: This will remove all unused Docker images, containers, and networks."
echo "   This action cannot be undone!"
echo ""
read -p "Do you want to prune Docker system? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🧹 Pruning Docker system..."
  docker system prune -f
  echo "✅ Docker system pruned."
else
  echo "⏭️  Skipping Docker system prune."
fi

echo "✅ Cleanup complete. Environment is fresh."
echo "------------------------------------------------"

echo "🐳 Starting Database & Redis..."
# Start specific services for migration
docker compose up -d postgres redis

echo "⏳ Waiting for PostgreSQL to be ready..."
# Loop until Postgres is ready to accept connections
until docker compose exec postgres pg_isready -U postgres; do
  echo "   Postgres not ready yet, waiting..."
  sleep 1
done
echo "✅ PostgreSQL is ready!"

echo "🗄️  Running Prisma Migrations..."
# Connects to localhost:5432 (mapped from container)
npx prisma migrate dev --name init --skip-seed

echo "🌱 Seeding Database..."
npx prisma db seed

echo "🚀 Starting the full stack (API, Worker, Observability)..."
# Start the rest of the containers
docker compose up -d --build

echo ""
echo "🎉 SETUP COMPLETE!"
echo "------------------------------------------------"
echo "➡️  API:        http://localhost:3000"
echo "➡️  Jaeger:     http://localhost:16686 (Traces)"
echo "➡️  Grafana:    http://localhost:3001  (Metrics - login: admin/admin)"
echo "➡️  Prometheus: http://localhost:9090  (Raw Data)"