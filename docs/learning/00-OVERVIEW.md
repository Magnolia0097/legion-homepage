# 학습 가이드 — Aion 2 Voice Tracker

## 이 폴더의 목적

프로젝트 완성 후 주찬이 전체 시스템을 복기/학습하기 위한 문서 모음.
작업 중에는 디테일을 보지 않고 완주에 집중했으므로, 이 폴더를 통해
나중에 체계적으로 공부한다.

## 읽는 순서 (권장)

1. [01-architecture.md](01-architecture.md) — 전체 구조 이해
2. [02-database-design.md](02-database-design.md) — Supabase 스키마
3. [03-pipeline-structure.md](03-pipeline-structure.md) — Python 파이프라인
4. [04-crawler-design.md](04-crawler-design.md) — 인벤 크롤링
5. [05-llm-classification.md](05-llm-classification.md) — LLM 분류
6. [06-aggregation-strategy.md](06-aggregation-strategy.md) — 집계
7. [07-frontend-integration.md](07-frontend-integration.md) — 대시보드

## 관련 문서

- [../PROJECT.md](../PROJECT.md) — 프로젝트 개요
- [../decisions/](../decisions/) — 왜 이런 선택을 했는지 (ADR)
- [../journal/](../journal/) — 일별 작업 일지

## 학습 팁

각 문서는 "What → Why → How → 주의사항" 구조로 작성되어 있다.
- What만 읽어도 전체 파악 가능
- Why는 면접 답변 준비에 유용
- How는 실제 코드 구현을 이해할 때 심화

## 관련 용어

[glossary.md](glossary.md)에서 프로젝트 전용 용어 정리.
