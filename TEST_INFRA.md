# WarWick Browser — E2E Testing Infrastructure (`TEST_INFRA.md`)

## 1. Testing Philosophy & Methodology

WarWick Browser's E2E test suite adheres to four core testing tenets:

1. **Requirement-Driven & Opaque-Box**:
   Tests are derived directly from user requirements (`ORIGINAL_REQUEST.md`) and the public feature inventory & interface contracts in `PROJECT.md`. Tests verify external observables:
   - Electron `BaseWindow` lifecycle, dimensions, frameless state, and dark background `#121215`.
   - Typed IPC Context Bridge (`window.warwickApi` across `tabs`, `agent`, `context`, `settings`).
   - Native `WebContentsView` bounds synchronization with React DOM layout containers (`#web-container`).
   - Omnibox URL / Search Resolver (differentiating protocols, domain names, query operators, and `@ai` / `?` triggers).
   - In-page live DOM reader text extraction and token protection (strictly truncated to 40,000 characters).
   - High-resolution viewport screenshot capture (`webContents.capturePage()`).
   - Antigravity streaming agent turns and live action milestone events.
   - Autonomous background research tab harvesting, audio isolation (`isMuted: true`), and pool management.
   - Keyboard hotkey accelerators (`Ctrl+T`, `Ctrl+W`, `Ctrl+K`, `Ctrl+J`).
   - Persistent settings, session storage, and browsing history.

2. **Zero-Dependency Native Fast Runner**:
   The test suite utilizes modern Node.js (`node:test` and `node:assert`), delivering extreme speed (~5 seconds for 313 comprehensive tests) without external daemon, webdriver, or heavy test runner baggage.

3. **Complete Independence & Isolation**:
   Each test case sets up its own clean browser driver instance, exercises specific state transitions, asserts exact outputs, and cleanly releases resources upon completion.

4. **Progressive Verifiability**:
   The test harness can run both against an in-memory specification-conforming opaque-box browser driver (during milestone development) and against the live packaged Electron binary.

---

## 2. Test Architecture & 4-Tier Hierarchy

The test suite is structured into 4 distinct verification tiers:

```
tests/e2e/
├── harness/
│   ├── types.js                  # Shared contracts, constants, and theme tokens
│   ├── fixtures.js               # Sample HTML, massive DOMs, mock search results, JPEG base64
│   └── browserDriver.js          # Authoritative Opaque-Box WarwickBrowserDriver
├── tier1_features/               # Tier 1: Feature Coverage (>=5 tests per feature, 135 total)
│   ├── f01_to_f05.test.js        # Features 1 - 5 (25 tests)
│   ├── f06_to_f10.test.js        # Features 6 - 10 (25 tests)
│   ├── f11_to_f15.test.js        # Features 11 - 15 (25 tests)
│   ├── f16_to_f20.test.js        # Features 16 - 20 (25 tests)
│   └── f21_to_f27.test.js        # Features 21 - 27 (35 tests)
├── tier2_boundary/               # Tier 2: Boundary & Corner Cases (>=5 tests per feature, 135 total)
│   ├── b01_to_b05.test.js        # Boundaries 1 - 5 (25 tests)
│   ├── b06_to_b10.test.js        # Boundaries 6 - 10 (25 tests)
│   ├── b11_to_b15.test.js        # Boundaries 11 - 15 (25 tests)
│   ├── b16_to_b20.test.js        # Boundaries 16 - 20 (25 tests)
│   └── b21_to_b27.test.js        # Boundaries 21 - 27 (35 tests)
├── tier3_combinations/           # Tier 3: Cross-Feature Combinations (>= 27 tests)
│   └── combinations.test.js      # 28 Pairwise and multi-feature interaction tests
├── tier4_scenarios/              # Tier 4: Real-World Scenarios (>= 14 tests)
│   └── scenarios.test.js         # 15 Realistic end-to-end user workflows
└── runner.js                     # Master test suite runner with ANSI status output
```

### Tier Breakdown & Metrics

| Tier | Description | Requirement | Delivered Tests | Status |
|---|---|---|---|---|
| **Tier 1: Feature Coverage** | Nominal paths & equivalence classes for Features 1-27 | >= 135 tests (5 * 27) | **135 tests** | PASS (100%) |
| **Tier 2: Boundary & Corner Cases** | Edge cases, limits, timeouts, nulls, crash recovery | >= 135 tests (5 * 27) | **135 tests** | PASS (100%) |
| **Tier 3: Cross-Feature Combos** | Pairwise interactions between shell, tabs, AI, search | >= 27 tests | **28 tests** | PASS (100%) |
| **Tier 4: Real-World Scenarios** | Full end-to-end user workflows & deep research | >= 14 tests | **15 tests** | PASS (100%) |
| **TOTAL** | Complete E2E Verification Suite | >= 311 tests | **313 tests** | **PASS (100%)** |

---

## 3. Feature Coverage Matrix (Features 1 - 27)

| # | Feature Name | Tier 1 Tests | Tier 2 Tests | Tier 3 Combos | Tier 4 Scenarios |
|---|---|---|---|---|---|
| 1 | `BaseWindow` / Shell Creation | F01-1 .. F01-5 | B01-1 .. B01-5 | X24 | SCENARIO-15 |
| 2 | Project Scaffolding & Build Pipeline | F02-1 .. F02-5 | B02-1 .. B02-5 | X28 | SCENARIO-06 |
| 3 | Native View Layout & Bounds Sync | F03-1 .. F03-5 | B03-1 .. B03-5 | X06, X07, X08 | SCENARIO-04 |
| 4 | Preload & Typed IPC Bridge | F04-1 .. F04-5 | B04-1 .. B04-5 | X13, X14 | SCENARIO-06 |
| 5 | Create Tab (`createTab`) | F05-1 .. F05-5 | B05-1 .. B05-5 | X01, X15 | SCENARIO-01 |
| 6 | Switch Tab (`switchTab`) | F06-1 .. F06-5 | B06-1 .. B06-5 | X27 | SCENARIO-01 |
| 7 | Close Tab (`closeTab`) | F07-1 .. F07-5 | B07-1 .. B07-5 | X09, X10, X23 | SCENARIO-01, 15 |
| 8 | Reload Tab (`reloadTab`) | F08-1 .. F08-5 | B08-1 .. B08-5 | X22 | SCENARIO-05, 14 |
| 9 | History Back / Forward | F09-1 .. F09-5 | B09-1 .. B09-5 | X11 | SCENARIO-05 |
| 10 | Left Vertical Tab Strip | F10-1 .. F10-5 | B10-1 .. B10-5 | X06, X23 | SCENARIO-01, 15 |
| 11 | Tab State Tracking & Favicons | F11-1 .. F11-5 | B11-1 .. B11-5 | X22 | SCENARIO-14 |
| 12 | Omnibox URL / Search Resolver | F12-1 .. F12-5 | B12-1 .. B12-5 | X01, X12 | SCENARIO-05, 10 |
| 13 | Omnibox `@ai` Trigger | F13-1 .. F13-5 | B13-1 .. B13-5 | X02 | SCENARIO-10 |
| 14 | Live DOM Reader (`read_current_page`) | F14-1 .. F14-5 | B14-1 .. B14-5 | X05, X18, X25 | SCENARIO-02, 07 |
| 15 | High-Res Screenshot Capture | F15-1 .. F15-5 | B15-1 .. B15-5 | X05, X19 | SCENARIO-02 |
| 16 | Antigravity Streaming Chat | F16-1 .. F16-5 | B16-1 .. B16-5 | X02, X26 | SCENARIO-02, 11 |
| 17 | Live Agent Action Stream | F17-1 .. F17-5 | B17-1 .. B17-5 | X14 | SCENARIO-03 |
| 18 | Quick Action Chips | F18-1 .. F18-5 | B18-1 .. B18-5 | X18, X19 | SCENARIO-02 |
| 19 | Local MCP Tool Connection | F19-1 .. F19-5 | B19-1 .. B19-5 | X14 | SCENARIO-13 |
| 20 | Web Search Tool (`perform_web_search`) | F20-1 .. F20-5 | B20-1 .. B20-5 | X20 | SCENARIO-03 |
| 21 | Background Tab Harvester | F21-1 .. F21-5 | B21-1 .. B21-5 | X20 | SCENARIO-03, 08 |
| 22 | Multi-Step Research Orchestrator | F22-1 .. F22-5 | B22-1 .. B22-5 | X03, X20 | SCENARIO-03, 08 |
| 23 | Non-Disruptive Background Pool | F23-1 .. F23-5 | B23-1 .. B23-5 | X04, X21 | SCENARIO-04, 09 |
| 24 | Theme & Branding Engine (OKLCH Dark) | F24-1 .. F24-5 | B24-1 .. B24-5 | X24 | SCENARIO-15 |
| 25 | Local Storage & History Persistence | F25-1 .. F25-5 | B25-1 .. B25-5 | X16, X28 | SCENARIO-12 |
| 26 | Keyboard Shortcuts | F26-1 .. F26-5 | B26-1 .. B26-5 | X15, X16, X17 | SCENARIO-04 |
| 27 | Settings & API Key Management | F27-1 .. F27-5 | B27-1 .. B27-5 | X12, X13, X28 | SCENARIO-06 |

---

## 4. How to Run the Tests

### Master Runner (Recommended)
Executes all 313 tests with formatted progress, per-tier breakdown, and execution duration:
```bash
node tests/e2e/runner.js
```

### Direct Node.js Test Runner
Run all tests using native `node:test`:
```bash
node --test tests/e2e/**/*.test.js
```

### Running Specific Tiers
```bash
# Tier 1 Feature Coverage
node --test tests/e2e/tier1_features/*.test.js

# Tier 2 Boundary & Corner Cases
node --test tests/e2e/tier2_boundary/*.test.js

# Tier 3 Cross-Feature Combinations
node --test tests/e2e/tier3_combinations/*.test.js

# Tier 4 Real-World Scenarios
node --test tests/e2e/tier4_scenarios/*.test.js
```
