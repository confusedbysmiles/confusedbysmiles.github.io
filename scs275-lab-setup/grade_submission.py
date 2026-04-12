#!/usr/bin/env python3
"""
grade_submission.py  —  SCS275 Lab Auto-Grader
================================================
Evaluates a student submission directory against the assignment rubric.

Usage (VS Code Terminal):
    python grade_submission.py <submission_dir> [options]

Options:
    --student-id NAME   Student name/ID (defaults to directory name)
    --json              Also write grade_report.json into the submission dir
    --no-color          Disable ANSI colour output

Expected submission layout:
    <submission_dir>/
    ├── dvwa/
    │   └── setup_dvwa.sh
    ├── exploit-lab/
    │   └── setup_exploit_lab.sh
    └── benign-binaries/
        ├── file_hasher.c
        ├── sysinfo.c
        ├── log_watcher.c
        ├── Makefile
        └── README.md
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Terminal colours (disabled by --no-color)
# ─────────────────────────────────────────────────────────────────────────────

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RubricItem:
    description: str
    points: int
    earned: int = 0
    feedback: str = ""


@dataclass
class Section:
    name: str
    items: List[RubricItem] = field(default_factory=list)

    @property
    def total_points(self) -> int:
        return sum(i.points for i in self.items)

    @property
    def earned_points(self) -> int:
        return sum(i.earned for i in self.items)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def read_file(path: str) -> Optional[str]:
    try:
        with open(path, "r", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def match_any(content: str, patterns: List[str]) -> bool:
    """Return True if any pattern matches (case-insensitive, multiline)."""
    flags = re.IGNORECASE | re.MULTILINE
    return any(re.search(p, content, flags) for p in patterns)


def match_all(content: str, patterns: List[str]) -> bool:
    """Return True only if every pattern matches."""
    flags = re.IGNORECASE | re.MULTILINE
    return all(re.search(p, content, flags) for p in patterns)


def award(item: RubricItem, passed: bool,
          ok: str = "", fail: str = "") -> None:
    if passed:
        item.earned = item.points
        item.feedback = ok or "PASS"
    else:
        item.earned = 0
        item.feedback = fail or "FAIL"


def missing_section(sec: Section, items: List[Tuple[str, int]]) -> None:
    """Append zero-scored items when the parent file is absent."""
    for desc, pts in items:
        sec.items.append(RubricItem(desc, pts, 0, "File missing — cannot evaluate."))


# ─────────────────────────────────────────────────────────────────────────────
# Deliverable 1 — setup_dvwa.sh
# ─────────────────────────────────────────────────────────────────────────────

def grade_dvwa(base: str) -> Section:
    sec = Section("Deliverable 1 — setup_dvwa.sh")
    path = os.path.join(base, "dvwa", "setup_dvwa.sh")
    c = read_file(path)

    # 1.1 File exists
    item = RubricItem("File exists at dvwa/setup_dvwa.sh", 5)
    award(item, c is not None, fail="File not found at dvwa/setup_dvwa.sh.")
    sec.items.append(item)

    if c is None:
        missing_section(sec, [
            ("Starts with #!/bin/bash and uses set -e",             5),
            ("Installs Docker Engine",                             10),
            ("Installs Docker Compose",                             5),
            ("Pulls ghcr.io/digininja/dvwa:latest image",         10),
            ("Exposes DVWA on port 80",                             5),
            ("Sets DVWA security level to 'low' via env var",     10),
            ("Configures systemd service for auto-restart",        10),
            ("Prints success message with URL and credentials",     5),
            ("Inline comments throughout (>= 10 comment lines)",    5),
        ])
        return sec

    # 1.2 Shebang + set -e
    item = RubricItem("Starts with #!/bin/bash and uses set -e", 5)
    ok_shebang = c.startswith("#!/bin/bash")
    ok_sete = bool(re.search(r"^set\s+-e", c, re.MULTILINE))
    msgs = []
    if not ok_shebang: msgs.append("missing #!/bin/bash shebang")
    if not ok_sete:    msgs.append("missing 'set -e'")
    award(item, ok_shebang and ok_sete,
          fail="Issues: " + "; ".join(msgs) if msgs else "")
    sec.items.append(item)

    # 1.3 Docker installation
    item = RubricItem("Installs Docker Engine", 10)
    award(item,
          match_any(c, [r"apt.get.*install.*docker", r"docker-ce",
                        r"docker\.io", r"get\.docker\.com"]),
          fail="No evidence of Docker Engine installation found.")
    sec.items.append(item)

    # 1.4 Docker Compose
    item = RubricItem("Installs Docker Compose", 5)
    award(item, match_any(c, [r"docker.compose", r"docker-compose"]),
          fail="No evidence of Docker Compose installation found.")
    sec.items.append(item)

    # 1.5 DVWA image
    item = RubricItem("Pulls ghcr.io/digininja/dvwa:latest image", 10)
    award(item, match_any(c, [r"ghcr\.io/digininja/dvwa"]),
          fail="Official DVWA image 'ghcr.io/digininja/dvwa' not referenced.")
    sec.items.append(item)

    # 1.6 Port 80
    item = RubricItem("Exposes DVWA on port 80", 5)
    award(item, match_any(c, [r"[\"']?80:80[\"']?", r"port.*80", r"-p\s*80"]),
          fail="Port 80 mapping not found.")
    sec.items.append(item)

    # 1.7 Security level low
    item = RubricItem("Sets DVWA security level to 'low' via environment variable", 10)
    award(item,
          match_any(c, [r"SECURITY_LEVEL\s*=\s*['\"]?low",
                        r"DVWA_SECURITY.*low", r"security.*=.*low"]),
          fail="DVWA_SECURITY_LEVEL=low not set.")
    sec.items.append(item)

    # 1.8 systemd
    item = RubricItem("Configures systemd service for auto-restart on reboot", 10)
    award(item,
          match_any(c, [r"systemd", r"\.service", r"systemctl\s+enable",
                        r"WantedBy.*multi-user"]),
          fail="No systemd service configuration found.")
    sec.items.append(item)

    # 1.9 Success message
    item = RubricItem("Prints success message with URL and default credentials", 5)
    award(item,
          match_any(c, [r"http://", r"URL", r"port\s*80"]) and
          match_any(c, [r"admin", r"password"]),
          fail="Success message missing URL and/or default credentials.")
    sec.items.append(item)

    # 1.10 Comments
    n_comments = len(re.findall(r"^\s*#[^!]", c, re.MULTILINE))
    item = RubricItem("Inline comments throughout (>= 10 comment lines)", 5)
    award(item, n_comments >= 10,
          ok=f"Found {n_comments} comment lines.",
          fail=f"Only {n_comments} comment lines — add more inline documentation.")
    sec.items.append(item)

    return sec


# ─────────────────────────────────────────────────────────────────────────────
# Deliverable 2 — setup_exploit_lab.sh
# ─────────────────────────────────────────────────────────────────────────────

REQUIRED_TOOLS  = ["gcc", "gdb", "gdbserver", "python3", "pwntools",
                   "checksec", "nasm", "file", "binutils"]
REQUIRED_FLAGS  = ["-fno-stack-protector", "-z execstack", "-m32", "-g"]


def grade_exploit_lab(base: str) -> Section:
    sec = Section("Deliverable 2 — setup_exploit_lab.sh")
    path = os.path.join(base, "exploit-lab", "setup_exploit_lab.sh")
    c = read_file(path)

    item = RubricItem("File exists at exploit-lab/setup_exploit_lab.sh", 5)
    award(item, c is not None,
          fail="File not found at exploit-lab/setup_exploit_lab.sh.")
    sec.items.append(item)

    if c is None:
        missing_section(sec, [
            ("Starts with #!/bin/bash and uses set -e",                        5),
            ("Installs all required tools",                                    10),
            ("Disables ASLR permanently (kernel.randomize_va_space=0)",        10),
            ("Creates 'student' user without sudo privileges",                  5),
            ("Compiles vuln_server with all required flags",                   10),
            ("Deploys source + binary to /home/student/",                       5),
            ("Creates systemd service running on port 4444",                   10),
            ("Creates /home/student/README.txt",                                5),
            ("Embedded C source contains strcpy + fixed buffer overflow",      10),
            ("Inline comments throughout (>= 10 comment lines)",                5),
        ])
        return sec

    # 2.2 Shebang + set -e
    item = RubricItem("Starts with #!/bin/bash and uses set -e", 5)
    ok_s = c.startswith("#!/bin/bash")
    ok_e = bool(re.search(r"^set\s+-e", c, re.MULTILINE))
    award(item, ok_s and ok_e,
          fail=("Missing shebang. " if not ok_s else "") +
               ("Missing set -e." if not ok_e else ""))
    sec.items.append(item)

    # 2.3 Required tools
    missing_tools = [t for t in REQUIRED_TOOLS
                     if not re.search(re.escape(t), c, re.IGNORECASE)]
    item = RubricItem("Installs all required tools (gcc, gdb, gdbserver, python3, "
                      "pwntools, checksec, nasm, file, binutils)", 10)
    award(item, len(missing_tools) == 0,
          ok="All required tools referenced.",
          fail=f"Missing tools: {', '.join(missing_tools)}")
    sec.items.append(item)

    # 2.4 Disable ASLR
    item = RubricItem("Disables ASLR permanently (kernel.randomize_va_space=0 "
                      "in /etc/sysctl.d/)", 10)
    award(item,
          match_any(c, [r"randomize_va_space\s*=\s*0",
                        r"kernel\.randomize_va_space"]) and
          match_any(c, [r"sysctl"]),
          fail="kernel.randomize_va_space=0 not set via sysctl.")
    sec.items.append(item)

    # 2.5 student user
    item = RubricItem("Creates 'student' user without sudo privileges", 5)
    award(item,
          match_any(c, [r"useradd.*student", r"adduser.*student"]),
          fail="No 'student' user creation found.")
    sec.items.append(item)

    # 2.6 Compile flags
    missing_flags = [f for f in REQUIRED_FLAGS if f not in c]
    item = RubricItem("Compiles vuln_server with all required flags "
                      "(-fno-stack-protector, -z execstack, -m32, -g)", 10)
    award(item, len(missing_flags) == 0,
          ok="All compile flags present.",
          fail=f"Missing compile flags: {', '.join(missing_flags)}")
    sec.items.append(item)

    # 2.7 Deploy path
    item = RubricItem("Deploys source + binary to /home/student/", 5)
    award(item, match_any(c, [r"/home/student/vuln_server"]),
          fail="Binary not deployed to /home/student/vuln_server.")
    sec.items.append(item)

    # 2.8 systemd + port 4444
    item = RubricItem("Creates systemd service running on port 4444", 10)
    award(item,
          match_any(c, [r"4444"]) and
          match_any(c, [r"systemd", r"\.service", r"systemctl"]),
          fail="No systemd service referencing port 4444 found.")
    sec.items.append(item)

    # 2.9 README.txt
    item = RubricItem("Creates /home/student/README.txt", 5)
    award(item,
          match_any(c, [r"README\.txt", r"/home/student/README"]),
          fail="README.txt creation not found.")
    sec.items.append(item)

    # 2.10 Vulnerable C pattern
    item = RubricItem("Embedded C source contains strcpy + fixed buffer (overflow pattern)", 10)
    award(item,
          match_any(c, [r"strcpy", r"strcat"]) and
          match_any(c, [r"char\s+\w+\[", r"buf\["]),
          fail="No strcpy-based buffer overflow pattern found in embedded C source.")
    sec.items.append(item)

    # 2.11 Comments
    n_comments = len(re.findall(r"^\s*#[^!]", c, re.MULTILINE))
    item = RubricItem("Inline comments throughout (>= 10 comment lines)", 5)
    award(item, n_comments >= 10,
          ok=f"Found {n_comments} comment lines.",
          fail=f"Only {n_comments} comment lines.")
    sec.items.append(item)

    return sec


# ─────────────────────────────────────────────────────────────────────────────
# Deliverable 3 — Benign Binaries
# ─────────────────────────────────────────────────────────────────────────────

def grade_benign_binaries(base: str) -> Section:
    sec = Section("Deliverable 3 — Benign Binaries")
    bb = os.path.join(base, "benign-binaries")

    def p(name: str) -> str:
        return os.path.join(bb, name)

    # ── file_hasher.c ────────────────────────────────────────────────────────
    fh = read_file(p("file_hasher.c"))

    item = RubricItem("file_hasher.c exists", 3)
    award(item, fh is not None, fail="file_hasher.c not found.")
    sec.items.append(item)

    if fh:
        item = RubricItem("file_hasher.c: implements MD5 (manual or OpenSSL)", 8)
        award(item, match_any(fh, [r"MD5", r"md5", r"openssl/md5"]),
              fail="No MD5 implementation or OpenSSL MD5 include found.")
        sec.items.append(item)

        item = RubricItem("file_hasher.c: accepts file path argument and reads file", 5)
        award(item, match_any(fh, [r"argv\[", r"fopen"]),
              fail="File path argument or fopen() not found.")
        sec.items.append(item)

        item = RubricItem("file_hasher.c: contains network-adjacent string artifacts", 5)
        award(item,
              match_any(fh, [r"checksum verif", r"remote", r"download",
                              r"network", r"server", r"firmware"]),
              fail="No network-adjacent string artifacts found.")
        sec.items.append(item)

        item = RubricItem("file_hasher.c: makes NO actual network calls", 5)
        has_net = match_any(fh, [r"\bsocket\s*\(", r"\bconnect\s*\(",
                                  r"\bsend\s*\(", r"\brecv\s*\("])
        award(item, not has_net,
              ok="No network syscalls detected.",
              fail="Network syscall found — binary must not make network connections.")
        sec.items.append(item)

        item = RubricItem("file_hasher.c: top-of-file comment block with purpose + teaching note", 3)
        award(item,
              match_all(fh, [r"/\*", r"purpose|Purpose", r"teach|malware|analys"]),
              fail="Comment block missing or incomplete (need Purpose + teaching note).")
        sec.items.append(item)
    else:
        missing_section(sec, [
            ("file_hasher.c: MD5 implementation",                8),
            ("file_hasher.c: file path argument + fopen()",      5),
            ("file_hasher.c: network-adjacent string artifacts", 5),
            ("file_hasher.c: no actual network calls",           5),
            ("file_hasher.c: comment block",                     3),
        ])

    # ── sysinfo.c ────────────────────────────────────────────────────────────
    si = read_file(p("sysinfo.c"))

    item = RubricItem("sysinfo.c exists", 3)
    award(item, si is not None, fail="sysinfo.c not found.")
    sec.items.append(item)

    if si:
        reads_all = (match_any(si, [r"/proc/cpuinfo"]) and
                     match_any(si, [r"/proc/meminfo"]) and
                     match_any(si, [r"/proc/uptime"]))
        item = RubricItem("sysinfo.c: reads /proc/cpuinfo, /proc/meminfo, /proc/uptime", 8)
        award(item, reads_all, fail="Not all three /proc files referenced.")
        sec.items.append(item)

        has_unsafe = match_any(si, [r"\bsystem\s*\(", r"\bexecv?\w*\s*\(",
                                     r"\bpopen\s*\(", r"\bsocket\s*\("])
        item = RubricItem("sysinfo.c: standard file I/O only (no system/exec/popen/socket)", 8)
        award(item, not has_unsafe,
              ok="No unsafe syscalls detected.",
              fail="system(), exec*(), popen(), or socket() found — use file I/O only.")
        sec.items.append(item)

        item = RubricItem("sysinfo.c: top-of-file comment block with purpose + teaching note", 3)
        award(item,
              match_all(si, [r"/\*", r"purpose|Purpose", r"teach|malware|analys"]),
              fail="Comment block missing or incomplete.")
        sec.items.append(item)
    else:
        missing_section(sec, [
            ("sysinfo.c: reads all three /proc files",          8),
            ("sysinfo.c: standard file I/O only",               8),
            ("sysinfo.c: comment block",                        3),
        ])

    # ── log_watcher.c ────────────────────────────────────────────────────────
    lw = read_file(p("log_watcher.c"))

    item = RubricItem("log_watcher.c exists", 3)
    award(item, lw is not None, fail="log_watcher.c not found.")
    sec.items.append(item)

    if lw:
        item = RubricItem("log_watcher.c: accepts log file path and keyword as arguments", 5)
        award(item,
              match_any(lw, [r"argv\[1\]", r"argc.*3", r"logfile", r"keyword"]),
              fail="Two-argument (logfile + keyword) handling not found.")
        sec.items.append(item)

        has_loop  = match_any(lw, [r"while\s*\(", r"for\s*\("])
        has_sleep = match_any(lw, [r"sleep\s*\(\s*2", r"POLL_INTERVAL",
                                    r"usleep\s*\(\s*2000"])
        item = RubricItem("log_watcher.c: polling loop with ~2-second sleep interval", 8)
        award(item, has_loop and has_sleep,
              fail="Polling loop with 2-second sleep not found.")
        sec.items.append(item)

        item = RubricItem("log_watcher.c: searches each line for the keyword (strstr/strcmp)", 5)
        award(item, match_any(lw, [r"strstr\s*\(", r"strncmp\s*\(", r"strcmp"]),
              fail="No string search (strstr/strcmp) for keyword found.")
        sec.items.append(item)

        item = RubricItem("log_watcher.c: clearly benign usage/help string embedded in binary", 5)
        award(item,
              match_any(lw, [r"usage|Usage|USAGE"]) and
              match_any(lw, [r"log.*file|logfile|log_file"]),
              fail="Benign usage/help string not found.")
        sec.items.append(item)

        item = RubricItem("log_watcher.c: top-of-file comment block with purpose + teaching note", 3)
        award(item,
              match_all(lw, [r"/\*", r"purpose|Purpose", r"teach|malware|analys"]),
              fail="Comment block missing or incomplete.")
        sec.items.append(item)
    else:
        missing_section(sec, [
            ("log_watcher.c: two-argument (logfile + keyword) handling",  5),
            ("log_watcher.c: polling loop with 2-second sleep",           8),
            ("log_watcher.c: keyword search via strstr/strcmp",           5),
            ("log_watcher.c: benign usage/help string",                   5),
            ("log_watcher.c: comment block",                              3),
        ])

    # ── Makefile ─────────────────────────────────────────────────────────────
    mk = read_file(p("Makefile"))
    item = RubricItem("Makefile exists and references all three targets", 5)
    award(item,
          mk is not None and
          match_any(mk, [r"file_hasher"]) and
          match_any(mk, [r"sysinfo"]) and
          match_any(mk, [r"log_watcher"]),
          fail="Makefile missing or does not reference all three binaries.")
    sec.items.append(item)

    item = RubricItem("Makefile compiles with gcc -O2", 3)
    award(item, mk is not None and match_any(mk, [r"-O2"]),
          fail="Makefile does not use -O2.")
    sec.items.append(item)

    # ── README.md ─────────────────────────────────────────────────────────────
    rm = read_file(p("README.md"))
    item = RubricItem("README.md exists and describes teaching objectives for all three binaries", 5)
    award(item,
          rm is not None and
          match_any(rm, [r"file_hasher|hasher"]) and
          match_any(rm, [r"sysinfo"]) and
          match_any(rm, [r"log_watcher|watcher"]) and
          match_any(rm, [r"teach|objective|exercise|malware"]),
          fail="README.md missing or does not cover all three binaries with teaching objectives.")
    sec.items.append(item)

    return sec


# ─────────────────────────────────────────────────────────────────────────────
# Report rendering
# ─────────────────────────────────────────────────────────────────────────────

def render_report(sections: List[Section], student_id: str) -> Tuple[int, int]:
    total_earned = sum(s.earned_points for s in sections)
    total_max    = sum(s.total_points for s in sections)

    print(f"\n{BOLD}{'═' * 68}{RESET}")
    print(f"{BOLD}  SCS275 Lab Grading Report{RESET}")
    print(f"  Submission : {student_id}")
    print(f"{'═' * 68}{RESET}")

    for sec in sections:
        pct = sec.earned_points / sec.total_points * 100 if sec.total_points else 0
        col = GREEN if pct >= 70 else (YELLOW if pct >= 50 else RED)
        print(f"\n{BOLD}{sec.name}{RESET}")
        print(f"  Score: {col}{sec.earned_points}/{sec.total_points} ({pct:.0f}%){RESET}")
        print(f"  {'─' * 58}")
        for item in sec.items:
            passed = item.earned == item.points
            tag_col = GREEN if passed else RED
            tag = "PASS" if passed else "FAIL"
            print(f"  [{tag_col}{tag}{RESET}] ({item.earned:2}/{item.points:2}pt)  {item.description}")
            # Only print feedback when it adds information beyond the tag
            if item.feedback and item.feedback not in ("PASS",):
                print(f"           {item.feedback}")

    pct = total_earned / total_max * 100 if total_max else 0
    col = GREEN if pct >= 70 else (YELLOW if pct >= 50 else RED)
    letter = ("A" if pct >= 90 else "B" if pct >= 80 else
              "C" if pct >= 70 else "D" if pct >= 60 else "F")

    print(f"\n{'═' * 68}")
    print(f"{BOLD}  FINAL SCORE : {col}{total_earned}/{total_max} ({pct:.1f}%){RESET}")
    print(f"{BOLD}  LETTER GRADE: {col}{letter}{RESET}")
    print(f"{'═' * 68}\n")

    return total_earned, total_max


def build_json(sections: List[Section], student_id: str,
               earned: int, total: int) -> dict:
    return {
        "student_id": student_id,
        "earned": earned,
        "total": total,
        "percentage": round(earned / total * 100, 1) if total else 0,
        "sections": [
            {
                "name":   s.name,
                "earned": s.earned_points,
                "total":  s.total_points,
                "items": [
                    {"description": i.description, "earned": i.earned,
                     "points": i.points, "feedback": i.feedback}
                    for i in s.items
                ],
            }
            for s in sections
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Grade an SCS275 lab submission against the assignment rubric.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("submission_dir",
                        help="Path to the student's submission directory")
    parser.add_argument("--student-id", default=None,
                        help="Student name/ID (default: submission dir name)")
    parser.add_argument("--json", action="store_true",
                        help="Write grade_report.json into the submission directory")
    parser.add_argument("--no-color", action="store_true",
                        help="Disable ANSI colour output")
    args = parser.parse_args()

    sub_dir = os.path.abspath(args.submission_dir)
    if not os.path.isdir(sub_dir):
        print(f"ERROR: '{sub_dir}' is not a directory.", file=sys.stderr)
        sys.exit(1)

    student_id = args.student_id or os.path.basename(sub_dir)

    if args.no_color:
        global GREEN, RED, YELLOW, BOLD, RESET
        GREEN = RED = YELLOW = BOLD = RESET = ""

    sections = [
        grade_dvwa(sub_dir),
        grade_exploit_lab(sub_dir),
        grade_benign_binaries(sub_dir),
    ]

    earned, total = render_report(sections, student_id)

    if args.json:
        report = build_json(sections, student_id, earned, total)
        out = os.path.join(sub_dir, "grade_report.json")
        with open(out, "w") as f:
            json.dump(report, f, indent=2)
        print(f"JSON report written to: {out}\n")


if __name__ == "__main__":
    main()
