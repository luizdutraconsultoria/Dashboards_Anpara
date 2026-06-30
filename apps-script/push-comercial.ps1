$claspJson     = "$PSScriptRoot\.clasp.json"
$comercialClasp = "$PSScriptRoot\.clasp.comercial.json"

Copy-Item $comercialClasp $claspJson -Force

try {
    clasp push --force
    clasp deploy --deploymentId "AKfycbw4rX9x64xg4PWvW3Zw_g6rv3rggoqqOP9tRdmBCGW5fcorCt5A4Kkd71cypViYp3c6qw"
} finally {
    Remove-Item $claspJson -Force
    Write-Host "Projeto do Churn restaurado."
}
