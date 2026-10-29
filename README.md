# SurveyAssistant - Chrome Extension (Manifest V3)

A lightweight, privacy-first Chrome extension that assists with completing legitimate online surveys using your own verified profile data and an optional local language model (Ollama).

---

## 🌟 Key Features & Privacy Guarantees

- **100% Local & Private:** All profile information is stored strictly on your computer using `chrome.storage.local`. No data is ever transmitted to remote cloud APIs or external servers.
- **Human-in-the-Loop Review:** SurveyAssistant displays suggested answers in a clean review list before filling any field. You can inspect, modify, or exclude answers.
- **Strictly No Auto-Submit:** SurveyAssistant **never** clicks submit buttons, never calls `.submit()`, and never circumvents CAPTCHA, bot-detection, or security checks.
- **Overwrite Protection:** Does not overwrite fields that already have answers on the page unless you explicitly approve it.
- **Visual Feedback & Clear Reporting:** Highlights successfully filled fields and labels in green, and provides an exact breakdown of **filled**, **skipped**, and **failed** fields.
- **Zero Hallucination ("NEEDS USER INPUT"):** If a question cannot be resolved from your profile facts, it is marked as `NEEDS USER INPUT`.
- **Lightweight & Beginner-Friendly:** Built with pure vanilla HTML, CSS, and modern JavaScript. Zero heavy node frameworks, zero build steps, and ideal for systems with 4 GB RAM.
- **Optional Local LLM (Ollama):** Optional local Ollama integration (`http://localhost:11434`) to interpret ambiguous survey questions. If Ollama is offline or disabled, rule-based matching continues to work completely standalone.

---

## 📁 Project Structure

```text
Survey Assistant/
├── manifest.json        # Chrome Extension Manifest V3 configuration
├── popup.html           # Extension popup window interface
├── popup.css            # Modern styling for popup & demo banner
├── popup.js             # Scan coordinator, review list, overwrite guard & filler
├── demo_profile.js      # Built-in isolated Demo Sample Profile
├── content.js           # Content script to safely detect & fill form fields
├── matcher.js           # Deterministic keyword & range-matching rules
├── llm_adapter.js       # Local Ollama adapter (offline-safe, strictly grounded)
├── options.html         # User profile editor & Ollama settings
├── options.css          # Styling for options page
├── options.js           # Storage persistence, export/import & demo loader
├── server.js            # Lightweight local server for safe demo survey testing
├── demo_survey.html     # Built-in 16-question demo survey testing all supported types
├── demo_survey.js       # Harmless client script preventing test form submit
├── icons/               # 16px, 32px, 48px, 128px PNG extension icons
└── tests/               # Automated unit tests for matcher, LLM, and form filling
```

---

## 🚀 How to Install in Google Chrome

1. Open **Google Chrome**.
2. In the address bar, type `chrome://extensions` and press **Enter**.
3. In the top-right corner, turn on the **Developer mode** toggle.
4. Click the **Load unpacked** button in the top-left corner.
5. In the folder picker dialog, select this folder:
   ```text
   C:\Users\AYUSHI JAIN\Desktop\Survey Assistant
   ```
6. Click **Select Folder**.
7. You will now see **SurveyAssistant** in your extensions list!
8. Click the puzzle icon 🧩 in the Chrome toolbar and click the pin icon 📌 next to SurveyAssistant to keep it visible.

---

## 🎭 Phase 5: Demo Sample Profile & Robust Matching

SurveyAssistant includes an isolated **Demo Sample Profile** designed specifically for local evaluation, without risking your personal profile data.

### Demo Profile Specification
- **Age:** 35
- **Gender:** Male
- **Occupation:** IT professional
- **Annual Income:** ₹20 LPA (handles Lakhs per annum and INR currency symbols)
- **Marital Status:** Married
- **Children:** 2
- **Residence:** Delhi
- **Housing Status:** Own apartment

### Profile Isolation & Safety Guarantee
- **Never Overwrites Your Real Profile:** Real user profiles are saved under `surveyAssistantProfile`. The Demo Profile is loaded from a read-only module (`demo_profile.js`) when `activeProfileMode` is set to `'demo'`. Your real profile remains completely untouched in storage.
- **Prominent Visual Indicators:** When in Demo mode, a high-visibility amber banner **"🎭 DEMO PROFILE ACTIVE — Test Mode"** appears across the popup and options page.
- **Instant One-Click Switching:** Click **"Switch to My Profile"** at any time to return immediately to your real profile data.

### Question Matching & "NEEDS USER INPUT" Fallback
- **Indian Income Matching (`matchLpaRange`):** Accurately normalizes ranges such as `₹15 - ₹25 LPA`, `10-20 Lakhs`, or `₹15,00,000 - ₹25,00,000`.
- **Precedence Guarding:** Evaluates `country of residence` before city `residence` so country dropdowns are never mistakenly populated with city names.
- **Compatibility Verification:** If options on a radio or dropdown question do not contain a match compatible with your profile fact (or if a fact is missing/ambiguous), the field strictly returns **`NEEDS USER INPUT`** with zero hallucination.

---

## 🧪 Testing with the Local Demo Survey

Chrome security strictly prevents extensions from injecting scripts into internal `chrome-extension://` URLs. Therefore, test the demo survey using one of these two supported local methods:

### Method 1: Local HTTP Server (Recommended)

1. Open a terminal (PowerShell or Command Prompt) in the project folder:
   ```powershell
   node server.js
   ```
2. Open Google Chrome to:
   ```text
   http://localhost:8080/demo_survey.html
   ```
3. Switch to Demo Profile:
   - Click the **SurveyAssistant** extension icon in Chrome.
   - Click the **"Switch to Demo"** button in the profile bar.
   - Notice the amber **DEMO PROFILE ACTIVE** banner appears.
4. Test Scanning & Review:
   - Click **🔍 Scan Page**.
   - Review the 16 detected survey questions:
     - **Q1 (Name):** Rahul Sharma
     - **Q2 (Email):** rahul.sharma@example.com
     - **Q3 (Age):** 35
     - **Q4 (Gender):** Male
     - **Q5 (Country):** India
     - **Q6 (Education):** Bachelor's Degree
     - **Q7 (Employment):** Employed full-time
     - **Q8 (Occupation):** Information Technology / IT professional
     - **Q9 (Annual Income):** ₹15 - ₹25 LPA
     - **Q10 (Marital Status):** Married
     - **Q11 (Children):** 2
     - **Q12 (City / Residence):** Delhi
     - **Q13 (Housing Status):** Own apartment
     - **Q14 (Daily Devices):** Computer, Smartphone
     - **Q15 (Primary Commute):** `NEEDS USER INPUT` (unspecified in demo profile)
     - **Q16 (Comments):** `NEEDS USER INPUT` (open-ended feedback)
5. Fill Form & Verify Highlights:
   - Click **✏️ Fill Form**.
   - 14 fields fill automatically and highlight in green.
   - 2 fields remain unselected / empty for human completion.
   - The form is **never** auto-submitted!

### Method 2: Direct File URL (`file:///`)

If you prefer opening `demo_survey.html` directly as a local file:
1. Open `chrome://extensions`.
2. Click **Details** under SurveyAssistant.
3. Toggle **Allow access to file URLs** to **ON**.
4. Double-click `demo_survey.html` in File Explorer to open it in Chrome.
5. Open SurveyAssistant and click **Scan Page**.

---

## 🛡️ Overwrite Protection

- When SurveyAssistant scans a page, it detects fields that already contain answers.
- Fields with existing answers are flagged with a **Has Answer** badge and are unchecked by default.
- To update them, either check the **Overwrite existing** toggle in the review header or check specific question cards individually.

---

## 🤖 Optional: Setting Up Local Ollama (Phase 2)

SurveyAssistant works standalone without an LLM. If you want local AI interpretation for ambiguous questions:

1. **Download Ollama for Windows:**  
   Visit [https://ollama.com/download](https://ollama.com/download) and install Ollama.
2. **Pull a lightweight model (Recommended for 4 GB RAM):**  
   Open PowerShell or Command Prompt and run:
   ```powershell
   ollama run llama3.2:1b
   ```
   *(Or `qwen2.5:0.5b` / `qwen2.5:1.5b` for minimal memory usage).*
3. **Enable in SurveyAssistant:**  
   - Open SurveyAssistant **Options** (⚙️).
   - Switch to the **Local Ollama LLM** tab.
   - Toggle **Enable Local LLM interpretation** to **ON**.
   - Click **Test Connection & Fetch Models** to verify.
   - Click **Save Changes**.
4. **How the LLM is controlled:**  
   - The model is instructed with a zero-temperature prompt grounded **exclusively** in your profile facts.
   - If the model is in any way uncertain, it is forced to reply `NEEDS USER INPUT`.
   - If Ollama is closed or offline, SurveyAssistant automatically falls back to rule-based profile matching with no interruptions.

---

## 🔒 Permissions & Security Audit

| Permission | Purpose |
| :--- | :--- |
| `storage` | Saves your profile and preferences locally in `chrome.storage.local`. |
| `activeTab` | Accesses only the survey tab when you explicitly click the extension. |
| `scripting` | Dynamically executes `content.js` on the active tab without needing broad host permissions. |
| `host_permissions: ["http://localhost:11434/*"]` | Allows local browser communication with your local Ollama daemon. |

---

## 🧪 Automated Tests

To run the automated test suites:
```powershell
node tests/test_matcher.js
node tests/test_llm_adapter.js
node tests/test_edge_cases.js
node tests/test_phase4_form_filling.js
node tests/test_phase5_demo_profile.js
```
All 67+ automated tests verify keyword detection, Indian LPA numeric range matching, demographic rules, custom facts handling, overwrite protection, demo profile isolation, and strict `NEEDS USER INPUT` fallbacks.
