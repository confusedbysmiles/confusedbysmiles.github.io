#!/bin/bash
# create_student_accounts.sh
# Creates individual Linux user accounts and SSH key pairs for each student
# listed in a roster file.
#
# Run as root on each lab instance AFTER the main setup script has completed:
#   sudo bash create_student_accounts.sh students.txt
#
# The roster file should contain one username per line, lowercase only.
# Blank lines and lines starting with # are ignored.
#
# What this script does for each student:
#   1. Creates a Linux user account with a home directory
#   2. Generates a unique ed25519 SSH key pair for that student
#   3. Installs the public key into their ~/.ssh/authorized_keys
#   4. Saves their private key to /root/student-keys/<username>.pem
#   5. Prints the private key so you can copy it to distribute to the student
#
# The student uses their private key to SSH in:
#   ssh -i <username>.pem <username>@<SERVER-IP>

set -e

# ─────────────────────────────────────────────
# Validate arguments
# ─────────────────────────────────────────────
if [[ $# -ne 1 ]]; then
    echo "Usage: sudo bash $0 <roster_file>"
    echo ""
    echo "  <roster_file>  Plain text file with one username per line."
    echo "                 Example: students.txt"
    exit 1
fi

ROSTER="$1"

if [[ ! -f "$ROSTER" ]]; then
    echo "ERROR: Roster file '$ROSTER' not found."
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This script must be run as root (use sudo)."
    exit 1
fi

# ─────────────────────────────────────────────
# Prepare output directory for private keys
# Stored on the instance as a backup in case you
# need to re-issue a key to a student later.
# ─────────────────────────────────────────────
KEY_DIR="/root/student-keys"
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

CREATED=()
SKIPPED=()

echo "=== SCS275 Student Account Creation ==="
echo "Roster : $ROSTER"
echo "Host   : $(hostname)"
echo "Date   : $(date)"
echo ""

# ─────────────────────────────────────────────
# Process each username in the roster file.
# Skip blank lines and comment lines (# prefix).
# ─────────────────────────────────────────────
while IFS= read -r username || [[ -n "$username" ]]; do
    # Strip leading/trailing whitespace
    username=$(echo "$username" | tr -d '[:space:]')

    # Skip blank lines and comments
    [[ -z "$username" ]] && continue
    [[ "$username" == \#* ]] && continue

    # Validate: lowercase letters, digits, underscores, hyphens only
    if ! [[ "$username" =~ ^[a-z][a-z0-9._-]{0,31}$ ]]; then
        echo "  [SKIP] '$username' — invalid username (must start with a letter,"
        echo "         contain only a-z 0-9 . _ - and be 32 chars or fewer)."
        SKIPPED+=("$username")
        continue
    fi

    # ─────────────────────────────────────────
    # Create the Linux user account if it
    # does not already exist.
    # ─────────────────────────────────────────
    if id "$username" &>/dev/null; then
        echo "  [INFO] User '$username' already exists — regenerating SSH key only."
    else
        useradd \
            --create-home \
            --shell /bin/bash \
            --comment "SCS275 Student" \
            "$username"
        echo "  [+] Created user: $username"
    fi

    # Ensure the student is NOT in the sudo group (belt-and-suspenders check)
    gpasswd -d "$username" sudo 2>/dev/null || true

    # ─────────────────────────────────────────
    # Generate a unique ed25519 SSH key pair
    # for this student.
    # The private key goes to /root/student-keys/
    # The public key is installed into the
    # student's authorized_keys.
    # ─────────────────────────────────────────
    PRIV_KEY="${KEY_DIR}/${username}.pem"
    PUB_KEY="${KEY_DIR}/${username}.pem.pub"

    # Remove any existing key for this user before regenerating
    rm -f "$PRIV_KEY" "$PUB_KEY"

    # Generate the key pair — no passphrase so students don't need one
    ssh-keygen \
        -t ed25519 \
        -C "scs275-${username}" \
        -f "$PRIV_KEY" \
        -N "" \
        -q

    chmod 600 "$PRIV_KEY"
    chmod 644 "$PUB_KEY"

    # Install the public key into the student's authorized_keys
    SSH_DIR="/home/${username}/.ssh"
    AUTH_KEYS="${SSH_DIR}/authorized_keys"

    mkdir -p "$SSH_DIR"
    # Replace any existing authorized_keys entirely so old keys don't linger
    cp "$PUB_KEY" "$AUTH_KEYS"

    chmod 700 "$SSH_DIR"
    chmod 600 "$AUTH_KEYS"
    chown -R "${username}:${username}" "$SSH_DIR"

    CREATED+=("$username")

done < "$ROSTER"

# ─────────────────────────────────────────────
# Print a summary and then the private keys.
# COPY THIS OUTPUT — send each student their
# own key block.
# ─────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Accounts created : ${#CREATED[@]}"
echo "  Skipped          : ${#SKIPPED[@]}"
if [[ ${#SKIPPED[@]} -gt 0 ]]; then
    echo "  Skipped usernames: ${SKIPPED[*]}"
fi
echo "  Private keys saved to: ${KEY_DIR}/"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  PRIVATE KEYS — distribute each block to the named student only."
echo "  Do NOT share one student's key with another."
echo ""
echo "══════════════════════════════════════════════════════════"

# Print each student's private key with a clear label
for username in "${CREATED[@]}"; do
    PRIV_KEY="${KEY_DIR}/${username}.pem"
    SERVER_IP=$(curl -sf --connect-timeout 3 \
        http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
        || hostname -I | awk '{print $1}')

    echo ""
    echo "┌─────────────────────────────────────────────────────────"
    echo "│  Student  : ${username}"
    echo "│  Server   : ${SERVER_IP}"
    echo "│  Connect  : ssh -i ${username}.pem ${username}@${SERVER_IP}"
    echo "│"
    echo "│  Private key (save as ${username}.pem, chmod 400):"
    echo "│"
    cat "$PRIV_KEY" | sed 's/^/│  /'
    echo "└─────────────────────────────────────────────────────────"
done

echo ""
echo "Done. Remember to run this script on the other lab instance too."
