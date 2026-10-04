# Publishing to GitHub

These are the exact commands for putting the project on GitHub from a fresh Ubuntu terminal under Windows Subsystem for Linux (WSL), with the zip downloaded to the Windows Downloads folder. The account is `Normansrule`, pushing over SSH through the host alias `github-normansrule` (set up in `~/.ssh/config` with the key `~/.ssh/id_ed25519_normansrule`).

Two rules:

- **Never run `git init` or `git add` in your home folder.** On this machine `~` is already a Git repository. Always `cd` into the project folder first.
- **Push over SSH, not HTTPS.** The GitHub CLI token cannot push files in `.github/workflows/` (it lacks the `workflow` scope), and this project has five workflows.

## First time (the repo is not on GitHub yet)

### 1. Unzip into its own folder

```bash
cd ~
mkdir -p ~/projects
cd ~/projects
ls -t /mnt/c/Users/aleks/Downloads/anatomy-odyssey*.zip | head -1    # the newest download
unzip -q /mnt/c/Users/aleks/Downloads/anatomy-odyssey.zip -d ~/projects
cd ~/projects/anatomy-odyssey
ls                                                                  # README.md, package.json, src/, …
```

If `unzip` is missing: `sudo apt install -y unzip`. If the browser saved it as `anatomy-odyssey (1).zip`, use that name in the `unzip` line (quote it).

If `~/projects/anatomy-odyssey` already exists from an earlier version, use the update steps further down instead.

### 2. Make it a repository and commit

```bash
cd ~/projects/anatomy-odyssey
git config user.name  >/dev/null || git config --global user.name "Aleksander Norman"
git config user.email >/dev/null || git config --global user.email "aleksanderjnorman@gmail.com"
git init -b main
git add -A
git status --short | head                                           # sanity check: project files only
git commit -m "Anatomy Odyssey v0.5.0"
```

### 3. Create the empty repo on GitHub

In a browser signed in as **Normansrule**, open <https://github.com/new>:

- Repository name: `anatomy-odyssey`
- Public
- Leave **Add a README**, **.gitignore** and **license** all off (the project already has them)

Or, only if the GitHub CLI is logged in as Normansrule (`gh auth status` shows it):

```bash
gh repo create Normansrule/anatomy-odyssey --public --description "A guided journey through the human body, from whole body to molecule"
```

### 4. Push

```bash
cd ~/projects/anatomy-odyssey
git remote add origin git@github-normansrule:Normansrule/anatomy-odyssey.git
ssh -T git@github-normansrule                                        # should greet you as Normansrule
git push -u origin main
```

If `git remote add` says the remote already exists (for example after `gh repo create`), point it at the SSH alias instead:

```bash
git remote set-url origin git@github-normansrule:Normansrule/anatomy-odyssey.git
git push -u origin main
```

### 5. Turn on the website

On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The push already started the `Deploy to GitHub Pages` workflow; once it is green (Actions tab), the app is live at `https://normansrule.github.io/anatomy-odyssey/`. If the first run finished before Pages was turned on, re-run it from the Actions tab.

### 6. Optional: desktop installers

A version tag builds Windows, macOS and Linux installers into a draft release (Releases page):

```bash
cd ~/projects/anatomy-odyssey
git tag v0.5.0
git push origin v0.5.0
```

## Updating an existing repo with a newer zip

The zip has no Git history in it, so copy the new files over your existing clone and commit the difference. `rsync --delete` also removes files the new version dropped, while keeping your `.git` folder.

```bash
cd ~/projects
rm -rf /tmp/anatomy-odyssey-new
mkdir -p /tmp/anatomy-odyssey-new
unzip -q /mnt/c/Users/aleks/Downloads/anatomy-odyssey.zip -d /tmp/anatomy-odyssey-new
rsync -a --delete --exclude .git --exclude node_modules --exclude dist --exclude dist-preview --exclude src-tauri/target \
  /tmp/anatomy-odyssey-new/anatomy-odyssey/ ~/projects/anatomy-odyssey/
cd ~/projects/anatomy-odyssey
git status --short
git add -A
git commit -m "Anatomy Odyssey v0.5.0"
git push
```

If the repo is on GitHub but there is no clone on this machine yet, clone it first, then run the block above:

```bash
mkdir -p ~/projects
cd ~/projects
git clone git@github-normansrule:Normansrule/anatomy-odyssey.git
```

## Optional: check it locally before pushing

Needs Node.js 20 or newer (`node --version`).

```bash
cd ~/projects/anatomy-odyssey
npm ci
npm test               # 250 unit tests
npm run dev            # open the printed http://localhost:5173 link in your Windows browser
```

The screenshot and accessibility checks also need Playwright. Ubuntu blocks `pip install` into the system Python, so use a small virtual environment:

```bash
cd ~/projects/anatomy-odyssey
python3 -m venv ~/.venvs/anatomy-odyssey
source ~/.venvs/anatomy-odyssey/bin/activate
pip install playwright pillow
python -m playwright install --with-deps chromium
npm run build
npx vite preview --port 4173 &
python tools/a11y-audit.py
python tools/screenshots.py --only chemistry
kill %1
```
