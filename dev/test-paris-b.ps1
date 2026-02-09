# Test Paris B: 커플 2일 합리적 (Couple + Reasonable + Moderate)
$body = @{
    destination = "Paris"
    startDate = "2026-03-01"
    endDate = "2026-03-02"
    startTime = "10:00"
    endTime = "22:00"
    vibes = @("Romantic", "Hotspot")
    travelStyle = "Reasonable"
    travelPace = "Normal"
    mobilityStyle = "Moderate"
    companionType = "Couple"
    companionCount = 2
    companionAges = "32,30"
    curationFocus = "Everyone"
    birthDate = "1994-06-15"
} | ConvertTo-Json -Depth 5

Write-Host "=== Paris B: Couple 2, Reasonable, Moderate (Transit B) ==="
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8082/api/routes/generate" `
        -Method POST `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
        -TimeoutSec 120

    $sw.Stop()
    Write-Host "Total time: $($sw.ElapsedMilliseconds)ms"
    $response | ConvertTo-Json -Depth 15 | Out-File -FilePath "dev/test-result-paris-b.json" -Encoding utf8
    Write-Host "Saved to dev/test-result-paris-b.json"

    if ($response.transportSummary) {
        Write-Host ""
        Write-Host "=== TRANSPORT ==="
        Write-Host "Category: $($response.transportSummary.category)"
        Write-Host "PerPerson/Day: EUR$($response.transportSummary.perPersonPerDay)"
        if ($response.transportSummary.guideUpsell) {
            Write-Host "Guide Upsell: EUR$($response.transportSummary.guideUpsell.perPersonPerDay)/day"
        }
    }

    if ($response.days) {
        foreach ($day in $response.days) {
            Write-Host ""
            Write-Host "=== Day $($day.day) ==="
            if ($day.places) {
                foreach ($place in $day.places) {
                    $nubi = if ($place.nubiReason) { $place.nubiReason } else { "(NONE!)" }
                    Write-Host "  [$($place.startTime)-$($place.endTime)] $($place.name)"
                    Write-Host "    >> $nubi"
                }
            }
        }
    }
} catch {
    $sw.Stop()
    Write-Host "ERROR after $($sw.ElapsedMilliseconds)ms: $_"
}
