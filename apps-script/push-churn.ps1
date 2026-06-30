$global   = "$env:USERPROFILE\.clasprc.json"
$backup   = "$env:USERPROFILE\.clasprc.json.comercial-bak"
$churnCreds = "$PSScriptRoot\.clasprc.json"
$claspJson  = "$PSScriptRoot\.clasp.json"
$churnClasp = "$PSScriptRoot\.clasp.churn.json"

Copy-Item $global $backup -Force
Copy-Item $churnCreds $global -Force
Copy-Item $churnClasp $claspJson -Force

try {
    clasp push --force
    clasp deploy --deploymentId "AKfycbyx3BlhOM2eIR2swdb_Y9lacBWyTOmFBG636qKRv902sUSTqJYztMSJvRAKEwcfFA5e"
} finally {
    Copy-Item $backup $global -Force
    Remove-Item $claspJson -Force
    Write-Host "Credenciais e projeto do Comercial restaurados."
}
