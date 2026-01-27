import React, { useState, useRef, useEffect } from 'react';

// --- Interfaces ---
interface SnapshotItem {
  id: string;
  item: string;
  size?: string;
  qty: number;
  category: string;
  isChecked: boolean;
}

interface HistoryRecord {
  date: string;
  branch: string;
  trackingNo?: string;
  signerName?: string; // Signer name
  signerRole?: string; // Signer position / role
  items: string;
  missing: string;
  note: string;
  images: string;
}

interface HistoryPanelProps {
  branches: string[];
  scriptUrl: string;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ branches, scriptUrl }) => {
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [historyData, setHistoryData] = useState<HistoryRecord | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const componentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  }, []);

  const handleSearchHistory = async () => {
    if (!selectedBranch || !selectedDate) {
      return alert("Please select branch and date before searching");
    }

    setIsHistoryLoading(true);
    setHistoryData(null);

    try {
      const url = `${scriptUrl}?action=getHistory&branch=${encodeURIComponent(
        selectedBranch
      )}&date=${selectedDate}`;

      const res = await fetch(url);
      const data = await res.json();

      // Use the latest record if multiple records exist
      if (data && data.length > 0) {
        setHistoryData(data[data.length - 1]);
      } else {
        alert("No record found for today");
      }
    } catch (error) {
      console.error(error);
      alert("Error fetching history");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    const element = componentRef.current;
    if (!element) return;

    setIsExporting(true);

    // Hide UI-only elements before exporting PDF
    const elementsToHide = element.querySelectorAll('.hide-on-pdf');
    const originalStyles: string[] = [];

    elementsToHide.forEach(el => {
      const htmlEl = el as HTMLElement;
      originalStyles.push(htmlEl.style.display);
      htmlEl.style.display = 'none';
    });

    const opt = {
      margin: 10,
      filename: `POP_Report_${selectedBranch}_${selectedDate}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    import('html2pdf.js').then((html2pdf: any) => {
      const worker = html2pdf.default || html2pdf;
      worker()
        .set(opt)
        .from(element)
        .save()
        .then(() => {
          // Restore hidden elements
          elementsToHide.forEach((el, index) => {
            (el as HTMLElement).style.display = originalStyles[index];
          });
          setIsExporting(false);
        });
    });
  };

  return (
    <div className="history-panel">
      {/* Controls */}
      <div className="controls-card">
        <div className="input-group">
          <label>1. Select Branch</label>
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
          >
            <option value="">-- Please Select Branch --</option>
            {branches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label>
            2. Date <span className="required">*</span>
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </div>

        <div className="input-group search-btn-container">
          <button
            onClick={handleSearchHistory}
            disabled={isHistoryLoading}
            className="search-btn"
          >
            {isHistoryLoading ? '⏳ Searching...' : '🔍 Search History'}
          </button>
        </div>
      </div>

      {/* Export overlay */}
      {isExporting && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p className="loading-text">Exporting PDF...</p>
        </div>
      )}

      <div className="result-card history-result">
        {!historyData && !isHistoryLoading && (
          <div className="empty-state">
            <span>🔍</span>
            <p>Select branch and date, then press "Search History"</p>
          </div>
        )}

        {isHistoryLoading && (
          <div className="empty-state">
            <div className="spinner-center"></div>
            <p>Fetching data...</p>
          </div>
        )}

        {historyData && (
          <div>
            <div className="export-btn-container">
              <button onClick={handleDownloadPDF} className="export-btn">
                🖨️ Export PDF / Print
              </button>
            </div>

            {/* PDF Content */}
            <div ref={componentRef} className="pdf-content">
              <div className="pdf-header">
                <h2 className="pdf-title">POP Receive Tracking Order</h2>
                <p className="pdf-subtitle">Confirmed Receipt Report</p>
              </div>

              {/* Info Section (Name & Position) */}
              <div
                className="pdf-info-grid"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '2px solid #f1f5f9',
                  paddingBottom: 15,
                  marginBottom: 15
                }}
              >
                <div>
                  <div>
                    <strong>🏠 Branch:</strong> {historyData.branch}
                  </div>
                  <div>
                    <strong>👤 Name:</strong> {historyData.signerName || "-"}
                  </div>
                  <div>
                    <strong>🔰 Position:</strong>{' '}
                    <span style={{
                      background: '#e0f2fe',
                      color: '#0369a1',
                      padding: '2px 8px',
                      borderRadius: 4
                    }}>
                      {historyData.signerRole || "-"}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <strong>📅 Date Checked:</strong>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {historyData.date}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table className="pdf-table">
                <thead>
                  <tr>
                    <th>Category</th>
                      <th>Size</th>
                    <th>Item</th>
                    <th className="text-center">Qty</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    try {
                      const items: SnapshotItem[] = JSON.parse(historyData.items);
                      return items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.category}</td>
                           <td>{item.size}</td>
                          <td>{item.item}</td>
                          <td className="text-center">{item.qty}</td>
                          <td className={`text-center ${item.isChecked ? 'text-success' : 'text-danger'}`}>
                            {item.isChecked ? '✅ Received' : '❌ Missing'}
                          </td>
                        </tr>
                      ));
                    } catch {
                      return (
                        <tr>
                          <td colSpan={4} className="text-center error-text">
                            ⚠️ Cannot load POP items
                          </td>
                        </tr>
                      );
                    }
                  })()}
                </tbody>
              </table>

              {/* Missing Items */}
              {historyData.missing && historyData.missing !== "-" && (
                <div className="missing-alert">
                  <h4>⚠️ Missing Items / Reported Issues</h4>
                  <pre>{historyData.missing}</pre>
                </div>
              )}

              <div className="note-box">
                <strong>📝 Note:</strong> {historyData.note || "-"}
              </div>

              <div className="pdf-footer">
                Document generated on {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
