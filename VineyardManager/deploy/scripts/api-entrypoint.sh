#!/bin/sh
# Fail closed before the API process starts. Print variable names only.
set -eu

fail() {
  echo "missing or unsafe: $1" >&2
  exit 1
}

require_set() {
  eval "val=\${$1-}"
  if [ -z "$val" ]; then
    fail "$1"
  fi
}

profile=${DEPLOY_PROFILE-}
case "$profile" in
  production|rehearsal) ;;
  *) fail DEPLOY_PROFILE ;;
esac

require_set NODE_ENV
if [ "$NODE_ENV" != "production" ]; then
  fail NODE_ENV
fi

require_set DATABASE_URL
require_set JWT_SECRET
require_set APP_URL
require_set WEB_ORIGIN
require_set MAIL_FROM
require_set UPLOAD_DIR
require_set WEATHER_CRON_ENABLED
require_set DIGEST_CRON_ENABLED

if [ "$DIGEST_CRON_ENABLED" != "false" ]; then
  fail DIGEST_CRON_ENABLED
fi

case "$UPLOAD_DIR" in
  /*) ;;
  *) fail UPLOAD_DIR ;;
esac

jwt_len=$(printf '%s' "$JWT_SECRET" | wc -c | tr -d ' ')
if [ "$jwt_len" -lt 64 ]; then
  fail JWT_SECRET
fi
printf '%s' "$JWT_SECRET" | grep -Eq '^[A-Za-z0-9_-]+$' || fail JWT_SECRET

if [ "$profile" = "production" ]; then
  if [ "$APP_URL" != "https://abidevine.hipfog.com" ]; then
    fail APP_URL
  fi
  if [ "$WEB_ORIGIN" != "https://abidevine.hipfog.com" ]; then
    fail WEB_ORIGIN
  fi
fi

case "$WEATHER_CRON_ENABLED" in
  true|false) ;;
  *) fail WEATHER_CRON_ENABLED ;;
esac

if [ -n "${SMTP_URL-}" ]; then
  :
elif [ -n "${SMTP_HOST-}" ]; then
  require_set SMTP_PORT
  require_set SMTP_USER
  require_set SMTP_PASS
else
  echo "mail not configured"
fi

exec "$@"
