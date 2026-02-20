#!/bin/bash
seed="_l337_h4x0r"
for i in {1..5}; do
    word=$(sort -R words | head -1)
    echo -n "$word "
    echo -n "$word$seed" | sha256sum | awk '{print $1}'
done
