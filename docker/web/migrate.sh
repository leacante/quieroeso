#!/bin/sh
# Applies pending Prisma migrations (Railway pre-deploy and docker compose "migrate").
set -eu
cd /app/migrate
exec ./node_modules/.bin/prisma migrate deploy
