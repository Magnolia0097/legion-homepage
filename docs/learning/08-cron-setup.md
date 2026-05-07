# 08 — cron 등록 가이드

## What

파이프라인 자동 실행을 위한 cron 등록 가이드.
`pipeline/scripts/run.sh`를 30분마다 자동 실행.

---

## Why

- 미니배치 스케줄링 (ADR 003): 비용 $0, 로컬 PC cron으로 충분
- v1은 단순 cron, v2에서 Airflow/Prefect 전환 예정

---

## How (주찬이 직접 실행할 명령)

### WSL2에서 cron 활성화

WSL2는 기본적으로 cron 데몬이 비활성화되어 있음. 한 번만 활성화:

```bash
sudo service cron start
```

부팅 시 자동 시작 위해 `.bashrc`에 추가:

```bash
echo "sudo service cron start 2>/dev/null" >> ~/.bashrc
```

### 스크립트 실행 권한 부여 (최초 1회)

```bash
chmod +x /home/user/legion-homepage/pipeline/scripts/run.sh
```

### crontab 등록

```bash
crontab -e
```

편집기가 열리면 맨 아래에 다음 줄 추가:

```
*/30 * * * * /home/user/legion-homepage/pipeline/scripts/run.sh
```

### 로그 확인

```bash
tail -f /home/user/legion-homepage/pipeline/logs/pipeline_$(date +%Y-%m-%d).log
```

### 등록 확인 / 제거

```bash
crontab -l          # 현재 등록 확인
crontab -e          # 편집기에서 해당 줄 삭제
```

---

## 주의사항

- WSL2/PC가 꺼져있으면 cron 안 돌아감 (Raspberry Pi나 무료 VPS로 이전 가능)
- 첫 등록 후 1시간 동안 로그 수동 확인 권장
- `run.sh`의 `PROJECT_DIR` 경로가 실제 경로와 맞는지 확인

## v2 마이그레이션 옵션

| 옵션 | 비용 | 특징 |
|------|------|------|
| Cloudflare Workers Cron | $0 | HTTP 호출만 가능, Python 불가 |
| Raspberry Pi | 전기비만 | 24/7 온프레미스 |
| Oracle Cloud Free Tier VPS | $0 | ARM VM 2개 영구 무료 |
| GitHub Actions | $0 (월 2000분) | 가장 쉬운 이전 경로 |
