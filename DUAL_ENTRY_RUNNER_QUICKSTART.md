# Dual Entry Runner Quickstart

This runner is installed on the mirror computer and talks to OpsIQ dual-entry APIs.
Target flow in this guide: your internal Famous Receiving screen (not customer Famous).

## 1) Generate pairing token in OpsIQ

Open AI Dual Entry page and click **Generate Pairing Token** for the customer tenant.

## 2) Register runner on mirror computer

From the project folder:

```powershell
npm run dual-entry:runner:register -- --token <PAIRING_TOKEN> --name MirrorRunner01 --machineName OPSIQ-MIRROR-02 --baseUrl http://localhost:3000
```

This writes `runner-config.json` with runner id and API key.

## 3) Start runner agent

```powershell
npm run dual-entry:runner:start
```

The agent will:
- send heartbeat
- claim queued jobs for its tenant
- run configured adapter (dry-run or command)
- post completion/failure back to OpsIQ

## 3b) Switch to command adapter (for real Famous automation)

Use a local script command that accepts payload and writes a result JSON:

```powershell
npm run dual-entry:runner:set-adapter -- --mode command --command "powershell -ExecutionPolicy Bypass -File ./scripts/famous-receiving-adapter.ps1 -Payload {{payload}} -Result {{result}} -JobId {{jobId}} -Mode simulate -FamousWindowTitle Receive" --workingDir . --timeoutMs 60000
```

Switch to live entry mode after validation:

```powershell
npm run dual-entry:runner:set-adapter -- --mode command --command "powershell -ExecutionPolicy Bypass -File ./scripts/famous-receiving-adapter.ps1 -Payload {{payload}} -Result {{result}} -JobId {{jobId}} -Mode live -FamousWindowTitle Receive -TabMapPath ./scripts/famous-receiving-tabmap.json" --workingDir . --timeoutMs 90000
```

Safer phased calibration commands:

```powershell
# 1) Focus Famous only (no typing)
npm run dual-entry:runner:set-adapter -- --mode command --command "powershell -ExecutionPolicy Bypass -File ./scripts/famous-receiving-adapter.ps1 -Payload {{payload}} -Result {{result}} -JobId {{jobId}} -Mode live -EntryPhase focus-only -FamousWindowTitle Receive -TabMapPath ./scripts/famous-receiving-tabmap.json" --workingDir . --timeoutMs 60000

# 2) Header only (no line-grid typing)
npm run dual-entry:runner:set-adapter -- --mode command --command "powershell -ExecutionPolicy Bypass -File ./scripts/famous-receiving-adapter.ps1 -Payload {{payload}} -Result {{result}} -JobId {{jobId}} -Mode live -EntryPhase header-only -FamousWindowTitle Receive -TabMapPath ./scripts/famous-receiving-tabmap.json" --workingDir . --timeoutMs 90000

# 3) Full header + line entry
npm run dual-entry:runner:set-adapter -- --mode command --command "powershell -ExecutionPolicy Bypass -File ./scripts/famous-receiving-adapter.ps1 -Payload {{payload}} -Result {{result}} -JobId {{jobId}} -Mode live -EntryPhase full -FamousWindowTitle Receive -TabMapPath ./scripts/famous-receiving-tabmap.json" --workingDir . --timeoutMs 90000
```

Token replacement in command template:
- `{{payload}}` path to JSON file containing the claimed job
- `{{result}}` path where your script should write result JSON
- `{{jobId}}` current job id

Expected result file schema:

```json
{
	"success": true,
	"message": "Submitted to target Famous",
	"submittedFields": {
		"poNumber": "PO-123",
		"sku": "GIRO-ALM-50",
		"qty": 80
	}
}
```

## 4) Queue a test job (optional)

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/dual-entry/jobs" -ContentType "application/json" -Body '{"tenant":"customer-famous-01","sourceSystem":"OpsIQ","targetSystem":"Famous-Receiving","payload":{"receiveDate":"04/14/26","whseLoc":"Produce Depot NJ","receiveType":"Grower","inventoryQnt":"2160","ref":"GRP-2026-001","lotId":"25D6673870","carrierId":"UAC","description":"TABLE GRAPES 18#POUCHCLEAR","lines":[{"commodity":"TABLEGRP","style":"18#POUCHCI1000","size":"CAT 1","grade":"CAT 1","label":"UAC","region":"CL","method":"ORIG CTN","invQnt":"1188","invUom":"ctn","variety":"ALLISON","palletCopies":"1","lotId":"25D6673870","productDescription":"TABLE GRAPES 18#POUCHCLEAR 1000"}]}}'
```

## 4b) Receiving payload shape

Use these keys in `payload` for internal Famous Receiving:

- Header fields: `receiptNo`, `receiveDate`, `poNumber`, `orderNumber`, `whseLoc`, `ref`, `lotId`, `carrierId`, `description`, `access`, `inventoryQnt`, `receiveType`
- Line rows: `lines[]` with `commodity`, `style`, `size`, `grade`, `label`, `region`, `method`, `color`, `invQnt`, `invUom`, `variety`, `palletCopies`, `lotId`, `productDescription`
- Optional pallet/tag rows: add `tags[]` inside each line object for later UI mapping.

## 5) Production adapter

The current runner supports two modes in `src/server/dual-entry-runner-agent.ts`:
- `dry-run` (default)
- `command` (executes your local automation script)

Included starter script:
- `scripts/famous-receiving-adapter.ps1` validates and normalizes Receiving payloads.
- `-Mode simulate` validates only (safe test).
- `-Mode live` focuses the Famous Receive window and performs keyboard entry using a configurable tab map.
- `-EntryPhase focus-only|header-only|full` controls calibration depth for safer go-live.
- Tune field order and key behavior in `scripts/famous-receiving-tabmap.json`.
