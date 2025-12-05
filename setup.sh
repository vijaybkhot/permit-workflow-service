#!/bin/bash
# filepath: /Users/vijaykhot/permit-workflow-service/setup.sh

set -e  # Exit on error

echo "🧹 Cleaning up old Docker containers..."

# Stop and remove existing containers (ignore errors if they don't exist)
docker stop permit-db permit-redis 2>/dev/null || true
docker rm permit-db permit-redis 2>/dev/null || true

echo "🐳 Starting PostgreSQL container..."
docker run --name permit-db \
  -e POSTGRES_PASSWORD=REDACTED_PASSWORD \
  -p 5433:5432 \
  -d postgres

echo "🐳 Starting Redis container..."
docker run --name permit-redis \
  -p 6379:6379 \
  -d redis

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 3

# Wait for Postgres to accept connections
until docker exec permit-db pg_isready -U postgres > /dev/null 2>&1; do
  echo "   Postgres not ready yet, waiting..."
  sleep 1
done
echo "✅ PostgreSQL is ready!"

echo "⏳ Waiting for Redis to be ready..."
until docker exec permit-redis redis-cli ping > /dev/null 2>&1; do
  echo "   Redis not ready yet, waiting..."
  sleep 1
done
echo "✅ Redis is ready!"

echo "📦 Installing npm dependencies..."
npm install

echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🗄️  Running Prisma migrations..."
npx prisma migrate dev --name init --skip-seed

echo "🌱 Seeding the database..."
npx prisma db seed

echo ""
echo "🎉 Setup complete!"
echo ""
echo "You can now run:"
echo "  npm run dev          # Start the API server"
echo "  npm run start:worker # Start the background worker"
echo "  npm run test         # Run tests"