$body = '{"destination":"Paris, France","startDate":"2026-03-10","endDate":"2026-03-12","companionType":"couple","companionCount":2,"vibes":["romantic","culture"],"travelStyle":"Reasonable","mobilityStyle":"PublicTransit","travelPace":"Moderate","curationFocus":"food","birthDate":"1990-01-01","startTime":"09:00","endTime":"21:00"}'
$start = Get-Date
$result = Invoke-WebRequest -Uri "https://legal-dannye-dbstour-4e6b86d5.koyeb.app/api/routes/generate" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 60 -UseBasicParsing
$elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
Write-Host "Time: ${elapsed}s / Status: $($result.StatusCode)"
$result.Content | Out-File -FilePath "test_result.json" -Encoding utf8
$json = $result.Content | ConvertFrom-Json
Write-Host "Days: $($json.days.Count)"
$d1places = $json.days[0].places
Write-Host "Day1 places: $($d1places.Count)"
for ($i = 0; $i -lt [Math]::Min(3, $d1places.Count); $i++) {
    $p = $d1places[$i]
    Write-Host "  [$i] name=$($p.name) type=$($p.type) price=$($p.estimatedPriceEur) start=$($p.startTime)"
}
