#!/bin/bash
# This script recreates the database for the kubaturnik application

set -e

# Load environment variables from .env file
if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "Warning: .env file not found!"
fi

# Get database name from environment or use default
DB_NAME=${DATABASE_NAME:-}

# Check if required environment variables are set
if [ -z "$DATABASE_NAME" ]; then
    echo "Error: DATABASE_NAME environment variable is not set!"
    exit 1
fi

if [ -z "$DATABASE_PASSWORD" ]; then
    echo "Error: DATABASE_PASSWORD environment variable is not set!"
    exit 1
fi

echo "Using database: $DATABASE_NAME"

# Drop and recreate the database in MySQL container
echo "Dropping and recreating database '$DB_NAME'"
docker exec -i api-backend-mysql bash -c "mysql -u root -p\\$DATABASE_PASSWORD -e 'DROP DATABASE IF EXISTS $DATABASE_NAME; CREATE DATABASE $DATABASE_NAME;'"

# Run database migrations
echo "Running database migrations..."
# alembic upgrade head
npm run migrate
echo "Database recreation completed successfully!"