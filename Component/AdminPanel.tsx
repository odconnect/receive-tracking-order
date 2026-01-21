import React, { useState, useMemo, useEffect } from 'react';
import './PopTracking.css';
import AdminShipmentPanel from "./AdminShipmentPanel";

// --- Interfaces ---
interface DailyStatus {
  date: string;
  submitted: string[];
  notSubmitted: string[];
}

interface AdminPanelProps {
  branches: string[];
  scriptUrl: string;
  onClose: () => void;
}

// Admin password (simple client-side protection)
const ADMIN_PASSWORD = "212224";

const AdminPanel: React.FC<AdminPanelProps> = ({ branches, scriptUrl, onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');

  // Date range states
  const [adminStartDate, setAdminStartDate] = useState<string>('');
  const [adminEndDate, setAdminEndDate] = useState<string>('');

  const [adminData, setAdminData] = useState<DailyStatus[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  type AdminTab = "report" | "shipment";
  const [activeTab, setActiveTab] = useState<AdminTab>("report");

  useEffect(() => {
    // Default date = today
    const today = new Date().toISOString().split('T')[0];
    setAdminStartDate(today);
    setAdminEndDate(today);
  }, []);

  // --- Admin Login ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setPasswordInput('');
    } else {
      alert("Incorrect password!");
    }
  };

  // --- Check submission status within date range ---
  const handleAdminCheckRange = async () => {
    if (!adminStartDate || !adminEndDate) {
      return alert("Please select both start and end dates");
    }
    if (new Date(adminStartDate) > new Date(adminEndDate)) {
      return alert("Start date must not be later than end date");
    }

    setIsAdminLoading(true);
    setAdminData([]);

    try {
      const url = `${scriptUrl}?action=getRangeStatus&startDate=${adminStartDate}&endDate=${adminEndDate}`;
      const res = await fetch(url);
      const submittedData: Record<string, string[]> = await res.json();

      const results: DailyStatus[] = [];

      const startParts = adminStartDate.split('-').map(Number);
      const endParts = adminEndDate.split('-').map(Number);

      const current = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);

      while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const submitted = submittedData[dateStr] || [];
        const notSubmitted = branches.filter(b => !submitted.includes(b));

        results.push({
          date: dateStr,
          submitted,
          notSubmitted
        });

        current.setDate(current.getDate() + 1);
      }

      setAdminData(results);
    } catch (error) {
      console.error(error);
      alert("Error fetching admin data");
    } finally {
      setIsAdminLoading(false);
    }
  };

  // --- Summary statistics ---
  const summaryStats = useMemo(() => {
    if (adminData.length === 0) {
      return { missing: [], reported: [] };
    }

    const stats: Record<string, { submitted: number; missing: number }> = {};
    branches.forEach(b => (stats[b] = { submitted: 0, missing: 0 }));

    adminData.forEach(day => {
      day.submitted.forEach(b => {
        if (stats[b]) stats[b].submitted++;
      });
      day.notSubmitted.forEach(b => {
        if (stats[b]) stats[b].missing++;
      });
    });

    const missing = Object.entries(stats)
      .filter(([_, val]) => val.submitted === 0)
      .map(([branch, val]) => ({ branch, count: val.missing }))
      .sort((a, b) => b.count - a.count);

    const reported = Object.entries(stats)
      .filter(([_, val]) => val.submitted > 0)
      .map(([branch, val]) => ({ branch, count: val.submitted }))
      .sort((a, b) => b.count - a.count);

    return { missing, reported };
  }, [adminData, branches]);

  // --- Send reminder email for a specific date ---
  const handleSendEmailForDate = async (date: string, notSubmitted: string[]) => {
    if (!confirm(`Confirm sending reminder email for ${date}?`)) return;

    setIsSubmitting(true);
    try {
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sendEmail',
          date,
          notSubmittedList: notSubmitted
        })
      });

      alert(`📧 Reminder email for ${date} sent successfully`);
    } catch (error) {
      console.error(error);
      alert("❌ Failed to send email");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Send summary email for date range ---
  const handleSendRangeEmail = async () => {
    if (adminData.length === 0) return;

    if (!confirm(`Confirm sending summary email (${adminStartDate} to ${adminEndDate})?`)) return;

    const missingForEmail = summaryStats.missing.map(item => ({
      branch: item.branch,
      dates: []
    }));

    setIsSubmitting(true);
    try {
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sendRangeEmail',
          startDate: adminStartDate,
          endDate: adminEndDate,
          summary: missingForEmail
        })
      });

      alert("📧 Summary email sent successfully");
    } catch (error) {
      console.error(error);
      alert("❌ Failed to send email");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- LOGIN SCREEN ---
  if (!isAuthenticated) {
    return (
      <div className="login-box">
        <h3 className="login-title">🔒 Admin Login</h3>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            className="login-input"
            autoComplete="current-password"
          />
          <div className="login-actions">
            <button type="submit" className="login-btn">Login</button>
            <button type="button" onClick={onClose} className="login-cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  // --- MAIN ADMIN UI ---
  return (
    <div>
      {/* ===== TAB BAR ===== */}
      <div className="controls-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className={activeTab === 'report' ? 'tab-active' : 'tab'}
            onClick={() => setActiveTab('report')}
          >
            📊 Admin Report
          </button>

          <button
            className={activeTab === 'shipment' ? 'tab-active' : 'tab'}
            onClick={() => setActiveTab('shipment')}
          >
            🚚 Admin Shipment
          </button>
        </div>
      </div>

      {/* ===== SHIPMENT TAB ===== */}
      {activeTab === "shipment" && (
        <AdminShipmentPanel
          scriptUrl={scriptUrl}
        //   onClose={() => setActiveTab("report")}
        />
      )}

      {/* ===== REPORT TAB ===== */}
      {activeTab === "report" && (
        <>
          {isSubmitting && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <p className="loading-text">Processing...</p>
            </div>
          )}

          <div className="controls-card">
            <div className="admin-date-controls">
              <label className="admin-date-label">📅 Select Date Range:</label>
              <input
                type="date"
                value={adminStartDate}
                onChange={e => setAdminStartDate(e.target.value)}
                className="admin-date-input"
              />
              <span className="date-separator">-</span>
              <input
                type="date"
                value={adminEndDate}
                onChange={e => setAdminEndDate(e.target.value)}
                className="admin-date-input"
              />
              <button
                onClick={handleAdminCheckRange}
                disabled={isAdminLoading}
                className="admin-check-btn"
              >
                {isAdminLoading ? 'Loading...' : '🔍 Check'}
              </button>
            </div>
          </div>

          {(summaryStats.missing.length > 0 || summaryStats.reported.length > 0) && (
            <div className="summary-section">
              <div className="summary-header">
                <h3 className="summary-title">
                  📊 Overall Summary ({adminStartDate} to {adminEndDate})
                </h3>
                <button onClick={handleSendRangeEmail} className="email-btn">
                  📧 Send Summary Email (missing branches only)
                </button>
              </div>

              <div className="summary-grid">
                <div className="summary-col reported">
                  <h4 className="col-header success">
                    ✅ Submitted ({summaryStats.reported.length} branches)
                  </h4>
                  <ul className="summary-list success">
                    {summaryStats.reported.map((item, idx) => (
                      <li key={idx}><strong>{item.branch}</strong></li>
                    ))}
                    {summaryStats.reported.length === 0 && <li className="empty-list">- None -</li>}
                  </ul>
                </div>

                <div className="summary-col missing">
                  <h4 className="col-header danger">
                    ❌ Not Submitted ({summaryStats.missing.length} branches)
                  </h4>
                  <ul className="summary-list danger">
                    {summaryStats.missing.map((item, idx) => (
                      <li key={idx}><strong>{item.branch}</strong></li>
                    ))}
                    {summaryStats.missing.length === 0 && <li className="empty-list">- None -</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {adminData.length > 0 && (
            <div className="daily-details-container">
              <h3 className="daily-title">📅 Daily Details</h3>

              {adminData.map((dayStatus, index) => (
                <div key={index} className="daily-card">
                  <div className="daily-header">
                    <h3 className="daily-date">Date {dayStatus.date}</h3>
                    {dayStatus.notSubmitted.length > 0 && (
                      <button
                        onClick={() =>
                          handleSendEmailForDate(dayStatus.date, dayStatus.notSubmitted)
                        }
                        className="daily-email-btn"
                      >
                        📧 Send Reminder
                      </button>
                    )}
                  </div>

                  <div className="daily-grid">
                    <div className="daily-col success-bg">
                      <h4 className="daily-col-title success">
                        ✅ Submitted ({dayStatus.submitted.length})
                      </h4>
                      <div className="daily-list success">
                        {dayStatus.submitted.join(", ") || "-"}
                      </div>
                    </div>

                    <div className="daily-col danger-bg">
                      <h4 className="daily-col-title danger">
                        ❌ Not Submitted ({dayStatus.notSubmitted.length})
                      </h4>
                      <div className="daily-list danger">
                        {dayStatus.notSubmitted.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminPanel;
