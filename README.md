# Appliance-repair voice agent (Retell + n8n + Telegram)

A Retell single-prompt phone agent for an appliance repair company's only line. It works out who is calling (standard customer, LG/Samsung/GE warranty customer, home-warranty-company rep, or spam), never books a standard job before the caller accepts the $99 fee, and sends a Telegram alert after every call. The fee, warranty and address rules are checked again on the server before a booking is logged to Google Sheets.

**Live now:** Retell agent version 23 on +1 (302) 309-8447, model `gemini-3.0-flash`. Always deploy with `node --env-file=.env retell/deploy.mjs --publish`: it publishes and moves the phone number to the new version (see [Retell](#5-retell)).

```
Caller ─► Retell number ─► Single-Prompt agent
            ├─ book_service_call ─► n8n WF-A: header auth → validate → IF new → Sheets append → {result, say}
            ├─ end_call (built-in)
            └─ call_analyzed webhook ─► n8n WF-B: verify signature → filter → build alert → Telegram
n8n error workflow: Error Trigger → format → Telegram "⚠️ <workflow> failed: <error>"
```

## Files

| File | What it is |
|---|---|
| `retell/system-prompt.md` | The agent prompt (role, voice, facts, warranty, fee gate, booking, reps, spam, edge cases, close). |
| `retell/llm.json` | Retell LLM: model, temperature, first message, default variables, `book_service_call` + `end_call`. `${…}` placeholders are filled by `deploy.mjs`. |
| `retell/agent.json` | Retell agent: voice, backchannel, boosted keywords, silence/duration limits, post-call fields, webhook. |
| `retell/deploy.mjs` | Creates or updates the LLM and agent through the API and attaches the phone number. |
| `n8n/wf-a-booking-function.json` | WF-A, `POST /webhook/retell/book-service-call`. |
| `n8n/wf-b-post-call-alert.json` | WF-B, `POST /webhook/retell/post-call`. |
| `n8n/error-alert.json` | Error workflow for both. |
| `tests/code-nodes.test.mjs` | Runs the Code-node JavaScript straight from the workflow JSON against the fixtures. |
| `tests/replay.mjs` | Signs the fixtures and posts them to your live n8n. |
| `tests/test-scenarios.md` | Live test calls for every caller type, with what the agent, Telegram and the Sheet should show. |

## Environment variables

| Variable | Used by | Value |
|---|---|---|
| `RETELL_API_KEY` | deploy, replay | Retell API key. Use the key with the **webhook** badge so it also signs webhooks. |
| `N8N_BASE_URL` | deploy, replay | Public https base of your n8n, e.g. `https://you.app.n8n.cloud`. Retell blocks localhost and private IPs. |
| `WEBHOOK_SECRET` | deploy, replay | A long random string, e.g. `openssl rand -hex 24`. Same value as the n8n "Retell booking secret" credential. |
| `RETELL_PHONE_NUMBER` | deploy (keep it set) | Your Retell number in E.164, e.g. `+15125550100`. Every run points it at the version just deployed; without it the number stays on its old version. |
| `RETELL_AGENT_ID` | deploy (optional) | Set after the first run to update that agent instead of creating a new one. Its LLM is found from the agent. |
| `RETELL_VOICE_ID` | deploy (optional) | Overrides `voice_id` in `agent.json` (default `retell-Brynne`). |
| `RETELL_WEBHOOK_KEY` | replay (optional) | Signing key if it differs from `RETELL_API_KEY`. |

No secrets are stored in any file.

## Build sequence

### 1. Telegram
1. In Telegram, message **@BotFather** → `/newbot` → copy the token.
2. Create a group **Call Feed**, add the bot, the team and reviewers, and send `/start@<yourbot>` in the group.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id` (starts with `-100…`).
4. In n8n, create a **Telegram API** credential named **Telegram - Call Feed** with the token.

### 2. Google Sheet
Create a sheet **Dispatch Log** with a tab **Jobs** and this header row in row 1:

```
logged_at, call_id, job_type, caller_name, phone, service_address, appliance, brand, issue, fee_accepted, notes
```

In n8n, create a **Google Sheets OAuth2 API** credential and sign in.

### 3. n8n credentials and variable
- **Header Auth** credential named **Retell booking secret**: Name `X-Webhook-Secret`, Value = your `WEBHOOK_SECRET`.
- Variable **RETELL_WEBHOOK_KEY** = the Retell API key with the webhook badge (Overview → Variables). If your plan has no Variables, use the constant in WF-B's "Verify signature" node instead (see below).
- Self-hosted n8n only: start n8n with `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (n8n Cloud already allows it).

### 4. Import the workflows
Import in this order with **Import from File**: `n8n/error-alert.json`, `n8n/wf-b-post-call-alert.json`, `n8n/wf-a-booking-function.json`. Then make the edits in [Values to paste](#values-to-paste), save, and activate all three. Copy the production URLs of WF-A and WF-B; they should be `<N8N_BASE_URL>/webhook/retell/book-service-call` and `<N8N_BASE_URL>/webhook/retell/post-call`.

### 5. Retell
1. Buy or import a number in the Retell dashboard.
2. Set the variables and deploy (creates the LLM and agent, attaches the number):

   ```bash
   node --env-file=.env retell/deploy.mjs --publish
   ```
3. Save the printed `RETELL_AGENT_ID` export. Later runs with it set edit the latest draft in place; if the latest version is published, they first create a new draft from it. The version is published, the phone number is moved to it, and the move is checked.
4. The phone number is pinned to one agent version. Publishing in the dashboard does **not** move it, so dashboard edits never reach the phone unless you also change Phone Numbers → your number → Inbound call agent (or pick the **Latest Published** tag there). Edit the repo and deploy instead.
5. `node retell/deploy.mjs --dry-run` prints the request bodies (secret masked) without calling the API.

### 6. Test
```bash
node --test
node tests/replay.mjs
```
Then work through `tests/test-scenarios.md`.

## Values to paste

After import, these are the only edits:

| Where | Field | Paste |
|---|---|---|
| WF-A → **Webhook** | Credential for Header Auth | pick **Retell booking secret** |
| WF-A → **Append to Jobs sheet** | Credential | pick your Google Sheets OAuth2 credential |
| WF-A → **Append to Jobs sheet** | Document (By URL) | your Dispatch Log sheet URL (replaces `PASTE_GOOGLE_SHEET_URL`) |
| WF-B → **Send to Call Feed** | Credential | pick **Telegram - Call Feed** |
| WF-B → **Send to Call Feed** | Chat ID | the `-100…` chat id (replaces `PASTE_TELEGRAM_CHAT_ID`) |
| Error alert → **Send to Call Feed** | Credential, Chat ID | same as WF-B |
| n8n Variables | `RETELL_WEBHOOK_KEY` | Retell API key with the webhook badge. **Or**, without Variables: WF-B → **Verify signature** → replace `PASTE_RETELL_WEBHOOK_KEY_HERE` |
| WF-A and WF-B → **Settings** | Error workflow | pick **Retell · error alert** (n8n gives imported workflows new IDs, so this link can't be pre-filled) |

If a credential with the exact name already exists, n8n usually picks it automatically on import.

## Configuration you may want to change

| Setting | Where |
|---|---|
| Company name, agent name | `retell/llm.json` → `default_dynamic_variables` |
| Time zone | `retell/agent.json` → `timezone` **and** WF-B → Build alert → `TIME_ZONE` |
| Line after booking | WF-A → Validate booking → `NEXT_STEPS` (default "The office will reach out to confirm the appointment time.") |
| Model, temperature | `retell/llm.json` → `model_config` (default `gemini-3.0-flash`, 0.2). `claude-5.5-sonnet` follows the prompt more closely but tends to say its reasoning out loud; the n8n checks below hold either way. |
| Voice | `retell/agent.json` → `voice_id`, or `RETELL_VOICE_ID` |

## How the guards work

**WF-A Validate booking** answers Retell with `{result, say}`; the agent acts on `say`.

| Check (in order) | Result |
|---|---|
| A required argument is empty, or `job_type` isn't `standard`/`warranty` | `missing`, "Ask for <field>, then try again." |
| Service address has no house number, and `notes` don't say "No house number" | `missing`, ask for the house number |
| `warranty` job, brand not LG, Samsung, GE or General Electric | `not_covered`, offer a standard visit with the $99 fee |
| `standard` job: `fee_accepted` isn't true, or the caller's answer to the **last** agent turn saying `$99` / "ninety-nine" isn't a clear yes (a no, "not sure", a question or no answer) | `fee_required`, say the fee line and get a clear yes |
| `call_id` already booked with identical details (workflow static data, kept 30 days) | `booked`, no second row |
| `call_id` already booked with different details | `booked`, a new row whose notes start "Correction of an earlier booking in this call." |
| Otherwise | `booked`, `NEXT_STEPS`, and one Sheet row |

The Sheets node retries twice and continues on failure; the Telegram alert is the backup record. Static data is only saved for production (active) executions, so duplicate protection does not apply to editor test runs.

**WF-B** verifies `x-retell-signature` (`v=<ms>,d=<hex HMAC-SHA256(rawBody + v, key)>`, timing-safe, at most 5 minutes off), keeps only `call_analyzed`, ignores repeated deliveries of the same call, and sends one HTML alert: 🔧 standard booking, 🛡️ warranty booking, 📨 warranty-company message, ⚠️ no booking, 🚫 spam (one line, silent), 📞 other/callback. Values are HTML-escaped, missing values print as "—", and the message stays under 4096 characters. A bad signature throws, so the error workflow posts it to the Call Feed.

## Retell dashboard map

What `deploy.mjs` sets, if you prefer to build it by hand:

| Setting | Dashboard |
|---|---|
| Single Prompt agent, prompt = `system-prompt.md` | Create agent → Single Prompt → prompt editor |
| Model `gemini-3.0-flash`, temperature 0.2 | Agent → LLM model dropdown → settings |
| Agent speaks first: "Thanks for calling {{company_name}}, this is {{agent_name}}. How can I help?" | Welcome message → AI speaks first, custom message |
| `company_name`, `agent_name` defaults | Security & fallback settings → Default dynamic variables |
| `book_service_call` (POST, WF-A URL, header `X-Webhook-Secret`, payload args only **off**, speak during execution **off** (the prompt gives the exact line), speak after **on**, timeout 10000 ms, parameters from `llm.json`) | Functions → + Add → Custom function |
| `end_call` | Functions → + Add → End call |
| Voice `retell-Brynne`, backchannel on | Voice settings / Speech settings |
| Boosted keywords | Speech settings → Boosted keywords |
| End call after 30 s silence, max 15 min | Call settings |
| Post-call fields (`caller_type`, `outcome`, text and boolean fields) | Post-Call Extraction → + Add (enum = Selector) |
| Webhook URL = WF-B URL, events = `call_analyzed` | Webhook settings (agent level) |
| Time zone | Agent settings → Timezone |
| Inbound agent for the number | Phone Numbers → your number → Inbound call agent |
