---
name: repo-debugger
description: Autonomous repository debugging agent skill for inspecting codebases, isolating bugs with evidence, generating minimal patches, and verifying fixes with automated tests.
version: 1.0.0
author: RepoPilot AI Maintainers
license: MIT
tools:
  - git
  - pytest
  - file_reader
  - patch_validator
tags:
  - code-repair
  - debugging
  - automated-testing
  - repository-intelligence
---

# Repo-Debugger Agent Skill

A standardized, tool-assisted skill for autonomous coding agents to safely investigate bugs in unfamiliar codebases, substantiate hypotheses with evidence, propose minimal unified diffs, and verify changes using isolated test execution.

## Core Principles

1. **Evidence Before Action:** Never hypothesize a bug without reading the relevant source file and locating the exact line range.
2. **Minimal Changes:** Generate the smallest possible unified diff that resolves the issue. Avoid refactoring unrelated code or reformatting styles.
3. **Never Trust Assumptions:** An unverified patch is merely a suggestion. A fix is only confirmed when regression tests pass in an isolated copy.
4. **Safety & Containment:** Do not alter the user's primary source files until explicit approval is granted.

---

## 9-Step Execution Workflow

```
[1. Discover] -> [2. Identify] -> [3. Collect Evidence] -> [4. Distinguish] -> [5. Propose Patch]
                      |
                      v
[6. Validate Patch] -> [7. Request Tests] -> [8. Interpret] -> [9. Honest Report]
```

### 1. Discover Repository Structure
- Inspect the file tree, package manifests (`package.json`, `pyproject.toml`, `requirements.txt`), and test directories (`tests/`, `__tests__/`).
- Detect languages, entrypoints, and configurations.

### 2. Identify Relevant Files
- Extract keywords, class names, function identifiers, and stack trace terms from the user report.
- Rank source files by relevance score.
- Never feed the entire repository into the model context; select only the top 3-5 relevant files.

### 3. Collect Concrete Evidence
- Read the relevant source sections with line numbers.
- Confirm whether the line reference exists in the current file on disk.
- Record the exact snippet as verifiable evidence.

### 4. Distinguish Confirmed Issues from Hypotheses
- Categorize findings into:
  - **Confirmed:** Supported by reproducing test failure or static syntax/type error.
  - **Hypothesis:** Plausible logic flaw or edge case needing test confirmation.
- State uncertainty explicitly if line numbers or behavior cannot be proven.

### 5. Generate Minimal Unified Diff
- Produce a standard unified diff header:
  ```diff
  --- a/src/calculator.py
  +++ b/src/calculator.py
  @@ -24,3 +24,3 @@
  -    return total * (1 - discount) if quantity > 0 else 0
  +    return total * (1 - discount) if quantity >= 0 else 0
  ```
- Keep context lines intact (`@@ -start,len +start,len @@`).

### 6. Validate the Patch
- Verify that the patch applies cleanly to the original file SHA256 hash.
- Reject patches with missing hunks, invalid paths, or out-of-boundary traversal.

### 7. Execute Permitted Tests in Isolated Workspace
- Copy repository files to an ephemeral sandbox directory.
- Apply the patch to the copy.
- Execute the test runner (e.g. `pytest -v` or `npm test`).
- Enforce strict timeouts (max 30 seconds).

### 8. Interpret Verification Results
- Inspect standard output, standard error, and exit codes:
  - `exit 0`: Tests passed.
  - `exit > 0`: Tests failed or assertion violated.
  - `exit -1`: Timeout.
- Report regression test output faithfully.

### 9. Report Changes and Limitations Honestly
- Provide a summary containing:
  - Root cause explanation
  - Proposed diff
  - Test command and outcome
  - Any remaining uncertainties or limitations

---

## Example Scenario: Off-By-One Discount Bug

### Input
- **Repository:** `fixtures/discount-calculator`
- **Issue:** "Calling `apply_discount(100.0, 0.1, 0)` raises ValueError instead of applying 0% discount."

### Agent Steps
1. **Discover:** Reads `fixtures/discount-calculator/calculator.py` and `tests/test_calculator.py`.
2. **Collect Evidence:** Line 18 of `calculator.py`:
   ```python
   if quantity <= 0:
       raise ValueError("Quantity must be greater than zero")
   ```
3. **Identify Test Failure:** Running `pytest` initially fails:
   ```
   FAILED tests/test_calculator.py::test_zero_quantity_fixed - ValueError: Quantity must be greater than zero
   ```
4. **Propose Patch:**
   ```diff
   --- a/calculator.py
   +++ b/calculator.py
   @@ -18,2 +18,2 @@
   -    if quantity <= 0:
   +    if quantity < 0:
            raise ValueError("Quantity cannot be negative")
   ```
5. **Verify:** Apply patch to temporary copy and re-run `pytest`:
   ```
   tests/test_calculator.py::test_apply_discount PASSED
   tests/test_calculator.py::test_zero_quantity_fixed PASSED
   2 passed in 0.05s
   ```
6. **Result:** Verified fix.
