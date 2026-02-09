# Test Case B: Couple Reasonable Porto (Category B = Transit)
$body = @{
    destination = "Porto"
    startDate = "2026-02-15"
    endDate = "2026-02-17"
    startTime = "10:00"
    endTime = "20:00"
    vibes = @("Hotspot", "Romantic")
    travelStyle = "Reasonable"
    travelPace = "Normal"
    mobilityStyle = "WalkMore"
    companionType = "Couple"
    companionCount = 2
    companionAges = "30,28"
    curationFocus = "Everyone"
    birthDate = "1996-03-20"
} | ConvertTo-Json -Depth 5

Write-Host "=== Test Case B: Couple Reasonable Porto (Transit Category) ==="
Write-Host "Request body: $body"
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8082/api/routes/generate" `
        -Method POST `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
        -TimeoutSec 120

    $sw.Stop()
    $elapsed = $sw.ElapsedMilliseconds

    Write-Host "=== RESULT ==="
    Write-Host "Total time: ${elapsed}ms"
    Write-Host ""

    # Save full result
    $response | ConvertTo-Json -Depth 15 | Out-File -FilePath "dev/test-result-b.json" -Encoding utf8
    Write-Host "Full result saved to dev/test-result-b.json"
    Write-Host ""

    # Key checks
    $itinerary = $response
    if ($itinerary.title) { Write-Host "Title: $($itinerary.title)" }
    if ($itinerary.destination) { Write-Host "Destination: $($itinerary.destination)" }

    # Transport summary
    if ($itinerary.transportSummary) {
        Write-Host ""
        Write-Host "=== TRANSPORT SUMMARY ==="
        Write-Host ($itinerary.transportSummary | ConvertTo-Json -Depth 5)
    }

    # Day details
    if ($itinerary.days) {
        foreach ($day in $itinerary.days) {
            Write-Host ""
            Write-Host "=== Day $($day.day) ==="
            if ($day.places) {
                foreach ($place in $day.places) {
                    $nubi = if ($place.nubiReason) { $place.nubiReason } else { "(none)" }
                    $gemini = if ($place.geminiReason) { $place.geminiReason.Substring(0, [Math]::Min(50, $place.geminiReason.Length)) } else { "(none)" }
                    Write-Host "  [$($place.startTime)-$($place.endTime)] $($place.name)"
                    Write-Host "    nubiReason: $nubi"
                    Write-Host "    geminiReason: ${gemini}..."
                }
            }
            if ($day.transportDisplay) {
                Write-Host "  Transport: $($day.transportDisplay | ConvertTo-Json -Depth 3 -Compress)"
            }
        }
    }
} catch {
    $sw.Stop()
    Write-Host "ERROR after $($sw.ElapsedMilliseconds)ms: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
        Write-Host "Response: $errBody"
    }
}
