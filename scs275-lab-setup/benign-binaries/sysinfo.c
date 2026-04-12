/*
 * sysinfo.c
 * Purpose   : Reads /proc/cpuinfo, /proc/meminfo, and /proc/uptime and
 *             prints a formatted system summary to stdout.
 * Implements: Standard POSIX file I/O only — no network calls, no exec(),
 *             no system(), no dynamic library loading beyond libc.
 * Teaches   : Baseline "ground truth" for a clean binary.  Students should
 *             confirm via static analysis (ldd, readelf, strings) and
 *             dynamic analysis (strace, ltrace) that the import profile is
 *             minimal and every syscall is accounted for.  This calibrates
 *             their tooling before they encounter ambiguous samples.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define LINE_BUF   512    /* maximum /proc line length we handle     */
#define HDR_WIDTH   54    /* width of section header separator lines */

/* ─────────────────────────────────────────────────────────────────────
 * print_header() — draw a labelled horizontal rule, e.g.
 *   ── CPU ────────────────────────────────────────────────────────
 * ──────────────────────────────────────────────────────────────────── */
static void print_header(const char *label)
{
    int label_len = (int)strlen(label);
    int pad = HDR_WIDTH - label_len - 4;   /* 4 = "── " + " " */
    if (pad < 0) pad = 0;

    printf("\n── %s ", label);
    for (int i = 0; i < pad; i++) putchar('-');
    putchar('\n');
}

/* ─────────────────────────────────────────────────────────────────────
 * print_field() — scan a /proc file line-by-line and print the first
 * line whose key prefix matches `field`.
 *
 * Example: print_field("/proc/cpuinfo", "model name")
 *   prints "  model name    : Intel(R) Core(TM) i7-10700K\n"
 * ──────────────────────────────────────────────────────────────────── */
static void print_field(const char *path, const char *field)
{
    FILE *f = fopen(path, "r");
    if (!f) {
        fprintf(stderr, "  [error] cannot open %s: ", path);
        perror(NULL);
        return;
    }

    char line[LINE_BUF];
    int found = 0;

    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, field, strlen(field)) == 0) {
            printf("  %s", line);
            found = 1;
            break;
        }
    }

    if (!found) {
        printf("  %s : (not found in %s)\n", field, path);
    }

    fclose(f);
}

/* ─────────────────────────────────────────────────────────────────────
 * show_cpuinfo() — print selected CPU fields from /proc/cpuinfo.
 *
 * /proc/cpuinfo is a text pseudo-file exported by the kernel.  Each
 * entry is a "key\t: value\n" line; the file may contain one block per
 * logical core.  We stop at the first match for each field (core 0).
 * ──────────────────────────────────────────────────────────────────── */
static void show_cpuinfo(void)
{
    print_header("CPU");
    print_field("/proc/cpuinfo", "model name");
    print_field("/proc/cpuinfo", "cpu cores");
    print_field("/proc/cpuinfo", "siblings");
    print_field("/proc/cpuinfo", "cpu MHz");
    print_field("/proc/cpuinfo", "cache size");
    print_field("/proc/cpuinfo", "flags");   /* shows feature bits, e.g. sse4 avx */
}

/* ─────────────────────────────────────────────────────────────────────
 * show_meminfo() — print selected memory fields from /proc/meminfo.
 *
 * /proc/meminfo reports quantities in kibibytes (kB).
 * ──────────────────────────────────────────────────────────────────── */
static void show_meminfo(void)
{
    print_header("Memory");
    print_field("/proc/meminfo", "MemTotal");
    print_field("/proc/meminfo", "MemFree");
    print_field("/proc/meminfo", "MemAvailable");
    print_field("/proc/meminfo", "Buffers");
    print_field("/proc/meminfo", "Cached");
    print_field("/proc/meminfo", "SwapTotal");
    print_field("/proc/meminfo", "SwapFree");
}

/* ─────────────────────────────────────────────────────────────────────
 * show_uptime() — read /proc/uptime and print a human-friendly uptime.
 *
 * /proc/uptime contains two space-separated floats:
 *   <seconds_since_boot> <total_idle_cpu_seconds>
 * We convert the first value to days / HH:MM:SS.
 * ──────────────────────────────────────────────────────────────────── */
static void show_uptime(void)
{
    print_header("Uptime");

    FILE *f = fopen("/proc/uptime", "r");
    if (!f) {
        fprintf(stderr, "  [error] cannot open /proc/uptime: ");
        perror(NULL);
        return;
    }

    double up_sec = 0.0, idle_sec = 0.0;
    if (fscanf(f, "%lf %lf", &up_sec, &idle_sec) != 2) {
        fprintf(stderr, "  [error] unexpected format in /proc/uptime\n");
        fclose(f);
        return;
    }
    fclose(f);

    long total  = (long)up_sec;
    long days   = total / 86400;
    long hours  = (total % 86400) / 3600;
    long mins   = (total % 3600)  / 60;
    long secs   = total % 60;

    /* Calculate CPU idle percentage (idle_sec counts all cores) */
    printf("  Uptime : %ld day%s, %02ld:%02ld:%02ld\n",
           days, (days == 1 ? "" : "s"), hours, mins, secs);
    printf("  Idle   : %.0f seconds (cumulative across all cores)\n", idle_sec);
}

/* ─────────────────────────────────────────────────────────────────────
 * main()
 * ──────────────────────────────────────────────────────────────────── */
int main(void)
{
    printf("╔══════════════════════════════════════════════════════╗\n");
    printf("║               System Information                     ║\n");
    printf("╚══════════════════════════════════════════════════════╝\n");

    show_cpuinfo();
    show_meminfo();
    show_uptime();

    printf("\n");
    return 0;
}
