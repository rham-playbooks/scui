#!/bin/bash
set -euo pipefail
exec > /var/log/scui-userdata.log 2>&1

echo "=== SCUI bootstrap start ==="

dnf install -y podman
dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm
dnf install -y certbot

CONTAINER_IMAGE="${container_image}"
AAP_BASE_URL="${aap_base_url}"
AAP_BEARER_TOKEN="${aap_bearer_token}"
API_CLIENT_BEARER_TOKEN="${api_client_bearer_token}"
DOMAIN="${domain}"
CERT_EMAIL="${cert_email}"

# Obtain Let's Encrypt cert (standalone mode on port 80)
if [ -n "$DOMAIN" ]; then
  echo "Requesting Let's Encrypt certificate for $DOMAIN ..."
  for i in 1 2 3 4 5; do
    certbot certonly --standalone --non-interactive --agree-tos \
      --email "$CERT_EMAIL" -d "$DOMAIN" && break
    echo "Certbot attempt $i failed, retrying in 30s (DNS may not have propagated)..."
    sleep 30
  done
fi

CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

podman pull "$CONTAINER_IMAGE"

if [ -n "$DOMAIN" ] && [ -f "$CERT_PATH/fullchain.pem" ]; then
  echo "Starting container with TLS on ports 80+443 ..."
  podman run -d \
    --name scui-nginx \
    --restart always \
    -p 80:80 \
    -p 443:443 \
    -v "$CERT_PATH/fullchain.pem:/etc/ssl/certs/site.crt:ro" \
    -v "$CERT_PATH/privkey.pem:/etc/ssl/private/site.key:ro" \
    -e "AAP_BASE_URL=$AAP_BASE_URL" \
    -e "AAP_BEARER_TOKEN=$AAP_BEARER_TOKEN" \
    -e "API_CLIENT_BEARER_TOKEN=$API_CLIENT_BEARER_TOKEN" \
    "$CONTAINER_IMAGE"
else
  echo "No TLS cert available, starting HTTP-only on port 80 ..."
  podman run -d \
    --name scui-nginx \
    --restart always \
    -p 80:80 \
    -e "AAP_BASE_URL=$AAP_BASE_URL" \
    -e "AAP_BEARER_TOKEN=$AAP_BEARER_TOKEN" \
    -e "API_CLIENT_BEARER_TOKEN=$API_CLIENT_BEARER_TOKEN" \
    "$CONTAINER_IMAGE"
fi

# Set up auto-renewal cron
echo "0 3 * * * certbot renew --quiet --deploy-hook 'podman restart scui-nginx'" \
  | crontab -

echo "=== SCUI bootstrap complete ==="
