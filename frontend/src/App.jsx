import { useState, useRef, useEffect, Fragment } from "react";

const BASE_URL = import.meta.env.VITE_API_URL;

const STATUS = { IDLE: "idle", LOADING: "loading", SUCCESS: "success", ERROR: "error" };
const TAB = { PDF: "pdf", FIGMA: "figma" };

const STEPS = [
  { id: 1, label: "소스 업로드" },
  { id: 2, label: "AI 분석" },
  { id: 3, label: "문서 생성" },
  { id: 4, label: "Jira 등록" },
];

const LOADING_MESSAGES = {
  [TAB.PDF]: [
    "PDF를 분석하고 있어요...",
    "AI가 문서를 생성하고 있어요...",
    "Outline에 업로드하는 중...",
    "Jira에 등록하는 중...",
  ],
  [TAB.FIGMA]: [
    "Figma 파일을 불러오는 중...",
    "AI가 문서를 생성하고 있어요...",
    "Outline에 업로드하는 중...",
    "Jira에 등록하는 중...",
  ],
};

// ─── 아이콘 ────────────────────────────────────────────────────────────────

function IconDoc({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconUpload({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}

function IconCheck({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconX({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconLink({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function IconJira({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 11.429 6.286 6.143a.571.571 0 0 0-.81 0L1.714 9.904a.571.571 0 0 0 0 .81l3.762 3.762L11.57 20.57a.571.571 0 0 0 .81 0l3.762-3.762a.571.571 0 0 0 0-.81l-4.571-4.57Zm.857-10.286a.571.571 0 0 0-.81 0l-3.761 3.762a.571.571 0 0 0 0 .81l4.571 4.571 4.571-4.571a.571.571 0 0 0 0-.81L12.43 1.143Z" />
    </svg>
  );
}

function IconWarning({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

// ─── 스텝바 ────────────────────────────────────────────────────────────────

function StepBar({ activeStep }) {
  return (
    <div className="flex items-center w-full mb-8 px-1">
      {STEPS.map((step, idx) => {
        const done = activeStep > step.id;
        const current = activeStep === step.id;
        return (
          <Fragment key={step.id}>
            {/* 원 + 라벨 */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-500
                  ${done ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-200"
                    : current ? "bg-white border-2 border-indigo-500 text-indigo-600 shadow-md shadow-indigo-100"
                    : "bg-white border-2 border-gray-200 text-gray-400"}`}
              >
                {done ? <IconCheck className="w-4 h-4 text-white" /> : step.id}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap transition-colors duration-300
                  ${done || current ? "text-indigo-600" : "text-gray-400"}`}
              >
                {step.label}
              </span>
            </div>
            {/* 연결선 */}
            {idx < STEPS.length - 1 && (
              <div className="flex-1 h-px mx-2 mb-5 transition-all duration-500"
                style={{ background: done ? "linear-gradient(to right, #6366f1, #8b5cf6)" : "#e5e7eb" }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── 로딩 오버레이 ─────────────────────────────────────────────────────────

function LoadingOverlay({ step, tab }) {
  const msgs = LOADING_MESSAGES[tab] ?? LOADING_MESSAGES[TAB.PDF];
  const msg = msgs[Math.min(step - 1, msgs.length - 1)];
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10">
      {/* 스피너 */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center">
          <IconDoc className="w-5 h-5 text-indigo-500" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-800">{msg}</p>
        <p className="text-xs text-gray-400 mt-1">잠시만 기다려 주세요</p>
      </div>
      {/* 진행 도트 */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── 성공 화면 ─────────────────────────────────────────────────────────────

function SuccessScreen({ result, jiraKey, onReset }) {
  const jiraUrl = `${result.outline_document_url.split("/doc/")[0]?.replace("getoutline", "atlassian") ?? "#"}`;

  return (
    <div className="space-y-5">
      {/* 배너 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 p-5 text-white">
        <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -right-10 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <IconCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">문서 생성 완료!</p>
            <p className="text-white/70 text-xs mt-0.5">Outline 문서가 생성되고 Jira에 등록됐습니다.</p>
          </div>
        </div>
      </div>

      {/* 문서 제목 */}
      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">문서 제목</p>
        <p className="text-sm font-medium text-gray-800 leading-snug">{result.title}</p>
      </div>

      {/* 버튼 그룹 */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={result.outline_document_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500
            px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200
            hover:shadow-lg hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all duration-200"
        >
          <IconLink className="w-4 h-4" />
          Outline 열기
        </a>
        <a
          href={`https://jira.atlassian.com/browse/${jiraKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-white border border-gray-200
            px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm
            hover:border-indigo-300 hover:text-indigo-600 hover:-translate-y-0.5 transition-all duration-200"
        >
          <IconJira className="w-4 h-4 text-blue-500" />
          Jira {jiraKey}
        </a>
      </div>

      {/* 메타 정보 */}
      <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">Jira 댓글 ID</span>
        <span className="text-xs font-mono font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
          #{result.jira_comment_id}
        </span>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-xl border-2 border-dashed border-gray-200 px-4 py-3 text-sm font-medium text-gray-500
          hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all duration-200"
      >
        ↑ 다시 업로드
      </button>
    </div>
  );
}

// ─── 메인 앱 ───────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState(TAB.PDF);
  const [file, setFile] = useState(null);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState(STATUS.IDLE);
  const [loadingStep, setLoadingStep] = useState(1);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [collections, setCollections] = useState([]);
  const [collectionId, setCollectionId] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE_URL}/collections`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCollections(data);
          if (data.length > 0) setCollectionId(data[0].id);
        }
      })
      .catch(() => {}); // 컬렉션 로드 실패는 조용히 무시
  }, []);

  const activeStep =
    status === STATUS.SUCCESS ? 5
    : status === STATUS.LOADING ? loadingStep
    : 1;

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") setFile(dropped);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const isPdf = tab === TAB.PDF;
    if (isPdf && !file) return;
    if (!isPdf && !figmaUrl.trim()) return;
    if (!jiraKey.trim()) return;

    setResult(null);
    setErrorMsg("");
    setStatus(STATUS.LOADING);
    setLoadingStep(1);

    try {
      // 2단계: AI 분석 요청
      setLoadingStep(2);

      let res;
      if (isPdf) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("jira_issue_key", jiraKey.trim());
        if (collectionId) formData.append("collection_id", collectionId);
        res = await fetch(`${BASE_URL}/process`, { method: "POST", body: formData });
      } else {
        res = await fetch(`${BASE_URL}/process-figma`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            figma_url: figmaUrl.trim(),
            jira_issue_key: jiraKey.trim(),
            collection_id: collectionId || null,
          }),
        });
      }

      // 3단계: 문서 생성 (응답 수신)
      setLoadingStep(3);
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("서버 응답을 파싱할 수 없습니다.");
      }
      if (!res.ok) throw new Error(data.detail ?? "알 수 없는 오류가 발생했습니다.");

      // 4단계: Jira 등록
      setLoadingStep(4);
      await new Promise((r) => setTimeout(r, 500));

      setResult(data);
      setStatus(STATUS.SUCCESS);
    } catch (err) {
      const msg = err.message === "Failed to fetch"
        ? "서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해주세요."
        : err.message;
      setErrorMsg(msg);
      setStatus(STATUS.ERROR);
    }
  };

  const reset = () => {
    setFile(null);
    setFigmaUrl("");
    setJiraKey("");
    setStatus(STATUS.IDLE);
    setResult(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isLoading = status === STATUS.LOADING;
  const canSubmit = !isLoading && jiraKey.trim().length > 0 &&
    (tab === TAB.PDF ? !!file : figmaUrl.trim().length > 0);

  return (
    <div className="min-h-screen w-full flex flex-col"
      style={{ background: "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 50%, #fdf4ff 100%)" }}>

      {/* ── 헤더 ── */}
      <header className="w-full px-6 py-4 flex items-center gap-3"
        style={{ borderBottom: "1px solid rgba(99,102,241,0.1)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
          <IconDoc className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-bold text-gray-800 tracking-tight">Visang</span>
        <span className="ml-auto text-[10px] font-medium text-indigo-400 bg-indigo-50 border border-indigo-100
          px-2 py-0.5 rounded-full">
          Powered by Gemini
        </span>
      </header>

      {/* ── 메인 카드 ── */}
      <main className="flex-1 flex items-center justify-center p-4 w-full">
        <div className="w-full max-w-md">
          {/* 글래스 카드 */}
          <div className="rounded-2xl border border-white/80 p-7 shadow-xl shadow-indigo-100/50"
            style={{ background: "rgba(255,255,255,0.75)", backdropFilter: "blur(16px)" }}>

            {/* 제목 */}
            {status !== STATUS.SUCCESS && (
              <div className="mb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">PDF to Outline</h1>
                <p className="mt-1 text-xs text-gray-400">
                  문서를 업로드하면 Outline 문서를 생성하고 Jira 이슈에 링크를 등록합니다.
                </p>
              </div>
            )}

            {/* 스텝바 */}
            <StepBar activeStep={Math.min(activeStep, 4)} />

            {/* ── 로딩 상태 ── */}
            {isLoading ? (
              <LoadingOverlay step={loadingStep} tab={tab} />
            ) : status === STATUS.SUCCESS ? (
              /* ── 성공 화면 ── */
              <SuccessScreen result={result} jiraKey={jiraKey} onReset={reset} />
            ) : (
              /* ── 폼 ── */
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* 탭 */}
                <div className="flex rounded-xl bg-gray-100/80 p-1 gap-1">
                  {[
                    { key: TAB.PDF, label: "PDF 업로드" },
                    { key: TAB.FIGMA, label: "Figma 링크" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setTab(key); setErrorMsg(""); }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200
                        ${tab === key
                          ? "bg-white text-indigo-600 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── PDF 탭 ── */}
                {tab === TAB.FIGMA ? (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Figma URL
                    </label>
                    <div className="relative">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400 pointer-events-none"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <input
                        type="url"
                        value={figmaUrl}
                        onChange={(e) => setFigmaUrl(e.target.value)}
                        placeholder="https://www.figma.com/design/..."
                        className="w-full rounded-xl border border-gray-200 bg-white/80 pl-10 pr-4 py-3 text-sm
                          text-gray-800 placeholder-gray-300
                          focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-300
                          transition-all duration-200"
                      />
                    </div>
                  </div>
                ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    PDF 파일
                  </label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => !file && fileInputRef.current?.click()}
                    className={`relative rounded-xl border-2 border-dashed transition-all duration-200
                      ${file ? "border-indigo-300 bg-indigo-50/60 cursor-default"
                        : isDragging ? "border-violet-400 bg-violet-50/60 scale-[1.01]"
                        : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer"}`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files[0] ?? null)}
                    />

                    {file ? (
                      /* 파일 선택됨 */
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                          <IconDoc className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                          <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center
                            text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                          <IconX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      /* 비어있음 */
                      <div className="flex flex-col items-center gap-2 py-8 px-4">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                          <IconUpload className="w-6 h-6 text-indigo-400" />
                        </div>
                        <p className="text-sm text-gray-600">
                          <span className="font-semibold text-indigo-600">클릭</span>하거나 파일을 드래그하세요
                        </p>
                        <p className="text-xs text-gray-400">PDF 형식만 지원합니다</p>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Collection 선택 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Outline Collection
                  </label>
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <select
                      value={collectionId}
                      onChange={(e) => setCollectionId(e.target.value)}
                      disabled={collections.length === 0}
                      className="w-full rounded-xl border border-gray-200 bg-white/80 pl-10 pr-4 py-3 text-sm
                        text-gray-800 font-medium appearance-none
                        focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-300
                        disabled:text-gray-400 transition-all duration-200"
                    >
                      {collections.length === 0
                        ? <option value="">컬렉션 불러오는 중...</option>
                        : collections.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))
                      }
                    </select>
                    <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Jira 이슈 키 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Jira 이슈 키
                  </label>
                  <div className="relative">
                    <IconJira className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                    <input
                      type="text"
                      value={jiraKey}
                      onChange={(e) => setJiraKey(e.target.value.toUpperCase())}
                      placeholder="예: PROJ-123"
                      className="w-full rounded-xl border border-gray-200 bg-white/80 pl-10 pr-4 py-3 text-sm
                        text-gray-800 placeholder-gray-300 font-medium tracking-wide
                        focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-300
                        transition-all duration-200"
                    />
                  </div>
                </div>

                {/* 에러 */}
                {status === STATUS.ERROR && (
                  <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                    <IconWarning className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{errorMsg}</p>
                  </div>
                )}

                {/* 제출 버튼 */}
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-bold text-white
                    transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
                    hover:shadow-lg hover:shadow-indigo-200 hover:-translate-y-0.5 active:translate-y-0"
                  style={{
                    background: canSubmit
                      ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                      : "linear-gradient(135deg, #a5b4fc 0%, #c4b5fd 100%)",
                  }}
                >
                  <IconUpload className="w-4 h-4" />
                  업로드 및 문서 생성
                </button>
              </form>
            )}
          </div>

          {/* 카드 하단 설명 */}
          {status === STATUS.IDLE && (
            <p className="text-center text-xs text-gray-400 mt-4"><br></br>
              PDF → Gemini AI 분석 → Outline 문서 → Jira 댓글
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
