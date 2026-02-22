$body = '{"destination":"Paris","startDate":"2026-03-10","endDate":"2026-03-13","startTime":"09:00","endTime":"21:00","companionType":"Couple","companionCount":2,"vibes":["Culture","Foodie","Romantic"],"travelStyle":"Reasonable","mobilityStyle":"Moderate","travelPace":"Normal","curationFocus":"Everyone","birthDate":"1990-05-15"}'

$start = Get-Date

try {
    $response = Invoke-RestMethod `
        -Uri "https://legal-dannye-dbstour-4e6b86d5.koyeb.app/api/routes/generate" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 60

    $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
    Write-Output "DONE: $elapsed sec"

    # Day1 전체 구조 JSON으로 출력 (필드 확인용)
    if ($response.days -and $response.days.Count -gt 0) {
        $day1 = $response.days[0]
        Write-Output ""
        Write-Output "=== DAY1 TOP-LEVEL FIELDS ==="
        $day1.PSObject.Properties.Name | ForEach-Object { Write-Output "  field: $_" }

        Write-Output ""
        Write-Output "=== DAY1 PLACE[0] FIELDS ==="
        $p = $day1.places[0]
        $p.PSObject.Properties | ForEach-Object {
            $val = $_.Value
            if ($val -is [string] -and $val.Length -gt 60) { $val = $val.Substring(0,60) + "..." }
            Write-Output "  $($_.Name): $val"
        }

        Write-Output ""
        Write-Output "=== PRICE CHECK (all places) ==="
        foreach ($day in $response.days) {
            foreach ($place in $day.places) {
                Write-Output "  Day$($day.day) $($place.name): EUR $($place.estimatedPriceEur)"
            }
        }
    }

} catch {
    $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
    Write-Output "ERROR after $elapsed sec: $($_.Exception.Message)"
}
