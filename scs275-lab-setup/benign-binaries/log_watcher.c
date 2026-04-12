/*
 * log_watcher.c
 * Purpose   : Tails a log file in a polling loop and prints any new line
 *             that contains a specified keyword, with a timestamp prefix.
 * Implements: Standard POSIX file I/O + sleep(); no network, no exec().
 * Teaches   : Context-dependent behavioural analysis.  A tight file-read
 *             loop that runs indefinitely is also exhibited by keyloggers,
 *             credential stealers, and data exfiltrators.  Students must
 *             learn that identical low-level behaviour (continuous file
 *             reads) can be benign or malicious depending on context —
 *             and that clear usage documentation embedded in the binary
 *             is meaningful evidence for human analysts even when automated
 *             tools flag the behaviour pattern.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>    /* sleep()  */
#include <signal.h>    /* signal() */
#include <time.h>      /* time(), localtime(), strftime() */

/* How often (seconds) we poll the file for new content.
 * Matches common log-rotation heartbeat intervals.              */
#define POLL_INTERVAL   2

/* Maximum line length we handle; lines longer than this are
 * truncated to the first LINE_MAX-1 characters.                */
#define LINE_MAX     4096

/* ─────────────────────────────────────────────────────────────────────
 * Signal handling — allow Ctrl-C to exit cleanly instead of producing
 * a terse "Broken pipe" error message.
 * ──────────────────────────────────────────────────────────────────── */
static volatile int g_running = 1;

static void handle_sigint(int sig)
{
    (void)sig;          /* suppress unused-parameter warning */
    g_running = 0;
}

/* ─────────────────────────────────────────────────────────────────────
 * usage() — comprehensive help text.
 *
 * The help string explicitly describes the tool as a log monitor and
 * gives clearly benign example invocations.  Students practicing
 * static analysis should locate this string (e.g. with `strings`) and
 * use it as documentary evidence of intent.
 * ──────────────────────────────────────────────────────────────────── */
static void usage(const char *prog)
{
    fprintf(stderr,
        "log_watcher — real-time log file keyword monitor\n"
        "================================================\n"
        "\n"
        "SYNOPSIS\n"
        "  %s <logfile> <keyword>\n"
        "\n"
        "DESCRIPTION\n"
        "  Monitors <logfile> for newly appended lines containing <keyword>.\n"
        "  Opens the file, seeks to the current end-of-file, then polls every\n"
        "  %d seconds for new content.  Any new line containing <keyword>\n"
        "  (case-sensitive, exact substring match) is printed to stdout with\n"
        "  a wall-clock timestamp prefix.\n"
        "\n"
        "  Press Ctrl-C to stop watching and exit cleanly.\n"
        "\n"
        "ARGUMENTS\n"
        "  <logfile>   Path to the log file to watch.\n"
        "              The file must exist and be readable.\n"
        "              Example: /var/log/syslog\n"
        "\n"
        "  <keyword>   Substring to match (case-sensitive).\n"
        "              Lines containing this string are printed.\n"
        "              Example: \"ERROR\", \"Failed password\", \"404\"\n"
        "\n"
        "OUTPUT FORMAT\n"
        "  [YYYY-MM-DD HH:MM:SS] <matching line>\n"
        "\n"
        "EXIT CODES\n"
        "  0   Stopped normally (Ctrl-C)\n"
        "  1   Bad arguments or could not open the log file\n"
        "\n"
        "EXAMPLES\n"
        "  # Watch for SSH login failures in the auth log\n"
        "  %s /var/log/auth.log \"Failed password\"\n"
        "\n"
        "  # Watch an nginx access log for HTTP 404 responses\n"
        "  %s /var/log/nginx/access.log \"404\"\n"
        "\n"
        "  # Monitor the system log for any ERROR-level messages\n"
        "  %s /var/log/syslog ERROR\n"
        "\n"
        "  # Watch a custom application log for exceptions\n"
        "  %s /opt/myapp/app.log \"Exception\"\n"
        "\n"
        "NOTES\n"
        "  - Only NEWLY appended lines are shown (existing content is skipped).\n"
        "  - Lines longer than %d bytes are truncated.\n"
        "  - This tool does NOT modify the log file.\n"
        "  - No network connections are made.\n",
        prog, POLL_INTERVAL,
        prog, prog, prog, prog,
        LINE_MAX - 1);
}

/* ─────────────────────────────────────────────────────────────────────
 * now_string() — fill buf with the current local time as
 *   "YYYY-MM-DD HH:MM:SS"
 * ──────────────────────────────────────────────────────────────────── */
static void now_string(char *buf, size_t len)
{
    time_t t = time(NULL);
    struct tm *tm_info = localtime(&t);
    strftime(buf, len, "%Y-%m-%d %H:%M:%S", tm_info);
}

/* ─────────────────────────────────────────────────────────────────────
 * watch_loop() — the main polling loop.
 *
 * Opens <logfile>, seeks to EOF (so existing content is skipped),
 * then every POLL_INTERVAL seconds reads any newly appended lines.
 * Lines matching <keyword> are printed with a timestamp.
 *
 * This is the function whose behaviour pattern resembles a keylogger:
 * it runs indefinitely, continuously reads a file, and never sleeps
 * for long.  Context — the logfile path, the keyword argument, and
 * the benign usage documentation above — distinguishes it.
 * ──────────────────────────────────────────────────────────────────── */
static int watch_loop(const char *logfile, const char *keyword)
{
    FILE *f = fopen(logfile, "r");
    if (!f) {
        perror(logfile);
        return 1;
    }

    /* Seek to the end — we only care about NEW lines, not history */
    if (fseek(f, 0, SEEK_END) != 0) {
        perror("fseek");
        fclose(f);
        return 1;
    }

    fprintf(stderr, "[log_watcher] Watching '%s' for '%s'  (Ctrl-C to stop)\n",
            logfile, keyword);

    char line[LINE_MAX];
    char ts[32];    /* timestamp buffer, "YYYY-MM-DD HH:MM:SS\0" = 20 bytes */

    while (g_running) {
        /* Drain all newly appended lines since the last check */
        while (fgets(line, sizeof(line), f)) {
            if (strstr(line, keyword)) {
                now_string(ts, sizeof(ts));
                printf("[%s] %s", ts, line);
                fflush(stdout);     /* ensure output appears immediately */
            }
        }

        /* clearerr() is required after fgets() returns NULL at EOF so
         * that the next call to fgets() will detect genuinely new data
         * rather than repeatedly returning NULL on the same EOF state.  */
        clearerr(f);

        /* Wait before the next poll — keeps CPU usage near zero        */
        sleep(POLL_INTERVAL);
    }

    fclose(f);
    return 0;
}

/* ─────────────────────────────────────────────────────────────────────
 * main()
 * ──────────────────────────────────────────────────────────────────── */
int main(int argc, char *argv[])
{
    if (argc != 3) {
        usage(argv[0]);
        return 1;
    }

    const char *logfile = argv[1];
    const char *keyword = argv[2];

    /* Install Ctrl-C handler before entering the loop */
    signal(SIGINT, handle_sigint);

    int rc = watch_loop(logfile, keyword);

    fprintf(stderr, "\n[log_watcher] Stopped.\n");
    return rc;
}
