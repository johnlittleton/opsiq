param(
  [Parameter(Mandatory = $true)]
  [string]$Payload,

  [Parameter(Mandatory = $true)]
  [string]$Result,

  [Parameter(Mandatory = $false)]
  [string]$JobId = '',

  [Parameter(Mandatory = $false)]
  [ValidateSet('simulate', 'live')]
  [string]$Mode = 'simulate',

  [Parameter(Mandatory = $false)]
  [string]$FamousWindowTitle = 'Receive',

  [Parameter(Mandatory = $false)]
  [string]$TabMapPath = './scripts/famous-receiving-tabmap.json',

  [Parameter(Mandatory = $false)]
  [ValidateSet('full', 'header-only', 'focus-only')]
  [string]$EntryPhase = 'full'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-ResultFile {
  param(
    [bool]$Success,
    [string]$Message,
    [hashtable]$SubmittedFields,
    [string[]]$Errors
  )

  $dir = Split-Path -Parent $Result
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  $payload = @{
    success = $Success
    message = $Message
    submittedFields = $SubmittedFields
    errors = $Errors
  }

  $payload | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Result -Encoding UTF8
}

function Get-String {
  param([object]$Value)
  if ($null -eq $Value) { return '' }
  return [string]$Value
}

function Get-FieldValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Object,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($null -eq $Object) {
    return $null
  }

  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) {
    return $null
  }

  return $prop.Value
}

function Send-LiteralText {
  param([string]$Text)

  if ([string]::IsNullOrEmpty($Text)) {
    return
  }

  $escaped = $Text
  $escaped = $escaped.Replace('{', '{{}')
  $escaped = $escaped.Replace('}', '{}}')
  $escaped = $escaped.Replace('+', '{+}')
  $escaped = $escaped.Replace('^', '{^}')
  $escaped = $escaped.Replace('%', '{%}')
  $escaped = $escaped.Replace('~', '{~}')
  $escaped = $escaped.Replace('(', '{(}')
  $escaped = $escaped.Replace(')', '{)}')
  $escaped = $escaped.Replace('[', '{[}')
  $escaped = $escaped.Replace(']', '{]}')

  [System.Windows.Forms.SendKeys]::SendWait($escaped)
}

function Send-SpecialKeys {
  param([string]$Keys)

  if ([string]::IsNullOrWhiteSpace($Keys)) {
    return
  }

  [System.Windows.Forms.SendKeys]::SendWait($Keys)
}

function Resolve-TabMap {
  param([string]$Path)

  $defaultMap = @{
    initialDelayMs = 400
    betweenKeysDelayMs = 60
    beforeHeaderKeys = ''
    afterHeaderKeys = '{TAB}'
    afterEachHeaderFieldKeys = '{TAB}'
    headerFieldOrder = @('receiptNo', 'receiveDate', 'poNumber', 'orderNumber', 'whseLoc', 'ref', 'lotId', 'carrierId', 'description', 'access', 'inventoryQnt', 'receiveType')
    receiveTypeMap = @{
      Grower = 'G'
      Transfer = 'T'
      PO = 'P'
      Misc = 'M'
    }
    lineEntryStartKeys = '{TAB}'
    afterEachLineFieldKeys = '{TAB}'
    lineFieldOrder = @('commodity', 'style', 'size', 'grade', 'label', 'region', 'method', 'color', 'invQnt', 'invUom', 'variety', 'palletCopies', 'lotId', 'productDescription')
    nextLineKeys = '{DOWN}'
    finalizationKeys = ''
  }

  if (-not (Test-Path -LiteralPath $Path)) {
    return $defaultMap
  }

  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $defaultMap
  }

  $custom = $raw | ConvertFrom-Json

  foreach ($prop in $custom.PSObject.Properties) {
    $defaultMap[$prop.Name] = $prop.Value
  }

  return $defaultMap
}

function Send-ReceivingAutomation {
  param(
    [hashtable]$Header,
    [array]$Lines,
    [string]$WindowTitle,
    [string]$MapPath,
    [string]$Phase
  )

  Add-Type -AssemblyName Microsoft.VisualBasic
  Add-Type -AssemblyName System.Windows.Forms

  $activated = [Microsoft.VisualBasic.Interaction]::AppActivate($WindowTitle)
  if (-not $activated) {
    throw "Could not focus Famous window title containing '$WindowTitle'."
  }

  $map = Resolve-TabMap -Path $MapPath

  $initialDelayMs = [int]($map.initialDelayMs)
  if ($initialDelayMs -lt 0) { $initialDelayMs = 0 }
  Start-Sleep -Milliseconds $initialDelayMs

  $betweenKeysDelayMs = [int]($map.betweenKeysDelayMs)
  if ($betweenKeysDelayMs -lt 0) { $betweenKeysDelayMs = 0 }

  Send-SpecialKeys -Keys ([string]$map.beforeHeaderKeys)

  foreach ($field in $map.headerFieldOrder) {
    $fieldName = [string]$field
    $value = Get-String (Get-FieldValue -Object $Header -Name $fieldName)

    if ($fieldName -eq 'receiveType' -and -not [string]::IsNullOrWhiteSpace($value)) {
      $mapped = Get-FieldValue -Object $map.receiveTypeMap -Name $value
      if ($null -ne $mapped -and -not [string]::IsNullOrWhiteSpace([string]$mapped)) {
        $value = [string]$mapped
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      Send-LiteralText -Text $value
    }

    Send-SpecialKeys -Keys ([string]$map.afterEachHeaderFieldKeys)
    Start-Sleep -Milliseconds $betweenKeysDelayMs
  }

  if ($Phase -eq 'header-only') {
    Send-SpecialKeys -Keys ([string]$map.finalizationKeys)
    return
  }

  if ($Phase -eq 'focus-only') {
    return
  }

  Send-SpecialKeys -Keys ([string]$map.afterHeaderKeys)
  Start-Sleep -Milliseconds $betweenKeysDelayMs

  Send-SpecialKeys -Keys ([string]$map.lineEntryStartKeys)
  Start-Sleep -Milliseconds $betweenKeysDelayMs

  for ($lineIndex = 0; $lineIndex -lt $Lines.Count; $lineIndex++) {
    $line = $Lines[$lineIndex]

    foreach ($field in $map.lineFieldOrder) {
      $fieldName = [string]$field
      $value = Get-String (Get-FieldValue -Object $line -Name $fieldName)

      if (-not [string]::IsNullOrWhiteSpace($value)) {
        Send-LiteralText -Text $value
      }

      Send-SpecialKeys -Keys ([string]$map.afterEachLineFieldKeys)
      Start-Sleep -Milliseconds $betweenKeysDelayMs
    }

    if ($lineIndex -lt ($Lines.Count - 1)) {
      Send-SpecialKeys -Keys ([string]$map.nextLineKeys)
      Start-Sleep -Milliseconds $betweenKeysDelayMs
    }
  }

  Send-SpecialKeys -Keys ([string]$map.finalizationKeys)
}

try {
  if (-not (Test-Path -LiteralPath $Payload)) {
    throw "Payload file not found: $Payload"
  }

  $raw = Get-Content -LiteralPath $Payload -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw 'Payload file is empty.'
  }

  $envelope = $raw | ConvertFrom-Json
  if ($null -eq $envelope.job -or $null -eq $envelope.job.payload) {
    throw 'Expected payload format { job: { payload: {...} } }'
  }

  $p = $envelope.job.payload

  $header = @{
    receiptNo = Get-String (Get-FieldValue -Object $p -Name 'receiptNo')
    receiveDate = Get-String (Get-FieldValue -Object $p -Name 'receiveDate')
    poNumber = Get-String (Get-FieldValue -Object $p -Name 'poNumber')
    orderNumber = Get-String (Get-FieldValue -Object $p -Name 'orderNumber')
    whseLoc = Get-String (Get-FieldValue -Object $p -Name 'whseLoc')
    ref = Get-String (Get-FieldValue -Object $p -Name 'ref')
    lotId = Get-String (Get-FieldValue -Object $p -Name 'lotId')
    carrierId = Get-String (Get-FieldValue -Object $p -Name 'carrierId')
    description = Get-String (Get-FieldValue -Object $p -Name 'description')
    access = Get-String (Get-FieldValue -Object $p -Name 'access')
    inventoryQnt = Get-String (Get-FieldValue -Object $p -Name 'inventoryQnt')
    receiveType = Get-String (Get-FieldValue -Object $p -Name 'receiveType')
  }

  $lines = @()
  $payloadLines = Get-FieldValue -Object $p -Name 'lines'
  if ($null -ne $payloadLines) {
    foreach ($line in $payloadLines) {
      $lines += @{
        blockId = Get-String (Get-FieldValue -Object $line -Name 'blockId')
        commodity = Get-String (Get-FieldValue -Object $line -Name 'commodity')
        style = Get-String (Get-FieldValue -Object $line -Name 'style')
        size = Get-String (Get-FieldValue -Object $line -Name 'size')
        grade = Get-String (Get-FieldValue -Object $line -Name 'grade')
        label = Get-String (Get-FieldValue -Object $line -Name 'label')
        region = Get-String (Get-FieldValue -Object $line -Name 'region')
        method = Get-String (Get-FieldValue -Object $line -Name 'method')
        color = Get-String (Get-FieldValue -Object $line -Name 'color')
        invQnt = Get-String (Get-FieldValue -Object $line -Name 'invQnt')
        invUom = Get-String (Get-FieldValue -Object $line -Name 'invUom')
        variety = Get-String (Get-FieldValue -Object $line -Name 'variety')
        palletCopies = Get-String (Get-FieldValue -Object $line -Name 'palletCopies')
        lotId = Get-String (Get-FieldValue -Object $line -Name 'lotId')
        productDescription = Get-String (Get-FieldValue -Object $line -Name 'productDescription')
        tags = Get-FieldValue -Object $line -Name 'tags'
      }
    }
  }

  $errors = @()
  if ([string]::IsNullOrWhiteSpace($header.receiveDate)) { $errors += 'receiveDate is required' }
  if ([string]::IsNullOrWhiteSpace($header.whseLoc)) { $errors += 'whseLoc is required' }
  if ([string]::IsNullOrWhiteSpace($header.receiveType)) { $errors += 'receiveType is required (Grower|Transfer|PO|Misc)' }
  if ($lines.Count -eq 0) { $errors += 'At least one receiving line is required in payload.lines[]' }

  $submitted = @{
    jobId = $JobId
    mode = $Mode
    entryPhase = $EntryPhase
    famousWindowTitle = $FamousWindowTitle
    tabMapPath = $TabMapPath
    header = $header
    lines = $lines
  }

  if ($errors.Count -gt 0) {
    Write-ResultFile -Success $false -Message 'Receiving payload validation failed.' -SubmittedFields $submitted -Errors $errors
    exit 0
  }

  if ($Mode -eq 'live') {
    Send-ReceivingAutomation -Header $header -Lines $lines -WindowTitle $FamousWindowTitle -MapPath $TabMapPath -Phase $EntryPhase
    if ($EntryPhase -eq 'focus-only') {
      Write-ResultFile -Success $true -Message 'Famous Receive window focused successfully; no keys were sent.' -SubmittedFields $submitted -Errors @()
      exit 0
    }

    if ($EntryPhase -eq 'header-only') {
      Write-ResultFile -Success $true -Message 'Receiving header entry sent to Famous window (header-only phase).' -SubmittedFields $submitted -Errors @()
      exit 0
    }

    Write-ResultFile -Success $true -Message 'Receiving job entry sent to Famous window via keyboard automation.' -SubmittedFields $submitted -Errors @()
    exit 0
  }

  Write-ResultFile -Success $true -Message 'Receiving job normalized (simulate mode). No UI actions executed.' -SubmittedFields $submitted -Errors @()
  exit 0
} catch {
  $submittedFallback = @{
    jobId = $JobId
    mode = $Mode
  }

  Write-ResultFile -Success $false -Message ('Adapter exception: ' + $_.Exception.Message) -SubmittedFields $submittedFallback -Errors @($_.Exception.Message)
  exit 0
}
