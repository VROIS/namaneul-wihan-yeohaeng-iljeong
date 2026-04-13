#!/bin/bash
# ⚠️ 수정금지(승인필요) — Metro 시작 전 자동 정리 스크립트
# 포트 8081 좀비 프로세스 정리 + 캐시 삭제

PORT=8081

# 1. 포트 8081 점유 프로세스 자동 정리
PIDS=$(node -e "
const fs = require('fs');
const target = (${PORT}).toString(16).toUpperCase().padStart(4,'0');
const lines = fs.readFileSync('/proc/net/tcp6','utf8').split('\n').slice(1);
const inodes = [];
for (const line of lines) {
  const p = line.trim().split(/\s+/);
  if (!p[1]) continue;
  if (p[1].split(':')[1] === target) inodes.push(p[9]);
}
if (inodes.length === 0) process.exit(0);
const procs = fs.readdirSync('/proc').filter(p => /^\d+$/.test(p));
const pids = new Set();
for (const pid of procs) {
  try {
    const fds = fs.readdirSync('/proc/'+pid+'/fd');
    for (const fd of fds) {
      const link = fs.readlinkSync('/proc/'+pid+'/fd/'+fd);
      for (const inode of inodes) {
        if (link.includes('socket:['+inode+']')) pids.add(pid);
      }
    }
  } catch(e) {}
}
console.log([...pids].join(' '));
" 2>/dev/null)

if [ -n "$PIDS" ]; then
  echo "[clean-metro] 포트 ${PORT} 점유 프로세스 정리: $PIDS"
  for pid in $PIDS; do
    kill -9 "$pid" 2>/dev/null
  done
  sleep 1
else
  echo "[clean-metro] 포트 ${PORT} 사용 가능"
fi

# 2. Metro 캐시 삭제
rm -rf /tmp/metro-* node_modules/.cache 2>/dev/null
echo "[clean-metro] 준비 완료"
