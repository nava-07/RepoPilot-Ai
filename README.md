# RepoPilot AI

> **Understand the code. Find the problem. Verify the fix.**

An open-source, repository-aware AI coding agent built for developers and maintainers. RepoPilot AI connects local open-weight AI inference with real repository intelligence, evidence-backed bug investigations, minimal unified diff patch generation, and isolated automated test verification.

---

## Key Features

- **Local-First & Private:** Default integration with local Ollama inference. No cloud subscriptions or API keys required.
- **Repository Explorer:** Safe filesystem tree traversal respecting `.gitignore`, excluding binaries, dependencies (`node_modules`, `venv`), and masking sensitive credentials.
- **Evidence-to-Patch Engine:** Findings are tied to exact code lines and snippets. Proposed fixes generate unified diffs ready for review.
- **Isolated Test Verification:** Runs regression tests (`pytest`, `npm test`) inside temporary workspace copies. Never mutates your primary code files without explicit approval.
- **Open-Source Agent Skill:** Ships with `backend/skills/repo-debugger/SKILL.md` following the Agent Skills Open Standard.
- **Clean Developer Interface:** High-density, dark-themed UI built with React, Vite, and Tailwind CSS.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   React + Vite Frontend                │
│ (Overview, Repositories, Investigations, Patches, Tests)│
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / JSON
┌──────────────────────────▼─────────────────────────────┐
│                   FastAPI Backend                      │
├────────────────────┬───────────────────┬───────────────┤
│ RepoService        │ AnalysisService   │ PatchService  │
│ (Tree, Inspection) │ (AST, Discovery)  │ (Diff, Hash)  │
├────────────────────┴───────────────────┴───────────────┤
│ TestService (Isolated Workspace Execution)             │
│ Database (SQLite WAL Persistence)                      │
└──────────────┬─────────────────────────┬───────────────┘
               │                         │
     ┌─────────▼─────────┐      ┌────────▼────────┐
     │   Local Ollama    │      │ User Repository │
     │  (Open-Weight AI) │      │  or Git Clones  │
     └───────────────────┘      └─────────────────┘
```

---

## Quick Start: How to Run

### Method 1: One-Click Run (Windows)
Double-click `run.bat` or run:
```powershell
.\run.ps1
```
This automatically spins up both the FastAPI backend and the Vite frontend.

### Method 2: Manual Terminal Execution

#### 1. Start the Backend
```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be live at: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

#### 2. Start the Frontend
```bash
cd frontend
npm run dev
```
Open your browser at: [http://127.0.0.1:5173](http://127.0.0.1:5173)

---

## How to Connect Ollama Locally

RepoPilot AI is designed to use **Ollama** for local, offline open-weight coding models.

### Step 1: Install Ollama
Download and install Ollama from [https://ollama.com](https://ollama.com).

### Step 2: Start the Ollama Service
In your terminal or command prompt, start Ollama:
```bash
ollama serve
```
*(On Windows, opening the Ollama application from the Start Menu starts the server automatically).*

### Step 3: Pull a Coding Model
Choose an open-weight coding model suitable for your hardware. Recommended models:

```bash
# Recommended general coding model (approx. 4.7 GB):
ollama pull qwen2.5-coder:7b

# Lightweight alternative for lower RAM (approx. 2.0 GB):
ollama pull llama3.2:3b

# DeepSeek Coder:
ollama pull deepseek-coder:6.7b
```

### Step 4: Select the Model in RepoPilot
1. Open RepoPilot in your browser at [http://127.0.0.1:5173](http://127.0.0.1:5173).
2. Go to **Settings** in the left sidebar.
3. You will see **Connected: yes (Ollama x.x.x)** and a list of installed models.
4. Click **Select** next to your pulled model (e.g. `qwen2.5-coder:7b`).
5. RepoPilot AI is now active and powered by your local model!

---

## Reproducible Demo: Discount Calculator Bug

RepoPilot comes with an included fixture repository at `fixtures/discount-calculator`:

1. In RepoPilot, navigate to **Repositories**.
2. Select **Local folder** and enter the absolute path to `fixtures/discount-calculator`:
   ```
   D:\Project\repopilot-ai-frontend-final\repopilot-ai\fixtures\discount-calculator
   ```
3. Click **Import**. Browse the file tree to see `calculator.py` and `test_calculator.py`.
4. Click **New Investigation** and enter:
   > *"calculate_discount raises a ValueError when quantity is 0 instead of returning a 0 discount."*
5. Review the evidence finding pointing to line 18 in `calculator.py`.
6. Click **Propose Patch** to generate the minimal diff fixing the boundary condition.
7. Click **Run tests (isolated)** to verify that `pytest` passes in the sandbox copy.
8. Click **Approve** to accept the verified patch!

---

## Security Policy

- **Loopback-Only Binding:** Backend binds strictly to `127.0.0.1` by default.
- **Path Traversal Protection:** All relative paths are sanitized against boundary escape.
- **Sensitive File Masking:** `.env`, private keys, and certificates are never read or sent to models.
- **Isolated Testing:** Tests execute only in temporary ephemeral workspaces.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
