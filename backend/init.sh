#!/bin/sh
# Azure App Service custom-container entrypoint: start sshd (required for the
# portal's "SSH" / Kudu web-terminal feature to reach this container on port
# 2222), then exec the real process (the Dockerfile's CMD) as PID 1.
mkdir -p /run/sshd
ssh-keygen -A
/usr/sbin/sshd -e
exec "$@"
