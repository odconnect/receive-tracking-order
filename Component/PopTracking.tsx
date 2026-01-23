import React, { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import './PopTracking.css';
import AdminPanel from './AdminPanel'; 
import HistoryPanel from './HistoryPanel'; 
// import OrderPanel from './OrderPanel'; 
import {
  normalizeBranchKey,
//   resolveCanonicalBranch
} from './utils/branchResolver';

// --- Type Definitions ---
interface InventoryItem { id: string; branch: string; branchKey: string;  category: string; item: string; qty: number; }
interface SnapshotItem { id: string; item: string; qty: number; category: string; isChecked: boolean; }
interface ProgressStats { count: number; total: number; percent: number; isComplete: boolean; }
interface OrderItem {
  category: string;
  branch: string;
  branchKey: string;
  item: string;
  qty: number;
}

interface OrderData {
  orderNo: string;
  orderDate: string;
  trackingNo: string;
  items: OrderItem[];
}

// Updated Payload Interface
interface SubmitPayload { 
  branch: string; 
  trackingNo: string; 
  orderNo: string;        // ✅ add this
  category: string; 
  date: string; 
  note: string; 
  images: string[]; 
  missingItems: string; 
  itemsSnapshot: SnapshotItem[]; 
  signerName: string;
  signerRole: string;
  signatureImage: string; 
}


// interface TrackingInfo { number: string; type: 'POP' | 'Equipment'; }

type LoadingStatus = 'loading' | 'ready' | 'error';
type AppMode = 'entry' | 'history' | 'admin';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzVkmDVxjYHX89CViQUsrfPVU7K8Kc8XMK-KoWHcjz4qsC4KnW3DQHcWxqzeQ1r654K/exec";

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
  
    // const [database, setDatabase] = useState<InventoryItem[]>([]);
    const [branches, setBranches] = useState<string[]>([]);
    // const [trackingMap, setTrackingMap] = useState<Record<string, TrackingInfo[]>>({}); 
    const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>('loading');
    const [mode, setMode] = useState<AppMode>('entry');
    
    const [selectedBranch, setSelectedBranch] = useState<string>('');
    const [selectedTrackingNo, setSelectedTrackingNo] = useState<string>('');
    // const [availableTrackings, setAvailableTrackings] = useState<TrackingInfo[]>([]);

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
const [selectedCategoryType, setSelectedCategoryType] =
  useState<"POP" | "EQUIPMENT" | "">("");
    const isPendingTracking =
  !selectedTrackingNo || selectedTrackingNo === "PENDING";
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    
// const [ordersLoaded, setOrdersLoaded] = useState(false);
    const [signerName, setSignerName] = useState<string>(''); 
    const [signerRole, setSignerRole] = useState<string>('');
    const [isAccepted, setIsAccepted] = useState<boolean>(false);
    const [hasSignature, setHasSignature] = useState<boolean>(false);
    
const [orders, setOrders] = useState<OrderData[]>([]);

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
                const [brandData, systemData, specialData, equipmentData] = await Promise.all([
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

                // const parsedTrackingMap = parseTrackingCSV(trackingData, allBranches);
                const sortedBranches = Array.from(allBranches).sort().filter(b => b.length > 2 && !b.includes("Total") && !b.includes("POP"));
                
                // setDatabase(allData); 
                setBranches(sortedBranches); 
                // setTrackingMap(parsedTrackingMap);
                setLoadingStatus('ready');
            } catch (error) { console.error(error); setLoadingStatus('error'); }
        };
        loadAllData();
    }, []);

const availableTrackings = useMemo(() => {
  if (!selectedBranch || !selectedCategoryType) return [];

  const branchKey = normalizeBranchKey(selectedBranch);
  const set = new Set<string>();

  orders.forEach(order => {
    const branchItems = order.items.filter(
      it => it.branchKey === branchKey
    );
    if (!branchItems.length) return;

    const match =
      selectedCategoryType === "EQUIPMENT"
        ? branchItems.some(it => it.category === "Equipment")
        : branchItems.some(it => it.category !== "Equipment");

    if (match) {
      set.add(order.trackingNo || "PENDING");
    }
  });

  return Array.from(set).sort((a, b) => {
    if (a === "PENDING") return -1;
    if (b === "PENDING") return 1;
    return a.localeCompare(b);
  });
}, [orders, selectedBranch, selectedCategoryType]);




    useEffect(() => { setCurrentPage(1); }, [selectedBranch, selectedCategory, searchTerm]);
useEffect(() => {
  loadOrders(); 
}, []);
   
useEffect(() => {
  if (!selectedBranch) {
    setSelectedTrackingNo("");
    return;
  }

  if (availableTrackings.length === 1) {
 
    setSelectedTrackingNo(availableTrackings[0]);
  } else {
   
    setSelectedTrackingNo("");
  }
}, [selectedBranch, availableTrackings]);




    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        setIsDrawing(true); setHasSignature(true);
        const rect = canvas.getBoundingClientRect();
        let x = 0, y = 0;
        if ('touches' in e) { x = e.touches[0].clientX - rect.left; y = e.touches[0].clientY - rect.top; } 
        else { x = (e as React.MouseEvent).nativeEvent.offsetX; y = (e as React.MouseEvent).nativeEvent.offsetY; }
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        let x = 0, y = 0;
        if ('touches' in e) { x = e.touches[0].clientX - rect.left; y = e.touches[0].clientY - rect.top; } 
        else { x = (e as React.MouseEvent).nativeEvent.offsetX; y = (e as React.MouseEvent).nativeEvent.offsetY; }
        ctx.lineTo(x, y); ctx.stroke();
    };

    const endDrawing = () => { setIsDrawing(false); };
    const clearSignature = () => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); }
        setHasSignature(false);
    };

    // Helper for category switching
    // const handleCategoryAutoSwitch = (type: 'POP' | 'Equipment') => {
    //     if (type === 'Equipment') { 
    //         setSelectedCategory('Equipment-Order'); 
    //     } else { 
    //         setSelectedCategory('all'); 
    //     }
    // };

    // --- UPDATED: Handle Tracking Change ---
const handleTrackingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  setSelectedTrackingNo(e.target.value);
  setCurrentPage(1);
};

    const fetchData = async (url: string): Promise<string> => { const response = await fetch(url); if (!response.ok) throw new Error("Network error"); return await response.text(); };
    
    // ... Parsing Logic ...
    const parseEquipmentCSV = (csvText: string, categoryName: string, branchSet: Set<string>): InventoryItem[] => {
        if (!csvText) return []; const rows: string[][] = []; let currentRow: string[] = []; let currentField = ''; let inQuotes = false;
        for (let i = 0; i < csvText.length; i++) { const char = csvText[i]; const nextChar = csvText[i + 1]; if (char === '"') { if (inQuotes && nextChar === '"') { currentField += '"'; i++; } else { inQuotes = !inQuotes; } } else if (char === ',' && !inQuotes) { currentRow.push(currentField); currentField = ''; } else if ((char === '\r' || char === '\n') && !inQuotes) { if (char === '\r' && nextChar === '\n') i++; currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ''; } else { currentField += char; } }
        if (currentField || currentRow.length > 0) { currentRow.push(currentField); rows.push(currentRow); }
        let headerRowIndex = -1; for (let i = 0; i < Math.min(rows.length, 50); i++) { if (rows[i][1]?.trim() === 'Shop') { headerRowIndex = i; break; } }
        if (headerRowIndex === -1) return [];
        const subHeaderIndex = headerRowIndex + 1; const subHeaders = rows[subHeaderIndex]; if (!subHeaders) return [];
        const dataStartIndex = subHeaderIndex + 1; const map = new Map<string, InventoryItem>();
        for (let i = dataStartIndex; i < rows.length; i++) { const row = rows[i]; if (row.length < 2) continue; const rawBranch = row[1]?.trim(); if (!rawBranch) continue; let branch = ""; if (branchSet.has(rawBranch)) { branch = rawBranch; } else { const target = rawBranch.replace(/\s+/g, '').toLowerCase(); for (const existing of branchSet) { if (existing.replace(/\s+/g, '').toLowerCase() === target) { branch = existing; break; } } } if (!branch) continue; for (let col = 3; col < subHeaders.length; col++) { const header = subHeaders[col]; if (!header || header.toLowerCase().includes('total')) continue; const item = header.replace(/^Quantity\s*/i, '').trim(); const qty = parseInt(row[col]?.replace(/,/g, '').trim() || '0', 10); if (qty > 0) { const key = `${branch}|${item}`; if (map.has(key)) { map.get(key)!.qty += qty; } else { map.set(key, { id: `EQ_${normalizeBranchKey(branch)}_${item}`.replace(/\s+/g, '_'), branch, branchKey: normalizeBranchKey(branch), category: categoryName, item, qty }); } } } }
        return Array.from(map.values());
    };
    // const parseTrackingCSV = (csvText: string, branchSet: Set<string>): Record<string, TrackingInfo[]> => {
    //     const map: Record<string, TrackingInfo[]> = {}; const lines = csvText.trim().split('\n');
    //     for (let i = 1; i < lines.length; i++) { const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); const rawBranch = row[0]?.replace(/^"|"$/g, '').trim(); if (!rawBranch) continue; const branch = resolveCanonicalBranch(rawBranch, branchSet); if (!branch) continue; const result: TrackingInfo[] = []; const pop = row[1]?.trim(); const equip = row[2]?.trim(); if (pop && pop !== '-' && pop !== '0') { pop.split(/[\n,]+/).forEach(n => result.push({ number: n.trim(), type: 'POP' })); } if (equip && equip !== '-' && equip !== '0') { equip.split(/[\n,]+/).forEach(n => result.push({ number: n.trim(), type: 'Equipment' })); } if (result.length) { map[branch] = map[branch] ? [...map[branch], ...result] : result; } }
    //     return map;
    // };
    const parseCSV = (csvText: string, categoryName: string, branchSet: Set<string>): InventoryItem[] => {
        if (!csvText) return []; const lines = csvText.trim().split('\n'); let headerIndex = -1; const branchIndices: Record<number, string> = {}; const parsedData: InventoryItem[] = [];
        for (let i = 0; i < lines.length; i++) { const line = lines[i]; if (line.includes("Head Office") || line.includes("Central World") || line.includes("Siam Paragon")) { headerIndex = i; const headers = lines[i].split(','); headers.forEach((h, index) => { const name = h.trim().replace(/^"|"$/g, ''); if (name && !name.includes("Total") && !name.includes("Tracking") && !name.includes("List") && !name.includes("No.") && !name.includes("Item") && !name.includes("Unit")) { branchSet.add(name); branchIndices[index] = name; } }); break; } }
        if (headerIndex === -1) return [];
        for (let i = headerIndex + 1; i < lines.length; i++) { const row = lines[i].split(','); if (row.length < 5) continue; const itemName = (row[1] || row[0] || "").trim().replace(/^"|"$/g, ''); if (!itemName || itemName.startsWith("Total") || itemName.toLowerCase().includes("tracking")) continue; for (const [indexStr, branchName] of Object.entries(branchIndices)) { const index = parseInt(indexStr); const qtyStr = (row[index] || "0").trim().replace(/^"|"$/g, ''); const qty = parseInt(qtyStr); if (!isNaN(qty) && qty > 0) { parsedData.push({ branch: branchName,  branchKey: normalizeBranchKey(branchName), category: categoryName, item: itemName, qty: qty, id: `${branchName}_${itemName}`.replace(/\s+/g, '_') }); } } }
        return parsedData;
    };

    const compressImage = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (file.type.includes('video')) { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result as string); reader.onerror = error => reject(error); return; }
            const reader = new FileReader(); reader.readAsDataURL(file);
            reader.onload = (event) => { const img = new Image(); if (event.target?.result) img.src = event.target.result as string; img.onload = () => { const canvas: HTMLCanvasElement = document.createElement('canvas'); const maxWidth = 1000; const scaleSize = maxWidth / img.width; const newWidth = (img.width > maxWidth) ? maxWidth : img.width; const newHeight = (img.width > maxWidth) ? (img.height * scaleSize) : img.height; canvas.width = newWidth; canvas.height = newHeight; const ctx = canvas.getContext('2d'); if (ctx) { ctx.drawImage(img, 0, 0, newWidth, newHeight); resolve(canvas.toDataURL('image/jpeg', 0.7)); } else { reject(new Error("Cannot get canvas context")); } }; img.onerror = (error) => reject(error); }; reader.onerror = (error) => reject(error);
        });
    };

    // const filteredData = useMemo<InventoryItem[]>(() => {
    //     if (!selectedBranch) return [];
    //     const branchKey = normalizeBranchKey(selectedBranch);
        
  
    //     let data = database.filter(d => d.branchKey === branchKey);

    
    //     if (selectedCategory !== 'all') { 
    //         data = data.filter(d => d.category === selectedCategory); 
    //     }

      
    //     if (searchTerm) { 
    //         const lower = searchTerm.toLowerCase(); 
    //         data = data.filter(d => d.item.toLowerCase().includes(lower)); 
    //     }
    //     return data;
    // }, [database, selectedBranch, selectedCategory, searchTerm, selectedTrackingNo, availableTrackings]);


const filteredData = useMemo<InventoryItem[]>(() => {
    if (!selectedBranch || !selectedTrackingNo || isPendingTracking) return [];
    
    const branchKey = normalizeBranchKey(selectedBranch);

    // 1. หา Order ทั้งหมดที่ตรงกับเลข Tracking นี้
    const matchedOrders = orders.filter(o => o.trackingNo === selectedTrackingNo);
    
    // 2. ดึงรายการ Items จากออเดอร์เหล่านั้นมาทำเป็น InventoryItem
    const itemsFromOrder: InventoryItem[] = matchedOrders.flatMap(order => 
        order.items
            .filter(it => it.branchKey === branchKey)
            .map(it => ({
                // สร้าง ID ชั่วคราวสำหรับการทำ Checklist
                id: `${order.orderNo}_${it.item}`.replace(/\s+/g, '_'),
                branch: it.branch,
                branchKey: it.branchKey,
                category: it.category,
                item: it.item,
                qty: it.qty
            }))
    );

    // 3. กรองด้วย Search Term (ถ้ามี)
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        return itemsFromOrder.filter(d => d.item.toLowerCase().includes(lower));
    }

    return itemsFromOrder;
}, [orders, selectedBranch, selectedTrackingNo, isPendingTracking, searchTerm]);


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
if (selectedFiles.length === 0) {
            return alert("⚠️ Please attach at least one photo or video as evidence of receipt.");
        }
  if (!signerName.trim()) return alert("⚠️ Please enter your Name.");
  if (!signerRole) return alert("⚠️ Please select your Role.");
  if (!isAccepted) return alert("⚠️ You must accept the confirmation.");
  if (!hasSignature) return alert("⚠️ Please sign your signature.");

 const allItemsToSubmit = filteredData; 

  const itemsSnapshot: SnapshotItem[] = allItemsToSubmit.map(item => ({
    id: item.id,
    item: item.item,
    qty: item.qty,
    category: item.category,
    isChecked: !!checkedItems[item.id] 
  }));
const missingList = itemsSnapshot
    .filter(item => !item.isChecked)
    .map(item => `- ${item.item} (Qty: ${item.qty})`);

  const missingString = missingList.length ? missingList.join("\n") : "-";

  setIsSubmitting(true);
  try {
    const mediaBase64 = await Promise.all(
      selectedFiles.map(file => compressImage(file))
    );

    const signatureData =
      canvasRef.current?.toDataURL("image/png") || "";
// const matchedOrder = orders.find(o => 

//         (o.trackingNo === selectedTrackingNo || (selectedTrackingNo === "PENDING" && o.trackingNo === "PENDING")) &&
 
//         o.items.some(it => normalizeBranchKey(it.branch) === normalizeBranchKey(selectedBranch))
//     );
const orderNosInTracking = Array.from(new Set(
        orders.filter(o => o.trackingNo === selectedTrackingNo)
              .map(o => o.orderNo)
    )).join(", ");
    // const finalOrderNo = matchedOrder ? matchedOrder.orderNo : "-";
    const payload: SubmitPayload = {
      branch: selectedBranch,
      // trackingNo: selectedTrackingNo?.trim()
      //   ? selectedTrackingNo
      //   : "PENDING", // ✅ สำคัญที่สุด
      trackingNo: selectedTrackingNo || "PENDING",
        // orderNo: finalOrderNo,
        orderNo: orderNosInTracking || "-",
      category: selectedCategory,
      date: selectedDate,
      note: reportNote || "Received All Items",
      images: mediaBase64,
      missingItems: missingString,
      itemsSnapshot,
      signerName,
      signerRole,
      signatureImage: signatureData
    };

    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    alert("✅ Report successfully.");
    setSelectedTrackingNo("");
    setCheckedItems({});
    clearSignature();
  } catch (err) {
    console.error(err);
    alert("❌ Error sending data");
  } finally {
    setIsSubmitting(false);
  }
};

const loadOrders = async () => {
  try {
    const res = await fetch(
      `https://script.google.com/macros/s/AKfycbwez3Frm0CM80fp_sSBWbbIdMvdkFG8k_2b-SWBrXrCn2IgQl2iIUHPh8S_uNd9BDU/exec?action=getOrders&_t=${Date.now()}`
    );

    const json = await res.json();
    console.log("🔥 RAW ORDERS:", json);

    const orderArray = Array.isArray(json) ? json : [];

    const normalized = orderArray.map((order: OrderData) => ({
      ...order,
      trackingNo:
        order.trackingNo && order.trackingNo !== "-"
          ? order.trackingNo
          : "PENDING",
      items: order.items.map(it => ({
        ...it,
        branchKey: normalizeBranchKey(it.branch)
      }))
    }));

    setOrders(normalized);
    // setOrdersLoaded(true); // ✅ สำคัญ
  } catch (err) {
    console.error("Failed to load orders", err);
    // setOrdersLoaded(true); // กันค้าง
  }
};

const groupedOrdersByTracking = useMemo(() => {
  const map: Record<string, OrderData[]> = {};

  orders.forEach(order => {
    const key = order.trackingNo || "PENDING";
    if (!map[key]) map[key] = [];
    map[key].push(order);
  });

  return map;
}, [orders]);
const pendingOrders = useMemo(() => {
  if (!selectedBranch || !isPendingTracking || !selectedCategoryType) return [];

  const branchKey = normalizeBranchKey(selectedBranch);

  return orders.filter(order => {
    if (order.trackingNo !== "PENDING") return false;

    const branchItems = order.items.filter(
      it => it.branchKey === branchKey
    );
    if (!branchItems.length) return false;

    // แยก POP / EQUIPMENT
    return selectedCategoryType === "EQUIPMENT"
      ? branchItems.some(it => it.category === "Equipment")
      : branchItems.some(it => it.category !== "Equipment");
  });
}, [orders, selectedBranch, isPendingTracking, selectedCategoryType]);

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
                    {/* <button onClick={() => setMode('order')} style={{ padding: '10px 20px', borderRadius: 30, border: 'none', background: mode === 'order' ? '#4f46e5' : '#e2e8f0', color: mode === 'order' ? 'white' : '#64748b', fontWeight: 600, cursor: 'pointer', boxShadow: mode === 'order' ? '0 4px 6px -1px rgba(79, 70, 229, 0.2)' : 'none' }}> 🛒 Order Equipment</button> */}
                
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

                {/* --- Display Order Panel --- */}
                    {/* {mode === 'order' && (
                        <OrderPanel
                            branches={branches}
                            scriptUrl={SCRIPT_URL}
                            trackingMap={trackingMap}
                            database={database}
                       onClose={() => setMode('entry')} 
                        />
                    )} */}
              

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
  <label>2. Category</label>
  <select
    value={selectedCategoryType}
    onChange={(e) => {
      setSelectedCategoryType(e.target.value as "POP" | "EQUIPMENT");
      setSelectedTrackingNo(""); // reset tracking เมื่อเปลี่ยน category
    }}
  >
    <option value="">-- Select Category --</option>
    <option value="POP">📦 POP</option>
    <option value="EQUIPMENT">🛠 Equipment</option>
  </select>
</div>
{selectedCategoryType && (
  <div className="input-group">
    <label>3. Tracking No.</label>
    <select
      value={selectedTrackingNo}
      onChange={handleTrackingChange}
    >
      <option value="">-- Select Tracking No --</option>
      {availableTrackings.map(trk => (
        <option key={trk} value={trk}>
          {trk === "PENDING" ? "PENDING" : trk}
        </option>
      ))}
    </select>
  </div>
)}
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

                    {selectedBranch &&
  Object.entries(groupedOrdersByTracking)
    .filter(([tracking]) =>
      !selectedTrackingNo || tracking === selectedTrackingNo
    )
    .map(([, list]) => {
      const branchOrders = list.filter(order =>
        order.items.some(
          it =>
            it.branchKey ===
            normalizeBranchKey(selectedBranch)
        )
      );

      if (!branchOrders.length) return null;

    //   return (
    //     <div key={tracking} className="result-card" style={{ marginTop: 20 }}>
    //       <div className="result-header">
    //         <strong>
    //           🚚 Tracking:{" "}
    //           {tracking === "PENDING"
    //             ? "PENDING"
    //             : tracking}
    //         </strong>
    //       </div>

    //       {/* {branchOrders.map(order => (
    //         <table
    //           key={order.orderNo}
    //           style={{ width: "100%", fontSize: "0.85rem" }}
    //         >
    //           <thead>
    //             <tr>
    //               <th>Category</th>
    //               <th>Item</th>
    //               <th style={{ textAlign: "center" }}>Qty</th>
    //             </tr>
    //           </thead>
    //           <tbody>
    //             {order.items
    //               .filter(
    //                 it =>
    //                   it.branchKey ===
    //                   normalizeBranchKey(selectedBranch)
    //               )
    //               .map((it, idx) => (
    //                 <tr key={idx}>
    //                   <td>{it.category}</td>
    //                   <td>{it.item}</td>
    //                   <td style={{ textAlign: "center" }}>
    //                     {it.qty}
    //                   </td>
    //                 </tr>
    //               ))}
    //           </tbody>
    //         </table>
    //       ))} */}
    //     </div>
    //   );
    })}
{selectedBranch && isPendingTracking && pendingOrders.length > 0 && (
  <>
    {pendingOrders.map((order, orderIdx) => (
      <div
        key={`${order.orderNo}_${orderIdx}`}
        className="result-card"
        style={{
          marginTop: 24,
          border: '1px solid #fde68a',
          background: 'linear-gradient(180deg, #fffbea, #ffffff)',
          boxShadow: '0 8px 20px rgba(0,0,0,0.05)'
        }}
      >
        {/* HEADER */}
        <div
          className="result-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '1rem',
            fontWeight: 700,
            color: '#92400e'
          }}
        >
          📦 Pending Order
          <span
            style={{
              fontSize: '0.7rem',
              background: '#fef3c7',
              color: '#92400e',
              padding: '3px 8px',
              borderRadius: 20,
              fontWeight: 600
            }}
          >
            PENDING
          </span>
        </div>

        {/* ORDER INFO */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            fontSize: '0.85rem',
            marginTop: 15,
            color: '#374151'
          }}
        >
          <div>
            <strong>Order No</strong>
            <div>{order.orderNo}</div>
          </div>
          <div>
            <strong>Order Date</strong>
            <div>{new Date(order.orderDate).toLocaleDateString()}</div>
          </div>
          <div>
            <strong>Status</strong>
            <div style={{ color: '#b45309', fontWeight: 600 }}>
              ⏳ Waiting for POP delivery
            </div>
          </div>
        </div>

        {/* ITEMS TABLE */}
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: 8,
              color: '#374151'
            }}
          >
            📋 Ordered Items
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr style={{ background: '#fffbeb' }}>
                  <th>Category</th>
                  <th>Item</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {order.items
                  .filter(it => it.branchKey === normalizeBranchKey(selectedBranch))
                  .map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            background: '#fef3c7',
                            padding: '2px 8px',
                            borderRadius: 12,
                            color: '#92400e',
                            fontWeight: 600
                          }}
                        >
                          {it.category}
                        </span>
                      </td>
                      <td>{it.item}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {it.qty.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER NOTE */}
        <div
          style={{
            marginTop: 15,
            fontSize: '0.75rem',
            color: '#92400e',
            background: '#fffbeb',
            padding: '8px 12px',
            borderRadius: 8
          }}
        >
          ℹ️ Items are shown for reference only.  
          Checklist & confirmation will be available once POP is received.
        </div>
      </div>
    ))}
  </>
)}

{selectedBranch && filteredData.length > 0 && !isPendingTracking && (
    
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
                                                     </div></div></th></tr></thead><tbody>{currentTableData.map(row => { const isChecked = !!checkedItems[row.id]; return (<tr key={row.id} className={isChecked ? 'checked-row' : ''} onClick={() => handleToggleCheck(row.id)}><td><span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, color: '#64748b' }}>{row.category.replace('RE-', '').replace('-POP', '')}</span></td><td className="item-name" style={{ color: '#334155', whiteSpace: 'normal', pointerEvents: 'none' }}>{searchTerm ? (<span>{row.item.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) => part.toLowerCase() === searchTerm.toLowerCase() ? <span key={i} style={{background: '#fef08a'}}>{part}</span> : part)}</span>) : row.item}</td><td style={{ textAlign: 'center', pointerEvents: 'none' }}><span className="qty-pill">{row.qty}</span></td><td style={{ textAlign: 'center' }}><div style={{ display: 'flex', justifyContent: 'center' }}><input type="checkbox" className="custom-checkbox" checked={isChecked} readOnly style={{ pointerEvents: 'none' }} disabled={!selectedDate} /></div></td></tr>) })}</tbody></table></div>{totalPages > 1 && (<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 15, padding: '15px 0', borderTop: '1px solid #f1f5f9' }}><button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 6, background: currentPage === 1 ? '#f1f5f9' : 'white', color: currentPage === 1 ? '#94a3b8' : '#334155', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>Prev</button><span style={{ fontSize: '0.9rem', color: '#64748b' }}>Page <strong>{currentPage}</strong> of {totalPages}</span><button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: 6, background: currentPage === totalPages ? '#f1f5f9' : 'white', color: currentPage === totalPages ? '#94a3b8' : '#334155', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>Next</button></div>)}</div>
                                            



                                            {/* REPORT SECTION & SIGNATURE */}
                                            <div className={`report-section ${reportClass}`}>
                                                <div className="report-header">
                                                    <div><span style={{ marginRight: 8 }}>{reportIcon}</span><span>{reportTitle}</span></div>

                                                    {(isComplete || isDefectMode) && (<button className={`defect-toggle-btn ${isDefectMode ? 'active' : ''}`} onClick={() => setIsDefectMode(!isDefectMode)}>{isDefectMode ? '↩️ Cancel Defect Report' : '⚠️ Found Defect?'}</button>)}
                                                </div>
                                                <div className="report-grid">
                                                    {(!isComplete || isDefectMode) && (<div><label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 5 }}>Issue Details</label><textarea rows={3} placeholder="Specify missing or damaged POP items..." value={reportNote} onChange={(e) => setReportNote(e.target.value)} /></div>)}
                                                    <div>
                                                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 5 }}>Attach Photo and Video (Required)</label>
                                                        <div className="upload-box">
                                                            <input type="file" className="upload-input" accept="image/*,video/*" multiple onChange={handleFileSelect} />
                                                            <div style={{ fontSize: 24, marginBottom: 5, color: '#fb923c' }}>📷 🎥</div>
                                                            <div style={{ color: '#f97316', fontSize: '0.85rem', fontWeight: 600, pointerEvents: 'none' }}>Tap to take photo and video or select files<br /><span style={{ color: 'red', fontSize: '0.7rem' }}>(Max 10 files)</span></div>
                                                        </div>
                                                        <div className="preview-grid">{selectedFiles.map((file, index) => { const url = URL.createObjectURL(file); return (<div key={index} className="preview-item">{file.type.startsWith('video/') ? <video src={url} className="preview-media" controls /> : <img src={url} alt="preview" className="preview-media" />}<div className="delete-btn" onClick={() => removeFile(index)}>×</div></div>) })}</div>
                                                    
                                                   {/*   <button className="btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
        {btnText}
      </button> */}
                                                    </div>

                                                  {/* --- SIGN OFF SECTION (UPDATED UI) --- */}
<div className="sign-off-section" style={{ 
    marginTop: 30, 
    background: '#ffffff', 
    borderRadius: 12, 
    border: '1px solid #e2e8f0', 
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
    padding: '20px',
    overflow: 'hidden'
}}>
    <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: 20, 
        borderBottom: '1px solid #f1f5f9', 
        paddingBottom: 15 
    }}>
        <span style={{ fontSize: '1.5rem', marginRight: 10 }}>✍️</span>
        <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Signature</h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>For Shop Manager / Assistant only</span>
        </div>
    </div>

    {/* Row: Name & Role */}
    <div className="sign-off-row" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
        {/* 1. Name Input */}
        <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Signer Name <span style={{color: '#ef4444'}}>*</span>
            </label>
            <input 
                type="text" 
                placeholder="Firstname - Lastname"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    borderRadius: 8, 
                    border: '1px solid #cbd5e1', 
                    fontSize: '0.95rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    backgroundColor: '#f8fafc'
                }}
                onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
            />
        </div>

        {/* 2. Role Selection */}
        <div style={{ flex: '0 0 auto', minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Role <span style={{color: '#ef4444'}}>*</span>
            </label>
            <select 
                value={signerRole} 
                onChange={(e) => setSignerRole(e.target.value)}
                style={{ 
                    width: '100%', 
                    padding: '10px 12px', 
                    borderRadius: 8, 
                    border: '1px solid #cbd5e1', 
                    fontSize: '0.95rem',
                    backgroundColor: '#fff',
                    cursor: 'pointer'
                }}
            >
                <option value="">-- Select --</option>
                <option value="Shop Manager">Shop Manager</option>
                <option value="Assistant Shop Manager">Assistant Shop Manager</option>
            </select>
        </div>
    </div>

    {/* 3. Signature Pad */}
    <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 6 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                Signature <span style={{color: '#ef4444'}}>*</span>
            </label>
            <button 
                onClick={clearSignature}
                style={{ 
                    fontSize: '0.75rem', 
                    color: '#ef4444', 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: 'none', 
                    padding: '4px 10px',
                    borderRadius: 4,
                    cursor: 'pointer', 
                    fontWeight: 600
                }}
            >
                🗑️ Clear
            </button>
        </div>
        
        <div style={{ 
            border: '2px dashed #cbd5e1', 
            borderRadius: 12, 
            overflow: 'hidden', 
            background: '#fff', 
            touchAction: 'none',
            position: 'relative'
        }}>
            {!hasSignature && (
                <div style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#e2e8f0',
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    pointerEvents: 'none',
                    userSelect: 'none'
                }}>
                    Sign Here
                </div>
            )}
            <canvas 
                ref={canvasRef}
                width={300}
                height={150}
                style={{ width: '100%', height: '150px', display: 'block', cursor: 'crosshair' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={endDrawing}
            />
        </div>
    </div>

    {/* 4. Acknowledgement Checkbox */}
    <div style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        gap: 12, 
        background: isAccepted ? '#eff6ff' : '#f8fafc', 
        border: isAccepted ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
        padding: '12px 15px', 
        borderRadius: 8,
        transition: 'all 0.2s'
    }}>
        <input 
            type="checkbox" 
            id="acceptCheck" 
            checked={isAccepted} 
            onChange={(e) => setIsAccepted(e.target.checked)}
            style={{ 
                width: 20, 
                height: 20, 
                cursor: 'pointer',
                marginTop: 2,
                accentColor: '#4f46e5'
            }}
        />
        <label htmlFor="acceptCheck" style={{ fontSize: '0.85rem', color: '#475569', cursor: 'pointer', lineHeight: 1.4 }}>
            <strong style={{color: '#1e293b'}}>I Accept & Confirm:</strong> All checked items have been received correctly. 
        </label>
    </div>
</div>
{/* --- END SIGN OFF SECTION --- */}
                                                    <button className="btn-submit" onClick={handleSubmit} disabled={isSubmitting}>{btnText}</button>
                                                </div>
                                            </div>
                                </>
                            )}
                            {selectedBranch && filteredData.length === 0 && (<div className="empty-state"><span>📭</span><p>No POP items found for this branch</p></div>)}
                            {!selectedBranch && (<div className="empty-state"><span>👈</span><p>Select a branch to start checking POP</p></div>)}
                        </>
                    )}
                </>
            )}
            
            <div style={{ textAlign: 'center', marginTop: 30, fontSize: '0.75rem', color: '#94a3b8' }}>* Data will be saved to Google Sheet & Drive</div>
        </div>
    );
};

export default PopTracking;