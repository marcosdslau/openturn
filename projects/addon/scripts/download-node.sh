#!/bin/bash
set -e

NODE_VERSION="v24.13.0"
BIN_DIR="../../bin"

mkdir -p "$BIN_DIR"

echo "============================================="
echo " Fetching Node.js $NODE_VERSION binaries "
echo "============================================="

# 1. Download Windows node.exe
if [ ! -f "$BIN_DIR/node-$NODE_VERSION-win-x64.exe" ]; then
    echo "Downloading Windows binary..."
    curl -L "https://nodejs.org/dist/$NODE_VERSION/win-x64/node.exe" -o "$BIN_DIR/node-$NODE_VERSION-win-x64.exe"
else
    echo "Windows binary already exists."
fi

# 2. Download Linux node
if [ ! -f "$BIN_DIR/node-$NODE_VERSION-linux-x64" ]; then
    echo "Downloading Linux binary..."
    curl -L "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz" -o "$BIN_DIR/node.tar.gz"
    tar -xzf "$BIN_DIR/node.tar.gz" -C "$BIN_DIR"
    mv "$BIN_DIR/node-$NODE_VERSION-linux-x64/bin/node" "$BIN_DIR/node-$NODE_VERSION-linux-x64"
    rm -rf "$BIN_DIR/node-$NODE_VERSION-linux-x64" "$BIN_DIR/node.tar.gz"
else
    echo "Linux binary already exists."
fi

echo "============================================="
echo " Done. Binaries saved to $BIN_DIR "
echo "============================================="
