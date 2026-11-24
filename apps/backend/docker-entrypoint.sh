#!/bin/sh
# Starts the backend as the unprivileged user "node".
set -e

if [ "$(id -u)" = "0" ]; then
  export HOME=/home/node
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
