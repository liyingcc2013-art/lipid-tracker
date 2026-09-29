'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  Activity,
  Code2,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Server,
  AlertCircle
} from 'lucide-react';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export default function Home() {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const processPdfFile = async (selectedFile: File) => {
    setError(null);
    setExtractedText(null);
    setNumPages(null);
    setModels(null);

    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a valid PDF document.');
      return;
    }

    setFile({
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
      lastModified: selectedFile.lastModified,
    });

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process PDF file.');
      }

      setExtractedText(data.text);
      setNumPages(data.numpages);

      // Trigger AI Diagnostic Probe
      setIsExtracting(true);
      try {
        const extractRes = await fetch('/api/extract-lipid-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.text }),
        });

        const extractJson = await extractRes.json();

        if (extractJson.models && Array.isArray(extractJson.models)) {
          setModels(extractJson.models);
        } else if (extractJson.error) {
          setError(extractJson.error);
        }
      } catch (extractErr) {
        console.error('Diagnostic model probe error:', extractErr);
        const extractMsg =
          extractErr instanceof Error ? extractErr.message : String(extractErr);
        setError(extractMsg);
      } finally {
        setIsExtracting(false);
      }
    } catch (err: unknown) {
      console.error('PDF parsing error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      processPdfFile(droppedFile);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      processPdfFile(selectedFile);
    }
  };

  const removeFile = () => {
    setFile(null);
    setExtractedText(null);
    setNumPages(null);
    setModels(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const copyToClipboard = () => {
    if (extractedText) {
      navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-600/20">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Gemini Model Diagnostic Probe
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Listing available models for API Key
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Intro Banner */}
        <section className="text-center max-w-2xl mx-auto space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Available Gemini Models
          </h2>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Upload a PDF document to probe Google Generative Language API and view available models for your API key.
          </p>
        </section>

        {/* Upload Area */}
        <section className="max-w-2xl mx-auto space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-10 transition-all duration-200 text-center ${
              isDragging
                ? 'border-teal-500 bg-teal-50/60 ring-4 ring-teal-500/10 scale-[1.01]'
                : file
                ? 'border-emerald-300 bg-emerald-50/30'
                : 'border-slate-300 hover:border-teal-500 hover:bg-slate-100/50 bg-white'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/pdf,.pdf"
              className="hidden"
            />

            {!file ? (
              <div className="flex flex-col items-center justify-center space-y-4">
                <div
                  className={`p-4 rounded-full transition-transform duration-200 group-hover:scale-110 ${
                    isDragging
                      ? 'bg-teal-100 text-teal-600'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-600'
                  }`}
                >
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm sm:text-base font-semibold text-slate-800">
                    <span className="text-teal-600 hover:underline">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-500">
                    PDF lab report or document
                  </p>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Diagnostic Model Registry Probe
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-between bg-white p-4 rounded-xl border border-emerald-200 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-700">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate max-w-[220px] sm:max-w-xs">
                        {file.name}
                      </p>
                      {isProcessing ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          <Loader2 className="w-3 h-3 animate-spin" /> Parsing PDF...
                        </span>
                      ) : isExtracting ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                          <Loader2 className="w-3 h-3 animate-spin" /> Fetching Models...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatFileSize(file.size)} • {numPages ? `${numPages} page(s) • ` : ''}PDF
                    </p>
                  </div>
                </div>
                <button
                  onClick={removeFile}
                  type="button"
                  aria-label="Remove uploaded file"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 p-3 rounded-lg font-mono whitespace-pre-wrap break-all">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Extracted Raw Text Display */}
          {extractedText !== null && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg space-y-0 text-slate-100">
              <div className="bg-slate-800/80 px-4 py-3 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center gap-2 text-xs font-mono text-teal-400">
                  <Code2 className="w-4 h-4" />
                  <span>Extracted PDF Raw Text</span>
                </div>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap selection:bg-teal-700 selection:text-white">
                {extractedText.trim().length > 0
                  ? extractedText
                  : '[No text content found in PDF document]'}
              </div>
            </div>
          )}
        </section>

        {/* BULLETED LIST OF AVAILABLE MODELS */}
        {models && (
          <section className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Server className="w-5 h-5 text-teal-600" />
              <h3 className="text-lg font-bold text-slate-900">
                Available Models ({models.length})
              </h3>
            </div>
            {models.length === 0 ? (
              <p className="text-sm text-slate-500">No models returned by API key.</p>
            ) : (
              <ul className="list-disc list-inside space-y-2 text-sm font-mono text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {models.map((modelName, idx) => (
                  <li key={idx} className="py-0.5">
                    {modelName}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
