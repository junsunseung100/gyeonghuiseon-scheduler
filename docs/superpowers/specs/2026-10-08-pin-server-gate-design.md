# PIN 서버 잠금장치 (가입 막은 채 PIN만으로) — 설계 (2026-10-08)

문제: PIN 로그인이 '익명 로그인'에 의존 → 익명=가입이라 "가입 허용" 꺼지면 막힘(현재 이메일·비번 화면으로 떨어짐). 또 기존 PIN은 브라우저에서만 검사(약함).

## 목표
- 가입은 계속 막아둠(공개 가입 차단 유지).
- 원장 경험은 그대로 PIN 4자리만.
- PIN을 **서버에서 검사**(진짜 잠금장치), 비밀번호는 서버에만.

## 방식
1. **공용 계정 1개**를 Supabase에 미리 생성(대시보드 Add user, 가입 꺼져도 가능). email+password.
2. **Vercel 서버 함수 `/api/login`**:
   - 입력 { pin }.
   - `process.env.APP_PIN`과 비교 → 틀리면 401.
   - 맞으면 Supabase `/auth/v1/token?grant_type=password`로 공용 계정 로그인 → access_token·refresh_token 반환.
   - 비번·PIN은 서버 환경변수에만(클라이언트 번들에 없음).
3. **클라이언트**:
   - supabase.ts `loginWithPin(pin)`: POST /api/login → 성공 시 `sb.auth.setSession({access_token, refresh_token})`.
   - boot(): 세션 있으면 그대로, 없으면 PIN 화면.
   - renderPin: PIN 입력 → loginWithPin → 성공 시 reload, 실패 시 "PIN이 맞지 않습니다".
   - 익명 로그인·이메일/비번 로그인 경로 제거.

## Vercel 환경변수(서버, VITE_ 아님)
- APP_PIN(원장 PIN 4자리)
- CLINIC_EMAIL, CLINIC_PASSWORD(공용 계정)
- SUPABASE_URL, SUPABASE_ANON_KEY (없으면 함수에서 VITE_ 값으로 폴백)

## 영향 파일
- 새 `api/login.js`(Vercel 함수).
- supabase.ts: loginWithPin, setSession, (signInAnon/signIn 제거 가능).
- main.ts: boot/render/renderPin 수정, renderLogin·익명 제거.

## 보안
- 가입 차단 유지. PIN이 서버에서 검증되어 틀리면 데이터 접근 세션이 안 나옴 → 기존 '주소+클라PIN'보다 강함.
- 공용 계정 비번은 서버 env에만. anon 키는 원래 공개라 무방.
- (선택 강화 다음) PIN 시도 횟수 제한.

## 수용 기준
- 가입 허용 OFF 상태에서 PIN 맞으면 로그인·데이터 보임, 틀리면 거부.
- 앱 코드/번들에 비번 없음.
