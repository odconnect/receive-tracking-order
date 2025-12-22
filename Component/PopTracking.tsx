import React, { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
// import { useReactToPrint } from 'react-to-print';
import './PopTracking.css';

// --- Type Definitions ---
interface InventoryItem {
    id: string;
    branch: string;
    category: string;
    item: string;
    qty: number;
}

interface SnapshotItem {
    id: string;
    item: string;
    qty: number;
    category: string;
    isChecked: boolean;
}

interface HistoryRecord {
    date: string;
    branch: string;
    items: string; // JSON String
    missing: string;
    note: string;
    images: string;
}

interface ProgressStats {
    count: number;
    total: number;
    percent: number;
    isComplete: boolean;
}

interface SubmitPayload {
    branch: string;
    date: string;
    note: string;
    images: string[];
    missingItems: string;
    itemsSnapshot: SnapshotItem[];
}

type LoadingStatus = 'loading' | 'ready' | 'error';
type AppMode = 'entry' | 'history';


const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxbjOMIR_MzIajinfLutQWYMeyD5jSW6t1EjBp_eiCTYcJEEZSYhmn4jjkhg6H7VTMB/exec";

const SHEET_URLS = {
    brand: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=577319442",
    system: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=1864539100",
    special: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=1283637344"
};

const PopTracking: React.FC = () => {

    const [database, setDatabase] = useState<InventoryItem[]>([]);
    const [branches, setBranches] = useState<string[]>([]);
    const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>('loading');

 
    const [mode, setMode] = useState<AppMode>('entry');
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>('');
  
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
    const [reportNote, setReportNote] = useState<string>('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDefectMode, setIsDefectMode] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    
    const [historyData, setHistoryData] = useState<HistoryRecord | null>(null);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    

    const componentRef = useRef<HTMLDivElement>(null);

    
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setSelectedDate(today);

       
        const savedChecks: Record<string, boolean> = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pop_check_')) {
                const id = key.replace('pop_check_', '');
                savedChecks[id] = true;
            }
        }
        setCheckedItems(savedChecks);

        const loadAllData = async () => {
            try {
                const [brandData, systemData, specialData] = await Promise.all([
                    fetchData(SHEET_URLS.brand),
                    fetchData(SHEET_URLS.system),
                    fetchData(SHEET_URLS.special)
                ]);

                let allData: InventoryItem[] = [];
                const allBranches = new Set<string>();

                const parseData = (csv: string, catName: string) => {
                    const parsed = parseCSV(csv, catName, allBranches);
                    allData = [...allData, ...parsed];
                };

                parseData(brandData, "RE-Brand");
                parseData(systemData, "RE-System");
                parseData(specialData, "Special-POP");

                const sortedBranches = Array.from(allBranches)
                    .sort()
                    .filter(b => b.length > 2 && !b.includes("Total") && !b.includes("POP"));

                setDatabase(allData);
                setBranches(sortedBranches);
                setLoadingStatus('ready');
            } catch (error) {
                console.error(error);
                setLoadingStatus('error');
            }
        };

        loadAllData();
    }, []);


    const fetchData = async (url: string): Promise<string> => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network error");
        return await response.text();
    };

    const parseCSV = (csvText: string, categoryName: string, branchSet: Set<string>): InventoryItem[] => {
        if (!csvText) return [];
        const lines = csvText.trim().split('\n');
        let headerIndex = -1;
        const branchIndices: Record<number, string> = {};
        const parsedData: InventoryItem[] = [];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("Head Office")) {
                headerIndex = i;
                const headers = lines[i].split(',');
                headers.forEach((h, index) => {
                    const name = h.trim().replace(/^"|"$/g, '');
                    if (name && !name.includes("Total") && !name.includes("Tracking") && !name.includes("List") && !name.includes("No.")) {
                        branchSet.add(name);
                        branchIndices[index] = name;
                    }
                });
                break;
            }
        }

        if (headerIndex === -1) return [];

        for (let i = headerIndex + 1; i < lines.length; i++) {
            const row = lines[i].split(',');
            if (row.length < 5) continue;
            const itemName = (row[1] || row[0] || "").trim().replace(/^"|"$/g, '');
            if (!itemName || itemName.startsWith("Total") || itemName.startsWith("Tracking")) continue;

            for (const [indexStr, branchName] of Object.entries(branchIndices)) {
                const index = parseInt(indexStr);
                const qtyStr = (row[index] || "0").trim().replace(/^"|"$/g, '');
                const qty = parseInt(qtyStr);
                
                if (!isNaN(qty) && qty > 0) {
                    parsedData.push({
                        branch: branchName,
                        category: categoryName,
                        item: itemName,
                        qty: qty,
                        id: `${branchName}_${itemName}`.replace(/\s+/g, '_')
                    });
                }
            }
        }
        return parsedData;
    };



    const compressImage = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
      
            if (file.type.includes('video')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = error => reject(error);
                return;
            }

           
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                if (event.target?.result) {
                    img.src = event.target.result as string;
                }
                
                img.onload = () => {
                   
                    const canvas: HTMLCanvasElement = document.createElement('canvas');
                    
                    const maxWidth = 1000; 
                    const scaleSize = maxWidth / img.width;
                    const newWidth = (img.width > maxWidth) ? maxWidth : img.width;
                    const newHeight = (img.width > maxWidth) ? (img.height * scaleSize) : img.height;

                    canvas.width = newWidth;
                    canvas.height = newHeight;

                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, newWidth, newHeight);
                        
                        
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                        resolve(compressedDataUrl);
                    } else {
                        reject(new Error("Cannot get canvas context"));
                    }
                };
                
                img.onerror = (error) => reject(error);
            };
            
            reader.onerror = (error) => reject(error);
        });
    };


    // const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    //     const reader = new FileReader();
    //     reader.readAsDataURL(file);
    //     reader.onload = () => resolve(reader.result as string);
    //     reader.onerror = error => reject(error);
    // });

   
    const filteredData = useMemo<InventoryItem[]>(() => {
        if (!selectedBranch) return [];
        let data = database.filter(d => d.branch === selectedBranch);
        if (selectedCategory !== 'all') {
            data = data.filter(d => d.category === selectedCategory);
        }
        return data;
    }, [database, selectedBranch, selectedCategory]);

    const progress = useMemo<ProgressStats>(() => {
        if (filteredData.length === 0) return { count: 0, total: 0, percent: 0, isComplete: false };
        const checkedCount = filteredData.filter(item => checkedItems[item.id]).length;
        const total = filteredData.length;
        return {
            count: checkedCount,
            total: total,
            percent: Math.round((checkedCount / total) * 100),
            isComplete: checkedCount === total
        };
    }, [filteredData, checkedItems]);
const handleToggleCheck = (id: string) => {
        if (!selectedDate) return alert('⚠️ กรุณาระบุวันที่ได้รับ POP');
        
        setCheckedItems(prev => {
            const isCurrentlyChecked = !!prev[id];
            const newState = { ...prev };
            
            if (isCurrentlyChecked) {
                delete newState[id]; 
                localStorage.removeItem('pop_check_' + id);
            } else {
                newState[id] = true;
                localStorage.setItem('pop_check_' + id, 'true');
            }
            return newState;
        });
    };
   const isAllSelected = filteredData.length > 0 && filteredData.every(item => checkedItems[item.id]);

    const handleSelectAll = () => {
        if (!selectedDate) return alert('⚠️ กรุณาระบุวันที่ได้รับ POP');

        const newCheckedState = {...checkedItems};
        if(isAllSelected) {
            filteredData.forEach(item => {
                delete newCheckedState[item.id];
                localStorage.removeItem('pop_check_' + item.id);
            });
        } else {
            filteredData.forEach(item => {
                newCheckedState[item.id] = true;
                localStorage.setItem('pop_check_' + item.id, 'true');
            });
        }
        setCheckedItems(newCheckedState);
        // setCheckedItems(prev => {
        //     const newState = { ...prev, [id]: !prev[id] };
        //     if (newState[id]) localStorage.setItem('pop_check_' + id, 'true');
        //     else localStorage.removeItem('pop_check_' + id);
        //     return newState;
        // });
    };

 const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;
        
        const fileList = Array.from(files);
        const MAX_FILE_SIZE_MB = 20;
        const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; 

        const validSizeFiles = fileList.filter(file => {
            if (file.size > MAX_BYTES) {
                alert(`⚠️ ไฟล์ "${file.name}" มีขนาดใหญ่เกิน ${MAX_FILE_SIZE_MB}MB \n(ระบบจะไม่ทำการอัปโหลดไฟล์นี้)`);
                return false;
            }
            return true;
        });

      
        if (validSizeFiles.length === 0) {
            event.target.value = '';
            return;
        }


        const uniqueNewFiles = validSizeFiles.filter(newFile => 
            !selectedFiles.some(existingFile => 
                existingFile.name === newFile.name && existingFile.size === newFile.size
            )
        );

        if (uniqueNewFiles.length === 0 && validSizeFiles.length > 0) {
             alert('คุณเลือกไฟล์เหล่านี้ไปแล้ว');
             event.target.value = ''; 
             return;
        }

     
        if (selectedFiles.length + uniqueNewFiles.length > 10) {
             alert('แนบไฟล์ได้ไม่เกิน 10 ไฟล์');
             event.target.value = '';
             return;
        }

        setSelectedFiles(prev => [...prev, ...uniqueNewFiles]);
        event.target.value = ''; 
    };
    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

   
    const handleSubmit = async () => {
        if (!selectedBranch) return alert("กรุณาเลือกสาขา");
        if (!selectedDate) return alert("กรุณาเลือกวันที่");

        const allBranchItems = database.filter(d => d.branch === selectedBranch);
        
      
        const itemsSnapshot: SnapshotItem[] = allBranchItems.map(item => ({
            id: item.id,
            item: item.item,
            qty: item.qty,
            category: item.category,
            isChecked: !!checkedItems[item.id]
        }));

        const isAllMissing = itemsSnapshot.length > 0 && itemsSnapshot.every(item => !item.isChecked);
      
        const missingList = itemsSnapshot
            .filter(item => !item.isChecked)
            .map(item => `- ${item.item} (จำนวน: ${item.qty})`);

        const isMissing = missingList.length > 0;
        const missingString = isMissing ? missingList.join("\n") : "-";


if (isAllMissing){
    if (!reportNote){
        return alert("⚠️ คุณยังไม่ได้เลือกรับรายการใดๆ เลย\n\nกรุณาระบุเหตุผลในช่อง 'รายละเอียดปัญหา' ก่อนกดส่ง\n");
    }
}

     else if (isMissing && !reportNote && selectedFiles.length === 0) {
            return alert("⚠️ POP ไม่ครบ: กรุณาระบุรายละเอียด หรือแนบรูปภาพ");
        } else if (isDefectMode) {
            if (!reportNote) return alert("⚠️ แจ้งชำรุด: กรุณาระบุรายละเอียด");
            if (selectedFiles.length === 0) return alert("⚠️ แจ้งชำรุด: กรุณาแนบรูปภาพ");
        } else if (!isMissing && !isDefectMode && selectedFiles.length === 0) {
            return alert("⚠️ ได้รับ POP ครบ: กรุณาถ่ายรูป/วิดีโอยืนยันการรับของ");
        }

        setIsSubmitting(true);

        try {
          const mediaBase64 = await Promise.all(selectedFiles.map(file => compressImage(file)));
            
            let finalNote = reportNote;

            if (isAllMissing) {
                finalNote = reportNote;
            }
           else if (!isMissing && !isDefectMode) finalNote = "Received All POP Items Successfully.";

            const payload: SubmitPayload = {
                branch: selectedBranch,
                date: selectedDate,
                note: finalNote,
                images: mediaBase64,
                missingItems: missingString,
                itemsSnapshot: itemsSnapshot 
            };

            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Alert Message
            let msg = "";
            if(isAllMissing){
                msg=`⚠️ บันทึกข้อมูลแล้ว ยังไม่ได้รับ POP\nเหตุผล: ${reportNote}`;
            } else if (isMissing) {
                msg = `⚠️ บันทึกข้อมูลแล้ว (POP ที่ยังไม่ได้รับ ${missingList.length} รายการ):\n\n`;
                msg += missingList.join("\n");
                msg += `\n\n================\nระบบได้แจ้งเตือนฝ่ายที่เกี่ยวข้องแล้ว`;
            } else if (isDefectMode) {
                msg = `✅ บันทึกข้อมูลสำเร็จ (แจ้งชำรุด)`;
            } else {
                msg = `✅ บันทึกข้อมูลสำเร็จ (ได้รับ POP ครบถ้วน)\nขอบคุณ`;
            }
            alert(msg);

            // Reset
            setReportNote('');
            setSelectedFiles([]);
            setIsDefectMode(false);
            const newCheckedState = { ...checkedItems };
            allBranchItems.forEach(item => {
                delete newCheckedState[item.id];
                localStorage.removeItem('pop_check_' + item.id);
            });
            setCheckedItems(newCheckedState);

        } catch (error) {
            console.error(error);
            alert("❌ เกิดข้อผิดพลาดในการส่งข้อมูล");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- SEARCH HISTORY ---
    const handleSearchHistory = async () => {
        if (!selectedBranch || !selectedDate) return alert("เลือกสาขาและวันที่ก่อนค้นหา");
        setIsHistoryLoading(true);
        setHistoryData(null);

        try {
            const url = `${SCRIPT_URL}?action=getHistory&branch=${encodeURIComponent(selectedBranch)}&date=${selectedDate}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data && data.length > 0) {
                
                setHistoryData(data[data.length - 1]); 
            } else {
                alert("ไม่พบประวัติการบันทึกของวันนี้");
            }
        } catch (error) {
            console.error(error);
            alert("เกิดข้อผิดพลาดในการดึงประวัติ");
        } finally {
            setIsHistoryLoading(false);
        }
    };

    // --- PRINT PDF ---
    // const handlePrint = useReactToPrint({
    //     contentRef: componentRef,
    //     documentTitle: `POP_Report_${selectedBranch}_${selectedDate}`,
    // });


// --- DOWNLOAD PDF FUNCTION ---
   const handleDownloadPDF = () => {
        const element = componentRef.current;
        if (!element) return;
        
        setIsSubmitting(true);
const elementsToHide = element.querySelectorAll('.hide-on-pdf');
const originalStyles: string[] = [];
    elementsToHide.forEach((el) => {
         const htmlEl = el as HTMLElement;
         originalStyles.push(htmlEl.style.display);
         htmlEl.style.display = 'none'; // ซ่อนชั่วคราว
    });
        const opt = {
            margin:       10, 
            filename:     `POP_Report_${selectedBranch}_${selectedDate}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

  (import('html2pdf.js') as any).then((html2pdf: any) => {
         html2pdf.default().set(opt).from(element).save().then(() => {
 
             elementsToHide.forEach((el, index) => {
                 (el as HTMLElement).style.display = originalStyles[index];
             });
             setIsSubmitting(false);
         });
        
    });
};


    // --- Logic UI ---
    const isComplete = progress.isComplete;
    let reportClass = 'mode-incomplete';
    let reportIcon = '📝';
    let reportTitle = 'แจ้งปัญหา / ยังได้รับPOPไม่ครบ';
    let btnText = '🚀 ยืนยันและส่งรายงาน';

    if (isComplete && !isDefectMode) {
        reportClass = 'mode-complete';
        reportIcon = '✅';
        reportTitle = 'ยืนยันการรับของครบถ้วน';
        btnText = '✅ ยืนยันการรับของ (Submit All)';
    } else if (isDefectMode) {
        reportClass = 'mode-incomplete';
        reportIcon = '⚠️';
        reportTitle = 'รายงาน POP ชำรุด/เสียหาย';
        btnText = '🚀 ส่งรายงานความเสียหาย';
    }

    return (
        <div className="pop-container">
            {isSubmitting && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                    <p style={{ marginTop: 15, fontWeight: 600, color: '#ea580c' }}>กำลังทำงาน...</p>
                </div>
            )}

            <header>
                <h1>POP Receive Tracking Order System</h1>
       

               
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
                    <button 
                        onClick={() => setMode('entry')}
                        style={{ 
                            padding: '10px 20px', 
                            borderRadius: 30, 
                            border: 'none', 
                            background: mode === 'entry' ? '#4f46e5' : '#e2e8f0', 
                            color: mode === 'entry' ? 'white' : '#64748b',
                            fontWeight: 600, cursor: 'pointer',
                            boxShadow: mode === 'entry' ? '0 4px 6px -1px rgba(79, 70, 229, 0.2)' : 'none'
                        }}
                    >
                        📝 Check POP Order
                    </button>
                    <button 
                        onClick={() => setMode('history')}
                        style={{ 
                            padding: '10px 20px', 
                            borderRadius: 30, 
                            border: 'none', 
                            background: mode === 'history' ? '#4f46e5' : '#e2e8f0', 
                            color: mode === 'history' ? 'white' : '#64748b',
                            fontWeight: 600, cursor: 'pointer',
                            boxShadow: mode === 'history' ? '0 4px 6px -1px rgba(79, 70, 229, 0.2)' : 'none'
                        }}
                    >
                        📜 History POP Receive
                    </button>
                </div>
            </header>

            <div className="status-wrapper">
                {loadingStatus === 'loading' && <div className="loading-pill"><div className="dot"></div> Connecting...</div>}
                {loadingStatus === 'ready' && <div className="loading-pill ready">✅ Ready</div>}
                {loadingStatus === 'error' && <div className="loading-pill error">❌ Disconnect</div>}
            </div>

   
          <div className="controls-card">
            
                <div className="input-group">
                    <label>1. เลือกสาขา (Branch)</label>
                    <select 
                        value={selectedBranch} 
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        disabled={loadingStatus !== 'ready'}
                    >
                        <option value="">-- กรุณาเลือกสาขา --</option>
                        {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>

               
                {mode === 'entry' ? (
                   
                    <div className="input-group">
                        <label>2. หมวดหมู่ (Category)</label>
                        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                            <option value="all">แสดงทั้งหมด (All)</option>
                            <option value="RE-Brand">RE-Brand</option>
                            <option value="RE-System">RE-System</option>
                            <option value="Special-POP">Special POP</option>
                        </select>
                    </div>
                ) : (
                
                    <div className="input-group">
                        <label>2. วันที่ (Date) <span className="required">*</span></label>
                        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                    </div>
                )}

          
                {mode === 'entry' ? (
             
                    <div className="input-group">
                        <label>3. วันที่ (Date) <span className="required">*</span></label>
                        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                    </div>
                ) : (
             
                    <div className="input-group" style={{display: 'flex', alignItems: 'end'}}>
                        <button 
                            onClick={handleSearchHistory} 
                            disabled={isHistoryLoading}
                            style={{ 
                                width: '100%', padding: '12px', background: '#0ea5e9', color: 'white', 
                                border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold' 
                            }}
                        >
                            {isHistoryLoading ? '⏳ Searching...' : '🔍 Search History'}
                        </button>
                    </div>
                )}
            </div>

           
            {mode === 'entry' && selectedBranch && filteredData.length > 0 && (
                <>
                    <div className="progress-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 5, color: 'var(--text-sub)' }}>
                            <span>ความคืบหน้าการตรวจรับ</span>
                            <span>{progress.count}/{progress.total} ({progress.percent}%)</span>
                        </div>
                        <div className="progress-container">
                            <div className="progress-bar" style={{ width: `${progress.percent}%` }}></div>
                        </div>
                    </div>

                    <div className="result-card">
                        <div className="result-header">
                            <span className="branch-title">{selectedBranch}</span>
                            <span className="total-badge">รวม {filteredData.length} รายการ</span>
                        </div>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: 50 }}>หมวด</th>
                                        <th>รายการ</th>
                                        
                                        <th style={{ width: 40, textAlign: 'center' }}>จำนวน</th>

                                        <th style={{width:60, textAlign: 'center' }}>
                                <div style={{display:'flex', flexDirection:'column', alignItems:'center',gap:2}}>
                                    <span style={{fontSize: '0.6rem'}}>รับแล้ว</span>
                                    <input 
                                        type="checkbox" 
                                        className="custom-checkbox header-checkbox"
                                        checked={isAllSelected}
                                        onChange={handleSelectAll}
                                        disabled={!selectedDate || filteredData.length === 0}
                                    />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map(row => {
                            const isChecked = !!checkedItems[row.id];
                                        return (
                                            <tr key={row.id} className={isChecked ? 'checked-row' : ''} onClick={() => handleToggleCheck(row.id)}>
                                                <td><span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, color: '#64748b' }}>{row.category.replace('RE-', '').replace('Special-', '')}</span></td>
                                                <td className="item-name" style={{ color: '#334155', whiteSpace: 'normal', pointerEvents: 'none' }}>{row.item}</td>
                                                <td style={{ textAlign: 'center', pointerEvents: 'none' }}><span className="qty-pill">{row.qty}</span></td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                        <input type="checkbox" className="custom-checkbox" checked={isChecked} readOnly style={{ pointerEvents: 'none' }} disabled={!selectedDate} />
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={`report-section ${reportClass}`}>
                        <div className="report-header">
                            <div><span style={{ marginRight: 8 }}>{reportIcon}</span><span>{reportTitle}</span></div>
                            {(isComplete || isDefectMode) && (
                                <button className={`defect-toggle-btn ${isDefectMode ? 'active' : ''}`} onClick={() => setIsDefectMode(!isDefectMode)}>
                                    {isDefectMode ? '↩️ ยกเลิกแจ้งชำรุด' : '⚠️ พบ POP ชำรุด?'}
                                </button>
                            )}
                        </div>
                        <div className="report-grid">
                            {(!isComplete || isDefectMode) && (
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 5 }}>รายละเอียดปัญหา</label>
                                    <textarea rows={3} placeholder="ระบุรายการ POP ที่หายไป หรือเสียหาย..." value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
                                </div>
                            )}
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 5 }}>แนบรูปภาพ/วิดีโอ (จำเป็น)</label>
                                <div className="upload-box">
                                    <input type="file" className="upload-input" accept="image/*,video/*" multiple onChange={handleFileSelect} />
                                    <div style={{ fontSize: 24, marginBottom: 5, color: '#fb923c' }}>📷 🎥</div>
                                    <div style={{ color: '#f97316', fontSize: '0.85rem', fontWeight: 600, pointerEvents: 'none' }}>กดเพื่อถ่ายรูป/วิดีโอ หรือเลือกไฟล์<br /><span style={{ color: 'red', fontSize: '0.7rem' }}>(รวมไม่เกิน 10 ไฟล์)</span></div>
                                </div>
                                <div className="preview-grid">
                                    {selectedFiles.map((file, index) => {
                                        const url = URL.createObjectURL(file);
                                        return (
                                            <div key={index} className="preview-item">
                                                {file.type.startsWith('video/') ? <video src={url} className="preview-media" controls /> : <img src={url} alt="preview" className="preview-media" />}
                                                <div className="delete-btn" onClick={() => removeFile(index)}>×</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                            <button className="btn-submit" onClick={handleSubmit}>{btnText}</button>
                        </div>
                    </div>
                </>
            )}

       
            {mode === 'history' && (
                <div className="result-card" style={{ padding: 20, minHeight: 300 }}>
                    {!historyData && !isHistoryLoading && (
                        <div className="empty-state">
                            <span>🔍</span>
                            <p>เลือกสาขาและวันที่ แล้วกดปุ่ม "ค้นหาประวัติ"</p>
                        </div>
                    )}

                    {isHistoryLoading && (
                         <div className="empty-state">
                            <div className="spinner" style={{margin:'0 auto'}}></div>
                            <p>กำลังดึงข้อมูล...</p>
                        </div>
                    )}

                    {historyData && (
                        <div>
                            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={handleDownloadPDF} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    🖨️ Export PDF / Print
                                </button>
                            </div>

                          
                            <div ref={componentRef} style={{ padding: 40, background: 'white', color: '#000' }}>
                                <div style={{textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #eee', paddingBottom: 10}}>
                                    <h2 style={{ margin: 0 }}>POP Receive Tracking Order</h2>
                                    <p style={{ margin: '5px 0 0 0', color: '#666' }}>POP Receive Tracking Order System</p>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, fontSize: '0.9rem' }}>
                                    <div><strong>🏠 สาขา:</strong> {historyData.branch}</div>
                                    <div style={{textAlign: 'right'}}><strong>📅 วันที่ตรวจสอบ:</strong> {historyData.date}</div>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f1f5f9', color: '#333' }}>
                                            <th style={{ border: '1px solid #ddd', padding: 8 }}>รายการ (Item)</th>
                                            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'center', width: 60 }}>จำนวน</th>
                                            <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'center', width: 100 }}>สถานะ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            try {
                                                const items: SnapshotItem[] = JSON.parse(historyData.items);
                                                return items.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td style={{ border: '1px solid #ddd', padding: 8 }}>{item.item}</td>
                                                        <td style={{ border: '1px solid #ddd', padding: 8, textAlign: 'center' }}>{item.qty}</td>
                                                        <td style={{ border: '1px solid #ddd', padding: 8, textAlign: 'center', fontWeight: 'bold', color: item.isChecked ? '#16a34a' : '#dc2626' }}>
                                                            {item.isChecked ? '✅ ได้รับครบ' : '❌ ยังไม่ได้รับ'}
                                                        </td>
                                                    </tr>
                                                ));
                                            } catch (e) {
                                                return <tr><td colSpan={3} style={{textAlign:'center', padding:20, color:'red'}}>⚠️ ไม่สามารถโหลดรายการPOPได้ (ข้อมูลอาจเสียหาย)</td></tr>;
                                            }
                                        })()}
                                    </tbody>
                                </table>

                                {historyData.missing && historyData.missing !== "-" && (
                                    <div className="hide-on-pdf" style={{ marginTop: 20, padding: 15, border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 8 }}>
                                        <h4 style={{ margin: '0 0 10px 0', color: '#b91c1c' }}>⚠️ รายการที่ยังไม่ได้รับ / แจ้งปัญหา:</h4>
                                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Sarabun, sans-serif', margin: 0, fontSize: '0.9rem' }}>{historyData.missing}</pre>
                                    </div>
                                )}

                                <div style={{ marginTop: 20, padding: 15, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                    <strong>📝 หมายเหตุ:</strong> {historyData.note || "-"}
                                </div>

                                <div style={{ marginTop: 50, textAlign: 'center', paddingTop: 20 }}>
                                    {/* <div style={{ borderTop: '1px solid #ddd', display: 'inline-block', paddingTop: 10, width: 200 }}>
                                        ลงชื่อผู้ตรวจสอบ
                                    </div> */}
                                    <div style={{ fontSize: '0.8rem', color: '#999', marginTop: 5 }}>
                                        (บันทึกอัตโนมัติเมื่อ {historyData.date})
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Empty States */}
            {mode === 'entry' && !selectedBranch && (
                <div className="empty-state">
                    <span>👈</span>
                    <p>เลือกสาขาเพื่อเริ่มเช็ค POP</p>
                </div>
            )}
             {mode === 'entry' && selectedBranch && filteredData.length === 0 && (
                <div className="empty-state">
                    <span>📭</span>
                    <p>ไม่พบรายการ POP สำหรับสาขานี้</p>
                </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 30, fontSize: '0.75rem', color: '#94a3b8' }}>
                * ข้อมูลจะถูกบันทึกลง Google Sheet
            </div>
        </div>
    );
};

export default PopTracking;