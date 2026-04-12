/*
 * file_hasher.c
 * Purpose   : Command-line utility that reads a file and prints its MD5
 *             checksum in standard md5sum(1) format.
 * Implements: MD5 via OpenSSL libcrypto (no other external dependencies).
 * Teaches   : String-artifact and import-profile analysis — the binary
 *             contains network-adjacent language ("checksum verification",
 *             "remote servers", "firmware") and links against a crypto
 *             library (shared with some ransomware families), yet makes
 *             zero network calls.  Students must learn that string
 *             indicators and library imports require corroborating evidence.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <openssl/md5.h>   /* requires -lssl -lcrypto at link time */

/* Read up to 64 KiB at a time; large enough to be efficient, small
 * enough to avoid stack overflow on constrained systems.             */
#define IO_BUFSIZE  65536

/* ─────────────────────────────────────────────────────────────────────
 * usage() — print help text and exit.
 *
 * The usage string deliberately includes network-adjacent vocabulary
 * ("checksum verification", "remote servers", "firmware") so that naive
 * keyword-scanning tools flag this binary.  Students must then look at
 * the actual import table and confirm: no socket(), no connect(), no
 * send()/recv() — the network language is purely documentary.
 * ──────────────────────────────────────────────────────────────────── */
static void usage(const char *prog)
{
    fprintf(stderr,
        "Usage: %s <file>\n"
        "\n"
        "Compute and print the MD5 checksum of <file>.\n"
        "\n"
        "Common use-cases:\n"
        "  - Integrity / checksum verification of downloaded packages\n"
        "  - Validating files received from remote servers\n"
        "  - Firmware integrity checks before flashing\n"
        "  - Deduplication pipelines and content-addressed caches\n"
        "\n"
        "Output format (identical to md5sum(1)):\n"
        "  <32-char hexdigest>  <filename>\n"
        "\n"
        "Examples:\n"
        "  %s /etc/passwd\n"
        "  %s firmware_update.bin     # verify firmware checksum\n"
        "  %s package.tar.gz          # confirm download integrity\n"
        "\n"
        "Exit codes: 0 = success, 1 = error (bad argument or I/O failure)\n",
        prog, prog, prog, prog);
}

/* ─────────────────────────────────────────────────────────────────────
 * hash_file() — stream-hash a file using OpenSSL's MD5 implementation.
 *
 * Returns 0 on success, -1 on I/O error.
 * On success, digest[] is filled with MD5_DIGEST_LENGTH (16) bytes.
 * ──────────────────────────────────────────────────────────────────── */
static int hash_file(const char *path, unsigned char digest[MD5_DIGEST_LENGTH])
{
    FILE *f = fopen(path, "rb");
    if (!f) {
        perror(path);
        return -1;
    }

    /* Initialise an incremental MD5 context */
    MD5_CTX ctx;
    MD5_Init(&ctx);

    unsigned char buf[IO_BUFSIZE];
    size_t n;

    /* Feed the file to MD5 in chunks; avoids loading the whole file
     * into memory (safe for very large files).                       */
    while ((n = fread(buf, 1, sizeof(buf), f)) > 0) {
        MD5_Update(&ctx, buf, n);
    }

    /* Check for read errors (distinct from EOF) */
    if (ferror(f)) {
        perror(path);
        fclose(f);
        return -1;
    }

    fclose(f);

    /* Finalise: write the 16-byte digest and invalidate the context */
    MD5_Final(digest, &ctx);
    return 0;
}

int main(int argc, char *argv[])
{
    if (argc != 2) {
        usage(argv[0]);
        return 1;
    }

    const char *path = argv[1];
    unsigned char digest[MD5_DIGEST_LENGTH];

    if (hash_file(path, digest) != 0) {
        return 1;
    }

    /* Print 32-character lowercase hex digest followed by two spaces
     * and the filename — matches the output of the system md5sum(1).  */
    for (int i = 0; i < MD5_DIGEST_LENGTH; i++) {
        printf("%02x", digest[i]);
    }
    printf("  %s\n", path);

    return 0;
}
