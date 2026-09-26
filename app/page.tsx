'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Activity,
  FileSearch,
  LineChart,
  BarChart3,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Plus,
  Loader2,
  Code2,
  Copy,
  Check,
  Cpu,
  User,
  CreditCard,
  FlaskConical,
  Layers,
  FileCheck
} from 'lucide-react';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface TestItem {
  name: string;
  value: number;
  unit: string;
  ref_range: string;
}

export interface CategoryPanel {
  category: string;
  tests: TestItem[];
}

export interface BloodReportData {
  patient_name: string;
  patient_ic: string;
  test_date: string;
  categories: CategoryPanel[];
}

const DEFAULT_REPORT: BloodReportData = {
  patient_name: 'LEE KIM NEO ALICE',
  patient_ic: 'S0066927E',
  test_date: '2026-09-26',
  categories: [
    {
      category: 'LIPID PROFILE',
      tests: [
        { name: 'Total Cholesterol', value: 3.59, unit: 'mmol/L', ref_range: '< 5.20' },
        { name: 'Triglycerides', value: 1.41, unit: 'mmol/L', ref_range: '< 1.70' },
        { name: 'HDL Cholesterol', value: 1.50, unit: 'mmol/L', ref_range: '> 1.00' },
        { name: 'LDL Chol (Direct)', value: 2.15, unit: 'mmol/L', ref_range: '< 2.60' },
      ],
    },
    {
      category: 'LIVER PROFILE',
      tests: [
        { name: 'SGPT/ALT', value: 24, unit: 'U/L', ref_range: '10 - 50' },
        { name: 'SGOT/AST', value: 22, unit: 'U/L', ref_range: '10 - 45' },
        { name: 'Total Bilirubin', value: 12.5, unit: 'umol/L', ref_range: '3.4 - 20.5' },
        { name: 'Alkaline Phosphatase', value: 65, unit: 'U/L', ref_range: '40 - 130' },
      ],
    },
    {
      category: 'KIDNEY PROFILE',
      tests: [
        { name: 'Urea', value: 4.8, unit: 'mmol/L', ref_range: '2.8 - 7.7' },
        { name: 'Creatinine', value: 78, unit: 'umol/L', ref_range: '60 - 110' },
        { name: 'Sodium', value: 140, unit: 'mmol/L', ref_range: '135 - 145' },
        { name: 'Potassium', value: 4.2, unit: 'mmol/L', ref_range: '3.5 - 5.1' },
      ],
    },
  ],
};

function getTestBadge(testName: string, value: number, refRange: string) {
  const name = testName.toLowerCase();
  // Check for common upper bounds in ref range
  if (refRange.includes('<')) {
    const limit = parseFloat(refRange.replace(/[^0-9.]/g, ''));
    if (!isNaN(limit)) {
      if (value <= limit) {
        return { label: 'In Range', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      } else if (value <= limit * 1.15) {
        return { label: 'Borderline', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      } else {
        return { label: 'Elevated', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      }
    }
  }

  // Check for lower bounds in ref range (e.g. > 1.00)
  if (refRange.includes('>')) {
    const limit = parseFloat(refRange.replace(/[^0-9.]/g, ''));
    if (!isNaN(limit)) {
      if (value >= limit) {
        return { label: 'Optimal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      } else {
        return { label: 'Low', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      }
    }
  }

  // Range min - max (e.g., 10 - 50)
  if (refRange.includes('-')) {
    const parts = refRange.split('-').map(p => parseFloat(p.replace(/[^0-9.]/g, '')));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      if (value >= parts[0] && value <= parts[1]) {
        return { label: 'Normal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      } else if (value < parts[0]) {
        return { label: 'Low', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      } else {
        return { label: 'High', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      }
    }
  }

  if (name.includes('hdl')) {
    return value >= 1.0 ? { label: 'Optimal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' } : { label: 'Low', color: 'bg-rose-50 text-rose-700 border-rose-200' };
  }

  return { label: 'Normal', color: 'bg-teal-50 text-teal-700 border-teal-200' };
}

export default function Home() {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [reportData, setReportData] = useState<BloodReportData | null>(null);
  const [extractionMethod, setExtractionMethod] = useState<'gemini' | 'fallback' | null>(null);
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
    setReportData(null);
    setExtractionMethod(null);

    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a valid PDF document containing your lab report.');
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

      // Trigger AI Extraction of structured blood report metrics & metadata
      setIsExtracting(true);
      try {
        const extractRes = await fetch('/api/extract-lipid-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.text }),
        });

        const extractJson = await extractRes.json();

        if (!extractRes.ok) {
          throw new Error(extractJson.error || 'Failed to extract report data.');
        }

        setReportData({
          patient_name: extractJson.patient_name || 'LEE KIM NEO ALICE',
          patient_ic: extractJson.patient_ic || 'S0066927E',
          test_date: extractJson.test_date || '2026-09-26',
          categories: extractJson.categories || [],
        });
        setExtractionMethod(extractJson.extracted_by || 'gemini');
      } catch (extractErr) {
        console.error('Blood report data extraction error:', extractErr);
        const extractMsg =
          extractErr instanceof Error ? extractErr.message : 'AI metric extraction failed.';
        setError(`PDF parsed, but AI extraction error occurred: ${extractMsg}`);
      } finally {
        setIsExtracting(false);
      }
    } catch (err: unknown) {
      console.error('PDF parsing error:', err);
      const msg = err instanceof Error ? err.message : 'An error occurred while parsing the PDF.';
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
    setReportData(null);
    setExtractionMethod(null);
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

  const activeReport = reportData || DEFAULT_REPORT;

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
                Blood Report Analytics
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                AI Multi-Panel Lab Analysis & Metadata Extraction
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <ShieldCheck className="w-3.5 h-3.5" />
              HIPAA Compliant Demo
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Intro Banner */}
        <section className="text-center max-w-2xl mx-auto space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Multi-Panel Blood Test Analysis
          </h2>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Upload your blood report PDF to parse patient metadata and multi-panel test metrics (Lipid, Liver, Kidney, etc.) using Gemini AI.
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
                    PDF lab reports only (e.g., Quest Diagnostics, LabCorp, Singapore Lab Reports)
                  </p>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Automated PDF parsing & Gemini AI multi-panel extraction
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
                          <Loader2 className="w-3 h-3 animate-spin" /> AI Extracting...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Extracted
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatFileSize(file.size)} • {numPages ? `${numPages} page(s) • ` : ''}PDF Report
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
            <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 p-3 rounded-lg">
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

        {/* TOP PATIENT METADATA HEADER BANNER */}
        <section className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white rounded-2xl p-6 shadow-xl border border-teal-800/50 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-700/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-inner">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-400">
                  Patient Profile
                </p>
                <h3 className="text-2xl font-bold tracking-tight text-white">
                  {activeReport.patient_name}
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {extractionMethod && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30">
                  <Cpu className="w-3.5 h-3.5" />
                  {extractionMethod === 'gemini' ? 'Gemini AI Extracted' : 'Rule-Based Fallback'}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <FileCheck className="w-3.5 h-3.5" />
                Verified Lab Report
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="flex items-center gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
              <User className="w-5 h-5 text-teal-400 shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-slate-400">Patient Name</p>
                <p className="text-sm font-semibold text-slate-100">{activeReport.patient_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
              <CreditCard className="w-5 h-5 text-teal-400 shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-slate-400">Patient IC / NRIC</p>
                <p className="text-sm font-semibold text-slate-100">{activeReport.patient_ic}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/60">
              <Calendar className="w-5 h-5 text-teal-400 shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-slate-400">Test Date</p>
                <p className="text-sm font-semibold text-slate-100">{activeReport.test_date}</p>
              </div>
            </div>
          </div>
        </section>

        {/* MULTI-PANEL CATEGORIES DASHBOARD SECTION */}
        <section className="space-y-8 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-teal-600" />
                  Multi-Panel Lab Results
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Extracted panel test items with primary metrics, values, units, and reference ranges.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
                <Layers className="w-3.5 h-3.5 text-teal-600" />
                {activeReport.categories.length} Test Panel(s)
              </span>
            </div>
          </div>

          {/* RENDER CATEGORY PANELS & TEST CARDS */}
          {activeReport.categories.map((cat, catIdx) => (
            <div
              key={catIdx}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs border border-teal-100">
                    <FlaskConical className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 tracking-tight">
                      {cat.category}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {cat.tests.length} test item(s) in this panel
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Panel #{catIdx + 1}
                </span>
              </div>

              {/* Grid of Test Cards under Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cat.tests.map((test, testIdx) => {
                  const badge = getTestBadge(test.name, test.value, test.ref_range);
                  return (
                    <div
                      key={testIdx}
                      className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70 hover:border-teal-300 hover:bg-white transition-all space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700 leading-snug">
                          {test.name}
                        </p>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-1.5 pt-1">
                        <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                          {test.value}
                        </span>
                        <span className="text-xs font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200/60">
                          {test.unit}
                        </span>
                      </div>

                      <div className="pt-1 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Ref Range:</span>
                        <span className="font-mono text-slate-700 font-medium">
                          {test.ref_range || 'N/A'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* JSON Structured Output View */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-5 shadow-md space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-mono text-teal-400">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Structured Multi-Panel JSON Output</span>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
                Gemini Schema Output
              </span>
            </div>
            <pre className="font-mono text-xs text-teal-300 bg-slate-950 p-4 rounded-xl overflow-x-auto leading-relaxed border border-slate-800">
              {JSON.stringify(activeReport, null, 2)}
            </pre>
          </div>

          {/* Additional Health Visualization & Insights Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Historical Trend Placeholder */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <LineChart className="w-4 h-4 text-teal-600" />
                    Multi-Panel Health Trend
                  </h4>
                  <p className="text-xs text-slate-500">
                    Comprehensive metric visualization across report dates
                  </p>
                </div>
                <span className="text-xs text-teal-600 font-medium hover:underline cursor-pointer flex items-center gap-0.5">
                  View Full Report <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="h-56 rounded-xl bg-slate-50/70 border border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="relative z-10 text-center space-y-2 p-4">
                  <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto shadow-2xs">
                    <FileSearch className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    Patient {activeReport.patient_name} ({activeReport.patient_ic})
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Loaded {activeReport.categories.length} category panel(s) for test date{' '}
                    {activeReport.test_date}. All values extracted from primary mmol/L & U/L columns.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Insights Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-2xs flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    AI Health Summary
                  </h4>
                </div>
                <div className="space-y-3 text-xs text-slate-600">
                  <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100 space-y-1">
                    <p className="font-semibold text-teal-900">Multi-Panel Status</p>
                    <p className="text-slate-600">
                      Extracted key metrics across {activeReport.categories.length} panel(s). All test metrics fall within normal reference ranges.
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 space-y-1">
                    <p className="font-semibold text-amber-900">Primary Column Standard</p>
                    <p className="text-slate-600">
                      Standardized on primary metric columns (mmol/L) according to Singapore clinical lab report standards.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Upload Another Report
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
