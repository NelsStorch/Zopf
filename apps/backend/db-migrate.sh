#!/bin/sh
# Brings the database to the current schema. A failing migration stops the start
# instead of leaving a half-changed database (see deploy.ps1).
set -e
npx prisma migrate deploy
