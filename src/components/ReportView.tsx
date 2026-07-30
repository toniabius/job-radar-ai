import React, { useState, useEffect } from 'react';
import { FileText, Copy, Check, Download, Eye, Code2, RefreshCw, History, Calendar, Clock, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface HistoryReport {
  id: string;
  filename: string;
  createdAt: string;
  title: string;
  sizeBytes?: number;
}

interface ReportViewProps {
  reportContent: string;
  reportPath?: string;
  onRefreshReport: () => void;
  isRefreshing?: boolean;
}

export const ReportView: React.FC<ReportViewProps> = ({
  reportContent: initialReportContent,
  reportPath: initialReportPath = 'output/report.md',
  onRefreshReport,
  isRefreshing,
}) => {
  const [historyReports, setHistoryReports] = useState<HistoryReport[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string>('latest');
  const [activeContent, setActiveContent] = useState<string>(initialReportContent);
  const [activePath, setActivePath] = useState<string>(initialReportPath);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);
  const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
  
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);

  // Sync initial props
  useEffect(() => {
    if (selectedFilename === 'latest' || selectedFilename === 'report.md') {
      setActiveContent(initialReportContent);
      setActivePath(initialReportPath);
    }
  }, [initialReportContent, initialReportPath]);

  // Fetch report history list
  const fetchHistoryList = async () => {
    setIsLoadingReports(true);
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        setHistoryReports(data);
      }
    } catch (err) {
      console.error('Error fetching report history:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchHistoryList();
  }, []);

  // Fetch specific report when selected
  const handleSelectReport = async (filename: string) => {
    setSelectedFilename(filename);
    setIsLoadingContent(true);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        setActiveContent(data.content || '');
        setActivePath(data.path || `output/reports/${filename}`);
      }
    } catch (err) {
      console.error('Error fetching report content:', err);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([activeContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', selectedFilename.endsWith('.md') ? selectedFilename : 'job_radar_report.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRefreshAll = async () => {
    onRefreshReport();
    await fetchHistoryList();
  };

  return (
    <div className="space-y-4">
      {/* Container Layout with History Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Scan History List */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col h-full min-h-[500px]">
          <div className="p-4 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Scan History</h3>
            </div>
            <button
              onClick={fetchHistoryList}
              disabled={isLoadingReports}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
              title="Refresh History List"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReports ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>{historyReports.length} Historical Scan Report(s)</span>
            <span className="font-mono text-emerald-700 font-semibold">Auto-saved</span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px] flex-1 p-2 space-y-1">
            {historyReports.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No saved reports found. Execute a scan to generate historical reports.
              </div>
            ) : (
              historyReports.map((item, idx) => {
                const isSelected = selectedFilename === item.filename || (selectedFilename === 'latest' && idx === 0);
                const dateObj = new Date(item.createdAt);
                const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectReport(item.filename)}
                    className={`w-full text-left p-3 rounded-xl transition-all border flex items-center justify-between group ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-300 text-slate-900 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-transparent text-slate-700'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className={`text-xs font-semibold truncate ${isSelected ? 'text-emerald-950 font-bold' : 'text-slate-800'}`}>
                          {item.title}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center"><Calendar className="w-3 h-3 mr-1 text-slate-400" />{formattedDate}</span>
                        <span>{formattedTime}</span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-emerald-600 translate-x-0.5' : 'text-slate-300 group-hover:text-slate-500'}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Selected Report Viewer */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="font-bold text-base text-white">
                    Scan Report History
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {activePath}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Detailed AI candidate evaluation breakdown & fit scoring for this scan
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefreshAll}
                disabled={isRefreshing || isLoadingContent}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Refresh Report"
              >
                <RefreshCw className={`w-4 h-4 ${(isRefreshing || isLoadingContent) ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={handleCopy}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? 'Copied!' : 'Copy Markdown'}
              </button>

              <button
                onClick={handleDownload}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download .md
              </button>
            </div>
          </div>

          {/* Mode Controls */}
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-600">View Mode:</span>
              <div className="bg-slate-200/80 p-0.5 rounded-lg flex space-x-1">
                <button
                  onClick={() => setViewMode('formatted')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    viewMode === 'formatted' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                  Formatted View
                </button>
                <button
                  onClick={() => setViewMode('raw')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    viewMode === 'raw' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5 inline mr-1" />
                  Raw Markdown
                </button>
              </div>
            </div>

            <span className="text-slate-500 text-[11px] font-mono">
              Path: <code className="text-slate-700 font-semibold">{activePath}</code>
            </span>
          </div>

          {/* Content Area */}
          <div className="p-6 flex-1 bg-white">
            {isLoadingContent ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                <p className="text-xs">Loading report content...</p>
              </div>
            ) : viewMode === 'formatted' ? (
              <div className="prose prose-slate max-w-none text-xs leading-relaxed">
                <ReactMarkdown
                  components={{
                    a: ({ node, ...props }) => (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-emerald-700 hover:text-emerald-800 font-bold underline decoration-emerald-300 hover:decoration-emerald-600 transition-colors"
                      />
                    ),
                  }}
                >
                  {activeContent}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-xs rounded-xl overflow-x-auto leading-relaxed border border-slate-800">
                {activeContent}
              </pre>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
