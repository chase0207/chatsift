#!/bin/bash
# 在【生产服务器】上运行的 chatsift MySQL 备份脚本(cron 每日)。
# 非破坏性。dump chatsift 库 → gzip → 本地保留 ≥30 天(可选上传 COS)。
# 建议 crontab:  0 3 * * *  /opt/chatsift/scripts/backup-mysql.sh >> /var/log/chatsift-backup.log 2>&1
set -euo pipefail

CONTAINER="${CHATSIFT_MYSQL_CONTAINER:-chatsift-mysql}"
DB_NAME="${MYSQL_DATABASE:-chatsift}"
BACKUP_DIR="${CHATSIFT_BACKUP_DIR:-/opt/chatsift/backups}"
RETENTION_DAYS="${CHATSIFT_BACKUP_RETENTION:-30}"
ENV_FILE="${CHATSIFT_ENV_FILE:-/opt/chatsift/deploy/.env.production}"

mkdir -p "$BACKUP_DIR"

# 取 root 密码(从 .env.production)
if [[ -f "$ENV_FILE" ]]; then
  ROOT_PW="$(grep -E '^MYSQL_ROOT_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
else
  echo "[ERROR] 找不到 $ENV_FILE,无法取 MySQL 密码"; exit 1
fi
[[ -n "${ROOT_PW:-}" ]] || { echo "[ERROR] MYSQL_ROOT_PASSWORD 为空"; exit 1; }

TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/chatsift_${DB_NAME}_${TS}.sql.gz"

echo "[backup] dump $DB_NAME from container $CONTAINER → $OUT"
docker exec -i "$CONTAINER" sh -c "exec mysqldump -uroot -p\"$ROOT_PW\" --single-transaction --routines --triggers \"$DB_NAME\"" \
  | gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[backup] done: $OUT ($SIZE)"

# 保留期清理
find "$BACKUP_DIR" -name 'chatsift_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "[backup] 已清理 ${RETENTION_DAYS} 天前的旧备份"

# 可选:上传腾讯云 COS(装好 coscli 并配置后取消注释)
# coscli cp "$OUT" cos://your-bucket/chatsift-backups/ && echo "[backup] uploaded to COS"
