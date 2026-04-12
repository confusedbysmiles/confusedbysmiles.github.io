# Benign Binaries — SCS275 Static & Dynamic Malware Analysis Exercise

These three utilities are designed for use in the SCS275 malware analysis lab.
Students run their Python analysis scripts against these binaries alongside
real-world malware samples and must correctly classify each as benign.

Each binary is engineered to teach a specific analytical lesson — see below.

---

## Building

```bash
# Install the only external dependency (OpenSSL headers for file_hasher)
sudo apt-get install gcc libssl-dev

make
```

Produces three ELF executables: `file_hasher`, `sysinfo`, `log_watcher`.

To add a layer of difficulty, strip symbols before distributing to students:

```bash
strip file_hasher sysinfo log_watcher
```

---

## Binaries and Teaching Objectives

### `file_hasher`

**Source:** `file_hasher.c`

**What it does:** Takes a file path as an argument, reads the file, and prints
its MD5 checksum in standard `md5sum(1)` format.  MD5 is implemented using
OpenSSL's `libcrypto`.

**Teaching objective — string and import analysis require context:**

The binary is designed to produce false positives for naive automated
classifiers on two dimensions:

1. **String artifacts.** The usage string contains vocabulary like
   `"checksum verification"`, `"remote servers"`, `"firmware"`, and
   `"download integrity"` — phrasing that overlaps with network-based
   threat descriptions.  Students whose scripts do keyword scoring on
   `strings` output may incorrectly flag this binary.

2. **Import profile.** The binary links against `libssl` and `libcrypto`,
   which are also imported by many ransomware families (for key exchange and
   file encryption).  Students looking only at shared library dependencies
   may draw the wrong conclusion.

**The lesson:** Run `strace`/`ltrace` dynamically.  The binary calls
`fopen()`, `fread()`, and the OpenSSL MD5 functions only.  There is no
`socket()`, `connect()`, `send()`, or `recv()`.  String artifacts and
import tables are necessary but not sufficient for classification.

---

### `sysinfo`

**Source:** `sysinfo.c`

**What it does:** Reads `/proc/cpuinfo`, `/proc/meminfo`, and `/proc/uptime`
using standard `fopen()`/`fgets()` calls and prints a formatted system summary.

**Teaching objective — baseline calibration of a clean binary:**

This binary is intentionally unambiguous.  Its import profile is minimal
(`libc` only).  It makes no network calls, no `exec()` calls, and performs
no heap-based tricks.  Every file it opens is a well-known Linux pseudo-file.

Students should use this binary to:
- Establish what a truly clean `strace` and `ltrace` trace looks like
- Confirm that their analysis tooling (YARA rules, import scanners, syscall
  tracers) produces no false positives on a clearly benign sample
- Understand the expected footprint of a "benign system utility" baseline

**The lesson:** Before declaring something malicious, analysts need a reference
point.  `sysinfo` provides that ground truth.

---

### `log_watcher`

**Source:** `log_watcher.c`

**What it does:** Takes a log file path and a keyword as arguments, seeks to
the end of the file, then polls every 2 seconds for newly appended lines.
Any line containing the keyword is printed to stdout with a timestamp.

**Teaching objective — behavioural indicators require context:**

The binary's runtime behaviour superficially resembles two well-known malware
patterns:

1. **File-read loop** — `log_watcher` calls `fgets()` in a tight loop that
   never terminates voluntarily.  Keyloggers and credential harvesters that
   monitor files like `~/.bash_history`, `/proc/<pid>/fd/<stdin>`, or browser
   cookie stores exhibit structurally identical code paths.

2. **Continuous polling** — checking a file for new content every 2 seconds
   is also a common pattern in C2 beacons that poll a local staging file for
   commands.

However, the binary is completely benign:
- It takes the target path from `argv[]` and prints it in its startup message
- It embeds a comprehensive usage string describing exactly what it does
- It makes no network calls and writes only to `stdout`/`stderr`
- Its purpose — real-time log monitoring — is a standard sysadmin workflow

**The lesson:** Automated behavioural analysis tools will often flag this
binary.  Human review of the argument handling, the embedded usage
documentation, and the `strace` output (showing only `fgets`/`strstr`/`sleep`
in the hot path) reveals it as benign.  Context is everything.

---

## Notes for Instructors

- **Architecture consistency.** Compile these on the same architecture as your
  malware samples (typically x86-64) to avoid confusing students with
  architecture differences in `file` or `readelf` output.

- **Stripping.** Distributing stripped binaries (`strip <binary>`) forces
  students to rely on dynamic analysis and behavioral indicators rather than
  simply reading symbol names — recommended for more advanced cohorts.

- **Expected false positives.** Automated YARA rule sets or `clamav` may flag
  `file_hasher` (OpenSSL imports) or `log_watcher` (file-read loop pattern).
  Document expected false positives in your lab handout so students can treat
  them as a learning moment rather than a marking error.

- **Sample pairing.** For maximum pedagogical impact, pair each benign binary
  with a malware sample that shares one surface-level characteristic:
  - `file_hasher` ↔ ransomware that imports OpenSSL
  - `sysinfo` ↔ an infostealer that also reads `/proc` files
  - `log_watcher` ↔ a keylogger with a similar file-read loop
