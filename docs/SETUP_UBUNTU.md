# From a blank Ubuntu terminal to a live site

These steps take you from a fresh Ubuntu machine (22.04, 24.04 or newer; native or Windows Subsystem for Linux 2 (WSL2)) to Cosmic Codex running locally and published on GitHub Pages. Copy each block into the terminal in order.

## 1 · Install the tools

```bash
sudo apt update
sudo apt install -y git curl unzip python3 python3-venv python3-pip build-essential nodejs npm
```

GitHub's command-line tool `gh` (optional, but it makes steps 4–5 one-liners):

```bash
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
sudo apt update && sudo apt install -y gh
```

## 2 · Tell git who you are, and connect to GitHub over SSH

```bash
git config --global user.name  "Aleksander Norman"
git config --global user.email "you@example.com"      # the email on your GitHub account
git config --global init.defaultBranch main

ssh-keygen -t ed25519 -C "cosmic-codex" -f ~/.ssh/id_ed25519 -N ""   # skip if you already have a key
gh auth login --git-protocol ssh --web                               # choose GitHub.com; uploads the key
ssh -T git@github.com                                                # should greet you by username
```

> **Several GitHub accounts on one machine?** Give the second account its own key and an SSH host alias in `~/.ssh/config`, for example `Host github-normansrule` → `HostName github.com`, `IdentityFile ~/.ssh/id_ed25519_normansrule`, and use `git@github-normansrule:Normansrule/cosmic-codex.git` as the remote in step 4.

## 3 · Get the code

**Either** clone the published repository:

```bash
mkdir -p ~/projects && cd ~/projects
git clone git@github.com:Normansrule/cosmic-codex.git
cd cosmic-codex
```

**or**, if you have the release zip (on WSL2 the Windows Downloads folder is `/mnt/c/Users/<you>/Downloads`):

```bash
mkdir -p ~/projects && cd ~/projects
unzip /mnt/c/Users/<you>/Downloads/cosmic-codex.zip
cd cosmic-codex
```

> Create the project in its own folder. If your home directory is itself a git repository, never run `git init` or `git add .` directly in `~`.

## 4 · Install, test and preview locally

```bash
bash scripts/setup_ubuntu.sh              # add --all for OpenSCAD, KiCad and Playwright
python3 -m http.server 8000 --directory site
```

Open **http://localhost:8000** (on WSL2 the Windows browser reaches it directly). Stop the server with `Ctrl+C`.

## 5 · Publish to GitHub (first time only; skip if you cloned)

```bash
git init
git add .
git commit -m "Cosmic Codex: an open atlas of space and spaceflight"

gh repo create Normansrule/cosmic-codex --public \
  --description "An open atlas of space & spaceflight: 3D simulations, equations, documents and hands-on builds" \
  --homepage "https://normansrule.github.io/cosmic-codex/"
git remote add origin git@github.com:Normansrule/cosmic-codex.git   # or your SSH alias
git push -u origin main
```

Workflow files in `.github/workflows/` must be pushed over SSH, or with a token that has the `workflow` scope.

## 6 · Switch on GitHub Pages (deployed by GitHub Actions)

```bash
gh api -X POST repos/Normansrule/cosmic-codex/pages -f build_type=workflow \
  || gh api -X PUT repos/Normansrule/cosmic-codex/pages -f build_type=workflow
gh workflow run pages.yml
gh run watch                                     # wait for the green tick
```

Or in the browser: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The site goes live at **https://normansrule.github.io/cosmic-codex/**. Every later push that changes `site/` redeploys it automatically, and every push runs the test workflow.

## 7 · Day-to-day

```bash
cd ~/projects/cosmic-codex
source .venv/bin/activate
python simulations/run.py blackhole --gif        # render into outputs/
python scripts/fetch_gallery.py                  # optional: offline copy of gallery images
git add -A && git commit -m "Describe the change" && git push
```

## Optional extras

| Want to… | Command |
|---|---|
| Rebuild all printable parts from OpenSCAD | `python experiments/tools/build_cad.py && python experiments/tools/build_advanced_cad.py` |
| Open the flight-computer PCB | `kicad experiments/30-flight-computer-pcb/hardware/kicad/cc-flight-logger.kicad_pro` |
| Screenshot any page headlessly | `python scripts/shot.py launch.html /tmp/launch.png --wait 5000` |
| Run the firmware host tests | `make -C experiments/30-flight-computer-pcb/firmware/test` |
| Regenerate `docs/EQUATIONS.md` | `node scripts/build_equations_md.mjs` |
| Regenerate the README simulation images | `python simulations/run.py showcase` |
