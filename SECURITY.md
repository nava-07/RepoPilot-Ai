# Security Policy

RepoPilot AI is designed with repository containment and secure agent execution at its core.

## Isolation and Containment Safeguards

1. **Loopback Binding by Default:** The FastAPI backend binds exclusively to `127.0.0.1`. It does not expose local filesystem trees or the local Ollama daemon to the public internet.
2. **Authorized Roots Enforcement:** When `REPOPILOT_AUTHORIZED_ROOTS` is set, repository imports and file reads outside these whitelisted roots are rejected with HTTP 403.
3. **Path Traversal Protection:** All relative file path requests are normalized and validated to prevent directory traversal (`..`) outside repository boundaries.
4. **Secret Filtering:** Sensitive files (`.env*`, `*.pem`, `*.key`, `id_rsa`, `credentials.json`) are automatically masked and blocked from being read or sent to AI models.
5. **Ephemerality of Test Workspace:** Test executions are conducted inside isolated temporary directories. Changes are never committed to your primary repository source files without explicit manual approval.
6. **No Arbitrary Command Injection:** Test runners are auto-detected based on repository manifests (e.g. `pytest`, `npm test`) rather than taking arbitrary unvalidated shell commands from API requests.

## Reporting Security Issues

If you discover a potential vulnerability within RepoPilot AI, please open a confidential security advisory on GitHub or email the maintainers directly. Do not file public issues for active vulnerabilities.
