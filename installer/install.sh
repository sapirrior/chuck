#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO="sapirrior/steward"

echo -e "${CYAN}${BOLD}[+] Installing Steward — Engineering Agent...${NC}"

# Detect OS
OS_RAW="$(uname -s)"
case "${OS_RAW}" in
  Linux*)   OS="linux" ;;
  Darwin*)  OS="darwin" ;;
  *)
    echo -e "${RED}[x] Unsupported operating system: ${OS_RAW}${NC}"
    exit 1
    ;;
esac

# Detect Architecture
ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
  x86_64|amd64)
    ARCH="x64"
    ;;
  aarch64|arm64|armv8*)
    ARCH="arm64"
    ;;
  *)
    echo -e "${RED}[x] Unsupported CPU architecture: ${ARCH_RAW}${NC}"
    exit 1
    ;;
esac

# Determine installation directory and target asset
IS_TERMUX=false
if [ -n "${PREFIX}" ] && [ -d "${PREFIX}/bin" ]; then
  IS_TERMUX=true
  INSTALL_DIR="${PREFIX}/bin"
  SHARE_DIR="${PREFIX}/share/steward"
  ASSET_NAME="steward-dist-cli.tar.gz"
elif [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  INSTALL_DIR="$HOME/.local/bin"
  ASSET_NAME="steward-${OS}-${ARCH}.tar.gz"
else
  INSTALL_DIR="/usr/local/bin"
  ASSET_NAME="steward-${OS}-${ARCH}.tar.gz"
fi

mkdir -p "${INSTALL_DIR}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"

echo -e "  ${BLUE}•${NC} Platform:     ${BOLD}${OS}-${ARCH}$([ "$IS_TERMUX" = true ] && echo " (Termux)")${NC}"
echo -e "  ${BLUE}•${NC} Install path: ${BOLD}${INSTALL_DIR}/steward${NC}"
echo -e "  ${BLUE}•${NC} Downloading:  ${CYAN}${DOWNLOAD_URL}${NC}"

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'steward-install')"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

# Download archive with timeouts and retries to prevent indefinite freezes
TARGET_FILE="${TMP_DIR}/${ASSET_NAME}"

if command -v curl >/dev/null 2>&1; then
  if ! curl -fL --connect-timeout 15 --max-time 300 --retry 3 --retry-delay 2 -# "${DOWNLOAD_URL}" -o "${TARGET_FILE}"; then
    echo -e "${RED}[x] Download failed with curl. Please check your internet connection and try again.${NC}"
    exit 1
  fi
elif command -v wget >/dev/null 2>&1; then
  if ! wget --timeout=15 --tries=3 --show-progress -O "${TARGET_FILE}" "${DOWNLOAD_URL}"; then
    echo -e "${RED}[x] Download failed with wget. Please check your internet connection and try again.${NC}"
    exit 1
  fi
else
  echo -e "${RED}[x] Neither curl nor wget was found. Please install curl or wget.${NC}"
  exit 1
fi

if [ ! -s "${TARGET_FILE}" ]; then
  echo -e "${RED}[x] Downloaded asset is empty or corrupted. Please verify release assets at https://github.com/${REPO}/releases${NC}"
  exit 1
fi

echo -e "  ${BLUE}•${NC} Extracting archive..."

# Extract and install
if ! tar -xzf "${TARGET_FILE}" -C "${TMP_DIR}"; then
  echo -e "${RED}[x] Failed to extract archive ${ASSET_NAME}.${NC}"
  exit 1
fi

if [ "$IS_TERMUX" = true ]; then
  mkdir -p "${SHARE_DIR}"
  if [ ! -f "${TMP_DIR}/cli.js" ]; then
    echo -e "${RED}[x] Failed to extract cli.js from ${ASSET_NAME}.${NC}"
    exit 1
  fi
  mv "${TMP_DIR}/cli.js" "${SHARE_DIR}/cli.js"

  cat << EOF > "${INSTALL_DIR}/steward"
#!${INSTALL_DIR}/sh
CLI_PATH="${SHARE_DIR}/cli.js"
if [ ! -f "\${CLI_PATH}" ]; then
  CLI_PATH="\${PREFIX:-/data/data/com.termux/files/usr}/share/steward/cli.js"
fi

if command -v bun >/dev/null 2>&1; then
  exec bun "\${CLI_PATH}" "\$@"
elif command -v node >/dev/null 2>&1; then
  exec node "\${CLI_PATH}" "\$@"
else
  echo "[x] Neither bun nor node was found. Please run: pkg install nodejs or pkg install bun"
  exit 1
fi
EOF
  chmod +x "${INSTALL_DIR}/steward"
  if command -v termux-fix-shebang >/dev/null 2>&1; then
    termux-fix-shebang "${INSTALL_DIR}/steward" 2>/dev/null || true
  fi
else
  if [ ! -f "${TMP_DIR}/steward" ]; then
    echo -e "${RED}[x] Failed to extract steward binary from archive.${NC}"
    exit 1
  fi
  chmod +x "${TMP_DIR}/steward"
  mv "${TMP_DIR}/steward" "${INSTALL_DIR}/steward"
fi

echo -e "${GREEN}${BOLD}[✔] Successfully installed steward to ${INSTALL_DIR}/steward!${NC}"

# Check PATH
case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo -e ""
    echo -e "${CYAN}[i] Notice: ${INSTALL_DIR} is not in your \$PATH.${NC}"
    echo -e "  Add it to your shell configuration:"
    echo -e "    ${BOLD}export PATH=\"${INSTALL_DIR}:\$PATH\"${NC}"
    echo -e ""
    ;;
esac

echo -e "Run ${BOLD}steward${NC} to get started."
