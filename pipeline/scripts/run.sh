#!/usr/bin/env bash
set -e

PROJECT_DIR="/home/user/legion-homepage/pipeline"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/pipeline_$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 파이프라인 시작" >> "$LOG_FILE"
$HOME/.local/bin/uv run python scripts/run_pipeline.py >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 파이프라인 종료" >> "$LOG_FILE"
