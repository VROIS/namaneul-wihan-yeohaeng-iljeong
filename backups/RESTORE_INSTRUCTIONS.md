# 복구 방법 (= 만약 필요 시)

## 백업 파일
- backups/place_seed_raw_pre_drop43_2026-05-12.json

## 컬럼 추가 + 데이터 복구 SQL

```sql
-- 1. 컬럼 추가
ALTER TABLE place_seed_raw ADD COLUMN <컬럼명> <타입>;

-- 2. 데이터 UPDATE
UPDATE place_seed_raw SET <컬럼명> = <값> WHERE id = <id>;
```

## Node 자동 복구 스크립트 (= 필요 시 작성)
```js
const backup = JSON.parse(fs.readFileSync('backups/place_seed_raw_pre_drop43_2026-05-12.json'));
for (const [col, rows] of Object.entries(backup.data_by_column)) {
  await db.query(`ALTER TABLE place_seed_raw ADD COLUMN ${col} <type>`);
  for (const r of rows) {
    await db.query(`UPDATE place_seed_raw SET ${col} = $1 WHERE id = $2`, [r[col], r.id]);
  }
}
```
