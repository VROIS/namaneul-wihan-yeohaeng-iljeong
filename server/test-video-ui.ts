
export function getTestVideoHtml(): string {
    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedance Video Generation Test</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f0f2f5; }
        .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #1a1a1a; }
        .input-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: 500; }
        input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        button { background: #6366f1; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #4f46e5; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        #status-area { margin-top: 20px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; display: none; }
        .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .status-processing { background: #dbeafe; color: #1e40af; }
        .status-succeeded { background: #dcfce7; color: #166534; }
        .status-failed { background: #fee2e2; color: #991b1b; }
        video { width: 100%; border-radius: 8px; margin-top: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🎬 Seedance 영상 생성 테스트</h1>
        <p style="color: #666; margin-bottom: 24px;">일정 ID를 입력하고 영상 생성을 요청하세요.</p>
        
        <div class="input-group">
            <label for="itineraryId">일정 ID (Itinerary ID)</label>
            <input type="number" id="itineraryId" value="5" placeholder="DB에 존재하는 일정 ID 입력">
        </div>

        <button id="generateBtn" onclick="startGeneration()">영상 생성 요청</button>

        <div id="status-area">
            <div id="statusBadge" class="status-badge status-pending">READY</div>
            <div id="message"></div>
            <div id="videoContainer"></div>
            <div id="logs" style="margin-top: 16px;"></div>
        </div>
    </div>

    <script>
        let pollingInterval = null;

        function log(msg) {
            const logs = document.getElementById('logs');
            logs.innerHTML = \`<div>[\${new Date().toLocaleTimeString()}] \${msg}</div>\` + logs.innerHTML;
        }

        async function startGeneration() {
            const id = document.getElementById('itineraryId').value;
            const btn = document.getElementById('generateBtn');
            const statusArea = document.getElementById('status-area');
            const statusBadge = document.getElementById('statusBadge');
            
            if (!id) return alert('일정 ID를 입력해주세요.');

            btn.disabled = true;
            statusArea.style.display = 'block';
            statusBadge.className = 'status-badge status-processing';
            statusBadge.innerText = 'REQUESTING...';
            document.getElementById('videoContainer').innerHTML = '';
            
            log('영상 생성 요청 중...');

            try {
                const res = await fetch(\`/api/itineraries/\${id}/video/generate\`, { method: 'POST' });
                const data = await res.json();

                if (data.success) {
                    log(`요청 성공! 상태: ${ data.status } `);
                    statusBadge.innerText = data.status.toUpperCase();
                    statusBadge.className = 'status-badge status-pending';
                    
                    // 메시지 표시
                    if (data.message) {
                        document.getElementById('message').innerText = data.message;
                        log(data.message);
                    }
                    
                    startPolling(id);
                } else {
                    throw new Error(data.error || 'Unknown error');
                }
            } catch (err) {
                log(\`Error: \${err.message}\`);
                btn.disabled = false;
                statusBadge.innerText = 'FAILED';
                statusBadge.className = 'status-badge status-failed';
            }
        }

        function startPolling(id) {
            if (pollingInterval) clearInterval(pollingInterval);
            
            const statusBadge = document.getElementById('statusBadge');
            const videoContainer = document.getElementById('videoContainer');
            const btn = document.getElementById('generateBtn');

            log('상태 조회 시작 (Polling)...');

            pollingInterval = setInterval(async () => {
                try {
                    const res = await fetch(\`/api/itineraries/\${id}/video\`);
                    const data = await res.json();

                    statusBadge.innerText = data.status.toUpperCase();
                    
                    if (data.status === 'succeeded') {
                        clearInterval(pollingInterval);
                        statusBadge.className = 'status-badge status-succeeded';
                        log(\`영상 생성 완료! URL: \${data.videoUrl}\`);
                        
                        videoContainer.innerHTML = \`
                            <video controls autoplay>
                                <source src="\${data.videoUrl}" type="video/mp4">
                                브라우저가 비디오를 지원하지 않습니다.
                            </video>
                            <p><a href="\${data.videoUrl}" target="_blank">영상 다운로드</a></p>
                        \`;
                        btn.disabled = false;
                    } else if (data.status === 'failed') {
                        clearInterval(pollingInterval);
                        statusBadge.className = 'status-badge status-failed';
                        log('영상 생성 실패.');
                        btn.disabled = false;
                    } else {
                        // pending or processing
                         statusBadge.className = 'status-badge status-processing';
                         if (data.message) {
                            document.getElementById('message').innerText = data.message;
                         }
                    }
                } catch (err) {
                    console.error(err);
                }
            }, 3000);
        }
    </script>
</body>
</html>
  `;
}
