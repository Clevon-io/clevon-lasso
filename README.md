# Clevon Lasso

보고 있는 웹 화면에서 요소를 찍거나 영역을 끌어 코멘트를 남기면, Claude Code 세션이 바로 받아 고친다.
Clevon Lander 의 시각 피드백 도구를 떼어 내 어느 프로젝트에서나 쓰게 만든 것이다.

두 가지로 쓴다.

- **Claude Code 플러그인** — 개발 중인 프로젝트에 아무것도 설치하지 않고 피드백을 주고받는다.
- **라이브러리 `@clevon/lasso`** — Share 같은 서비스가 자기 화면에 피드백 도구를 붙이고, 받은 피드백을 직접 처리한다.

## 플러그인

### 설치

```bash
claude plugin marketplace add Clevon-io/clevon-lasso
claude plugin install lasso@clevon-lasso
```

Claude Code 를 다시 시작하면 `/lasso` 가 잡힌다. 조건은 clevon-skills 와 같다(`Clevon-io` 조직 멤버, git 이 private 저장소를 clone 할 수 있을 것). Node 20 이상이 필요하다.

### 쓰기

프로젝트 폴더에서 Claude Code 에 `/lasso 3000` 처럼 개발 서버 포트를 알려 준다.

1. 세션이 `localhost:3100` 에 중계 서버를 띄운다. 원래 화면 그대로에 피드백 도구만 얹혀 있고, 코드를 고치면 원래처럼 바로 반영된다.
2. 그 주소에서 요소를 누르거나 끌어 코멘트를 남기고 [N건 보내기]를 누른다. Space 로 둘러보기와 전환한다.
3. 세션이 피드백을 받아 고치고 보고한다.

"잠깐 쉬어"라고 하면 받기만 멈추고, 그동안 보낸 피드백은 다시 켤 때 먼저 처리한다. "꺼줘"라고 하면 중계 서버까지 내린다.

### 업데이트·삭제

```bash
claude plugin marketplace update clevon-lasso
claude plugin update lasso@clevon-lasso

claude plugin uninstall lasso@clevon-lasso
```

프로젝트에는 남는 파일이 없다. 받은 피드백과 스크린샷은 `~/.clevon-lasso/` 아래 프로젝트별 폴더에 쌓이며, 필요 없으면 그 폴더를 지우면 된다.

## 라이브러리

```ts
import { mountLasso } from '@clevon/lasso'

const lasso = mountLasso({
  onSend: async ({ message, images, url, viewport }) => {
    // message: 코멘트들을 묶은 마크다운, images: JPEG data URL 목록
    await saveFeedback({ message, images, url, viewport })
    return true // false 면 모은 코멘트를 지우지 않는다
  },
})

lasso.unmount()
```

`onSend` 대신 `endpoint: '/api/feedback'` 를 주면 같은 내용을 JSON 으로 POST 한다. 도구 UI 는 Shadow DOM 안에 그려 페이지 스타일과 섞이지 않는다. React 페이지에서는 코멘트마다 컴포넌트 이름이 함께 적힌다.

받는 쪽이 Node 라면 `@clevon/lasso/server` 의 `createInbox`·`handleFeedbackRequest` 로 이미지 저장과 수신 기록을 그대로 쓸 수 있다. 빌드 없이 한 줄로 붙이려면 `@clevon/lasso/client.js`(React 포함 단일 파일, 스크립트를 내려준 서버의 `/__lasso/feedback` 으로 보낸다)를 쓴다.

설치는 아직 레지스트리에 올리지 않았으므로 git 의존성으로 받는다.

```json
"@clevon/lasso": "github:Clevon-io/clevon-lasso#path:/packages/lasso"
```

## 개발

```bash
pnpm install
pnpm build        # 패키지 빌드 + 플러그인 스킬 폴더(bin/)에 결과물 복사
pnpm check-types
```

플러그인은 빌드 없이 돌아야 하므로 `plugins/lasso/skills/lasso/bin/` 의 빌드 결과를 함께 커밋한다. 소스를 고쳤으면 `pnpm build` 뒤에 커밋한다.

| 경로 | 내용 |
| --- | --- |
| `packages/lasso/src/core` | 페이지 검사기(요소 선택·영역 선택·캡처·컴포넌트 이름), 직렬화 |
| `packages/lasso/src/ui`, `hooks` | 피드백 UI (Lander 와 같은 화면) |
| `packages/lasso/src/index.tsx` | `mountLasso` — Shadow DOM 에 UI 를 붙인다 |
| `packages/lasso/src/server` | 수신함, 중계 서버(HTML 에 도구 스크립트 주입, WebSocket 통과) |
| `packages/lasso/src/cli.ts` | `lasso <포트>`, `lasso watch`, `lasso path` |
| `plugins/lasso` | Claude Code 플러그인 |
