# Test Case A: 4인가족 Luxury Porto (Category A = Guide)
$body = @{
    destination = "Porto"
    startDate = "2026-02-15"
    endDate = "2026-02-17"
    startTime = "09:00"
    endTime = "21:00"
    vibes = @("Culture", "Foodie")
    travelStyle = "Luxury"
    travelPace = "Normal"
    mobilityStyle = "Minimal"
    companionType = "Family"
    companionCount = 4
    companionAges = "45,43,15,12"
    curationFocus = "Everyone"
    birthDate = "1981-05-15"
} | ConvertTo-Json -Depth 5

Write-Host "=== Test Case A: 4-Family Luxury Porto (Guide Category) ==="
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
    $response | ConvertTo-Json -Depth 15 | Out-File -FilePath "dev/test-result-a.json" -Encoding utf8
    Write-Host "Full result saved to dev/test-result-a.json"
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
