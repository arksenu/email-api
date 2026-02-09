#!/bin/bash
trap 'kill 0' EXIT

docker compose up db &
sleep 2
npm run dev &

wait
