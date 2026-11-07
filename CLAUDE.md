# Clevon Lasso

시각 피드백 도구. 구조와 사용법은 README.md.

- `main` 에서 작업한다. 브랜치를 새로 만들지 않는다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다.
- 소스를 고치면 `pnpm build` 로 `plugins/lasso/skills/lasso/bin/` 을 갱신하고 함께 커밋한다. 플러그인 사용자는 빌드하지 않는다.
- 플러그인을 바꿔 배포할 때는 `plugins/lasso/.claude-plugin/plugin.json` 과 `.claude-plugin/marketplace.json` 의 version 을 같이 올린다.
- 피드백 UI 는 Clevon Lander 의 피드백 도구와 같은 화면을 유지한다.
