# SCS275 Lab — AWS Deployment Guide

Complete step-by-step instructions for deploying the DVWA server and Exploit Lab
on fresh Ubuntu 22.04 EC2 instances. Follow every step in order.

---

## What You Will End Up With

| Server | Purpose | Port |
|--------|---------|------|
| `scs275-dvwa` | DVWA web application target | 80 (HTTP) |
| `scs275-exploit-lab` | Buffer overflow exploit target | 4444 (TCP) + 22 (SSH) |

Estimated total time: **30–45 minutes**
Estimated AWS cost while running: **~$0.03/hour** for both instances combined

---

## Before You Start — What You Need

1. An AWS account with permission to create EC2 instances, security groups, and key pairs.
2. Your campus or VPN IP address/range (you will restrict access to this). To find your current IP, search "what is my IP" in any browser.
3. A terminal application:
   - Mac/Linux: Terminal (built in)
   - Windows: PowerShell, Windows Terminal, or Git Bash
4. The two setup scripts from this repository (`setup_dvwa.sh` and `setup_exploit_lab.sh`) on your local machine.

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
- **Description:** `DVWA lab server — HTTP for students, SSH for admin`
- **VPC:** Leave as default (the pre-selected default VPC is fine)

**2.4** Under **Inbound rules**, click **Add rule** and add the following two rules:

**Rule 1 — SSH for your admin access:**
- **Type:** SSH
- **Protocol:** TCP (auto-filled)
- **Port range:** 22 (auto-filled)
- **Source:** Custom → type your IP address followed by `/32`
  (example: if your IP is `203.0.113.50`, enter `203.0.113.50/32`)
- **Description:** Admin SSH

**Rule 2 — HTTP for students:**
- Click **Add rule** again
- **Type:** HTTP
- **Protocol:** TCP (auto-filled)
- **Port range:** 80 (auto-filled)
- **Source:** Custom → enter your campus/student IP range in CIDR notation
  (example: `203.0.113.0/24` covers addresses `.0` through `.255`)
  If you are unsure of the range, ask your network administrator.
  As a last resort you can use `0.0.0.0/0` (open to everyone) but be aware
  DVWA is intentionally vulnerable and should not be public-facing long-term.
- **Description:** Student HTTP access

**2.5** Leave **Outbound rules** at the default (allow all outbound).

**2.6** Click **Create security group**.

---

### Security Group B — Exploit Lab Server

**2.7** Click **Create security group** again.

**2.8** Fill in the **Basic details** section:
- **Security group name:** `scs275-exploit-sg`
- **Description:** `Exploit lab server — port 4444 for students, SSH for admin`
- **VPC:** Leave as default

**2.9** Under **Inbound rules**, click **Add rule** and add these two rules:

**Rule 1 — SSH for your admin access:**
- **Type:** SSH
- **Protocol:** TCP (auto-filled)
- **Port range:** 22 (auto-filled)
- **Source:** Custom → `<your-ip>/32`
- **Description:** Admin SSH

**Rule 2 — Exploit target port for students:**
- Click **Add rule**
- **Type:** Custom TCP
- **Protocol:** TCP (auto-filled)
- **Port range:** 4444
- **Source:** Custom → student IP range (same CIDR as above)
- **Description:** Student exploit lab access

**2.10** Click **Create security group**.

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

DVWA requires a one-time database setup step before it will work.

**6.1** Open a web browser and go to: `http://<DVWA-IP>/`

You should see the DVWA login page. If you see a blank page or connection error, wait 30 seconds and refresh — Docker containers can take a moment to fully start after the script completes.

**6.2** Log in with:
- **Username:** `admin`
- **Password:** `password`

**6.3** After login you will be redirected to a setup page. Scroll to the bottom and click the **Create / Reset Database** button.

**6.4** The page will reload and show a success message. DVWA is now fully operational. Click **Login** and sign in again with the same credentials.

**6.5** Confirm the security level: In the left sidebar click **DVWA Security**. The level should already be set to **Low**. If it is not, change it to Low and click Submit.

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

**8.1** In your browser, navigate to `http://<DVWA-IP>/` and confirm you can log in.

**8.2** In your terminal, run a quick HTTP check:
```bash
curl -s -o /dev/null -w "HTTP status: %{http_code}\n" http://<DVWA-IP>/
```
You should see `HTTP status: 302` or `200`. Anything in the 200–302 range is good.

### Verify Exploit Lab

**8.3** Confirm the vulnerable server is listening and ASLR is disabled:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP> \
    "systemctl is-active vuln-server && \
     echo 'ASLR value (0=disabled):' && cat /proc/sys/kernel/randomize_va_space && \
     echo 'Listening:' && ss -tlnp | grep 4444"
```

Expected output:
```
active
ASLR value (0=disabled):
0
Listening:
LISTEN  0  5  0.0.0.0:4444  ...
```

**8.4** Connect to the exploit target to confirm it responds:
```bash
nc <EXPLOIT-IP> 4444
```
You should immediately see `echo> `. Type anything and press Enter — it echoes it back. Press `Ctrl+C` to disconnect.

**8.5** Confirm the binary's security profile from your local machine:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP> \
    "checksec --file=/home/student/vuln_server"
```

Expected output shows:
- `Stack: No canary found`
- `NX: NX disabled` (executable stack)
- `PIE: No PIE`

---

## PHASE 9 — Give Students Access

### DVWA Students

Share the following with your class — no SSH access is needed:
```
URL:      http://<DVWA-IP>/
Username: admin
Password: password
```

### Exploit Lab Students

Students need SSH access as the `student` user. The two options below go from simplest to most secure.

---

**Option A — Shared password (simplest, fine for a single lab session)**

SSH into the exploit lab as ubuntu/admin:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP>
```

Set a password for the student account:
```bash
sudo passwd student
# Enter a lab password twice when prompted
```

Enable password authentication in SSH:
```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' \
    /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Type `exit`. Students now connect with:
```bash
ssh student@<EXPLOIT-IP>
# Enter the lab password you set
```

---

**Option B — Individual SSH keys (more secure, better for multi-week courses)**

For each student, they generate a key pair on their own machine:
```bash
ssh-keygen -t ed25519 -C "student-name" -f ~/.ssh/scs275-student
```
They send you the contents of `~/.ssh/scs275-student.pub` (the public key — sharing this is safe).

You add each key to the instance:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<EXPLOIT-IP>

sudo -u student mkdir -p /home/student/.ssh
sudo chmod 700 /home/student/.ssh
sudo -u student bash -c 'echo "PASTE-STUDENT-PUBLIC-KEY-HERE" \
    >> /home/student/.ssh/authorized_keys'
sudo chmod 600 /home/student/.ssh/authorized_keys
```

The student connects with:
```bash
ssh -i ~/.ssh/scs275-student student@<EXPLOIT-IP>
```

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

### "Connection refused" when SSHing

- The instance may not have finished booting — wait 60 seconds and try again.
- Check that your IP matches the one in the security group inbound rule. Your IP may have changed if you are on a dynamic connection. Update the rule if needed: EC2 → Security Groups → `scs275-dvwa-sg` → Inbound rules → Edit.

### DVWA page shows a database connection error

The MariaDB container may still be starting. Wait 30 seconds and refresh. If it persists, SSH into the instance and check logs:
```bash
ssh -i ~/.ssh/scs275-lab.pem ubuntu@<DVWA-IP>
docker-compose -f /opt/dvwa/docker-compose.yml logs --tail=50
```

### Port 4444 times out from student machines

- Confirm the security group inbound rule for port 4444 covers the student IP range.
- Confirm the service is running: `systemctl status vuln-server`
- Confirm the firewall on the instance itself is not blocking it: `sudo ufw status` (should be inactive or show 4444 allowed).

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
- [ ] Key pair `scs275-lab.pem` created and saved with `chmod 400`
- [ ] Security group `scs275-dvwa-sg` created (ports 22, 80)
- [ ] Security group `scs275-exploit-sg` created (ports 22, 4444)
- [ ] DVWA instance launched: Ubuntu 22.04, t3.small, 20 GB, correct security group
- [ ] Exploit lab instance launched: Ubuntu 22.04, t3.micro, 15 GB, correct security group
- [ ] `setup_dvwa.sh` ran successfully and showed success banner
- [ ] DVWA database initialised (clicked "Create / Reset Database" in browser)
- [ ] DVWA security level confirmed as **Low**
- [ ] `setup_exploit_lab.sh` ran successfully and showed success banner
- [ ] ASLR confirmed disabled: `cat /proc/sys/kernel/randomize_va_space` returns `0`
- [ ] Port 4444 responds to `nc <EXPLOIT-IP> 4444` with `echo> ` prompt
- [ ] Elastic IPs assigned (if multi-session course)
- [ ] Student access configured (password or SSH keys)

### Before Each Lab Session
- [ ] Both instances started and showing 2/2 health checks
- [ ] DVWA loads in browser: `http://<DVWA-IP>/`
- [ ] Port 4444 responds: `nc <EXPLOIT-IP> 4444`
- [ ] Student connection details distributed

### After Each Lab Session
- [ ] Both instances stopped to avoid charges
