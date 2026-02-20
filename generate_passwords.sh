#!/bin/bash
seed="_l337_h4x0r"
> passwords.txt
for i in {1..5}; do
    word=$(sort -R words | head -1)
    hash=$(echo -n "$word$seed" | sha256sum | awk '{print $1}')
    echo "$word $hash" | tee -a passwords.txt
done
