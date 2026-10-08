# Publishing to GitHub

The exact commands for this project, from a fresh Ubuntu terminal under Windows Subsystem for Linux (WSL). The account is `Normansrule`, pushing over SSH through the host alias `github-normansrule` (set up in `~/.ssh/config` with the key `~/.ssh/id_ed25519_normansrule`). Downloads land in the Windows Downloads folder, `/mnt/c/Users/aleks/Downloads/`.

The project is built one reviewed step at a time: each change arrives as a patch file, you look it over, and you push it yourself.

Three rules:

- **Never run `git init` or `git add` in your home folder.** On this machine `~` is already a Git repository. Always `cd` into the project folder first.
- **Push over SSH, not HTTPS.** The GitHub CLI token cannot push files in `.github/workflows/` (it lacks the `workflow` scope), and this project has five workflows.
- **Commit with your GitHub no-reply address**, so your personal email never appears in the public history (set once per repository, below).

## 1. Turn on the website (once)

The `Deploy to GitHub Pages` workflow cannot publish until Pages is switched on for the repository. Either:

- **In the browser**, signed in as Normansrule: open <https://github.com/Normansrule/anatomy-odyssey/settings/pages>, and under **Build and deployment → Source** choose **GitHub Actions**. Nothing else on that page needs changing.
- **Or in the terminal**, if the GitHub CLI is logged in as Normansrule (`gh auth status` shows it):

  ```bash
  gh api -X POST repos/Normansrule/anatomy-odyssey/pages -f build_type=workflow
  ```

  An error saying Pages already exists means it is on; that is fine.

The next push to `main` deploys the site. To deploy right away without a push, open **Actions → Deploy to GitHub Pages → Run workflow**, or run `gh workflow run pages.yml --repo Normansrule/anatomy-odyssey`. When the run is green, the app is live at <https://normansrule.github.io/anatomy-odyssey/>.

## 2. Apply a change and push it

Each step comes as a patch file (for example `anatomy-odyssey-v0.9.1.patch`) saved to your Windows Downloads folder.

```bash
cd ~/projects/anatomy-odyssey
git remote -v                         # should say git@github-normansrule:Normansrule/anatomy-odyssey.git
git status --short                    # should print nothing; commit or stash anything listed first
git switch main
git pull --ff-only                    # catch up with GitHub
git config user.name  "Aleksander Norman"
git config user.email "60046480+Normansrule@users.noreply.github.com"

ls -t /mnt/c/Users/aleks/Downloads/anatomy-odyssey-*.patch | head -3     # the newest patch first
git am /mnt/c/Users/aleks/Downloads/anatomy-odyssey-v0.9.1.patch
git show --stat HEAD                  # review what changed
git show HEAD -- README.md            # read any file's changes
```

Optional local check before pushing (needs Node.js 20 or newer):

```bash
npm ci
npm test
npm run dev                           # open the printed http://localhost:5173 link in your Windows browser; Ctrl+C to stop
```

Then push:

```bash
git push origin main
```

If you do not like the change, undo it before pushing with `git reset --hard HEAD~1`.

If `git am` stops with a conflict, nothing is half-applied permanently: run `git am --abort` to put the folder back as it was, and ask for a patch made against your current `main`.

## 3. Publish the desktop apps

A version tag builds Windows, macOS and Linux installers and publishes them as a GitHub release. The "Download the desktop app" links in the README and in the app's About dialog point at the latest release.

```bash
cd ~/projects/anatomy-odyssey
git switch main
git pull --ff-only
grep '"version"' package.json         # the tag must match this version
git tag v0.16.0
git push origin v0.16.0
```

The build takes about 15 to 25 minutes (Actions → Desktop app). When it is green, the installers are at <https://github.com/Normansrule/anatomy-odyssey/releases/latest>. They are not code-signed yet, so Windows and macOS warn on first launch; the release notes say how to open them.

## Check it with the screenshot and accessibility tools

These need Playwright. Ubuntu blocks `pip install` into the system Python, so use a small virtual environment:

```bash
cd ~/projects/anatomy-odyssey
python3 -m venv ~/.venvs/anatomy-odyssey
source ~/.venvs/anatomy-odyssey/bin/activate
pip install playwright pillow
python -m playwright install --with-deps chromium
npm run build
npx vite preview --port 4173 &
python tools/a11y-audit.py
python tools/screenshots.py --only skeletal
kill %1
```

## Troubleshooting

### The Pages deploy fails at "configure-pages" with "Get Pages site failed ... Not Found"

Pages is not switched on yet. Do step 1, then re-run the workflow.

### `fatal: Not possible to fast-forward` when pulling

Your folder's history and GitHub's have split. GitHub's `main` is the one to keep. Save your local state on a branch first, then line the folder up with GitHub:

```bash
cd ~/projects/anatomy-odyssey
git status --short                      # anything listed here is uncommitted; commit or copy it out first
git branch backup-before-sync           # your old local commits stay on this branch
git fetch origin
git reset --hard origin/main
git log --oneline -3                    # now matches GitHub
```

Delete the backup later with `git branch -D backup-before-sync` once you are sure you do not need it.

### No clone on this machine yet

```bash
mkdir -p ~/projects
cd ~/projects
git clone git@github-normansrule:Normansrule/anatomy-odyssey.git
cd anatomy-odyssey
```

### Check that each folder pushes to its own repository

Two project folders pointing at the same GitHub repository is how space content once ended up in this one. Check before pushing:

```bash
cd ~/projects/anatomy-odyssey && git remote -v      # should say Normansrule/anatomy-odyssey.git
cd ~/projects/cosmic-library  && git remote -v      # should say Normansrule/cosmic-library.git
```

Fix a wrong one with `git remote set-url origin git@github-normansrule:Normansrule/<repo>.git`.
