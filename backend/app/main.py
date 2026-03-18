import io
import base64
from typing import Optional

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ProcessRequest(BaseModel):
    jira_issue_key: str  # e.g. "PROJ-123"


class ProcessResponse(BaseModel):
    outline_document_url: str
    jira_comment_id: str
    title: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_text_from_pdf(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n\n".join(pages)


def generate_outline_with_gemini(pdf_text: str) -> dict[str, str]:
    """Returns {"title": ..., "markdown": ...}"""
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = (
        "다음 PDF 내용을 분석하여 구조화된 Outline 문서를 작성해 주세요.\n"
        "응답은 반드시 아래 형식을 따르세요:\n\n"
        "TITLE: <문서 제목>\n\n"
        "<마크다운 본문>\n\n"
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

    return {"title": title, "markdown": body}


async def create_outline_document(title: str, markdown: str) -> str:
    """Creates a document in Outline and returns its public URL."""
    headers = {
        "Authorization": f"Bearer {settings.outline_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "title": title,
        "text": markdown,
        "collectionId": settings.outline_collection_id,
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
    return data["data"]["url"]


async def add_jira_comment(issue_key: str, document_url: str, title: str) -> str:
    """Adds a comment to a Jira issue and returns the comment ID."""
    token = base64.b64encode(
        f"{settings.jira_email}:{settings.jira_api_token}".encode()
    ).decode()
    headers = {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
    }
    body = (
        f"📄 *PDF → Outline 문서가 생성되었습니다.*\n\n"
        f"*제목:* {title}\n"
        f"*링크:* {document_url}"
    )
    payload = {"body": body}
    url = f"{settings.jira_base_url}/rest/api/3/issue/{issue_key}/comment"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=headers, timeout=30)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Jira API error: {resp.text}")
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "version": app.version}


@app.post("/process", response_model=ProcessResponse, tags=["PDF Processing"])
async def process_pdf(
    file: UploadFile = File(..., description="업로드할 PDF 파일"),
    jira_issue_key: str = Form(..., description="댓글을 달 Jira 이슈 키 (예: PROJ-123)"),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")

    file_bytes = await file.read()

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

    # 3. Outline 문서 생성
    document_url = await create_outline_document(result["title"], result["markdown"])

    # 4. Jira 댓글 등록
    comment_id = await add_jira_comment(jira_issue_key, document_url, result["title"])

    return ProcessResponse(
        outline_document_url=document_url,
        jira_comment_id=comment_id,
        title=result["title"],
    )
