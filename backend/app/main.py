import io
import re
import json
import base64
import logging
import threading
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token Usage Persistence
# ---------------------------------------------------------------------------

TOKEN_USAGE_FILE = Path(__file__).parent.parent / "token_usage.json"
DAILY_LIMIT = 1_500_000  # Gemini 무료 플랜 일일 한도
_token_lock = threading.Lock()


def _load_token_usage() -> dict:
    if TOKEN_USAGE_FILE.exists():
        try:
            return json.loads(TOKEN_USAGE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_token_usage(data: dict) -> None:
    TOKEN_USAGE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def record_token_usage(total_tokens: int) -> None:
    """오늘 날짜의 누적 토큰 사용량을 token_usage.json에 기록합니다."""
    today = date.today().isoformat()
    with _token_lock:
        data = _load_token_usage()
        day = data.setdefault(today, {"total_requests": 0, "total_tokens": 0})
        day["total_requests"] += 1
        day["total_tokens"] += total_tokens
        _save_token_usage(data)

import pdfplumber
import google.generativeai as genai
import httpx
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    gemini_api_key: str
    outline_api_url: str
    outline_api_key: str
    outline_collection_id: str
    jira_base_url: str
    jira_email: str
    jira_api_token: str
    figma_access_token: str
    cors_origins: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()

genai.configure(api_key=settings.gemini_api_key)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="PDF to Outline",
    description="PDF를 업로드하면 Outline 문서를 생성하고 Jira 이슈에 링크 댓글을 등록합니다.",
    version="0.1.0",
)

_cors_origins = [o.strip() for o in settings.cors_origins.split(",")]
for _extra in ("http://localhost:5173", "http://127.0.0.1:5173"):
    if _extra not in _cors_origins:
        _cors_origins.append(_extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ProcessRequest(BaseModel):
    jira_issue_key: str  # e.g. "PROJ-123"


class TokenUsage(BaseModel):
    prompt_token_count: int
    candidates_token_count: int
    total_token_count: int


class TokenUsageResponse(BaseModel):
    date: str
    today_requests: int
    today_tokens: int
    today_limit_percent: float  # 일일 한도 대비 %
    total_requests: int         # 전체 누적
    total_tokens: int           # 전체 누적


class ProcessResponse(BaseModel):
    outline_document_url: str
    jira_comment_id: str
    title: str
    token_usage: TokenUsage | None = None


class CollectionItem(BaseModel):
    id: str
    name: str


class FigmaProcessRequest(BaseModel):
    figma_url: str
    jira_issue_key: str
    collection_id: str | None = None


class TestJiraRequest(BaseModel):
    jira_issue_key: str
    message: str
    title: str = ""
    url: str = ""


class TestJiraResponse(BaseModel):
    jira_comment_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_figma_file_key(figma_url: str) -> str:
    """Figma URL에서 file key를 추출합니다.
    지원 형식:
      https://www.figma.com/file/XXXXXX/...
      https://www.figma.com/design/XXXXXX/...
    """
    match = re.search(r"figma\.com/(?:file|design)/([A-Za-z0-9]+)", figma_url)
    if not match:
        raise ValueError(f"유효한 Figma URL이 아닙니다: {figma_url}")
    return match.group(1)


async def fetch_figma_file(file_key: str) -> dict:
    """Figma REST API로 파일 데이터를 가져옵니다."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.figma.com/v1/files/{file_key}",
            headers={"X-Figma-Token": settings.figma_access_token},
            timeout=30,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Figma API error: {resp.text}")
    return resp.json()


def extract_figma_text(figma_data: dict) -> str:
    """Figma 파일 데이터에서 페이지명, 프레임명, 텍스트 노드를 추출합니다."""
    lines: list[str] = []

    def _walk(node: dict, depth: int = 0) -> None:
        node_type = node.get("type", "")
        name = node.get("name", "").strip()

        if node_type == "CANVAS":          # 페이지
            lines.append(f"\n[페이지] {name}")
        elif node_type == "FRAME":         # 프레임
            prefix = "  " * depth
            lines.append(f"{prefix}[프레임] {name}")
        elif node_type == "TEXT":          # 텍스트 노드
            chars = node.get("characters", "").strip()
            if chars:
                prefix = "  " * depth
                lines.append(f"{prefix}- {chars}")

        for child in node.get("children", []):
            _walk(child, depth + 1)

    for page in figma_data.get("document", {}).get("children", []):
        _walk(page)

    return "\n".join(lines)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n\n".join(pages)


def generate_outline_with_gemini(pdf_text: str) -> dict:
    """Returns {"title": ..., "markdown": ..., "token_usage": TokenUsage}"""
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = (
        "아래 PDF 내용을 분석하여 개발자가 바로 이해할 수 있는 한국어 문서를 작성해 주세요.\n"
        "불필요한 내용은 제거하고 핵심만 명확하게 정리하세요.\n\n"
        "응답은 반드시 아래 형식을 따르세요:\n\n"
        "TITLE: <PDF 내용 기반으로 자동 생성한 문서 제목>\n\n"
        "## 문서 개요\n"
        "<전체 내용을 2~3줄로 요약>\n\n"
        "## 주요 내용\n"
        "<핵심 내용을 의미 단위 섹션(### 소제목)으로 나눠 정리>\n\n"
        "## 참고사항\n"
        "<기타 메모, 제약사항, 주의할 점 등 — 없으면 이 섹션은 생략>\n\n"
        "---\n"
        f"{pdf_text[:12000]}"
    )
    response = model.generate_content(prompt)
    raw = response.text.strip()

    title = "Untitled Document"
    body = raw
    if raw.startswith("TITLE:"):
        first_line, _, rest = raw.partition("\n")
        title = first_line.removeprefix("TITLE:").strip()
        body = rest.strip()

    # 토큰 사용량 추출 및 로깅
    usage = response.usage_metadata
    token_usage = TokenUsage(
        prompt_token_count=usage.prompt_token_count,
        candidates_token_count=usage.candidates_token_count,
        total_token_count=usage.total_token_count,
    )
    logger.info(
        "Gemini token usage — prompt: %d, candidates: %d, total: %d",
        token_usage.prompt_token_count,
        token_usage.candidates_token_count,
        token_usage.total_token_count,
    )

    return {"title": title, "markdown": body, "token_usage": token_usage}


async def create_outline_document(title: str, markdown: str, collection_id: str | None = None) -> str:
    """Creates a document in Outline and returns its public URL."""
    headers = {
        "Authorization": f"Bearer {settings.outline_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "title": title,
        "text": markdown,
        "collectionId": collection_id or settings.outline_collection_id,
        "publish": True,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.outline_api_url}/documents.create",
            json=payload,
            headers=headers,
            timeout=30,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Outline API error: {resp.text}")
    data = resp.json()
    raw_url = data["data"]["url"]  # e.g. "/doc/..."

    # raw_url이 상대경로인 경우 OUTLINE_API_URL의 origin(scheme+host)을 붙여 완전한 URL로 만든다
    if raw_url.startswith("/"):
        parsed = urlparse(settings.outline_api_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        return f"{origin}{raw_url}"

    return raw_url


def _jira_auth_headers() -> dict[str, str]:
    token = base64.b64encode(
        f"{settings.jira_email}:{settings.jira_api_token}".encode()
    ).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


def _build_adf_body(message: str, title: str, url: str) -> dict:
    """
    ADF 구조:
      📄 PDF → Outline 문서가 생성되었습니다.
      제목: {title}
      링크: {url}  ← link mark로 클릭 가능한 하이퍼링크
    """
    content = [
        # 첫 번째 줄: 고정 헤더 메시지
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": message}],
        },
    ]

    if title:
        content.append({
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "제목: ", "marks": [{"type": "strong"}]},
                {"type": "text", "text": title},
            ],
        })

    if url:
        content.append({
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "링크: ", "marks": [{"type": "strong"}]},
                {
                    "type": "text",
                    "text": url,
                    "marks": [{"type": "link", "attrs": {"href": url}}],
                },
            ],
        })

    return {"type": "doc", "version": 1, "content": content}


async def _post_jira_comment(issue_key: str, body: str, title: str = "", url: str = "") -> str:
    """Posts a comment to a Jira issue in ADF format and returns the comment ID."""
    adf_body = _build_adf_body(body, title, url)
    jira_url = f"{settings.jira_base_url}/rest/api/3/issue/{issue_key}/comment"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            jira_url, json={"body": adf_body}, headers=_jira_auth_headers(), timeout=30
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Jira API error: {resp.text}")
    return resp.json()["id"]


async def add_jira_comment(
    issue_key: str,
    document_url: str,
    title: str,
    header: str = "📄 PDF → Outline 문서가 생성되었습니다.",
) -> str:
    """Adds a document-link comment to a Jira issue and returns the comment ID."""
    return await _post_jira_comment(
        issue_key,
        body=header,
        title=title,
        url=document_url,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "version": app.version}


@app.get("/token-usage", response_model=TokenUsageResponse, tags=["Health"])
def get_token_usage():
    """날짜별 누적 토큰 사용량을 반환합니다."""
    today = date.today().isoformat()
    data = _load_token_usage()

    today_data = data.get(today, {"total_requests": 0, "total_tokens": 0})
    today_tokens = today_data["total_tokens"]

    all_requests = sum(v["total_requests"] for v in data.values())
    all_tokens = sum(v["total_tokens"] for v in data.values())

    return TokenUsageResponse(
        date=today,
        today_requests=today_data["total_requests"],
        today_tokens=today_tokens,
        today_limit_percent=round(today_tokens / DAILY_LIMIT * 100, 2),
        total_requests=all_requests,
        total_tokens=all_tokens,
    )


@app.get("/collections", response_model=list[CollectionItem], tags=["Outline"])
async def get_collections():
    """Outline의 컬렉션 목록을 반환합니다."""
    headers = {
        "Authorization": f"Bearer {settings.outline_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.outline_api_url}/collections.list",
            json={"limit": 100},
            headers=headers,
            timeout=15,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Outline API error: {resp.text}")
    data = resp.json()
    return [
        CollectionItem(id=c["id"], name=c["name"])
        for c in data.get("data", [])
    ]


@app.post("/test-jira", response_model=TestJiraResponse, tags=["Test"])
async def test_jira(req: TestJiraRequest):
    """Jira 연동만 단독으로 테스트합니다. Gemini·Outline 없이 지정 이슈에 댓글을 등록합니다."""
    comment_id = await _post_jira_comment(req.jira_issue_key, req.message, req.title, req.url)
    return TestJiraResponse(jira_comment_id=comment_id)


@app.post("/process-figma", response_model=ProcessResponse, tags=["Figma"])
async def process_figma(req: FigmaProcessRequest):
    """Figma 파일을 분석해 Outline 문서를 생성하고 Jira 이슈에 댓글을 등록합니다."""
    # 1. Figma file key 추출
    try:
        file_key = extract_figma_file_key(req.figma_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Figma API로 파일 데이터 조회
    figma_data = await fetch_figma_file(file_key)

    # 3. 텍스트 추출
    figma_text = extract_figma_text(figma_data)
    if not figma_text.strip():
        raise HTTPException(status_code=422, detail="Figma 파일에서 텍스트를 추출할 수 없습니다.")

    # 4. Gemini로 Outline 마크다운 생성
    try:
        result = generate_outline_with_gemini(figma_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API 오류: {e}")

    # 5. Outline 문서 생성
    document_url = await create_outline_document(result["title"], result["markdown"], req.collection_id)

    # 6. Jira 댓글 등록
    comment_id = await add_jira_comment(
        req.jira_issue_key, document_url, result["title"],
        header="🎨 Figma → Outline 문서가 생성되었습니다.",
    )

    return ProcessResponse(
        outline_document_url=document_url,
        jira_comment_id=comment_id,
        title=result["title"],
        token_usage=result["token_usage"],
    )


@app.post("/process-figma-mock", response_model=ProcessResponse, tags=["Test"])
async def process_figma_mock(req: FigmaProcessRequest):
    """Figma API로 파일 정보를 가져오되 Gemini 없이 Mock 마크다운으로 Outline·Jira를 테스트합니다."""
    # 1. Figma file key 추출
    try:
        file_key = extract_figma_file_key(req.figma_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Figma API 실제 호출
    figma_data = await fetch_figma_file(file_key)

    # 3. 파일명 + 페이지명 추출
    figma_file_name = figma_data.get("name", file_key)
    page_names = ", ".join(
        page.get("name", "")
        for page in figma_data.get("document", {}).get("children", [])
        if page.get("name")
    ) or "없음"

    title = f"[Figma] {figma_file_name}"
    markdown = f"## Figma 문서\n파일명: {figma_file_name}\n페이지: {page_names}"

    # 4. Outline 문서 생성
    document_url = await create_outline_document(title, markdown, req.collection_id)

    # 5. Jira 댓글 등록
    comment_id = await add_jira_comment(
        req.jira_issue_key, document_url, title,
        header="🎨 Figma → Outline 문서가 생성되었습니다.",
    )

    return ProcessResponse(
        outline_document_url=document_url,
        jira_comment_id=comment_id,
        title=title,
        token_usage=None,
    )


@app.post("/process-mock", response_model=ProcessResponse, tags=["Test"])
async def process_pdf_mock(
    file: UploadFile = File(..., description="업로드할 PDF 파일"),
    jira_issue_key: str = Form(..., description="댓글을 달 Jira 이슈 키 (예: PROJ-123)"),
    collection_id: str | None = Form(None, description="Outline 컬렉션 ID (미입력 시 기본값 사용)"),
):
    """PDF 파싱·Gemini 없이 Mock 데이터로 Outline 문서 생성 및 Jira 댓글 등록을 테스트합니다."""
    title = f"테스트 문서 - {file.filename}"
    markdown = "## 테스트\n이것은 Mock 테스트입니다."

    document_url = await create_outline_document(title, markdown, collection_id)
    comment_id = await add_jira_comment(jira_issue_key, document_url, title)

    return ProcessResponse(
        outline_document_url=document_url,
        jira_comment_id=comment_id,
        title=title,
        token_usage=None,
    )


@app.post("/process", response_model=ProcessResponse, tags=["PDF Processing"])
async def process_pdf(
    file: UploadFile = File(..., description="업로드할 PDF 파일"),
    jira_issue_key: str = Form(..., description="댓글을 달 Jira 이슈 키 (예: PROJ-123)"),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")

    file_bytes = await file.read()
    logger.info("[PDF] 파일명: %s | 크기: %.1f KB", file.filename, len(file_bytes) / 1024)

    # 1. PDF 텍스트 추출
    try:
        pdf_text = extract_text_from_pdf(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF 파싱 오류: {e}")

    if not pdf_text.strip():
        raise HTTPException(status_code=422, detail="PDF에서 텍스트를 추출할 수 없습니다.")

    # 2. Gemini로 Outline 생성
    try:
        result = generate_outline_with_gemini(pdf_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API 오류: {e}")

    if result["token_usage"]:
        u = result["token_usage"]
        logger.info(
            "[Gemini] 입력: %d 토큰 | 출력: %d 토큰 | 총: %d 토큰",
            u.prompt_token_count,
            u.candidates_token_count,
            u.total_token_count,
        )
        record_token_usage(u.total_token_count)

    # 3. Outline 문서 생성
    document_url = await create_outline_document(result["title"], result["markdown"])

    # 4. Jira 댓글 등록
    comment_id = await add_jira_comment(jira_issue_key, document_url, result["title"])

    return ProcessResponse(
        outline_document_url=document_url,
        jira_comment_id=comment_id,
        title=result["title"],
        token_usage=result["token_usage"],
    )
