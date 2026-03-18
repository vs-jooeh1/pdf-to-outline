import { useState, useRef } from "react";

const API_URL = "http://127.0.0.1:8000/process";

const STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
};

export default function App() {
  const [file, setFile] = useState(null);
  const [jiraKey, setJiraKey] = useState("");
  const [status, setStatus] = useState(STATUS.IDLE);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef(null);

  const handleFileDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") setFile(dropped);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !jiraKey.trim()) return;

    setStatus(STATUS.LOADING);
    setResult(null);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("jira_issue_key", jiraKey.trim());

    try {
      const res = await fetch(API_URL, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "알 수 없는 오류");
      setResult(data);
      setStatus(STATUS.SUCCESS);
    } catch (err) {
      setErrorMsg(err.message);
      setStatus(STATUS.ERROR);
    }
  };

  const reset = () => {
    setFile(null);
    setJiraKey("");
    setStatus(STATUS.IDLE);
    setResult(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 mb-4">
            <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">PDF to Outline</h1>
          <p className="mt-1 text-sm text-gray-500">
            PDF를 업로드하면 Outline 문서를 생성하고 Jira에 링크를 등록합니다.
          </p>
        </div>

        {status !== STATUS.SUCCESS ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* PDF Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors
                ${file ? "border-indigo-400 bg-indigo-50" : "border-gray-300 hover:border-indigo-300 hover:bg-gray-50"}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files[0] ?? null)}
              />
              {file ? (
                <>
                  <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-indigo-700 truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-indigo-400">{(file.size / 1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-indigo-600">클릭</span>하거나 PDF 파일을 드래그하세요
                  </p>
                  <p className="text-xs text-gray-400">PDF 형식만 지원합니다</p>
                </>
              )}
            </div>

            {/* Jira Issue Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Jira 이슈 키
              </label>
              <input
                type="text"
                value={jiraKey}
                onChange={(e) => setJiraKey(e.target.value)}
                placeholder="예: PROJ-123"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            {/* Error */}
            {status === STATUS.ERROR && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!file || !jiraKey.trim() || status === STATUS.LOADING}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === STATUS.LOADING ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  처리 중...
                </>
              ) : "업로드 및 생성"}
            </button>
          </form>
        ) : (
          /* Success Result */
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">문서가 성공적으로 생성되었습니다!</span>
            </div>

            <div className="space-y-3">
              <ResultRow label="문서 제목" value={result.title} />
              <ResultRow
                label="Outline 문서"
                value={
                  <a
                    href={result.outline_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline break-all"
                  >
                    {result.outline_document_url}
                  </a>
                }
              />
              <ResultRow label="Jira 댓글 ID" value={result.jira_comment_id} />
            </div>

            <button
              onClick={reset}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700
                hover:bg-gray-50 transition-colors"
            >
              다시 업로드
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}
