#!/bin/sh
set -eu

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(".")[0]) * 100 + Number(process.versions.node.split(".")[1])' 2>/dev/null || echo 0)" -lt 2219 ]; then
  command -v curl >/dev/null 2>&1 || { echo "Node.js 22.19+ or curl is required" >&2; exit 1; }
  os=$(uname -s | tr '[:upper:]' '[:lower:]'); arch=$(uname -m)
  case "$arch" in x86_64) arch=x64;; arm64|aarch64) arch=arm64;; *) echo "Unsupported architecture: $arch" >&2; exit 1;; esac
  version=v22.22.0; install_root="${XDG_DATA_HOME:-$HOME/.local/share}/agentctl/runtime"
  mkdir -p "$install_root"
  curl -fsSLo "$install_root/node.tar.xz" "https://nodejs.org/dist/$version/node-$version-$os-$arch.tar.xz"
  tar -xJf "$install_root/node.tar.xz" -C "$install_root" --strip-components=1
  PATH="$install_root/bin:$PATH"; export PATH
fi

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$repo_dir"
npm ci --ignore-scripts
npm run build
npm install --global .
global_bin=$(npm prefix --global)/bin
case ":$PATH:" in *":$global_bin:"*) :;; *) echo "Add $global_bin to PATH";; esac
echo "Installed agentctl. Run: $global_bin/agentctl setup"
