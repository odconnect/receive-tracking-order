import React, { useState, useEffect, useMemo,  type ChangeEvent } from 'react';
import './PopTracking.css';
import AdminPanel from './AdminPanel'; 
import HistoryPanel from './HistoryPanel'; 
import {
  normalizeBranchKey,
  resolveCanonicalBranch
} from './utils/branchResolver';


// --- Type Definitions ---
interface InventoryItem { id: string; branch: string; branchKey: string;  category: string; item: string; qty: number; }
interface SnapshotItem { id: string; item: string; qty: number; category: string; isChecked: boolean; }
interface ProgressStats { count: number; total: number; percent: number; isComplete: boolean; }
interface SubmitPayload { branch: string; trackingNo: string; category: string; date: string; note: string; images: string[]; missingItems: string; itemsSnapshot: SnapshotItem[]; }
interface TrackingInfo { number: string; type: 'POP' | 'Equipment'; }

type LoadingStatus = 'loading' | 'ready' | 'error';
type AppMode = 'entry' | 'history' | 'admin';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwZGVUS5zAHrA07rrABvY2wemdqbnt0_tmKMxXPVaVL9LIvuz4X4YjYpCowuFXTsqOp/exec";

const SHEET_URLS = {
    brand: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=577319442",
    system: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=1864539100",
    special: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=1283637344",
    tracking: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=1495482850",
    equipment: "https://docs.google.com/spreadsheets/d/1f4jzIQd2wdIAMclsY4vRw04SScm5xUYN0bdOz8Rn4Pk/export?format=csv&gid=288598451"
};


const SkeletonLoader = () => {
    return (
        <div className="animate-pulse" style={{ marginTop: 20 }}>
            <div className="skeleton-controls">
                <div className="skeleton skeleton-input"></div><div className="skeleton skeleton-input"></div><div className="skeleton skeleton-input"></div>
            </div>
            <div style={{ marginBottom: 20 }}><div className="skeleton" style={{ height: 20, width: '100%', borderRadius: 10 }}></div></div>
            <div className="skeleton-card"><div className="skeleton skeleton-header"></div>{[...Array(6)].map((_, i) => (<div key={i} className="skeleton-row"><div className="skeleton skeleton-col" style={{ width: '15%' }}></div><div className="skeleton skeleton-col" style={{ width: '60%' }}></div><div className="skeleton skeleton-col" style={{ width: '10%' }}></div><div className="skeleton skeleton-col" style={{ width: '15%' }}></div></div>))}</div>
        </div>
    );
};

const PopTracking: React.FC = () => {
    const [database, setDatabase] = useState<InventoryItem[]>([]);
    const [branches, setBranches] = useState<string[]>([]);
    const [trackingMap, setTrackingMap] = useState<Record<string, TrackingInfo[]>>({}); 
    const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>('loading');
    const [mode, setMode] = useState<AppMode>('entry');
    
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedTrackingNo, setSelectedTrackingNo] = useState<string>('');
    const [availableTrackings, setAvailableTrackings] = useState<TrackingInfo[]>([]);

    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 50;
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
    const [reportNote, setReportNote] = useState<string>('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDefectMode, setIsDefectMode] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    
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
                const [brandData, systemData, specialData, equipmentData, trackingData] = await Promise.all([
                    fetchData(SHEET_URLS.brand), 
                    fetchData(SHEET_URLS.system), 
                    fetchData(SHEET_URLS.special),
                    fetchData(SHEET_URLS.equipment),
                    fetchData(SHEET_URLS.tracking)
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
                
                
           
                const equipmentItems = parseEquipmentCSV(equipmentData, "Equipment-Order", allBranches);
                allData = [...allData, ...equipmentItems];

                const parsedTrackingMap = parseTrackingCSV(trackingData, allBranches);

                const sortedBranches = Array.from(allBranches).sort().filter(b => b.length > 2 && !b.includes("Total") && !b.includes("POP"));
                
                setDatabase(allData); 
                setBranches(sortedBranches); 
                setTrackingMap(parsedTrackingMap);
                setLoadingStatus('ready');
            } catch (error) { console.error(error); setLoadingStatus('error'); }
        };
        loadAllData();
    }, []);

    useEffect(() => { setCurrentPage(1); }, [selectedBranch, selectedCategory, searchTerm]);

    useEffect(() => {
        if (selectedBranch) {
            const list = trackingMap[selectedBranch] || [];
            setAvailableTrackings(list);
            
            if (list.length === 1) {
                const info = list[0];
                setSelectedTrackingNo(info.number);
                handleCategoryAutoSwitch(info.type);
            } else {
                setSelectedTrackingNo('');
          
            }
        } else {
            setAvailableTrackings([]);
            setSelectedTrackingNo('');
        }
    }, [selectedBranch, trackingMap]);

    const handleCategoryAutoSwitch = (type: 'POP' | 'Equipment') => {
        if (type === 'Equipment') {
            setSelectedCategory('Equipment-Order');
        } else {
            setSelectedCategory('all'); 
        }
    };

    const handleTrackingChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setSelectedTrackingNo(val);
        const found = availableTrackings.find(t => t.number === val);
        if (found) {
            handleCategoryAutoSwitch(found.type);
        }
    };

    const fetchData = async (url: string): Promise<string> => { const response = await fetch(url); if (!response.ok) throw new Error("Network error"); return await response.text(); };
    
const parseEquipmentCSV = (
  csvText: string,
  categoryName: string,
  branchSet: Set<string>
): InventoryItem[] => {
  if (!csvText) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"'; 
        i++; 
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField); 
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

 
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
      const colB = rows[i][1]?.trim(); 
      if (colB === 'Shop') {
          headerRowIndex = i;
          break;
      }
  }

  if (headerRowIndex === -1) return [];

  const subHeaderIndex = headerRowIndex + 1;
  const subHeaders = rows[subHeaderIndex]; 

  if (!subHeaders) return []; 

  const dataStartIndex = subHeaderIndex + 1;

  const map = new Map<string, InventoryItem>();

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const rawBranch = row[1]?.trim();
    if (!rawBranch) continue;

    let branch = "";
    if (branchSet.has(rawBranch)) {
        branch = rawBranch;
    } else {
        const target = rawBranch.replace(/\s+/g, '').toLowerCase();
        for (const existing of branchSet) {
            if (existing.replace(/\s+/g, '').toLowerCase() === target) {
                branch = existing;
                break;
            }
        }
    }

    if (!branch) continue; 

    for (let col = 3; col < subHeaders.length; col++) {
   
      const header = subHeaders[col];
      

      if (!header || header.toLowerCase().includes('total')) continue;

      const item = header.replace(/^Quantity\s*/i, '').trim();

      const qty = parseInt(row[col]?.replace(/,/g, '').trim() || '0', 10);
      
      if (qty > 0) {
        const key = `${branch}|${item}`;
        if (map.has(key)) {
          map.get(key)!.qty += qty;
        } else {
          map.set(key, {
            id: `EQ_${normalizeBranchKey(branch)}_${item}`.replace(/\s+/g, '_'),
            branch,
            branchKey: normalizeBranchKey(branch),
            category: categoryName,
            item, 
            qty
          });
        }
      }
    }
  }

  return Array.from(map.values());
};

const parseTrackingCSV = (
  csvText: string,
  branchSet: Set<string>
): Record<string, TrackingInfo[]> => {
  const map: Record<string, TrackingInfo[]> = {};
  const lines = csvText.trim().split('\n');

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const rawBranch = row[0]?.replace(/^"|"$/g, '').trim();
    if (!rawBranch) continue;

    const branch = resolveCanonicalBranch(rawBranch, branchSet);
    if (!branch) continue;

    const result: TrackingInfo[] = [];

    const pop = row[1]?.trim();
    const equip = row[2]?.trim();

    if (pop && pop !== '-' && pop !== '0') {
      pop.split(/[\n,]+/).forEach(n =>
        result.push({ number: n.trim(), type: 'POP' })
      );
    }

    if (equip && equip !== '-' && equip !== '0') {
      equip.split(/[\n,]+/).forEach(n =>
        result.push({ number: n.trim(), type: 'Equipment' })
      );
    }

    if (result.length) {
      map[branch] = map[branch]
        ? [...map[branch], ...result]
        : result;
    }
  }

  return map;
};


    const parseCSV = (
        csvText: string, 
        categoryName: string, 
        branchSet: Set<string>, 
   
    ): InventoryItem[] => {
        if (!csvText) return [];
        const lines = csvText.trim().split('\n');
        let headerIndex = -1;
        const branchIndices: Record<number, string> = {};
        const parsedData: InventoryItem[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes("Head Office") || line.includes("Central World") || line.includes("Siam Paragon")) {
                headerIndex = i;
                const headers = lines[i].split(',');
                headers.forEach((h, index) => {
                    const name = h.trim().replace(/^"|"$/g, '');
                    if (name && !name.includes("Total") && !name.includes("Tracking") && !name.includes("List") && !name.includes("No.") && !name.includes("Item") && !name.includes("Unit")) {
                        branchSet.add(name); branchIndices[index] = name;
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
            if (!itemName || itemName.startsWith("Total") || itemName.toLowerCase().includes("tracking")) continue;
            
            for (const [indexStr, branchName] of Object.entries(branchIndices)) {
                const index = parseInt(indexStr);
                const qtyStr = (row[index] || "0").trim().replace(/^"|"$/g, '');
                const qty = parseInt(qtyStr);
                if (!isNaN(qty) && qty > 0) {
                    parsedData.push({ branch: branchName,  branchKey: normalizeBranchKey(branchName), category: categoryName, item: itemName, qty: qty, id: `${branchName}_${itemName}`.replace(/\s+/g, '_') });
                }
            }
        }
        return parsedData;
    };

    const compressImage = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (file.type.includes('video')) { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result as string); reader.onerror = error => reject(error); return; }
            const reader = new FileReader(); reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image(); if (event.target?.result) img.src = event.target.result as string;
                img.onload = () => {
                    const canvas: HTMLCanvasElement = document.createElement('canvas');
                    const maxWidth = 1000; const scaleSize = maxWidth / img.width;
                    const newWidth = (img.width > maxWidth) ? maxWidth : img.width;
                    const newHeight = (img.width > maxWidth) ? (img.height * scaleSize) : img.height;
                    canvas.width = newWidth; canvas.height = newHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) { ctx.drawImage(img, 0, 0, newWidth, newHeight); resolve(canvas.toDataURL('image/jpeg', 0.7)); } else { reject(new Error("Cannot get canvas context")); }
                }; img.onerror = (error) => reject(error);
            }; reader.onerror = (error) => reject(error);
        });
    };

// const filteredData = useMemo<InventoryItem[]>(() => {
//   if (!selectedBranch) return [];

//   let data = database.filter(d => {

//     if (d.category === 'Equipment-Order') {
//       return (
//         selectedCategory === 'Equipment-Order' ||
//         availableTrackings.some(t => t.type === 'Equipment')
//       );
//     }


//     return d.branchKey === normalizeBranchKey(selectedBranch);
//   });

//   if (selectedCategory !== 'all') {
//     data = data.filter(d => d.category === selectedCategory);
//   }

//   if (searchTerm) {
//     const lower = searchTerm.toLowerCase();
//     data = data.filter(d => d.item.toLowerCase().includes(lower));
//   }

//   return data;
// }, [
//   database,
//   selectedBranch,
//   selectedCategory,
//   searchTerm,
//   availableTrackings
// ]);

const filteredData = useMemo<InventoryItem[]>(() => {
  if (!selectedBranch) return [];

  const branchKey = normalizeBranchKey(selectedBranch);

  let data = database.filter(
    d => d.branchKey === branchKey
  );

  if (selectedCategory !== 'all') {
    data = data.filter(d => d.category === selectedCategory);
  }

  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    data = data.filter(d =>
      d.item.toLowerCase().includes(lower)
    );
  }

  return data;
}, [database, selectedBranch, selectedCategory, searchTerm]);




    const currentTableData = useMemo(() => {
        const indexOfLastItem = currentPage * itemsPerPage; const indexOfFirstItem = indexOfLastItem - itemsPerPage;
        return filteredData.slice(indexOfFirstItem, indexOfLastItem);
    }, [filteredData, currentPage, itemsPerPage]);
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    const progress = useMemo<ProgressStats>(() => {
        if (filteredData.length === 0) return { count: 0, total: 0, percent: 0, isComplete: false };
        const checkedCount = filteredData.filter(item => checkedItems[item.id]).length; const total = filteredData.length;
        return { count: checkedCount, total: total, percent: Math.round((checkedCount / total) * 100), isComplete: checkedCount === total };
    }, [filteredData, checkedItems]);

    const handleToggleCheck = (id: string) => {
        if (!selectedDate) return alert('⚠️ Please specify the POP receipt date');
        setCheckedItems(prev => {
            const isCurrentlyChecked = !!prev[id]; const newState = { ...prev };
            if (isCurrentlyChecked) { delete newState[id]; localStorage.removeItem('pop_check_' + id); } 
            else { newState[id] = true; localStorage.setItem('pop_check_' + id, 'true'); }
            return newState;
        });
    };
    const isAllSelected = filteredData.length > 0 && filteredData.every(item => checkedItems[item.id]);
    const handleSelectAll = () => {
        if (!selectedDate) return alert('⚠️ Please specify the POP receipt date');
        const newCheckedState = {...checkedItems};
        if(isAllSelected) { filteredData.forEach(item => { delete newCheckedState[item.id]; localStorage.removeItem('pop_check_' + item.id); }); } 
        else { filteredData.forEach(item => { newCheckedState[item.id] = true; localStorage.setItem('pop_check_' + item.id, 'true'); }); }
        setCheckedItems(newCheckedState);
    };
 
    const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files; if (!files) return;
        const fileList = Array.from(files); const MAX_FILE_SIZE_MB = 20; const MAX_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; 
        const validSizeFiles = fileList.filter(file => { if (file.size > MAX_BYTES) { alert(`⚠️ File "${file.name}" exceeds ${MAX_FILE_SIZE_MB}MB`); return false; } return true; });
        if (validSizeFiles.length === 0) { event.target.value = ''; return; }
        const uniqueNewFiles = validSizeFiles.filter(newFile => !selectedFiles.some(existingFile => existingFile.name === newFile.name && existingFile.size === newFile.size));
        if (selectedFiles.length + uniqueNewFiles.length > 10) { alert('Cannot attach more than 10 files'); event.target.value = ''; return; }
        setSelectedFiles(prev => [...prev, ...uniqueNewFiles]); event.target.value = ''; 
    };
    const removeFile = (index: number) => { setSelectedFiles(prev => prev.filter((_, i) => i !== index)); };

    const handleSubmit = async () => {
        if (!selectedBranch) return alert("Please select a branch"); 
        if (!selectedDate) return alert("Please select a date");
        
        const allBranchItems = database.filter(d => d.branch === selectedBranch);
        const itemsSnapshot: SnapshotItem[] = allBranchItems.map(item => ({ id: item.id, item: item.item, qty: item.qty, category: item.category, isChecked: !!checkedItems[item.id] }));
        const isAllMissing = itemsSnapshot.length > 0 && itemsSnapshot.every(item => !item.isChecked);
        const missingList = itemsSnapshot.filter(item => !item.isChecked).map(item => `- ${item.item} (Qty: ${item.qty})`);
        const isMissing = missingList.length > 0; const missingString = isMissing ? missingList.join("\n") : "-";

        if (isAllMissing && !reportNote) return alert("⚠️ You haven't selected any received items.\n\nPlease specify the reason in the 'Issue Details' box before submitting.\n");
        else if (isMissing && !reportNote && selectedFiles.length === 0) return alert("⚠️ Missing POP: Please provide details or attach images");
        else if (isDefectMode) { if (!reportNote) return alert("⚠️ Reporting Defect: Please provide details"); if (selectedFiles.length === 0) return alert("⚠️ Reporting Defect: Please attach images"); }
        else if (!isMissing && !isDefectMode && selectedFiles.length === 0) return alert("⚠️ All POP Received: Please take a photo/video to confirm receipt");

        setIsSubmitting(true);
        try {
          const mediaBase64 = await Promise.all(selectedFiles.map(file => compressImage(file)));
            let finalNote = reportNote;
            if (isAllMissing) finalNote = reportNote;
            else if (!isMissing && !isDefectMode) finalNote = "Received All POP Items Successfully.";

            const payload: SubmitPayload = { 
                branch: selectedBranch, 
                trackingNo: selectedTrackingNo || "-", 
                category: selectedCategory,
                date: selectedDate, 
                note: finalNote, 
                images: mediaBase64, 
                missingItems: missingString, 
                itemsSnapshot: itemsSnapshot 
            };

            await fetch(SCRIPT_URL, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let msg = "";
            if(isAllMissing) msg=`⚠️ บันทึกข้อมูลแล้ว (ยังไม่ได้รับ POP)\nเหตุผล: ${reportNote}`;
            else if (isMissing) msg = `⚠️ บันทึกข้อมูลแล้ว (POP ขาดหาย ${missingList.length} รายการ):\n\n` + missingList.join("\n") + `\n\n================\nระบบได้แจ้งเตือนฝ่ายที่เกี่ยวข้องแล้ว`;
            else if (isDefectMode) msg = `✅ บันทึกข้อมูลสำเร็จ (แจ้งของชำรุด)`;
            else msg = `✅ บันทึกข้อมูลสำเร็จ (ได้รับ POP ครบถ้วน)\nขอบคุณ`;
            alert(msg);

            setReportNote(''); setSelectedFiles([]); setIsDefectMode(false); setSelectedTrackingNo('');
            const newCheckedState = { ...checkedItems };
            allBranchItems.forEach(item => { delete newCheckedState[item.id]; localStorage.removeItem('pop_check_' + item.id); });
            setCheckedItems(newCheckedState);
        } catch (error) { console.error(error); alert("❌ Error sending data"); } finally { setIsSubmitting(false); }
    };

    const isComplete = progress.isComplete;
    let reportClass = 'mode-incomplete'; let reportIcon = '📝'; let reportTitle = 'Report Issue / Missing POP'; let btnText = '🚀 Confirm and Submit Report';
    if (isComplete && !isDefectMode) { reportClass = 'mode-complete'; reportIcon = '✅'; reportTitle = 'Confirm Complete Receipt'; btnText = '✅ Confirm Receipt (Submit All)'; } 
    else if (isDefectMode) { reportClass = 'mode-incomplete'; reportIcon = '⚠️'; reportTitle = 'Report Damaged/Defective POP'; btnText = '🚀 Submit Damage Report'; }

    return (
        <div className="pop-container">
            {isSubmitting && (<div className="loading-overlay"><div className="spinner"></div><p style={{ marginTop: 15, fontWeight: 600, color: '#ea580c' }}>Processing...</p></div>)}
            <header>
                <h1>POP Receive Tracking Order System</h1>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
                    <button onClick={() => setMode('entry')} style={{ padding: '10px 20px', borderRadius: 30, border: 'none', background: mode === 'entry' ? '#4f46e5' : '#e2e8f0', color: mode === 'entry' ? 'white' : '#64748b', fontWeight: 600, cursor: 'pointer', boxShadow: mode === 'entry' ? '0 4px 6px -1px rgba(79, 70, 229, 0.2)' : 'none' }}> Check POP Order</button>
                    <button onClick={() => setMode('history')} style={{ padding: '10px 20px', borderRadius: 30, border: 'none', background: mode === 'history' ? '#4f46e5' : '#e2e8f0', color: mode === 'history' ? 'white' : '#64748b', fontWeight: 600, cursor: 'pointer', boxShadow: mode === 'history' ? '0 4px 6px -1px rgba(79, 70, 229, 0.2)' : 'none' }}>📜 History POP Receive</button>
                    <button onClick={() => { setMode('admin'); }} style={{ padding: '10px 20px', borderRadius: 30, border: 'none', background: mode === 'admin' ? '#ef4444' : '#e2e8f0', color: mode === 'admin' ? 'white' : '#64748b', fontWeight: 600, cursor: 'pointer', boxShadow: mode === 'admin' ? '0 4px 6px -1px rgba(239, 68, 68, 0.2)' : 'none' }}>🔐 Admin</button>
                </div>
            </header>
            <div className="status-wrapper">
                {loadingStatus === 'loading' && <div className="loading-pill"><div className="dot"></div> Connecting...</div>} {loadingStatus === 'ready' && <div className="loading-pill ready">✅ Ready</div>} {loadingStatus === 'error' && <div className="loading-pill error">❌ Disconnect</div>}
            </div>
            {loadingStatus === 'loading' ? (<SkeletonLoader />) : (
                <>
                    {/* --- Display Admin Panel --- */}
                    {mode === 'admin' && (
                        <AdminPanel 
                            branches={branches} 
                            scriptUrl={SCRIPT_URL} 
                            onClose={() => setMode('entry')} 
                        />
                    )}

                    {/* --- Display History Panel --- */}
                    {mode === 'history' && (
                        <HistoryPanel
                            branches={branches}
                            scriptUrl={SCRIPT_URL}
                        />
                    )}

                    {/* --- Entry Panel --- */}
                    {mode === 'entry' && (
                        <>
                            <div className="controls-card">
                                <div className="input-group">
                                    <label>1. Select Branch</label>
                                    <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} disabled={loadingStatus !== 'ready'}>
                                        <option value="">-- Please Select Branch --</option>
                                        {branches.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label>2. Tracking No.</label>
                                 
                                        <select value={selectedTrackingNo} onChange={handleTrackingChange}>
                                            <option value="">-- Select Tracking No --</option>
                                            {availableTrackings.map((t, idx) => (
                                                <option key={idx} value={t.number}>
                                                    {t.number} ({t.type}) 
                                                </option>
                                            ))}
                                        </select>
                                
                                </div>
                                <div className="input-group">
                                    <label>3. Category</label>
                                    <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                                        <option value="all">Show All</option>
                                        <option value="RE-Brand">RE-Brand</option>
                                        <option value="RE-System">RE-System</option>
                                        <option value="Special-POP">Special POP</option>
                                        <option value="Equipment-Order">Equipment Order</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label>4. Date <span className="required">*</span></label>
                                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                                </div>
                                <div className="input-group" style={{width: '100%', marginTop: 10}}>
                                    <label>🔍 Search Item</label>
                                    <input type="text" placeholder="Type to search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1'}} />
                                </div>
                            </div>

                            {selectedBranch && filteredData.length > 0 && (
                                <><div className="progress-section">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 5, color: 'var(--text-sub)' }}>
                                        <span>Inspection Progress</span>
                                        <span>{progress.count}/{progress.total} ({progress.percent}%)</span></div>
                                        <div className="progress-container"><div className="progress-bar" style={{ width: `${progress.percent}%` }}>
                                            </div>
                                            </div>
                                            </div>
                                            <div className="result-card">
                                                <div className="result-header">
                                                    <span className="branch-title">{selectedBranch}</span>
                                                    <span className="total-badge">Total {filteredData.length} items</span>
                                                    </div>
                                                    <div className="table-container">
                                                        <table>
                                                            <thead>
                                                                <tr>
                                                                    <th style={{ width: 50 }}>Category</th>
                                                                    <th>Item</th>
                                                                    <th style={{ width: 40, textAlign: 'center' }}>Qty</th>
                                                                    <th style={{width:80, textAlign: 'center' }}>
                                                                        <div style={{display:'flex', flexDirection:'column', alignItems:'center',gap:2}}>
                                                                            <span style={{fontSize: '0.6rem'}}>Received</span>
                                                                            <div style={{display:'flex', gap: 5}}>
                                                                                <input type="checkbox" className="custom-checkbox header-checkbox" checked={isAllSelected} onChange={handleSelectAll} disabled={!selectedDate || filteredData.length === 0} title="Select All"/>
                                                     </div></div></th></tr></thead><tbody>{currentTableData.map(row => { const isChecked = !!checkedItems[row.id]; return (<tr key={row.id} className={isChecked ? 'checked-row' : ''} onClick={() => handleToggleCheck(row.id)}><td><span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, color: '#64748b' }}>{row.category.replace('RE-', '').replace('-POP', '')}</span></td><td className="item-name" style={{ color: '#334155', whiteSpace: 'normal', pointerEvents: 'none' }}>{searchTerm ? (<span>{row.item.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) => part.toLowerCase() === searchTerm.toLowerCase() ? <span key={i} style={{background: '#fef08a'}}>{part}</span> : part)}</span>) : row.item}</td><td style={{ textAlign: 'center', pointerEvents: 'none' }}><span className="qty-pill">{row.qty}</span></td><td style={{ textAlign: 'center' }}><div style={{ display: 'flex', justifyContent: 'center' }}><input type="checkbox" className="custom-checkbox" checked={isChecked} readOnly style={{ pointerEvents: 'none' }} disabled={!selectedDate} /></div></td></tr>) })}</tbody></table></div>{totalPages > 1 && (<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 15, padding: '15px 0', borderTop: '1px solid #f1f5f9' }}><button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 6, background: currentPage === 1 ? '#f1f5f9' : 'white', color: currentPage === 1 ? '#94a3b8' : '#334155', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>Prev</button><span style={{ fontSize: '0.9rem', color: '#64748b' }}>Page <strong>{currentPage}</strong> of {totalPages}</span><button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 6, background: currentPage === totalPages ? '#f1f5f9' : 'white', color: currentPage === totalPages ? '#94a3b8' : '#334155', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>Next</button></div>)}</div><div className={`report-section ${reportClass}`}><div className="report-header"><div><span style={{ marginRight: 8 }}>{reportIcon}</span><span>{reportTitle}</span></div>{(isComplete || isDefectMode) && (<button className={`defect-toggle-btn ${isDefectMode ? 'active' : ''}`} onClick={() => setIsDefectMode(!isDefectMode)}>{isDefectMode ? '↩️ Cancel Defect Report' : '⚠️ Found Defect?'}</button>)}</div><div className="report-grid">{(!isComplete || isDefectMode) && (<div><label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 5 }}>Issue Details</label><textarea rows={3} placeholder="Specify missing or damaged POP items..." value={reportNote} onChange={(e) => setReportNote(e.target.value)} /></div>)}<div><label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 5 }}>Attach Photo/Video (Required)</label><div className="upload-box"><input type="file" className="upload-input" accept="image/*,video/*" multiple onChange={handleFileSelect} /><div style={{ fontSize: 24, marginBottom: 5, color: '#fb923c' }}>📷 🎥</div><div style={{ color: '#f97316', fontSize: '0.85rem', fontWeight: 600, pointerEvents: 'none' }}>Tap to take photo/video or select files<br /><span style={{ color: 'red', fontSize: '0.7rem' }}>(Max 10 files)</span></div></div><div className="preview-grid">{selectedFiles.map((file, index) => { const url = URL.createObjectURL(file); return (<div key={index} className="preview-item">{file.type.startsWith('video/') ? <video src={url} className="preview-media" controls /> : <img src={url} alt="preview" className="preview-media" />}<div className="delete-btn" onClick={() => removeFile(index)}>×</div></div>) })}</div></div><button className="btn-submit" onClick={handleSubmit}>{btnText}</button></div></div></>
                            )}
                            {selectedBranch && filteredData.length === 0 && (<div className="empty-state"><span>📭</span><p>No POP items found for this branch</p></div>)}
                            {!selectedBranch && (<div className="empty-state"><span>👈</span><p>Select a branch to start checking POP</p></div>)}
                        </>
                    )}
                </>
            )}
            
            <div style={{ textAlign: 'center', marginTop: 30, fontSize: '0.75rem', color: '#94a3b8' }}>* Data will be saved to Google Sheet</div>
        </div>
    );
};

export default PopTracking;