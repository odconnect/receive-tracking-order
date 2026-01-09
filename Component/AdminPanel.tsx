import React, { useState, useMemo, useEffect } from 'react';

interface DailyStatus { date: string; submitted: string[]; notSubmitted: string[]; }


interface AdminPanelProps {
    branches: string[];
    scriptUrl: string;
    onClose: () => void;
}

const ADMIN_PASSWORD = "212224428";

const AdminPanel: React.FC<AdminPanelProps> = ({ branches, scriptUrl, onClose }) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [passwordInput, setPasswordInput] = useState<string>('');
    
    // Date States
    const [adminStartDate, setAdminStartDate] = useState<string>('');
    const [adminEndDate, setAdminEndDate] = useState<string>('');
    
    const [adminData, setAdminData] = useState<DailyStatus[]>([]);
    const [isAdminLoading, setIsAdminLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setAdminStartDate(today);
        setAdminEndDate(today);
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordInput === ADMIN_PASSWORD) { setIsAuthenticated(true); setPasswordInput(''); } else alert("รหัสผ่านไม่ถูกต้อง!");
    };

    const handleAdminCheckRange = async () => {
        if (!adminStartDate || !adminEndDate) return alert("กรุณาเลือกช่วงวันที่ให้ครบ");
        if (new Date(adminStartDate) > new Date(adminEndDate)) return alert("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");

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

                results.push({ date: dateStr, submitted: submitted, notSubmitted: notSubmitted });
                current.setDate(current.getDate() + 1);
            }
            setAdminData(results);
        } catch (error) {
            console.error(error);
            alert("เกิดข้อผิดพลาดในการดึงข้อมูล Admin");
        } finally {
            setIsAdminLoading(false);
        }
    };

    const summaryStats = useMemo(() => {
        if (adminData.length === 0) return { missing: [], reported: [] };
        
        const stats: Record<string, { submitted: number, missing: number }> = {};
        branches.forEach(b => stats[b] = { submitted: 0, missing: 0 });

        adminData.forEach(day => {
            day.submitted.forEach(b => { if(stats[b]) stats[b].submitted++; });
            day.notSubmitted.forEach(b => { if(stats[b]) stats[b].missing++; });
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

    const handleSendEmailForDate = async (date: string, notSubmitted: string[]) => {
        if (!confirm(`ยืนยันส่งอีเมลรายงานของวันที่ ${date}?`)) return;
        setIsSubmitting(true);
        try {
            await fetch(scriptUrl, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sendEmail', date: date, notSubmittedList: notSubmitted })
            });
            alert(`📧 ส่งอีเมลรายงานของวันที่ ${date} เรียบร้อยแล้ว`);
        } catch (error) { console.error(error); alert("❌ ส่งอีเมลล้มเหลว"); } finally { setIsSubmitting(false); }
    };

    const handleSendRangeEmail = async () => {
        if (adminData.length === 0) return;
        if (!confirm(`ยืนยันส่งอีเมลสรุปยอดรวมทั้งหมด (${adminStartDate} ถึง ${adminEndDate})?`)) return;
        
        const missingForEmail = summaryStats.missing.map(item => ({ branch: item.branch, dates: [] }));

        setIsSubmitting(true);
        try {
            await fetch(scriptUrl, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'sendRangeEmail', 
                    startDate: adminStartDate, 
                    endDate: adminEndDate, 
                    summary: missingForEmail
                })
            });
            alert(`📧 ส่งอีเมลสรุปภาพรวมเรียบร้อยแล้ว`);
        } catch (error) { console.error(error); alert("❌ ส่งอีเมลล้มเหลว"); } finally { setIsSubmitting(false); }
    };

    // --- RENDER ---

    if (!isAuthenticated) {
        return (
            <div className="login-box">
                <h3 className="login-title">🔒 Login Admin</h3>
                <form onSubmit={handleLogin}>
                    <input 
                        type="password" 
                        placeholder="password" 
                        value={passwordInput} 
                        onChange={(e) => setPasswordInput(e.target.value)} 
                        className="login-input"
                    />
                    <div className="login-actions">
                        <button type="submit" className="login-btn">Login</button>
                        <button type="button" onClick={onClose} className="login-cancel-btn">Cancel</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div>
            {isSubmitting && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                    <p className="loading-text">Processing...</p>
                </div>
            )}
            
            <div className="controls-card">
                <div className="admin-date-controls">
                    <label className="admin-date-label">📅 Select Date:</label>
                    <input 
                        type="date" 
                        value={adminStartDate} 
                        onChange={(e) => setAdminStartDate(e.target.value)} 
                        className="admin-date-input" 
                    />
                    <span className="date-separator">-</span>
                    <input 
                        type="date" 
                        value={adminEndDate} 
                        onChange={(e) => setAdminEndDate(e.target.value)} 
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
                        <h3 className="summary-title">📊 สรุปภาพรวม ({adminStartDate} ถึง {adminEndDate})</h3>
                        <button onClick={handleSendRangeEmail} className="email-btn">📧 ส่งอีเมลสรุป (เฉพาะสาขาที่ขาด)</button>
                    </div>
                    
                    <div className="summary-grid">
                        <div className="summary-col reported">
                            <h4 className="col-header success">✅ รายงานแล้ว ({summaryStats.reported.length} สาขา)</h4>
                            <ul className="summary-list success">
                                {summaryStats.reported.map((item, idx) => (
                                    <li key={idx}><strong>{item.branch}</strong></li>
                                ))}
                                {summaryStats.reported.length === 0 && <li className="empty-list">- ไม่มี -</li>}
                            </ul>
                        </div>
                        <div className="summary-col missing">
                            <h4 className="col-header danger">❌ ขาดส่ง ({summaryStats.missing.length} สาขา)</h4>
                            <ul className="summary-list danger">
                                {summaryStats.missing.map((item, idx) => (
                                    <li key={idx}><strong>{item.branch}</strong></li>
                                ))}
                                {summaryStats.missing.length === 0 && <li className="empty-list">- ไม่มี -</li>}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {adminData.length > 0 && (
                <div className="daily-details-container">
                    <h3 className="daily-title">📅 รายละเอียดรายวัน</h3>
                    {adminData.map((dayStatus, index) => (
                        <div key={index} className="daily-card">
                            <div className="daily-header">
                                <h3 className="daily-date">วันที่ {dayStatus.date}</h3>
                                {dayStatus.notSubmitted.length > 0 && (
                                    <button 
                                        onClick={() => handleSendEmailForDate(dayStatus.date, dayStatus.notSubmitted)} 
                                        className="daily-email-btn"
                                    >
                                        📧 ส่งอีเมลตามงาน
                                    </button>
                                )}
                            </div>
                            <div className="daily-grid">
                                <div className="daily-col success-bg">
                                    <h4 className="daily-col-title success">✅ ส่งแล้ว ({dayStatus.submitted.length})</h4>
                                    <div className="daily-list success">{dayStatus.submitted.join(", ") || "-"}</div>
                                </div>
                                <div className="daily-col danger-bg">
                                    <h4 className="daily-col-title danger">❌ ยังไม่ส่ง ({dayStatus.notSubmitted.length})</h4>
                                    <div className="daily-list danger">{dayStatus.notSubmitted.join(", ") || "-"}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminPanel;