#!/bin/bash
set -e

# Lists all non-system users (UID >= 1000, excluding the 'nobody' account)
# and shows their home directory and whether an authorized_keys file exists.

echo "----------------------------------------"
printf "%-20s %-30s %s\n" "USERNAME" "HOME DIRECTORY" "AUTHORIZED_KEYS"
echo "----------------------------------------"

# /etc/passwd fields: username:password:UID:GID:comment:home:shell
while IFS=: read -r username _ uid _ _ home _; do

    # Skip UIDs below 1000 (system accounts) and the 'nobody' pseudo-user
    if [[ "$uid" -lt 1000 ]] || [[ "$username" == "nobody" ]]; then
        continue
    fi

    auth_keys="$home/.ssh/authorized_keys"

    if [[ -f "$auth_keys" ]]; then
        key_status="EXISTS"
    else
        key_status="MISSING"
    fi

    printf "%-20s %-30s %s\n" "$username" "$home" "$key_status"

done < /etc/passwd

echo "----------------------------------------"
