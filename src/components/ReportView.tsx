import React, { useState, useEffect } from 'react';
import {
  FileText,
  Copy,
  Check,
  Download,
  Eye,
  Code2,
  RefreshCw,
  Calendar,
  Clock,
  ChevronRight,
  Sparkles,
  Trash2,
} from 'lucide-react';
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
  activeProfileName?: string;
  onRefreshReport: () => void;
  isRefreshing?: boolean;
}

export const ReportView: React.FC<ReportViewProps> = ({
  reportContent: initialReportContent,
  reportPath: initialReportPath = 'output/report.md',
  activeProfileName,
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

  // Sync initial props & refetch history list when profile/content changes
  useEffect(() => {
    fetchHistoryList();
  }, [initialReportContent, initialReportPath, activeProfileName]);

  // Fetch report history list
  const fetchHistoryList = async () => {
    setIsLoadingReports(true);
    try {
      const res = await fetch(`/api/reports?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data: HistoryReport[] = await res.json();
        setHistoryReports(data);

        if (data.length === 0) {
          setSelectedFilename('');
          setActiveContent('');
          setActivePath('');
        } else {
          // Check if currently selected filename exists in new data
          const exists = data.find((item) => item.filename === selectedFilename);
          if (exists) {
            handleSelectReport(exists.filename);
          } else {
            const topItem = data[0];
            setSelectedFilename(topItem.filename);
            handleSelectReport(topItem.filename);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching report history:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  // Fetch specific report when selected
  const handleSelectReport = async (filename: string) => {
    if (!filename) {
      setActiveContent('');
      setActivePath('');
      return;
    }
    setSelectedFilename(filename);
    setIsLoadingContent(true);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(filename)}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setActiveContent(data.content || '');
        setActivePath(data.path || `output/reports/${filename}`);
      } else {
        setActiveContent('');
        setActivePath('');
      }
    } catch (err) {
      console.error('Error fetching report content:', err);
      setActiveContent('');
      setActivePath('');
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleCopy = () => {
    if (!activeContent) return;
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!activeContent) return;
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

  const handleDeleteReport = async (filename: string) => {
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedFilename === filename) {
          setSelectedFilename('');
          setActiveContent('');
          setActivePath('');
        }
        await fetchHistoryList();
      }
    } catch (err) {
      console.error('Error deleting report:', err);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[680px]">
      {/* Header Banner - Matching DatabaseViewer style */}
      <div className="p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-base text-white">Scan History</h2>
            </div>
            <p className="text-xs text-slate-400">View candidate evaluation match reports generated by automated and manual scans</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isRefreshing || isLoadingReports}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="Refresh list and current report"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-emerald-400 ${(isRefreshing || isLoadingReports) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Two-Column Master Detail Split View (Left History List | Right Report Preview) */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-[600px]">
        {/* Left Side: Scan History List */}
        <div className="w-full md:w-80 shrink-0 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col">
          {/* Sidebar Section Title */}
          <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>SAVED REPORTS</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-[10px] text-slate-700 font-mono font-semibold">
              {historyReports.length}
            </span>
          </div>

          {/* List of Historical Scan Reports */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {historyReports.length === 0 ? (
              <div className="py-16 px-4 text-center text-slate-500">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-xs font-medium text-slate-600">No reports generated yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Run a scan from the dashboard to generate candidate match evaluations.
                </p>
              </div>
            ) : (
              historyReports.map((item, idx) => {
                const isSelected = selectedFilename === item.filename || (selectedFilename === 'latest' && idx === 0);
                const dateObj = new Date(item.createdAt);
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                const formattedTime = dateObj.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={item.id}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group border ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-xs font-medium'
                        : 'bg-white hover:bg-slate-100/80 border-slate-200/80 text-slate-700'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectReport(item.filename)}
                      className="flex items-center justify-between flex-1 min-w-0 pr-2"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <FileText
                            className={`w-4 h-4 shrink-0 ${
                              isSelected ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'
                            }`}
                          />
                          <span
                            className={`text-xs font-semibold truncate ${
                              isSelected ? 'text-emerald-900' : 'text-slate-800'
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-mono pl-6">
                          <span className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                            {formattedDate}
                          </span>
                          <span>{formattedTime}</span>
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isSelected
                            ? 'text-emerald-600 translate-x-0.5'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                    </button>
                    {/* Delete button — only show for named history files, not the fallback "report.md" */}
                    {item.filename !== 'report.md' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteReport(item.filename); }}
                        className="ml-1 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        title="Delete report"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Report Detail Preview Pane */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden min-w-0">
          {activeContent ? (
            <>
              {/* Report Viewer Toolbar Header */}
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2 min-w-0">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-mono font-semibold text-slate-700 truncate">
                    {activePath || `output/reports/${selectedFilename}`}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {/* View Mode Toggle */}
                  <div className="bg-slate-200/70 p-0.5 rounded-lg flex space-x-1">
                    <button
                      onClick={() => setViewMode('formatted')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        viewMode === 'formatted'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      Formatted
                    </button>
                    <button
                      onClick={() => setViewMode('raw')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        viewMode === 'raw'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5 inline mr-1" />
                      Raw
                    </button>
                  </div>

                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 mr-1" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </button>

                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download
                  </button>
                </div>
              </div>

              {/* Scrollable Report Content Pane */}
              <div className="p-6 flex-1 overflow-y-auto bg-white">
                {isLoadingContent ? (
                  <div className="py-24 text-center text-slate-400 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                    <p className="text-xs">Loading report preview...</p>
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
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 text-slate-400">
              <Sparkles className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700">No Report Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Select a scan report from the left history sidebar to preview candidate evaluation breakdown and fit ratings.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
