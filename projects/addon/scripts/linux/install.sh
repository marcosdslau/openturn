#!/bin/bash
set -e

echo "============================================="
echo "  OpenTurn Addon Connector - Linux Installer "
echo "============================================="

if [ "$EUID" -ne 0 ]; then
  echo "Please run this script as root (sudo ./install.sh)"
  exit 1
fi

NODE_VERSION="v24.13.0"
TOKEN=""
RELAY_URL="wss://api.sua-empresa.com/ws/connectors"

# Parse args
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -t|--token) TOKEN="$2"; shift ;;
        -u|--url) RELAY_URL="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

# Prompt for token if not provided
if [ -z "$TOKEN" ]; then
    echo "Enter Pairing Token (JWT):"
    read -r TOKEN
fi

if [ -z "$TOKEN" ]; then
    echo "Error: Token is required for installation."
    exit 1
fi

echo "Installing binaries..."
cp ../../bin/node-$NODE_VERSION-linux-x64 /usr/local/bin/openturn-node
chmod +x /usr/local/bin/openturn-node

mkdir -p /usr/local/lib/openturn-connector
cp ../../dist/index.js /usr/local/lib/openturn-connector/

echo "Configuring connector..."
# Run the pairing command to generate the config file in /root/.openturn-connector/config.json
/usr/local/bin/openturn-node /usr/local/lib/openturn-connector/index.js pair --token "$TOKEN" --url "$RELAY_URL"

echo "Creating systemd service..."
cat <<EOF > /etc/systemd/system/openturn-connector.service
[Unit]
Description=OpenTurn Addon Connector
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/openturn-node /usr/local/lib/openturn-connector/index.js start
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=openturn-connector

[Install]
WantedBy=multi-user.target
EOF

echo "Reloading systemd and enabling service..."
systemctl daemon-reload
systemctl enable openturn-connector
systemctl start openturn-connector

echo "============================================="
echo "Installation Complete!"
echo "Check status with: sudo systemctl status openturn-connector"
echo "View logs with: sudo journalctl -u openturn-connector -f"
echo "============================================="
