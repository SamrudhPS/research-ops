# Setup

---

## Prerequisites

| Requirement | Minimum version | Check |
|---|---|---|
| Node.js | 20.x | `node --version` |
| npm | 9.x | `npm --version` |
| Claude Code | latest | `claude --version` |
| Git | any | `git --version` |

You also need an Anthropic API key. Get one at [console.anthropic.com](https://console.anthropic.com).

---

## Windows

### 1. Install Node.js

Download the LTS installer from [nodejs.org](https://nodejs.org) and run it. Accept all defaults.

Verify:
```powershell
node --version   # v20.x.x or higher
npm --version    # 9.x.x or higher
```

### 2. Install Claude Code

```powershell
npm install -g @anthropic-ai/claude-code
```

Verify:
```powershell
claude --version
```

### 3. Clone and install Research-Ops

```powershell
git clone https://github.com/your-username/research-ops.git
cd research-ops
npm install
```

### 4. Set your API key

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

To persist across sessions, add it to your PowerShell profile:
```powershell
notepad $PROFILE
```
Add the line above, save, and restart your terminal.

### 5. Verify

```powershell
npm run doctor
```

### 6. First run

```powershell
node src/index.js onboard
```

---

## macOS

### 1. Install Node.js

Using Homebrew (recommended):
```bash
brew install node
```

Or download the installer from [nodejs.org](https://nodejs.org).

Verify:
```bash
node --version   # v20.x.x or higher
npm --version    # 9.x.x or higher
```

### 2. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Verify:
```bash
claude --version
```

### 3. Clone and install Research-Ops

```bash
git clone https://github.com/your-username/research-ops.git
cd research-ops
npm install
```

### 4. Set your API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

To persist across sessions:
```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc
```

If you use bash instead of zsh, replace `.zshrc` with `.bash_profile`.

### 5. Verify

```bash
npm run doctor
```

### 6. First run

```bash
node src/index.js onboard
```

---

## Linux

### 1. Install Node.js

Using nvm (recommended — avoids permission issues):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

Or using apt (Ubuntu/Debian):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify:
```bash
node --version   # v20.x.x or higher
npm --version    # 9.x.x or higher
```

### 2. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

If you get a permissions error with a system Node install:
```bash
npm install -g @anthropic-ai/claude-code --prefix ~/.local
export PATH="$HOME/.local/bin:$PATH"
```

Verify:
```bash
claude --version
```

### 3. Clone and install Research-Ops

```bash
git clone https://github.com/your-username/research-ops.git
cd research-ops
npm install
```

### 4. Set your API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

To persist across sessions:
```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

### 5. Verify

```bash
npm run doctor
```

### 6. First run

```bash
node src/index.js onboard
```

---

## Configure

After `onboard` completes, your `researcher.yml` is written to the project root. You can edit it directly at any time — it is plain YAML. See `config/researcher.example.yml` for a fully annotated reference.

The only fields that gate recommendations are:

```yaml
skills:
  level:        # beginner | intermediate | advanced
  programming:  # list of languages you use regularly
  tools:        # list of frameworks with hands-on experience
  math_comfort: # low | medium | high

constraints:
  hours_per_week:  # integer — be honest, not optimistic
  compute:         # laptop | university_cluster | cloud_credits
  dataset_access:  # none | kaggle | university_library | open_access_only

goals:
  north_star:  # conference_paper | thesis_chapter | survey | replication | learning
```

---

## Verify

Run this after setup and any time something stops working:

```
npm run doctor
```

Expected output when everything is ready:

```
Research-Ops — prerequisite check

  ✓  Node.js v20.11.0  (≥ 20 required)
  ✓  Claude Code installed (1.0.3)
  ✓  ANTHROPIC_API_KEY set  (sk-ant-...a4f2)
  ✓  researcher.yml found and valid
  ✓  data/ folder exists and is writable
  ✓  data/seen-papers.tsv found
  ✓  tracker.tsv found
  ✓  All 9 required packages installed
  ✓  Semantic Scholar API reachable

──────────────────────────────────────
9/9 checks passed
Research-Ops is ready. Run: node src/index.js onboard
```

---

## First Run

If this is your first time:
```bash
node src/index.js onboard
```

If `researcher.yml` already exists:
```bash
node src/index.js tracker
```

The tracker will tell you exactly where you are in the pipeline and what to run next.

---

Something broken? Run `npm run doctor`
