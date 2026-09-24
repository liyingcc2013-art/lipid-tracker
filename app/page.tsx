'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Activity,
  TrendingUp,
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
  Cpu
} from 'lucide-react';

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

interface LipidMetrics {
  test_date: string;
  ldl: number;
  hdl: number;
  triglycerides: number;
  total_cholesterol: number;
  unit: string;
}

function getStatusBadge(type: 'total' | 'ldl' | 'hdl' | 'triglycerides', value: number) {
  if (type === 'total') {
    if (value < 200) return { label: 'Optimal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (value <= 239) return { label: 'Borderline', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'High', color: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  if (type === 'ldl') {
    if (value < 100) return { label: 'Optimal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (value <= 129) return { label: 'Near Optimal', color: 'bg-teal-50 text-teal-700 border-teal-200' };
    if (value <= 159) return { label: 'Borderline', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'High', color: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  if (type === 'hdl') {
    if (value >= 60) return { label: 'Optimal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (value >= 40) return { label: 'Normal', color: 'bg-teal-50 text-teal-700 border-teal-200' };
    return { label: 'Low', color: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  if (type === 'triglycerides') {
    if (value < 150) return { label: 'Normal', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (value <= 199) return { label: 'Borderline', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'High', color: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  return { label: 'Normal', color: 'bg-slate-50 text-slate-700 border-slate-200' };
}

export default function Home() {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [lipidData, setLipidData] = useState<LipidMetrics | null>(null);
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
    setLipidData(null);
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

      // Trigger AI Extraction of structured lipid metrics
      setIsExtracting(true);
      try {
        const extractRes = await fetch('/api/extract-lipid-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.text }),
        });

        const extractJson = await extractRes.json();

        if (!extractRes.ok) {
          throw new Error(extractJson.error || 'Failed to extract lipid data.');
        }

        setLipidData({
          test_date: extractJson.test_date,
          ldl: extractJson.ldl,
          hdl: extractJson.hdl,
          triglycerides: extractJson.triglycerides,
          total_cholesterol: extractJson.total_cholesterol,
          unit: extractJson.unit,
        });
        setExtractionMethod(extractJson.extracted_by || 'gemini');
      } catch (extractErr) {
        console.error('Lipid data extraction error:', extractErr);
        const extractMsg =
          extractErr instanceof Error ? extractErr.message : 'AI lipid metric extraction failed.';
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
    setLipidData(null);
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

  const activeTotal = lipidData ? lipidData.total_cholesterol : 198;
  const activeLdl = lipidData ? lipidData.ldl : 115;
  const activeHdl = lipidData ? lipidData.hdl : 58;
  const activeTriglycerides = lipidData ? lipidData.triglycerides : 125;
  const activeUnit = lipidData ? lipidData.unit : 'mg/dL';
  const activeTestDate = lipidData ? lipidData.test_date : null;

  const metricCards = [
    {
      title: 'Total Cholesterol',
      value: `${activeTotal} ${activeUnit}`,
      statusInfo: getStatusBadge('total', activeTotal),
      change: lipidData ? 'Extracted from PDF' : '-12 mg/dL from last report',
      trend: 'down',
    },
    {
      title: 'LDL (Bad)',
      value: `${activeLdl} ${activeUnit}`,
      statusInfo: getStatusBadge('ldl', activeLdl),
      change: lipidData ? 'Extracted from PDF' : '-8 mg/dL from last report',
      trend: 'down',
    },
    {
      title: 'HDL (Good)',
      value: `${activeHdl} ${activeUnit}`,
      statusInfo: getStatusBadge('hdl', activeHdl),
      change: lipidData ? 'Extracted from PDF' : '+4 mg/dL from last report',
      trend: 'up',
    },
    {
      title: 'Triglycerides',
      value: `${activeTriglycerides} ${activeUnit}`,
      statusInfo: getStatusBadge('triglycerides', activeTriglycerides),
      change: lipidData ? 'Extracted from PDF' : '-15 mg/dL from last report',
      trend: 'down',
    },
  ];

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
                Lipid Trend Tracker
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                AI-Powered Blood Test Analysis
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Intro Banner */}
        <section className="text-center max-w-2xl mx-auto space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Monitor Your Cardiovascular Health Trends
          </h2>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Upload your blood test lab reports to parse lipid panel metrics with Gemini AI, track changes over time, and visualize your health trajectory.
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
                <div className={`p-4 rounded-full transition-transform duration-200 group-hover:scale-110 ${
                  isDragging ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-600'
                }`}>
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm sm:text-base font-semibold text-slate-800">
                    <span className="text-teal-600 hover:underline">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-500">
                    PDF lab reports only (e.g. Quest Diagnostics, LabCorp, Quest Lipid Panel)
                  </p>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Automated PDF parsing & Gemini AI extraction
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-emerald-200 shadow-sm" onClick={(e) => e.stopPropagation()}>
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

        {/* Dashboard Section */}
        <section className="space-y-6 pt-4 border-t border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-teal-600" />
                  Lipid Dashboard
                </h3>
                {lipidData && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                    <Cpu className="w-3 h-3" />
                    AI Extracted ({extractionMethod === 'gemini' ? 'Gemini API' : 'Structured Parser'})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {lipidData
                  ? `Displaying extracted metrics for lab test on ${lipidData.test_date}`
                  : 'Visual trend analysis and health metrics overview'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {activeTestDate ? `Test Date: ${activeTestDate}` : 'Last 12 Months'}
              </span>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metricCards.map((metric, idx) => (
              <div
                key={idx}
                className={`p-5 rounded-2xl border transition-all ${
                  lipidData
                    ? 'bg-white border-teal-200 shadow-sm ring-1 ring-teal-500/10'
                    : 'bg-white border-slate-200/80 shadow-2xs hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">{metric.title}</p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${metric.statusInfo.color}`}
                  >
                    {metric.statusInfo.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  {isExtracting ? (
                    <div className="h-8 w-24 bg-slate-200 animate-pulse rounded" />
                  ) : (
                    <span className="text-2xl font-bold text-slate-900 tracking-tight">
                      {metric.value}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-2">
                  <TrendingUp className="w-3 h-3 text-teal-600" />
                  {metric.change}
                </p>
              </div>
            ))}
          </div>

          {/* JSON Structured Output View when Lipid Data is Extracted */}
          {lipidData && (
            <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-5 shadow-md space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-xs font-mono text-teal-400">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Structured Lipid JSON Output</span>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
                  JSON Schema Validated
                </span>
              </div>
              <pre className="font-mono text-xs text-teal-300 bg-slate-950 p-4 rounded-xl overflow-x-auto leading-relaxed border border-slate-800">
                {JSON.stringify(lipidData, null, 2)}
              </pre>
            </div>
          )}

          {/* Visualization Placeholders */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Chart Placeholder */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <LineChart className="w-4 h-4 text-teal-600" />
                    Lipid Profile Historical Trend
                  </h4>
                  <p className="text-xs text-slate-500">Comparing LDL, HDL, and Total Cholesterol over time</p>
                </div>
                <span className="text-xs text-teal-600 font-medium hover:underline cursor-pointer flex items-center gap-0.5">
                  View Full Details <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>

              {/* Chart Graphic Mockup */}
              <div className="h-64 rounded-xl bg-slate-50/70 border border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 flex items-end justify-between px-8 pb-6 opacity-30 pointer-events-none">
                  {/* Decorative chart lines / bars background mockup */}
                  <div className="w-12 bg-teal-500 rounded-t-sm h-[40%]" />
                  <div className="w-12 bg-teal-500 rounded-t-sm h-[65%]" />
                  <div className="w-12 bg-teal-500 rounded-t-sm h-[50%]" />
                  <div className="w-12 bg-teal-500 rounded-t-sm h-[80%]" />
                  <div className="w-12 bg-teal-500 rounded-t-sm h-[60%]" />
                </div>
                <div className="relative z-10 text-center space-y-2 p-4">
                  <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto shadow-2xs">
                    <FileSearch className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {extractedText !== null
                      ? 'PDF Raw Text & AI Metrics Processed'
                      : 'Chart Visualization Area'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    {lipidData
                      ? `Successfully extracted test metrics from report dated ${lipidData.test_date}. Total Cholesterol: ${lipidData.total_cholesterol} ${lipidData.unit}.`
                      : 'Upload a PDF lab report above to extract raw text and populate interactive lipid trend charts.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Health Insights Card Placeholder */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-2xs flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    AI Health Insights
                  </h4>
                </div>
                <div className="space-y-3 text-xs text-slate-600">
                  <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-100 space-y-1">
                    <p className="font-semibold text-teal-900">HDL/LDL Ratio</p>
                    <p className="text-slate-600">
                      HDL is {activeHdl} {activeUnit} and LDL is {activeLdl} {activeUnit}. Continued aerobic exercise will help maintain elevated HDL levels.
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 space-y-1">
                    <p className="font-semibold text-amber-900">LDL Target Threshold</p>
                    <p className="text-slate-600">
                      {activeLdl > 100
                        ? `Your LDL level is ${activeLdl} ${activeUnit}, slightly above the optimal 100 ${activeUnit} target.`
                        : `Your LDL level is ${activeLdl} ${activeUnit}, which meets the optimal target threshold.`}
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
                  <Plus className="w-4 h-4" /> Add Another Lab Report
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
