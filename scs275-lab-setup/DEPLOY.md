# SCS275 Lab — AWS Deployment Guide

Complete step-by-step instructions for deploying the DVWA server and Exploit Lab
on fresh Ubuntu 22.04 EC2 instances. Follow every step in order.

---

## What You Will End Up With

| Server | Purpose | Exposed port | How students connect |
|--------|---------|-------------|----------------------|
| `scs275-dvwa` | DVWA web application target | 22 (SSH only) | SSH tunnel → browser on localhost |
| `scs275-exploit-lab` | Buffer overflow exploit target | 22 (SSH only) | SSH → `nc localhost 4444` on the instance |

**Security model:** Neither server exposes application ports to the internet.
Every student has their own named Linux account and SSH key. Access is controlled
by authentication, not IP filtering. All traffic is encrypted in transit.

Estimated total time: **45–60 minutes** (plus ~2 min per student account)
Estimated AWS cost while running: **~$0.03/hour** for both instances combined

---

## Before You Start — What You Need

1. An AWS account with permission to create EC2 instances, security groups, and key pairs.
2. A roster of student usernames (e.g. `jsmith`, `adoe`) — one account will be created per student.
3. A terminal application:
   - Mac/Linux: Terminal (built in)
   - Windows: PowerShell, Windows Terminal, or Git Bash
4. The scripts from this repository on your local machine (`setup_dvwa.sh`, `setup_exploit_lab.sh`, and `create_student_accounts.sh`).

---

## PHASE 1 — Create a Key Pair

A key pair lets you SSH into your EC2 instances securely. You create it once and reuse it for both servers.

**1.1** Sign in to the AWS Management Console.

**1.2** In the search bar at the top of the console, type **EC2** and click the EC2 result.

**1.3** In the left sidebar, scroll down to **Network & Security** and click **Key Pairs**.

**1.4** Click the orange **Create key pair** button in the top-right corner.

**1.5** Fill in the form:
- **Name:** `scs275-lab`
- **Key pair type:** RSA
- **Private key file format:**
  - Choose `.pem` if you are on Mac or Linux
  - Choose `.ppk` if you are on Windows and use PuTTY
  - Choose `.pem` if you are on Windows and use PowerShell or Git Bash

**1.6** Click **Create key pair**. A file named `scs275-lab.pem` (or `.ppk`) will automatically download to your computer. **Do not lose this file** — AWS will never give it to you again.

**1.7** Move the file somewhere permanent and restrict its permissions so SSH will accept it:

```bash
# Mac / Linux — run in your terminal
mkdir -p ~/.ssh
mv ~/Downloads/scs275-lab.pem ~/.ssh/scs275-lab.pem
chmod 400 ~/.ssh/scs275-lab.pem
```

On Windows with PowerShell the equivalent permission fix is:
```powershell
icacls "$env:USERPROFILE\.ssh\scs275-lab.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

---

## PHASE 2 — Create Security Groups

Security groups act as firewalls. You need one per server. **Do this before launching instances.**

### Security Group A — DVWA Server

**2.1** In the EC2 left sidebar, under **Network & Security**, click **Security Groups**.

**2.2** Click **Create security group**.

**2.3** Fill in the **Basic details** section:
- **Security group name:** `scs275-dvwa-sg`
- **Description:** `DVWA lab server — SSH only, students use SSH tunnels`
- **VPC:** Leave as default (the pre-selected default VPC is fine)

**2.4** Under **Inbound rules**, click **Add rule** and add **one rule only**:

**Rule 1 — SSH (the only open port):**
- **Type:** SSH
- **Protocol:** TCP (auto-filled)
- **Port range:** 22 (auto-filled)
- **Source:** `0.0.0.0/0`
  (Students connect from various locations; SSH with individual key pairs is the
  security boundary — not IP restriction. Port 80 is never exposed publicly.)
- **Description:** SSH for admin and student accounts

**2.5** Leave **Outbound rules** at the default (allow all outbound).

**2.6** Click **Create security group**.

> **Why no port 80?** DVWA is intentionally vulnerable. Exposing it directly
> to the internet — even to a campus range — creates unnecessary risk. Students
> reach it via an SSH tunnel that forwards port 80 to their local machine.
> The web traffic never leaves the encrypted SSH connection.

---

### Security Group B — Exploit Lab Server

**2.7** Click **Create security group** again.

**2.8** Fill in the **Basic details** section:
- **Security group name:** `scs275-exploit-sg`
- **Description:** `Exploit lab server — SSH only, students connect to vuln_server via localhost`
- **VPC:** Leave as default

**2.9** Under **Inbound rules**, add **one rule only**:

**Rule 1 — SSH (the only open port):**
- **Type:** SSH
- **Protocol:** TCP (auto-filled)
- **Port range:** 22 (auto-filled)
- **Source:** `0.0.0.0/0`
- **Description:** SSH for admin and student accounts

**2.10** Click **Create security group**.

> **Why no port 4444?** Students SSH into the instance as their own account
> and run their exploits from within that session (`nc localhost 4444`). The
> vulnerable server is only reachable from inside the machine — an internet-
> facing exploit target would be a serious liability.

---

## PHASE 3 — Launch the DVWA Instance

**3.1** In the EC2 left sidebar, click **Instances**, then click **Launch instances**.

**3.2** Under **Name and tags**, enter: `scs275-dvwa`

**3.3** Under **Application and OS Images (Amazon Machine Image)**:
- Click **Browse more AMIs** if Ubuntu is not already shown
- In the search box type: `Ubuntu Server 22.04 LTS`
- Select the result published by **Canonical** with architecture **64-bit (x86)**
- The AMI ID will look like `ami-0xxxxxxxxxxxxxxxxx` — the exact ID varies by region, which is fine

**3.4** Under **Instance type**:
- Click the dropdown and search for `t3.small`
- Select `t3.small` (2 vCPU, 2 GiB RAM)
- Do not use t3.micro for DVWA — Docker needs the extra memory

**3.5** Under **Key pair (login)**:
- Select `scs275-lab` from the dropdown

**3.6** Under **Network settings**, click **Edit**:
- **VPC:** leave as default
- **Subnet:** leave as default (any availability zone is fine)
- **Auto-assign public IP:** **Enable** (important — you need a public IP to reach it)
- **Firewall (security groups):** select **Select existing security group**
- From the dropdown, select `scs275-dvwa-sg`

**3.7** Under **Configure storage**:
- Change the size from 8 GiB to **20 GiB**
- Leave volume type as `gp3`

**3.8** Leave everything else at default. Click **Launch instance**.

**3.9** Click **View all instances** to return to the instances list. Wait until the **Instance state** column shows **Running** and the **Status check** column shows **2/2 checks passed** (takes 1–2 minutes). Refresh the page if needed.

**3.10** Click on the instance row. In the details panel at the bottom, locate and copy the **Public IPv4 address** (looks like `54.x.x.x`). Save this — it is your DVWA URL.

---

## PHASE 4 — Launch the Exploit Lab Instance

**4.1** Click **Launch instances** again.

**4.2** Under **Name and tags**, enter: `scs275-exploit-lab`

**4.3** Under **Application and OS Images**: same as before — **Ubuntu Server 22.04 LTS**, 64-bit x86, published by Canonical.

**4.4** Under **Instance type**: select `t3.micro` (1 vCPU, 1 GiB — sufficient for the exploit server)

**4.5** Under **Key pair**: select `scs275-lab`

**4.6** Under **Network settings**, click **Edit**:
- **Auto-assign public IP:** Enable
- **Firewall:** Select existing security group → `scs275-exploit-sg`

**4.7** Under **Configure storage**: change to **15 GiB**, type `gp3`

**4.8** Click **Launch instance**.

**4.9** Wait for the instance to show **Running** and **2/2 checks passed**.

**4.10** Click the instance row, copy its **Public IPv4 address**. Save this separately from the DVWA IP.

---

## PHASE 5 — Run the DVWA Setup Script

You will SSH into the DVWA instance and run the setup script.

**5.1** Open a terminal on your local machine.

**5.2** Navigate to wherever you cloned this repository so the script is accessible:
```bash
cd /path/to/scs275-lab-setup
```

**5.3** Copy the setup script to the DVWA instance (replace `<DVWA-IP>` with the IP you saved in step 3.10):
```bash
scp -i ~/.ssh/scs275-lab.pem \
    dvwa/setup_dvwa.sh \
    ubuntu@<DVWA-IP>:~/setup_dvwa.sh
```

You may see a prompt: `Are you sure you want to continue connecting (yes/no)?` — type `yes` and press Enter.

**5.4** SSH into the DVWA instance:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<DVWA-IP>
```

Your prompt will change to something like `ubuntu@ip-172-x-x-x:~$` — you are now inside the EC2 instance.

**5.5** Run the setup script as root. This will take **3–8 minutes** the first time because Docker must download the DVWA and MariaDB images (~800 MB total):
```bash
sudo bash setup_dvwa.sh
```

Watch the output as it runs. Each numbered step prints progress. When it finishes you will see a banner like:
```
╔══════════════════════════════════════════════════════╗
║           DVWA is now running!                       ║
║  URL      :  http://54.x.x.x                        ║
║  Username :  admin                                   ║
║  Password :  password                                ║
╚══════════════════════════════════════════════════════╝
```

If you see an error instead, scroll up to find the first line that says `Error:` or `failed` and note it.

**5.6** Type `exit` to close the SSH session and return to your local terminal.

---

## PHASE 6 — Initialise the DVWA Database (Required — Do This Once)

DVWA requires a one-time database setup step. Because port 80 is not publicly
exposed, you reach it through an **SSH tunnel** that forwards the port to your
local machine. You will use this same tunnel method to verify it works; students
use the same approach.

**6.1** Open a **new terminal window** on your local machine (keep it open — the tunnel runs in it).

**6.2** Start the SSH tunnel. This forwards port 8080 on your local machine to port 80 on the DVWA instance:
```bash
ssh -i ~/.ssh/scs275-lab.pem \
    -L 8080:localhost:80 \
    -N \
    ubuntu@<DVWA-IP>
```
- `-L 8080:localhost:80` — forward local port 8080 to the instance's port 80
- `-N` — don't open a shell, just hold the tunnel open
- The command will appear to hang with no output — that is correct. The tunnel is active.

**6.3** In your web browser, go to: `http://localhost:8080/`

You should see the DVWA login page. If you see "connection refused", wait 30 seconds and refresh — Docker may still be starting.

**6.4** Log in with:
- **Username:** `admin`
- **Password:** `password`

**6.5** After login you will be redirected to a setup page. Scroll to the bottom and click the **Create / Reset Database** button.

**6.6** The page reloads with a success message. Click **Login** and sign in again with the same credentials.

**6.7** Confirm the security level: In the left sidebar click **DVWA Security**. It should show **Low**. If not, set it to Low and click Submit.

**6.8** Press `Ctrl+C` in the tunnel terminal to close it. The tunnel is only needed when you or a student want to browse DVWA.

---

## PHASE 7 — Run the Exploit Lab Setup Script

**7.1** In your local terminal, copy the setup script to the exploit lab instance:
```bash
scp -i ~/.ssh/scs275-lab.pem \
    exploit-lab/setup_exploit_lab.sh \
    ubuntu@<EXPLOIT-IP>:~/setup_exploit_lab.sh
```

**7.2** SSH into the exploit lab instance:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP>
```

**7.3** Run the setup script as root (takes **2–4 minutes**):
```bash
sudo bash setup_exploit_lab.sh
```

When it finishes you will see a banner confirming the target is running on port 4444.

**7.4** Type `exit` to return to your local terminal.

---

## PHASE 8 — Verify Both Servers Are Working

### Verify DVWA

**8.1** Open a terminal and start the admin SSH tunnel:
```bash
ssh -i ~/.ssh/scs275-lab.pem -L 8080:localhost:80 -N ubuntu@<DVWA-IP>
```

**8.2** In your browser go to `http://localhost:8080/` and confirm you can log in with `admin` / `password`. Press `Ctrl+C` in the terminal when done.

### Verify Exploit Lab

**8.3** Confirm the vulnerable server is listening on port 4444 (localhost only) and ASLR is disabled:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP> \
    "systemctl is-active vuln-server && \
     echo 'ASLR (0=disabled):' && cat /proc/sys/kernel/randomize_va_space && \
     echo 'Listening:' && ss -tlnp | grep 4444"
```

Expected output:
```
active
ASLR (0=disabled):
0
Listening:
LISTEN  0  5  127.0.0.1:4444  ...
```

Note: `127.0.0.1:4444` (loopback only) is correct — the server is intentionally not bound to `0.0.0.0` since students reach it from within their SSH session.

**8.4** Connect to the exploit target from within an SSH session:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP>
# Now you are inside the instance:
nc localhost 4444
```
You should immediately see `echo> `. Type anything and press Enter — it echoes back. Press `Ctrl+C`, then `exit`.

**8.5** Confirm the binary's security profile:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP> \
    "checksec --file=/home/student/vuln_server"
```

Expected: `Stack: No canary found`, `NX: NX disabled`, `PIE: No PIE`.

---

## PHASE 9 — Create Individual Student Accounts

Each student gets their own named Linux account on **both** servers. The helper
script `create_student_accounts.sh` automates this. You will run it twice —
once on each instance.

### Step 9.1 — Prepare your student roster file

On your local machine, create a plain-text file called `students.txt` with one
username per line. Usernames must be lowercase letters and numbers only (no
spaces). Good practice is to use `firstlast` or `first_last` format:

```
jsmith
adoe
mgarcia
lwang
pnguyen
```

Save the file in the `scs275-lab-setup/` directory alongside the scripts.

### Step 9.2 — Copy the roster and account script to both instances

```bash
# DVWA instance
scp -i ~/.ssh/scs275-lab.pem \
    students.txt \
    create_student_accounts.sh \
    ubuntu@<DVWA-IP>:~/

# Exploit lab instance
scp -i ~/.ssh/scs275-lab.pem \
    students.txt \
    create_student_accounts.sh \
    ubuntu@<EXPLOIT-IP>:~/
```

### Step 9.3 — Run the account creation script on the DVWA instance

```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<DVWA-IP>
sudo bash create_student_accounts.sh students.txt
exit
```

The script will:
- Create a Linux account for each username in `students.txt`
- Generate a unique ed25519 SSH key pair for each student
- Print a summary table of every username and their private key

**Copy the entire output** before you close the terminal — it contains each
student's private key, which you will distribute to them individually.
The keys are also saved to `/root/student-keys/` on the instance for reference.

### Step 9.4 — Run the account creation script on the Exploit Lab instance

```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP>
sudo bash create_student_accounts.sh students.txt
exit
```

Same process — copy the output. Students need a key for each server.

### Step 9.5 — Distribute keys to students

For each student, send them (via your LMS, email, or lab handout):
1. Their **DVWA private key** (the text block starting with `-----BEGIN OPENSSH PRIVATE KEY-----`)
2. Their **Exploit Lab private key** (a separate key)
3. The connection instructions below

**What to tell students — save this as a handout:**

---

#### Student Connection Instructions

**Setting up your SSH key**

Save the private key file your instructor gave you. Then in your terminal:

```bash
# Mac / Linux
mkdir -p ~/.ssh
# Paste your key into a file — use the filename your instructor specified,
# e.g. scs275-dvwa.pem or scs275-exploit.pem
chmod 400 ~/.ssh/scs275-dvwa.pem
chmod 400 ~/.ssh/scs275-exploit.pem
```

On Windows (PowerShell):
```powershell
icacls "$env:USERPROFILE\.ssh\scs275-dvwa.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

---

**Connecting to DVWA (web application lab)**

DVWA is accessed through your browser, but you first need to open an SSH
tunnel to reach it. Open a terminal and run:

```bash
ssh -i ~/.ssh/scs275-dvwa.pem \
    -L 8080:localhost:80 \
    -N \
    <YOUR-USERNAME>@<DVWA-IP>
```

Leave this terminal open (it will appear to hang — that is normal).
Open your browser and go to: **http://localhost:8080/**

Log in with: **admin** / **password**

To stop: press `Ctrl+C` in the terminal.

---

**Connecting to the Exploit Lab**

SSH into the exploit server using your key:

```bash
ssh -i ~/.ssh/scs275-exploit.pem <YOUR-USERNAME>@<EXPLOIT-IP>
```

Once logged in, connect to the vulnerable target:
```bash
nc localhost 4444
```

You should see `echo> ` — this is the vulnerable server. Press `Ctrl+C` to
disconnect from it. Your gdb, pwntools scripts, and exploit development all
run from within this SSH session.

---

---

## PHASE 10 — Assign Elastic IPs (Recommended for Multi-Week Courses)

By default, an EC2 instance gets a **new public IP every time it is started**. If you stop and restart instances between lab sessions, the IP changes and any links or instructions you gave students break. Elastic IPs are static IPs that stay the same.

**10.1** In the EC2 left sidebar under **Network & Security**, click **Elastic IPs**.

**10.2** Click **Allocate Elastic IP address** → leave defaults → click **Allocate**.

**10.3** Select the newly allocated IP, click **Actions** → **Associate Elastic IP address**.
- **Resource type:** Instance
- **Instance:** select `scs275-dvwa`
- Click **Associate**

**10.4** Repeat steps 10.2–10.3 for the exploit lab instance.

**10.5** From now on, use the Elastic IP addresses (shown in the Elastic IPs list) rather than the auto-assigned public IPs. These will not change across stop/start cycles.

> **Cost note:** Elastic IPs are free while associated with a running instance. They cost ~$0.005/hour if the instance is stopped. Release them when the course ends.

---

## PHASE 11 — Stopping and Starting Instances Between Sessions

**IMPORTANT:** Stop instances when the lab is not in use to avoid unnecessary charges. Stopping preserves the disk and all configuration — it is not the same as terminating.

### Stop both instances (run before you leave for the day)

```bash
# Get your instance IDs first (one-time lookup)
aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=scs275-dvwa,scs275-exploit-lab" \
    --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value|[0],InstanceId]' \
    --output table
```

Then stop them (replace IDs with your actual values):
```bash
aws ec2 stop-instances \
    --instance-ids i-0xxxxxxxxxxxxxxxxx i-0yyyyyyyyyyyyyyyyy
```

Or do it in the console: EC2 → Instances → check both → Instance state → Stop instance.

### Start both instances (run before a lab session)

```bash
aws ec2 start-instances \
    --instance-ids i-0xxxxxxxxxxxxxxxxx i-0yyyyyyyyyyyyyyyyy
```

Or in the console: EC2 → Instances → check both → Instance state → Start instance.

Wait ~60 seconds after starting for the instances to pass health checks before directing students to them.

---

## Troubleshooting

### "Connection refused" or "Permission denied" when SSHing

- The instance may not have finished booting — wait 60 seconds and try again.
- `Permission denied (publickey)` means the wrong key is being used, or the
  key file permissions are too open. Confirm `chmod 400` on the `.pem` file.
- If a student's key stops working, re-run `create_student_accounts.sh` with
  just their username in a single-line `students.txt` — it will regenerate
  their key without touching other accounts.

### DVWA page shows a database connection error

The MariaDB container may still be starting. Wait 30 seconds and refresh.
If it persists, check the logs from inside an SSH session:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<DVWA-IP>
docker-compose -f /opt/dvwa/docker-compose.yml logs --tail=50
```

### Student's SSH tunnel connects but browser shows "connection refused"

- The tunnel opened successfully but DVWA may still be starting — wait
  30 seconds and refresh the browser.
- Confirm the tunnel is forwarding the right port:
  `ssh ... -L 8080:localhost:80 ...` (local 8080 → remote 80).
- Confirm DVWA is running on the instance:
  `ssh -i ~/.ssh/scs275-lab.pem ubuntu@<DVWA-IP> "docker ps"`

### Student cannot reach port 4444

- Port 4444 is only accessible from localhost (inside the SSH session).
  The student must run `nc localhost 4444` from within their SSH session,
  not from their local machine.
- Confirm the service is running: `systemctl status vuln-server`

### The setup script fails mid-way

The scripts use `set -e` so they stop at the first error. Re-read the last few lines of output before the error message. Common causes:
- **No internet connectivity from the instance:** Check that the instance is in a public subnet with an internet gateway attached to its VPC (the default VPC is set up correctly out of the box).
- **Package not found:** Run `sudo apt-get update -y` manually first, then re-run the script.

---

## End-of-Course Cleanup

When the course is over, **terminate** the instances and release the Elastic IPs to stop all charges.

**Terminate instances:**
EC2 → Instances → select both → Instance state → Terminate instance

**Release Elastic IPs:**
EC2 → Elastic IPs → select both → Actions → Release Elastic IP addresses

---

## Quick Reference Checklist

Use this to confirm everything is ready before each lab session.

### One-Time Setup
- [ ] Key pair `scs275-lab.pem` created, moved to `~/.ssh/`, `chmod 400`'d
- [ ] Security group `scs275-dvwa-sg` created — **port 22 only**, source `0.0.0.0/0`
- [ ] Security group `scs275-exploit-sg` created — **port 22 only**, source `0.0.0.0/0`
- [ ] DVWA instance launched: Ubuntu 22.04, t3.small, 20 GB, `scs275-dvwa-sg`
- [ ] Exploit lab instance launched: Ubuntu 22.04, t3.micro, 15 GB, `scs275-exploit-sg`
- [ ] `setup_dvwa.sh` ran to completion (success banner shown)
- [ ] DVWA database initialised via SSH tunnel + browser ("Create / Reset Database" clicked)
- [ ] DVWA security level confirmed as **Low**
- [ ] `setup_exploit_lab.sh` ran to completion (success banner shown)
- [ ] ASLR confirmed disabled: `cat /proc/sys/kernel/randomize_va_space` returns `0`
- [ ] Exploit server responds: SSH in → `nc localhost 4444` → `echo> ` prompt seen
- [ ] `students.txt` roster file prepared
- [ ] `create_student_accounts.sh` run on **both** instances
- [ ] Individual private keys distributed to each student
- [ ] Elastic IPs assigned (if multi-session course)

### Before Each Lab Session
- [ ] Both instances started and showing 2/2 health checks (wait ~60 seconds)
- [ ] Admin SSH tunnel confirms DVWA loads: `ssh -L 8080:localhost:80 -N ubuntu@<DVWA-IP>` then `http://localhost:8080/`
- [ ] Exploit server is active: `ssh ubuntu@<EXPLOIT-IP> "systemctl is-active vuln-server"`
- [ ] Students have their key files and the connection instructions handout

### After Each Lab Session
- [ ] Both instances stopped to avoid charges
