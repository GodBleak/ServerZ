#!/bin/sh

HEALTH_CHECK_FILE="/tmp/health"
MAX_AGE_SECONDS=10

if [ ! -f "$HEALTH_CHECK_FILE" ]; then
  exit 1
fi

file_timestamp=$(date -r "$HEALTH_CHECK_FILE" +%s)
current_time=$(date +%s)
age=$((current_time - file_timestamp))

if [ $age -le $MAX_AGE_SECONDS ]; then
  exit 0
else
  exit 1
fi
