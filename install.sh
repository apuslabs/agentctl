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
if [ ! -f "$repo_dir/install.sh" ] || [ ! -f "$repo_dir/package.json" ] || [ ! -f "$repo_dir/package-lock.json" ] || [ ! -f "$repo_dir/src/cli.ts" ]; then
  command -v curl >/dev/null 2>&1 || { echo "curl is required for the remote installer" >&2; exit 1; }
  tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/agentctl.XXXXXX")
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
  ref=${AGENTCTL_REF-main}
  [ -n "$ref" ] || { echo "AGENTCTL_REF must not be empty" >&2; exit 1; }
  curl -fsSL "https://github.com/apuslabs/agentctl/archive/$ref.tar.gz" | tar -xzf - -C "$tmp_dir"
  repo_dir=$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)
fi
cd "$repo_dir"
npm ci --ignore-scripts
npm run build
npm install --global .
global_bin=$(npm prefix --global)/bin
case ":$PATH:" in *":$global_bin:"*) :;; *) echo "Add $global_bin to PATH";; esac
if [ "${AGENTCTL_NO_LAUNCH:-0}" = 1 ] || [ -n "${CI:-}" ] || [ ! -t 1 ] || [ ! -e /dev/tty ]; then
  echo "Next step: agentctl"
else
  echo "agentctl is ready."
  echo "Opening your assistant..."
  exec "$global_bin/agentctl" </dev/tty >/dev/tty 2>/dev/tty
fi
