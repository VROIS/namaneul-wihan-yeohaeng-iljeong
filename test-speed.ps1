$BASE = "https://legal-dannye-dbstour-4e6b86d5.koyeb.app"
$BODY = '{"destination":"Paris, France","startDate":"2026-04-10","endDate":"2026-04-12","companionType":"couple","vibes":["romantic","culture"],"travelStyle":"Reasonable","mobilityStyle":"PublicTransport","pace":"moderate","curationFocus":"local","birthDate":"1990-01-01","companionCount":2}'

Write-Host "=== Test 1: Full itinerary generation (gemini-2.5-flash) ==="
$t1 = Get-Date
$r1 = Invoke-RestMethod -Uri "$BASE/api/routes/generate" -Method POST -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($BODY))
$s1 = [Math]::Round(((Get-Date)-$t1).TotalSeconds, 1)
Write-Host "Total time: ${s1}s"
Write-Host "Server total: $($r1.metadata._totalMs)ms"
Write-Host "Step1 (Gemini+DB): $($r1.metadata._timings.step1_parallel)ms"
Write-Host "Step2 (Enrich): $(if ($r1.metadata._timings.step2_enrich -and $r1.metadata._timings.step1_parallel) { $r1.metadata._timings.step2_enrich - $r1.metadata._timings.step1_parallel } else { 'n/a' })ms"
Write-Host ""
if ($r1.days -and $r1.days.Count -gt 0) {
    $p0 = $r1.days[0].places[0]
    Write-Host "Day1 #1: $($p0.name) | $($p0.startTime)-$($p0.endTime) | EUR:$($p0.estimatedPriceEur)"
    $p1 = $r1.days[0].places[1]
    Write-Host "Day1 #2: $($p1.name) | $($p1.startTime)-$($p1.endTime) | EUR:$($p1.estimatedPriceEur)"
}

Write-Host ""
Write-Host "=== Test 2: Gemini Refine (slot -> refine) ==="
$t2 = Get-Date
$r2 = Invoke-RestMethod -Uri "$BASE/api/admin/test/gemini-refine" -Method POST -ContentType "application/json" -Body "{}"
$s2 = [Math]::Round(((Get-Date)-$t2).TotalSeconds, 1)
Write-Host "Total time: ${s2}s"
Write-Host "Gemini only: $($r2.geminiMs)ms"
Write-Host "Prompt: $($r2.promptChars) chars / Response: $($r2.responseChars) chars"
