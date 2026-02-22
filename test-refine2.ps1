$t1 = Get-Date
$resp1 = Invoke-RestMethod -Uri "https://legal-dannye-dbstour-4e6b86d5.koyeb.app/api/admin/test/gemini-refine" -Method POST -ContentType "application/json" -Body "{}"
$ms1 = [Math]::Round(((Get-Date)-$t1).TotalSeconds, 1)
Write-Host "=== GEMINI REFINE (slot refine approach) ==="
Write-Host "Total: ${ms1}s"
Write-Host "Gemini only: $($resp1.geminiMs)ms"
Write-Host "Prompt: $($resp1.promptChars) chars / Response: $($resp1.responseChars) chars"
if ($resp1.result) {
    $d1 = $resp1.result.days[0].places
    $names1 = ($d1 | ForEach-Object { $_.name }) -join " -> "
    Write-Host "Day1 order: $names1"
    foreach ($p in ($d1 | Select-Object -First 3)) {
        $r = if ($p.reason) { $p.reason.Substring(0, [Math]::Min(80, $p.reason.Length)) } else { "" }
        Write-Host "[$($p.name)] EUR:$($p.estimatedCostEur) | $r"
    }
} else {
    Write-Host "raw: $($resp1.raw)"
}
