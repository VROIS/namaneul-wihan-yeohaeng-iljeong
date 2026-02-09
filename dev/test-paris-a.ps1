# Test Paris A: 대가족 3일 B교통 (ExtendedFamily + Reasonable + WalkMore)
$body = @{
    destination = "Paris"
    startDate = "2026-02-20"
    endDate = "2026-02-22"
    startTime = "09:00"
    endTime = "21:00"
    vibes = @("Culture", "Foodie")
    travelStyle = "Reasonable"
    travelPace = "Normal"
    mobilityStyle = "WalkMore"
    companionType = "ExtendedFamily"
    companionCount = 6
    companionAges = "55,53,30,28,5,3"
    curationFocus = "Everyone"
    birthDate = "1971-08-10"
} | ConvertTo-Json -Depth 5

Write-Host "=== Paris A: ExtendedFamily 6, Reasonable, WalkMore (Transit B) ==="
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
    $response | ConvertTo-Json -Depth 15 | Out-File -FilePath "dev/test-result-paris-a.json" -Encoding utf8
    Write-Host "Saved to dev/test-result-paris-a.json"

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
