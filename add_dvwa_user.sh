#!/bin/bash
set -e

# ── argument validation ──────────────────────────────────────────────────────

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <username> <path-to-public-key>" >&2
    exit 1
fi

USERNAME="$1"
PUBKEY_FILE="$2"

if [[ ! -f "$PUBKEY_FILE" ]]; then
    echo "Error: public key file '$PUBKEY_FILE' not found." >&2
    exit 1
fi

# ── create the user ──────────────────────────────────────────────────────────

# --create-home ensures /home/$USERNAME is created with correct skeleton files.
# --shell sets the login shell; no -G sudo, so no elevated privileges.
useradd \
    --create-home \
    --home-dir "/home/$USERNAME" \
    --shell /bin/bash \
    "$USERNAME"

# ── set up SSH directory and authorised key ──────────────────────────────────

SSH_DIR="/home/$USERNAME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"

# Copy the supplied public key into authorized_keys
cp "$PUBKEY_FILE" "$AUTH_KEYS"

# Permissions required by sshd:
#   .ssh/          700 (owner rwx only)
#   authorized_keys 600 (owner rw only)
chmod 700 "$SSH_DIR"
chmod 600 "$AUTH_KEYS"

# Give the new user ownership of their .ssh directory and its contents
chown -R "$USERNAME:$USERNAME" "$SSH_DIR"

# ── confirmation summary ─────────────────────────────────────────────────────

echo "----------------------------------------"
echo "User created successfully."
echo "  Username      : $USERNAME"
echo "  Home directory: /home/$USERNAME"
echo "  Authorized key: $AUTH_KEYS"
echo ""
echo "REMINDER: Distribute the corresponding private key to the user via a"
echo "secure out-of-band channel (e.g. encrypted email or a secrets manager)."
echo "Never send private keys over unencrypted channels."
echo "----------------------------------------"
