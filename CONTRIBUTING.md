# Contributing to RepoPilot AI

Thank you for your interest in contributing to RepoPilot AI! We welcome contributions to make repository-aware coding agents safer, faster, and more capable.

## Development Workflow

### Prerequisites
- Python 3.11+
- Node.js 18+
- Git
- Ollama (optional, for local AI model inference)

### Setup Backend
```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

### Setup Frontend
```bash
cd frontend
npm install
npm run dev
```

### Running Tests
```bash
pytest backend/tests
```

### Contribution Guidelines
- Never hardcode fake analysis results or simulated AI responses.
- Keep agent loop transitions bounded to prevent infinite execution cycles.
- Preserve explicit user approval steps before applying patches to source repositories.
- Follow the Agent Skills Open Standard for any additions to `backend/skills/`.
