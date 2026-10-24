# ESCALATION ROOM — AI 피드백 논문 리뷰 웹앱

온라인 박사과정 논문 리뷰용 **실시간 멀티플레이 웹앱**입니다. Phung et al. (2026), *Closing the Loop: An Instructor-in-the-Loop AI Assistance System for Supporting Student Help-Seeking in Programming Education*의 연구 주제를 기반으로 기획한 교육용 가상 사례입니다. 게임의 학생 4명은 논문에 등장하는 실제 연구 참여자가 아닙니다.

## 포함된 기능

- **교수자 모드:** 비밀번호 인증, 6자리 룸 생성, THINK ROOM 문항 5개 전환, 실시간 집계, ESCALATION 단계 전환, 학습자별 선택 및 이유 확인, '최고' 투표 결과, 대표 발표자 4명, 마무리 슬라이드.
- **참여자 모드:** 코드로 입장, 공개된 THINK ROOM 객관식 질문에 응답 및 변경, 마지막 학생 4명 선택, 확신도·이유 제출, 판단 기준 직접 확인, 다른 교사의 의견 열람, 학생별 최고 1표 투표(자기투표 불가).
- **실시간:** Socket.IO를 통한 서버 기반 동기화. 전체 집계 및 결과 화면은 관리자 소켓에만 전송됩니다.
- **시각:** 4명 학생 캐릭터 PNG 이미지와 모바일·PC 반응형 UI.

## 실행법

Node.js 18 이상이 필요합니다. 프로젝트 폴더에서:

```bash
npm install
```

macOS/Linux:
```bash
ADMIN_PASSWORD='여기에_강력한_비밀번호' npm start
```

Windows PowerShell:
```powershell
$env:ADMIN_PASSWORD='여기에_강력한_비밀번호'
npm start
```

브라우저에서 `http://localhost:3000`에 접속합니다.

1. 발표자: **교수자 모드 → 관리자 비밀번호 → 새 수업 만들기**를 선택합니다.
2. 발급된 6자리 룸 코드를 참여자에게 공유합니다.
3. 다른 참여자들은 서버 주소와 룸 코드로 입장합니다.
4. 발표 초기 THINK ROOM 문항을 선택하여 응답을 받고 **THINK 결과**에서 확인합니다.
5. 발표 마지막에 **학생 선택 및 이유 제출 시작**을 눌러 미션을 엽니다.
6. 충분한 응답을 받은 후 **의견 게시판 · 최고 투표 시작**을 누릅니다.
7. 참가자에게는 의견만, 교수자에게는 **모두의 선택 결과**, **대표 발표**, **최종 정리**가 나타납니다.

## 실제 온라인 수업에 배포

로컬 PC의 `localhost` 주소는 다른 선생님들이 직접 접속할 수 없습니다. Render, Railway, 또는 Node.js/Socket.IO를 지원하는 웹 서버에 이 프로젝트를 올려야 합니다.

- 시작 명령: `npm start`
- 환경변수: `ADMIN_PASSWORD` (반드시 지정)
- 포트: 호스팅이 제공하는 `PORT` 사용
- 서버 데이터: `sessions.json` 저장 (애플리케이션 시작 후 자동 생성). 서버가 재시작하거나 임시 디스크가 초기화될 수 있는 호스팅에서는 **영구 디스크 볼륨**을 추가하세요.
- HTTPS 사용, 관리자 비밀번호를 참여자에게 노출하지 않기
- **한 서버 인스턴스 기준**이며, 여러 인스턴스 분산 운영용 Redis 어댑터는 포함되지 않았습니다.

## 참고 사항

- Node 모듈(`node_modules`)은 ZIP에 포함하지 않습니다. `npm install` 필요.
- 진행 중 서버를 재시작하면 화면 연결은 다시 수립되지만, 영구 디스크가 없다면 기록이 유지되지 않을 수 있습니다.
- 닉네임과 선택 이유를 서버에 저장하므로 실제 수업 전 참가자에게 수집 사실을 알리세요.
- '판단 기준 확인'은 이용자가 직접 태그로 확정합니다(문장 자동분류는 구현하지 않았습니다).
- 연구 결과를 검증하는 실험 도구가 아니라 교육 토론 게임입니다.


## Supabase + Render 지속 저장 (v1.1)

이 버전은 `DATABASE_URL`이 설정되어 있으면 Supabase PostgreSQL에 수업 데이터를 저장하고, 없으면 이전처럼 로컬 `sessions.json`에 저장합니다.

1. Supabase에서 프로젝트를 만들고 데이터베이스 비밀번호를 보관합니다.
2. Supabase 대시보드의 **Connect → Session pooler**에서 PostgreSQL 연결 문자열을 복사합니다. 비밀번호 부분을 데이터베이스 비밀번호로 바꿉니다. 연결 문자열은 절대로 GitHub에 올리지 마세요.
3. GitHub 저장소 최상위의 `server.js`, `package.json`을 이 버전으로 교체하고 Commit 합니다.
4. Render 서비스 → Environment → Add Environment Variable: Key=`DATABASE_URL`, Value=위 연결 문자열. 기존 `ADMIN_PASSWORD`는 유지합니다.
5. Save, rebuild, and deploy 후 Render Logs에서 `Supabase PostgreSQL storage connected`와 `listening on port`가 나타나는지 확인합니다. 테이블 `escalation_state`는 서버가 자동으로 생성합니다.
6. Supabase Table Editor → `public.escalation_state`의 id=1 데이터가 생성되고, 응답 후 updated_at이 바뀌는지 확인합니다.

**보안:** 데이터베이스 연결 문자열은 서버 전용입니다. 참가자에게 공유하거나 `public` 폴더나 GitHub에 넣지 마세요. 참가자 응답에 포함된 닉네임과 이유는 Supabase에 저장됩니다. 수업 전 개인정보 수집을 안내하고 수업 종료 후 필요한 기간만 보관하세요.

**한계:** 단일 Render 앱 인스턴스용 구조입니다. 여러 인스턴스로 확장하지 마세요. Render 무료 서비스는 유휴 상태에서 중지될 수 있으며 실시간 연결이 잠시 끊길 수 있습니다. 데이터는 데이터베이스에 보관되므로 재시작 후에도 남습니다. 데이터베이스 또는 네트워크 장애 시 저장이 실패할 수 있으므로 실제 수업 전에 테스트하세요.
