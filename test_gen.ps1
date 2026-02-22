$body = '{"destination":"Paris, France","startDate":"2026-03-10","endDate":"2026-03-12","companionType":"couple","companionCount":2,"vibes":["romantic","culture"],"travelStyle":"Reasonable","mobilityStyle":"PublicTransit","travelPace":"Moderate","curationFocus":"food","birthDate":"1990-01-01","startTime":"09:00","endTime":"21:00"}'
$start = Get-Date
$result = Invoke-WebRequest -Uri "https://legal-dannye-dbstour-4e6b86d5.koyeb.app/api/routes/generate" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 60 -UseBasicParsing
$elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
Write-Host "Time: ${elapsed}s / Status: $($result.StatusCode)"
$json = $result.Content | ConvertFrom-Json
Write-Host "Days: $($json.days.Count)"
foreach ($d in $json.days) {
    Write-Host "  Day$($d.day): $($d.theme) - $($d.places.Count) places"
}
$place1 = $json.days[0].places[0]
Write-Host "Place1: $($place1.name) / nameKo=$($place1.nameKo) / type=$($place1.type) / price=EUR$($place1.estimatedPriceEur) / start=$($place1.startTime)"
$meal = $json.days[0].places | Where-Object { $_.type -eq "lunch" -or $_.type -eq "dinner" } | Select-Object -First 1
if ($meal) {
    Write-Host "Meal: $($meal.name) type=$($meal.type) price=EUR$($meal.estimatedPriceEur)"
} else {
    Write-Host "No meal found in day1"
}
