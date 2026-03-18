# PDF to Outline

PDF를 업로드하면 Google Gemini AI가 내용을 분석해 **Outline 문서**를 자동 생성하고, 지정한 **Jira 이슈**에 문서 링크 댓글을 등록하는 시스템입니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| PDF 파싱 | `pdfplumber`로 텍스트 추출 |
| AI 문서 생성 | Google Gemini 1.5 Flash로 구조화된 마크다운 생성 |
| Outline 등록 | Outline API로 문서 자동 생성 및 게시 |
| Jira 연동 | 지정 이슈에 문서 링크 댓글 자동 등록 |

## 기술 스택

- **Backend**: Python 3.11+, FastAPI, uvicorn
- **Frontend**: React (예정)
- **PDF 파싱**: pdfplumber
- **AI**: Google Gemini API (`google-generativeai`)
- **문서화**: Outline API
- **이슈 트래킹**: Jira REST API v3

## 폴더 구조

```
pdf-to-outline/
├── backend/
│   ├── app/
│   │   └── main.py        # FastAPI 앱 (라우터, 서비스 로직)
│   ├── requirements.txt
│   └── .env.example       # 환경 변수 템플릿
├── frontend/              # React 앱 (예정)
├── .gitignore
└── README.md
```

## 시작하기

### 1. 환경 변수 설정

```bash
cd backend
cp .env.example .env
# .env 파일을 열어 각 값을 채워주세요
```

| 변수 | 설명 |
|------|------|
| `GEMINI_API_KEY` | Google AI Studio에서 발급 |
| `OUTLINE_API_URL` | Outline 인스턴스 주소 (예: `https://app.getoutline.com/api`) |
| `OUTLINE_API_KEY` | Outline → Settings → API |
| `OUTLINE_COLLECTION_ID` | 문서를 생성할 컬렉션 ID |
| `JIRA_BASE_URL` | `https://your-domain.atlassian.net` |
| `JIRA_EMAIL` | Atlassian 계정 이메일 |
| `JIRA_API_TOKEN` | [Atlassian API Token](https://id.atlassian.com/manage-profile/security/api-tokens) |

### 2. 패키지 설치

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 서버 실행

```bash
uvicorn app.main:app --reload
```

서버가 실행되면 아래 URL에서 확인할 수 있습니다.

- API 문서 (Swagger): http://localhost:8000/docs
- Health Check: http://localhost:8000/health

## API

### `GET /health`

서버 상태를 확인합니다.

```json
{ "status": "ok", "version": "0.1.0" }
```

### `POST /process`

PDF를 처리하고 Outline 문서 생성 및 Jira 댓글을 등록합니다.

**Request** — `multipart/form-data`

| 필드 | 타입 | 설명 |
|------|------|------|
| `file` | File | PDF 파일 |
| `jira_issue_key` | string | Jira 이슈 키 (예: `PROJ-123`) |

**Response**

```json
{
  "outline_document_url": "https://app.getoutline.com/doc/...",
  "jira_comment_id": "10001",
  "title": "생성된 문서 제목"
}
```

## 라이선스

MIT
