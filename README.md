# 빛소리 (Bitsori)

사진의 픽셀을 음악으로, 음악을 다시 픽셀로.

- **웹 스튜디오** (`apps/web`): 사진 업로드, 세밀한 설정, MIDI → 사진 변환, PNG(설정 포함)·MIDI 저장
- **카메라 앱** (`apps/mobile`): 찍으면 바로 노래가 된다. 필터, 보관함, 유료 필터 결제 시트 (Capacitor → iOS/Android)
- **공통 엔진** (`packages/*`): 웹과 앱이 같은 코드로 변환한다. 같은 사진과 같은 설정이면 같은 노래가 나온다.

제품 문서: [docs/PRD.md](docs/PRD.md) · 이름 검토: [docs/naming.md](docs/naming.md)

## 구조

```
apps/
  web/        웹 스튜디오 (Vite + TypeScript)
  mobile/     카메라 앱 (Vite + TypeScript → Capacitor)
packages/
  core/       변환 엔진 — 이미지↔악보, 음악 필터·반주, MIDI 읽기/쓰기, PNG 메타정보 (DOM 없음, Node 테스트)
  audio/      재생기 — 악보 + 필터 반주 재생 (Tone.js), 악기 목록, 피아노 샘플(직접 호스팅)
  browser/    브라우저 공용 — 이미지 읽기·저장, 재생 위치 그리기, 유료 필터 이용 권한
docs/         PRD, 이름 검토
```

## 시작하기

Node 20 이상과 pnpm 10이 필요하다.

```bash
pnpm install
pnpm dev:web       # http://localhost:5173
pnpm dev:mobile    # https://localhost:5174 (휴대폰은 같은 와이파이에서 https://<PC IP>:5174, 인증서 경고는 허용)
pnpm test          # 엔진 테스트 (왕복 변환·필터·golden)
pnpm typecheck
pnpm build
```

- 웹은 모든 필터를 무료로 연다. 앱의 결제는 개발용(누르면 바로 구매 처리)이다.

## 변환 규칙 요약

| 항목 | 규칙 |
|---|---|
| 밝기 → 음 | `0.299R + 0.587G + 0.114B`. 밝을수록 높은 음. 음역 안에서 **필터의 음계에 속한 음**에 고르게 배정 |
| 화음 | 줄(가로 방향이면 행, 세로 방향이면 열)을 N개씩 묶어 한 칸 = N음 화음 |
| 쉼표 | 기준보다 어둡거나, 지정한 쉼표 색과 비슷하거나, 투명한 픽셀 |
| 이음 | 같은 줄에서 같은 음이 이어지면 한 음으로 길게 |
| 필터 | 음계 종류 + 반주 스타일 + 추천 설정. 원본·팝은 무료, 로파이·몽환·오르골·시네마는 앱에서 유료 (웹은 모두 무료) |
| 사진이 정하는 것 | 조(주된 색), 장·단조(밝기·따뜻함), 빠르기 ±15%와 드럼 밀도(복잡함), 코드 진행(멜로디에 맞춘 자동 화성), 음 세기(채도) |
| 필터 강도 | 0~100%. 낮을수록 반주가 작아지고 사진 고유의 화성이 살아난다 |
| 메타정보 | PNG 내부 텍스트 영역(iTXt, 키워드 `bitsori`)과 MIDI 텍스트 이벤트(`bitsori:{…}`)에 설정을 JSON으로 저장 |

자세한 내용은 PRD의 부록과 `packages/core/src`의 주석에 있다.

**결과가 같은지 확인하는 기준 테스트**: 변환 규칙을 바꾸면 `packages/core/test/golden.test.ts`의 스냅샷이 깨진다. 의도한 변경일 때만 `pnpm --filter @bitsori/core exec vitest run -u`로 갱신한다.

## 앱 (Capacitor)

```bash
cd apps/mobile
pnpm exec cap add ios        # 처음 한 번 (Xcode 필요)
pnpm exec cap add android    # 처음 한 번 (Android Studio 필요)
pnpm cap:sync                # 웹 빌드 → 네이티브 프로젝트에 반영
pnpm cap:ios                 # Xcode 열기
```

iOS는 `ios/App/App/Info.plist`에 카메라 권한 문구(`NSCameraUsageDescription`)와 사진 보관함 저장 문구(`NSPhotoLibraryAddUsageDescription`)를 넣어야 한다.

### 남은 일

- 스토어 인앱 결제 연동: `packages/browser/src/entitlements.ts`의 `PurchaseProvider`를 구현해 `apps/mobile/src/main.ts`의 `DevPurchaseProvider`를 교체한다.
- 앱 고급 설정 화면, 영상 공유, 라이브 모드 (PRD 7.3)

## 라이선스·출처

피아노 소리: Salamander Grand Piano V3 by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) (`packages/audio/samples/ATTRIBUTION.md`)
