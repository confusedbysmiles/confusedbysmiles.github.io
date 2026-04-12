# Makefile — SCS275 Benign Binaries exercise
#
# Compiles all three analysis-exercise utilities.
# file_hasher links against OpenSSL libcrypto for MD5 support;
# the other two have no external dependencies beyond libc.
#
# Prerequisites (Ubuntu/Debian):
#   sudo apt-get install gcc libssl-dev
#
# Usage:
#   make          — build all three binaries
#   make clean    — remove compiled binaries

CC      := gcc
CFLAGS  := -O2 -Wall -Wextra -std=c11 -D_POSIX_C_SOURCE=200809L

TARGETS := file_hasher sysinfo log_watcher

.PHONY: all clean

all: $(TARGETS)
	@echo "Build complete: $(TARGETS)"

# file_hasher requires OpenSSL's libcrypto for MD5 (-lssl -lcrypto).
# On Ubuntu: sudo apt-get install libssl-dev
file_hasher: file_hasher.c
	$(CC) $(CFLAGS) -o $@ $< -lssl -lcrypto

# sysinfo reads /proc pseudo-files — no external libraries needed.
sysinfo: sysinfo.c
	$(CC) $(CFLAGS) -o $@ $<

# log_watcher uses only libc (fopen, strstr, sleep).
log_watcher: log_watcher.c
	$(CC) $(CFLAGS) -o $@ $<

clean:
	rm -f $(TARGETS)
