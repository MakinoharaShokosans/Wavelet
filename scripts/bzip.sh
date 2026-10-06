#!/usr/bin/env bash
# ==============================================================================
# Wavelet ♫ Bilibili 音频解包与母带自愈转换脚本 (bzip)
# ==============================================================================
set -eo pipefail

resolve_script_dir() {
  local source="${BASH_SOURCE[0]}"
  while [ -h "$source" ]; do
    local dir
    dir="$(cd -P "$(dirname "$source")" >/dev/null 2>&1 && pwd)"
    source="$(readlink "$source")"
    [[ $source != /* ]] && source="$dir/$source"
  done
  cd -P "$(dirname "$source")" >/dev/null 2>&1 && pwd
}

SCRIPT_DIR="$(resolve_script_dir)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"

# 执行 Node.js 调度器
exec node "$SCRIPT_DIR/bzip.mjs" "$@"
