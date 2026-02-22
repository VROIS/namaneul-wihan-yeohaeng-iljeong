$body = '{"destination":"Paris","startDate":"2026-03-10","endDate":"2026-03-13","startTime":"09:00","endTime":"21:00","companionType":"Couple","companionCount":2,"vibes":["Culture","Foodie","Romantic"],"travelStyle":"Reasonable","mobilityStyle":"Moderate","travelPace":"Normal","curationFocus":"Everyone","birthDate":"1990-05-15"}'

$start = Get-Date
Write-Output "=== START ==="

try {
    $response = Invoke-RestMethod `
        -Uri "https://legal-dannye-dbstour-4e6b86d5.koyeb.app/api/routes/generate" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 60

    $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
    Write-Output "=== DONE: $elapsed sec ==="

    if ($response.metadata) {
        $m = $response.metadata
        Write-Output ""
        Write-Output "--- TIMING ---"
        if ($m._timings) {
            $t = $m._timings
            Write-Output "  Step1(Gemini+DB): $($t.step1_parallel) ms"
            $step2ms = $t.step2_enrich - $t.step1_parallel
            Write-Output "  Step2(Enrich): $step2ms ms"
        }
        Write-Output "  Total: $($m._totalMs) ms"
        Write-Output "  Pipeline: $($m.pipelineVersion)"
    }

    if ($response.days) {
        Write-Output ""
        Write-Output "--- ITINERARY ($($response.days.Count) days) ---"
        foreach ($day in $response.days) {
            Write-Output "  Day $($day.day): $($day.theme)"
            foreach ($place in $day.places) {
                $nubiR = if ($place.nubiReason) { "nubiReason:YES[$($place.nubiReason.Substring(0, [Math]::Min(20,$place.nubiReason.Length)))]" } else { "nubiReason:NO" }
                $img = if ($place.image) { "IMG:YES" } else { "IMG:NO" }
                $price = "EUR:$($place.estimatedPriceEur)"
                $transit = if ($place.transitNote) { "transitNote:YES" } else { "transitNote:NO" }
                Write-Output "    [$($place.startTime)-$($place.endTime)] $($place.name) | $nubiR | $img | $price | $transit"
            }
            if ($day.transits -and $day.transits.Count -gt 0) {
                Write-Output "    -- TRANSITS $($day.transits.Count) segments --"
                foreach ($tr in $day.transits) {
                    $est = if ($tr.isEstimated) { "HAVERSINE" } else { "GOOGLE" }
                    Write-Output "      $($tr.from) -> $($tr.to): $($tr.durationText) [$($tr.modeLabel)] $est"
                    if ($tr.transitNote) {
                        Write-Output "        note: $($tr.transitNote)"
                    }
                }
            }
        }
    }

    if ($response.costSummary) {
        Write-Output ""
        Write-Output "--- COST SUMMARY ---"
        $response.costSummary | ConvertTo-Json -Depth 2
    }

} catch {
    $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
    Write-Output "=== ERROR after $elapsed sec ==="
    Write-Output $_.Exception.Message
}
