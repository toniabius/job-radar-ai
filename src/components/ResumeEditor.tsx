import React, { useState, useRef } from 'react';
import { User, Save, FileText, Check, Sparkles, RefreshCw, Upload, FileUp, Loader2, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ResumeData } from '../types';

interface ResumeEditorProps {
  resume: ResumeData;
  onSave: (content: string) => void;
  isSaving?: boolean;
}

export const ResumeEditor: React.FC<ResumeEditorProps> = ({
  resume,
  onSave,
  isSaving,
}) => {
  const [content, setContent] = useState(resume.content);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseStage, setParseStage] = useState('Reading PDF text layer...');
  const [pdfUploadMessage, setPdfUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    onSave(content);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please select a valid PDF file.');
      return;
    }

    setIsParsingPdf(true);
    setParseProgress(15);
    setParseStage(`Extracting text layer from "${file.name}"...`);
    setPdfUploadMessage(`Parsing "${file.name}"... You can safely navigate to other tabs while parsing completes.`);

    let progressInterval: any = null;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        setParseProgress(35);
        setParseStage('Analyzing document structure with Gemini AI...');

        // Simulate smooth progress increments during network request
        progressInterval = setInterval(() => {
          setParseProgress((prev) => {
            if (prev >= 88) return prev;
            if (prev > 60) setParseStage('Calculating years of experience & skill tags...');
            return prev + 6;
          });
        }, 400);

        const base64Data = reader.result as string;
        const res = await fetch('/api/resume/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64Data, filename: file.name }),
        });

        clearInterval(progressInterval);
        setParseProgress(100);
        setParseStage('Parsing completed successfully!');

        const data = await res.json();
        if (data.success && data.extractedMarkdown) {
          setContent(data.extractedMarkdown);
          onSave(data.extractedMarkdown);
          setPdfUploadMessage(`✅ Successfully extracted & saved "${file.name}"!`);
          setTimeout(() => {
            setPdfUploadMessage(null);
            setIsParsingPdf(false);
            setParseProgress(0);
          }, 4000);
        } else {
          setPdfUploadMessage(`⚠️ Error: ${data.error || 'Failed to parse PDF.'}`);
          setIsParsingPdf(false);
          setParseProgress(0);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);
      console.error('PDF Upload Error:', err);
      setPdfUploadMessage('⚠️ Failed to upload and process PDF file.');
      setIsParsingPdf(false);
      setParseProgress(0);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Editor Header */}
      <div className="p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-white">Resume Manager (`resume/resume.md`)</h2>
            <p className="text-xs text-slate-400">This resume is evaluated by Gemini AI for every discovered job posting</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,application/pdf"
            onChange={handlePdfUpload}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsingPdf}
            className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 shadow-xs transition-colors cursor-pointer"
          >
            {isParsingPdf ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-emerald-400" />
                Parsing PDF...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-1.5 text-emerald-400" />
                Upload PDF Resume
              </>
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Saved resume.md!
              </>
            ) : isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                Save resume.md
              </>
            )}
          </button>
        </div>
      </div>

      {pdfUploadMessage && (
        <div className={`px-5 py-3 text-xs font-semibold flex flex-col space-y-2 border-b ${
          pdfUploadMessage.includes('✅')
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : pdfUploadMessage.includes('⚠️')
            ? 'bg-rose-50 text-rose-900 border-rose-200'
            : 'bg-amber-50/80 text-amber-950 border-amber-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isParsingPdf && <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-600" />}
              <span>{pdfUploadMessage}</span>
            </div>
            {!isParsingPdf && (
              <button
                onClick={() => setPdfUploadMessage(null)}
                className="text-slate-400 hover:text-slate-600 ml-4 font-bold text-sm"
              >
                ×
              </button>
            )}
          </div>

          {isParsingPdf && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-amber-900 font-semibold">
                <span>{parseStage}</span>
                <span>{parseProgress}%</span>
              </div>
              <div className="w-full bg-amber-200/80 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-600 h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${parseProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor Controls */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-600">View Mode:</span>
          <div className="bg-slate-200/80 p-0.5 rounded-lg flex space-x-1">
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'edit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Markdown Editor
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Formatted Preview
            </button>
          </div>
        </div>
      </div>

      {/* Skill Chips & Experience Banner */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 overflow-x-auto">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold text-slate-800 shrink-0">Detected Skills:</span>
          <div className="flex flex-wrap gap-1.5 items-center">
            {resume.parsedSkills && resume.parsedSkills.length > 0 ? (
              resume.parsedSkills.map((skill, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {skill}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-slate-500 italic">
                No skills detected yet. Paste markdown or upload a PDF resume above to auto-extract skills.
              </span>
            )}
          </div>
        </div>

        {/* Calculated Experience Badge */}
        <div className="flex items-center space-x-2 shrink-0">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 mr-1 text-blue-600" />
            Experience: {resume.experienceYears ? `${resume.experienceYears}+ Years` : 'Auto-Calculated'}
          </span>
        </div>
      </div>

      {/* Main Work Area */}
      <div className="p-5 min-h-[400px]">
        {activeTab === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-[450px] p-4 bg-slate-950 text-slate-100 font-mono text-xs rounded-xl border border-slate-800 focus:outline-hidden focus:border-emerald-500/80 leading-relaxed"
            placeholder="Paste your Markdown resume here, or click 'Upload PDF Resume' above..."
          />
        ) : (
          <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 max-h-[450px] overflow-y-auto prose prose-slate max-w-none text-xs">
            {content && content.trim() ? (
              <ReactMarkdown>{content}</ReactMarkdown>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="font-semibold text-slate-600 text-sm">No Resume Content</p>
                <p className="text-xs text-slate-400 mt-1">
                  Upload a PDF resume or switch to the Markdown Editor tab to enter your details.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
