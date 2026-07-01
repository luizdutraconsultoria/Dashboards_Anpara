$global    = "$env:USERPROFILE\.clasprc.json"
$backup    = "$env:USERPROFILE\.clasprc.json.churn-bak"
$comercialCreds = "$PSScriptRoot\.clasprc.comercial.json"
$claspJson      = "$PSScriptRoot\.clasp.json"
$comercialClasp = "$PSScriptRoot\.clasp.comercial.json"

Copy-Item $global $backup -Force
Copy-Item $comercialCreds $global -Force
Copy-Item $comercialClasp $claspJson -Force

try {
    clasp push --force
    clasp deploy --deploymentId "AKfycbw4rX9x64xg4PWvW3Zw_g6rv3rggoqqOP9tRdmBCGW5fcorCt5A4Kkd71cypViYp3c6qw"
} finally {
    Copy-Item $backup $global -Force
    Remove-Item $claspJson -Force
    Write-Host "Credenciais e projeto do Churn restaurados."
}
