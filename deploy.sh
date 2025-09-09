#!/bin/bash

# Variables
USER="gneuro"
BASE_PATH="/home/${USER}"
BASE_NAME="backend-gneuro"
BASE_COMPOSE_FILE="docker-compose"
REMOTE="tg-web.djbloknote.ru"

# Ask user for area to deploy
echo "Enter the area to deploy (press enter for dev, type 'prod' for prod):"
read AREA

# Set default area to dev if not specified
if [ -z "$AREA" ]; then
    AREA="development"
    REMOTE=""
fi

# Set destination path and docker compose file based on area
DESTINATION_PATH="$BASE_PATH/${AREA}_${BASE_NAME}/"
# DEPLOY_USER="${AREA}_${BASE_NAME}"
DEPLOY_USER="${USER}"

echo Destination path: $DESTINATION_PATH

# Check if .env file exists for the specified area
AREA_ENV_FILE=".env-$AREA"
echo "Using environment file: $AREA_ENV_FILE"
# exit 1
if [ ! -f "$AREA_ENV_FILE" ]; then
    echo "Error: .env-$AREA file not found."
    exit 1
fi

# Deploy function
deploy() {
    DOCKER_COMPOSE_FILE="docker-compose-prod.yaml"

    ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@$REMOTE "mkdir -p $DESTINATION_PATH"

    rsync -avz -e 'ssh -o StrictHostKeyChecking=no' ${AREA_ENV_FILE} ${DEPLOY_USER}@"$REMOTE:$DESTINATION_PATH/.env"

    rsync -avz -e 'ssh -o StrictHostKeyChecking=no' docker* src services  *.json *.js ${DEPLOY_USER}@"$REMOTE:$DESTINATION_PATH/"
    ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@$REMOTE "cd $DESTINATION_PATH && docker compose -f ${DOCKER_COMPOSE_FILE} up -d --build"
}

# Deploy
deploy