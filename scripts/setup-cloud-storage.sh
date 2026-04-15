#!/bin/bash
# Setup rclone cloud storage for Audiobookshelf
# Supports: Google Drive, Dropbox, OneDrive, S3, Backblaze B2, WebDAV, 70+ others
#
# Usage: ./setup-cloud-storage.sh

set -e

RCLONE_CONFIG_DIR="/opt/audiobookshelf/rclone"
MOUNT_BASE="/opt/audiobookshelf"
CACHE_DIR="/opt/audiobookshelf/rclone-cache"

echo "=== Audiobookshelf Cloud Storage Setup ==="
echo ""

# Install rclone if needed
if ! command -v rclone &>/dev/null; then
    echo "Installing rclone..."
    curl https://rclone.org/install.sh | bash
fi

echo "rclone version: $(rclone version --check 2>/dev/null | head -1 || rclone version | head -1)"
echo ""

# Create dirs
mkdir -p "$RCLONE_CONFIG_DIR" "$CACHE_DIR"

# Check if already configured
if [ -f "$RCLONE_CONFIG_DIR/rclone.conf" ]; then
    echo "Existing remotes:"
    RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone listremotes
    echo ""
    read -p "Add another remote? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Done. Use 'rclone mount <remote>: /mount/point' to mount."
        exit 0
    fi
fi

echo "Choose storage provider:"
echo "  1) Google Drive"
echo "  2) Dropbox"
echo "  3) OneDrive"
echo "  4) Amazon S3"
echo "  5) Backblaze B2"
echo "  6) WebDAV (Nextcloud, ownCloud, etc.)"
echo "  7) Other (interactive rclone config)"
echo ""
read -p "Choice [1-7]: " choice

REMOTE_NAME=""
case $choice in
    1) REMOTE_NAME="gdrive"
       echo "Setting up Google Drive..."
       RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone config create "$REMOTE_NAME" drive
       ;;
    2) REMOTE_NAME="dropbox"
       RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone config create "$REMOTE_NAME" dropbox
       ;;
    3) REMOTE_NAME="onedrive"
       RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone config create "$REMOTE_NAME" onedrive
       ;;
    4) REMOTE_NAME="s3"
       RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone config create "$REMOTE_NAME" s3
       ;;
    5) REMOTE_NAME="b2"
       RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone config create "$REMOTE_NAME" b2
       ;;
    6) REMOTE_NAME="webdav"
       RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone config create "$REMOTE_NAME" webdav
       ;;
    7) RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone config
       REMOTE_NAME=$(RCLONE_CONFIG="$RCLONE_CONFIG_DIR/rclone.conf" rclone listremotes | tail -1 | tr -d ':')
       ;;
    *) echo "Invalid choice"; exit 1 ;;
esac

if [ -z "$REMOTE_NAME" ]; then
    echo "No remote configured."
    exit 1
fi

echo ""
echo "Remote '$REMOTE_NAME' configured."
echo ""

# Ask for remote path
read -p "Remote folder path (e.g., Audiobooks or /Books): " REMOTE_PATH
REMOTE_PATH="${REMOTE_PATH:-/}"

# Mount point
MOUNT_POINT="$MOUNT_BASE/${REMOTE_NAME}-audiobooks"
mkdir -p "$MOUNT_POINT"

echo ""
echo "=== Creating systemd mount service ==="

cat > "/etc/systemd/system/abs-rclone-${REMOTE_NAME}.service" << EOF
[Unit]
Description=rclone mount ${REMOTE_NAME} for Audiobookshelf
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/rclone mount ${REMOTE_NAME}:${REMOTE_PATH} ${MOUNT_POINT} \
  --config ${RCLONE_CONFIG_DIR}/rclone.conf \
  --allow-other \
  --vfs-cache-mode full \
  --vfs-cache-max-size 10G \
  --vfs-cache-max-age 72h \
  --dir-cache-time 30m \
  --poll-interval 15m \
  --log-level INFO \
  --log-file /var/log/abs-rclone-${REMOTE_NAME}.log
ExecStop=/bin/fusermount -uz ${MOUNT_POINT}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "abs-rclone-${REMOTE_NAME}"
systemctl start "abs-rclone-${REMOTE_NAME}"

echo ""
echo "=== Done ==="
echo "Mount point: $MOUNT_POINT"
echo "Service: abs-rclone-${REMOTE_NAME}"
echo ""
echo "Add to your docker-compose.yml volumes:"
echo "  - ${MOUNT_POINT}:/audiobooks-${REMOTE_NAME}:ro"
echo ""
echo "Then in ABS, create a library pointing to /audiobooks-${REMOTE_NAME}"
echo ""
echo "Commands:"
echo "  systemctl status abs-rclone-${REMOTE_NAME}  # check status"
echo "  journalctl -u abs-rclone-${REMOTE_NAME}     # view logs"
echo "  ls ${MOUNT_POINT}                            # browse files"
