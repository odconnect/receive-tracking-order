import React, { useEffect, useMemo, useState } from "react";

interface ShipmentItem {
  orderNo: string;
  branch: string;
  branchKey: string;
  trackingNo: string;
  item: string;
  qty: number;
  createdAt: string;
}

interface Props {
  scriptUrl: string;
}

const AdminShipmentPanel: React.FC<Props> = ({ scriptUrl }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ShipmentItem[]>([]);

 
  const [branchFilter, setBranchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"POP" | "EQUIPMENT">("POP"); 
  const [trackingFilter, setTrackingFilter] = useState("");

 
  const [editingOrderNo, setEditingOrderNo] = useState<string | null>(null);
  const [tempTracking, setTempTracking] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  
  const getBaseBranchName = (fullBranchName: string) => {
    return fullBranchName.replace(" (Equipment)", "").trim();
  };

  // ===== 1. Load Data Function =====
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${scriptUrl}?action=getShipmentItems&_t=${Date.now()}`);
      const json = await res.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Failed to load shipment items", err);
      alert("❌ โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [scriptUrl]);

  // ===== 2. Logic Dropdown สาขา (โชว์เฉพาะชื่อหลัก) =====
  const availableBranches = useMemo(() => {
    // ดึงเฉพาะชื่อสาขาหลัก (ตัด Equipment ออก) มาทำรายการ
    const branches = new Set(items.map((i) => getBaseBranchName(i.branch)));
    return Array.from(branches).sort();
  }, [items]);

  // ===== 3. Logic Dropdown Tracking (กรองตามสาขา และ ประเภท) =====
  const availableTrackings = useMemo(() => {
    if (!branchFilter) return [];

    const targetBranchName = typeFilter === "EQUIPMENT" 
      ? `${branchFilter} (Equipment)` 
      : branchFilter;

    const branchItems = items.filter((i) => i.branch === targetBranchName);

    // Normalize Tracking Values
    const trackings = new Set(branchItems.map((i) => {
        if (!i.trackingNo || i.trackingNo === "-" || i.trackingNo === "") return "PENDING";
return String(i.trackingNo);
    }));

    return Array.from(trackings).sort((a, b) => {
        if (a === "PENDING") return 1;
        if (b === "PENDING") return -1;
        return a.localeCompare(b);
    });
  }, [items, branchFilter, typeFilter]); // ✅ เพิ่ม typeFilter เป็น dependency

  // Reset Tracking เมื่อเปลี่ยน Branch หรือ Type
  useEffect(() => {
    setTrackingFilter("");
  }, [branchFilter, typeFilter]);

  // ===== 4. Logic Filter Data (Main Logic) =====
  const filteredItems = useMemo(() => {
    if (!branchFilter || !trackingFilter) return [];

    return items.filter((it) => {
      // 1. กรองชื่อสาขา (ต้องสร้างชื่อเต็มให้ตรงกับ Data)
      const targetBranchName = typeFilter === "EQUIPMENT" 
        ? `${branchFilter} (Equipment)` 
        : branchFilter;
      
      if (it.branch !== targetBranchName) return false;

      // 2. กรอง Tracking
      if (trackingFilter === "ALL") return true;

      const currentTracking = (!it.trackingNo || it.trackingNo === "-" || it.trackingNo === "") 
                              ? "PENDING" 
                              : String(it.trackingNo);
      
      return currentTracking === trackingFilter;
    });
  }, [items, branchFilter, typeFilter, trackingFilter]);

  // ===== 5. ฟังก์ชันบันทึก Tracking =====
  const handleSaveTracking = async (orderNo: string, branch: string) => {
    if (!tempTracking.trim()) return alert("กรุณากรอกเลข Tracking");
    
    setIsSaving(true);
    try {
      await fetch(scriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateTracking",
          orderNo: orderNo,
          branch: branch, // ✅ ส่งชื่อสาขาเต็มๆ (รวม Equipment) ไปให้ Server
          trackingNo: tempTracking
        })
      });

      // Optimistic Update
      setItems(prevItems => prevItems.map(item => {
        if (item.orderNo === orderNo && item.branch === branch) {
            return { ...item, trackingNo: tempTracking };
        }
        return item;
      }));

      alert("✅ อัปเดต Tracking เรียบร้อย!");
      setEditingOrderNo(null);
      setTempTracking("");
      
      setTimeout(() => loadData(), 2000);

    } catch (error) {
      console.error(error);
      alert("❌ เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setIsSaving(false);
    }
  };

 return (
  <div>
    {/* ===== HEADER ===== */}
    <div
      className="controls-card"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontWeight: 700 }}>
          🚚 Shipment Tracking Management
        </h3>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
          ตรวจสอบและแก้ไข Tracking Number ของ POP / Equipment
        </p>
      </div>
{/* 
      <button className="login-cancel-btn" onClick={onClose}>
        ← Back
      </button> */}
    </div>

    {/* ===== FILTERS ===== */}
    <div className="controls-card">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20
        }}
      >
        {/* Branch */}
        <div className="input-group">
          <label>1. Branch</label>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">-- Select Branch --</option>
            {availableBranches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div className="input-group">
          <label>2. Category</label>
          <div
            style={{
              display: "flex",
              background: "#f1f5f9",
              borderRadius: 8,
              padding: 4
            }}
          >
            <button
              onClick={() => setTypeFilter("POP")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                background: typeFilter === "POP" ? "#4f46e5" : "transparent",
                color: typeFilter === "POP" ? "white" : "#64748b"
              }}
            >
              📦 POP
            </button>
            <button
              onClick={() => setTypeFilter("EQUIPMENT")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                background: typeFilter === "EQUIPMENT" ? "#f59e0b" : "transparent",
                color: typeFilter === "EQUIPMENT" ? "white" : "#64748b"
              }}
            >
              🛠 Equipment
            </button>
          </div>
        </div>

        {/* Tracking */}
        <div className="input-group">
          <label>3. Tracking No.</label>
          <select
            value={trackingFilter}
            onChange={(e) => setTrackingFilter(e.target.value)}
            disabled={!branchFilter}
          >
            <option value="">
              {branchFilter ? "-- Select Tracking --" : "-- Select Branch First --"}
            </option>
            {branchFilter && <option value="ALL">📋 Show All</option>}
            {availableTrackings.map((t) => (
              <option key={t} value={t}>
                {t === "PENDING" ? "⏳ PENDING" : t}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>

    {/* ===== RESULT ===== */}
    <div className="result-card">
      {!loading && branchFilter && trackingFilter && filteredItems.length === 0 && (
        <div className="empty-state">
          <span>📭</span>
          <p>No shipment items found</p>
        </div>
      )}

      {!loading && filteredItems.length > 0 && (
        <>
          {/* Summary */}
          <div
            style={{
              marginBottom: 15,
              padding: 12,
              borderRadius: 10,
              background: typeFilter === "POP" ? "#eef2ff" : "#fffbeb",
              border: typeFilter === "POP"
                ? "1px solid #c7d2fe"
                : "1px solid #fde68a"
            }}
          >
            <strong>🏠 Branch:</strong> {branchFilter}<br />
            <strong>📦 Category:</strong>{" "}
            {typeFilter === "POP" ? "POP Items" : "Equipment Items"}
          </div>

          {/* Table */}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order Name</th>
                  <th style={{ width: 260 }}>Tracking</th>
                  <th>Item</th>
                  <th style={{ textAlign: "center" }}>Qty</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it, idx) => {
                  const isEditing = editingOrderNo === it.orderNo;
                  const isPending =
                    it.trackingNo === "PENDING" ||
                    it.trackingNo === "-" ||
                    !it.trackingNo;

                  return (
                    <tr key={idx}>
                      <td>{it.orderNo}</td>

                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input
                              value={tempTracking}
                              onChange={(e) => setTempTracking(e.target.value)}
                              placeholder="Tracking No."
                              style={{ flex: 1 }}
                            />
                            <button
                              onClick={() => handleSaveTracking(it.orderNo, it.branch)}
                              disabled={isSaving}
                              className="btn-submit"
                              style={{ padding: "0 12px" }}
                            >
                              💾
                            </button>
                            <button
                              onClick={() => setEditingOrderNo(null)}
                              style={{
                                padding: "0 10px",
                                background: "#ef4444",
                                color: "white",
                                borderRadius: 6,
                                border: "none"
                              }}
                            >
                              ✖
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                padding: "4px 10px",
                                borderRadius: 20,
                                background: isPending ? "#fee2e2" : "#dcfce7",
                                color: isPending ? "#b91c1c" : "#166534"
                              }}
                            >
                              {isPending ? "PENDING" : it.trackingNo}
                            </span>
                            <button
                              onClick={() => {
                                setEditingOrderNo(it.orderNo);
                                setTempTracking(isPending ? "" : it.trackingNo);
                              }}
                              style={{
                                border: "1px solid #cbd5e1",
                                background: "white",
                                borderRadius: 6,
                                padding: "2px 8px",
                                cursor: "pointer"
                              }}
                            >
                              ✏️
                            </button>
                          </div>
                        )}
                      </td>

                      <td>{it.item}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className="qty-pill">{it.qty}</span>
                      </td>
                      <td>
                        {new Date(it.createdAt).toLocaleDateString("th-TH")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  </div>
);

};

export default AdminShipmentPanel;