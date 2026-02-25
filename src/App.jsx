import React, { useState, useCallback, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, ReferenceLine } from "recharts";

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000";

const VEHICLE_TYPES = [
  { value: "BEV", label: "Battery Electric", icon: "⚡", color: "#00e5ff" },
  { value: "PHEV", label: "Plug-in Hybrid", icon: "🔌", color: "#69ff47" },
  { value: "HEV", label: "Hybrid", icon: "♻️", color: "#ffd740" },
  { value: "ICEV-p", label: "Petrol ICE", icon: "⛽", color: "#ff6b6b" },
  { value: "ICEV-d", label: "Diesel ICE", icon: "🏭", color: "#ff9a3c" },
];

const GRID_PRESETS = [
  { label: "Norway (hydro)", value: 0.017 },
  { label: "France (nuclear)", value: 0.056 },
  { label: "EU average", value: 0.255 },
  { label: "UK", value: 0.233 },
  { label: "USA average", value: 0.386 },
  { label: "Australia", value: 0.480 },
  { label: "Poland (coal-heavy)", value: 0.770 },
  { label: "India", value: 0.708 },
  { label: "Custom", value: null },
];

const PIE_COLORS = { manufacturing: "#a78bfa", use_phase: "#38bdf8", disposal: "#fb7185" };

// ── Utilities ──────────────────────────────────────────────────────────────────

const fmt = (n, decimals = 0) => n?.toLocaleString("en-US", { maximumFractionDigits: decimals }) ?? "—";
const fmtTonne = (kg) => kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;

// ── API ────────────────────────────────────────────────────────────────────────

async function compareVehicles(vehicles) {
  const res = await fetch(`${API_BASE}/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicles }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "API error");
  }
  return res.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function VehicleCard({ vtype, isSelected, onToggle }) {
  return (
    <button
      onClick={() => onToggle(vtype.value)}
      style={{
        background: isSelected ? `${vtype.color}18` : "rgba(255,255,255,0.03)",
        border: `1.5px solid ${isSelected ? vtype.color : "rgba(255,255,255,0.08)"}`,
        borderRadius: 12,
        padding: "14px 18px",
        cursor: "pointer",
        transition: "all 0.2s",
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: isSelected ? vtype.color : "#9ca3af",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: isSelected ? 600 : 400,
        letterSpacing: "0.02em",
        width: "100%",
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: 20 }}>{vtype.icon}</span>
      <div>
        <div style={{ color: isSelected ? vtype.color : "#e5e7eb", fontWeight: 600, fontSize: 13 }}>{vtype.label}</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{vtype.value}</div>
      </div>
      {isSelected && (
        <span style={{ marginLeft: "auto", fontSize: 16, color: vtype.color }}>✓</span>
      )}
    </button>
  );
}

function StatCard({ label, value, sub, color = "#a78bfa", flag }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      padding: "18px 20px",
      position: "relative",
      overflow: "hidden",
    }}>
      {flag && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: "#f59e0b", color: "#000",
          fontSize: 10, fontWeight: 700, padding: "3px 8px",
          borderBottomLeftRadius: 8,
        }}>⚠ GREENWASH</div>
      )}
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "IBM Plex Mono, monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f0f10",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: "10px 14px",
      fontSize: 13, color: "#e5e7eb",
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span>{p.name}</span>
          <span style={{ fontFamily: "monospace" }}>{fmtTonne(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [selectedVehicles, setSelectedVehicles] = useState(["BEV", "ICEV-p"]);
  const [annualKm, setAnnualKm] = useState(15000);
  const [years, setYears] = useState(10);
  const [gridPreset, setGridPreset] = useState(GRID_PRESETS[7]); // India default
  const [customGrid, setCustomGrid] = useState(0.233);
  const [vehicleSize, setVehicleSize] = useState("medium");

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("bar");

  const gridFactor = gridPreset.value ?? customGrid;

  const toggleVehicle = useCallback((v) => {
    setSelectedVehicles((prev) => {
      if (prev.includes(v)) {
        return prev.length > 2 ? prev.filter((x) => x !== v) : prev;
      }
      return [...prev, v];
    });
  }, []);

  const runComparison = useCallback(async () => {
    if (selectedVehicles.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const vehicles = selectedVehicles.map((vt) => ({
        vehicle_type: vt,
        annual_km: annualKm,
        years,
        grid_factor: gridFactor,
        vehicle_size: vehicleSize,
      }));
      const data = await compareVehicles(vehicles);
      setResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVehicles, annualKm, years, gridFactor, vehicleSize]);

  // Auto-run on param change (debounced)
  useEffect(() => {
    const t = setTimeout(runComparison, 600);
    return () => clearTimeout(t);
  }, [runComparison]);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const barData = results?.results.map((r) => ({
    name: r.vehicle_type,
    Manufacturing: r.manufacturing,
    "Use Phase": r.use_phase,
    Disposal: r.disposal,
    color: VEHICLE_TYPES.find((v) => v.value === r.vehicle_type)?.color,
  }));

  // Build line chart data: one row per year, columns = best vehicle + each comparison vehicle
  // The best vehicle's curve is the same across all pairs — we only need it once
  const lineData = results?.break_even
    ? results.break_even.years_range.map((y, i) => {
        const row = { year: `Yr ${y}` };
        // Best vehicle curve (same in every pair — take from first pair)
        row[results.break_even.best_vehicle] =
          results.break_even.pairs[0].yearly_best_cumulative[i];
        // Each comparison vehicle's curve
        results.break_even.pairs.forEach((pair) => {
          row[pair.comparison_vehicle] = pair.yearly_comparison_cumulative[i];
        });
        return row;
      })
    : null;

  // Collect all break-even years across pairs for reference lines
  const breakEvenMarkers = results?.break_even?.pairs
    .filter((p) => p.year != null && p.year > 0)
    .map((p) => ({ year: p.year, label: `${p.comparison_vehicle} BE yr ${p.year}` })) ?? [];

  const bestResult = results?.results.find(
    (r) => r.vehicle_type === results.recommendation.recommended_vehicle
  );

  const pieData = bestResult
    ? [
        { name: "Manufacturing", value: bestResult.manufacturing },
        { name: "Use Phase", value: bestResult.use_phase },
        { name: "Disposal", value: bestResult.disposal },
      ]
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh",
      background: "#060b14",
      color: "#e5e7eb",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      padding: "0",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        input[type=range] { accent-color: #a78bfa; }
        select { appearance: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,0.02)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #a78bfa, #38bdf8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>🌍</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em" }}>Carbon Compare</div>
            <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.05em" }}>LIFECYCLE VEHICLE EMISSIONS ENGINE</div>
          </div>
        </div>
        <div style={{
          fontSize: 11, color: "#4b5563",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 6, padding: "4px 10px",
          fontFamily: "IBM Plex Mono, monospace",
        }}>
          LCA METHODOLOGY
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 77px)" }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: 280, flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          padding: "24px 20px",
          background: "rgba(255,255,255,0.01)",
          overflowY: "auto",
        }}>
          <Section label="Select Vehicles" sub="Choose 2–5 to compare">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {VEHICLE_TYPES.map((v) => (
                <VehicleCard
                  key={v.value}
                  vtype={v}
                  isSelected={selectedVehicles.includes(v.value)}
                  onToggle={toggleVehicle}
                />
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8 }}>
              {selectedVehicles.length} selected · min 2
            </div>
          </Section>

          <Section label="Usage Profile">
            <Label text={`Annual Distance: ${fmt(annualKm)} km`} />
            <input type="range" min={3000} max={50000} step={500}
              value={annualKm} onChange={(e) => setAnnualKm(+e.target.value)}
              style={{ width: "100%", marginBottom: 16 }} />

            <Label text={`Ownership Period: ${years} years`} />
            <input type="range" min={1} max={25} step={1}
              value={years} onChange={(e) => setYears(+e.target.value)}
              style={{ width: "100%", marginBottom: 16 }} />

            <Label text="Vehicle Size" />
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              {["small", "medium", "large"].map((s) => (
                <button key={s} onClick={() => setVehicleSize(s)} style={{
                  flex: 1, padding: "6px 0", borderRadius: 8,
                  border: `1px solid ${vehicleSize === s ? "#a78bfa" : "rgba(255,255,255,0.08)"}`,
                  background: vehicleSize === s ? "rgba(167,139,250,0.12)" : "transparent",
                  color: vehicleSize === s ? "#a78bfa" : "#6b7280",
                  fontSize: 12, fontWeight: vehicleSize === s ? 600 : 400,
                  cursor: "pointer", fontFamily: "inherit",
                  textTransform: "capitalize",
                }}>
                  {s}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Grid Intensity">
            <Label text="Region Preset" />
            <select
              value={gridPreset.label}
              onChange={(e) => {
                const p = GRID_PRESETS.find((g) => g.label === e.target.value);
                setGridPreset(p);
              }}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e5e7eb", fontSize: 13, marginBottom: 12,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              {GRID_PRESETS.map((p) => (
                <option key={p.label} value={p.label} style={{ background: "#0f172a" }}>
                  {p.label} {p.value ? `(${p.value} kg/kWh)` : ""}
                </option>
              ))}
            </select>

            {gridPreset.value === null && (
              <>
                <Label text={`Custom: ${customGrid} kg CO₂/kWh`} />
                <input type="range" min={0.01} max={1.5} step={0.01}
                  value={customGrid}
                  onChange={(e) => setCustomGrid(+e.target.value)}
                  style={{ width: "100%" }} />
              </>
            )}

            <div style={{
              marginTop: 10, padding: "8px 12px", borderRadius: 8,
              background: "rgba(56,189,248,0.08)",
              border: "1px solid rgba(56,189,248,0.2)",
              fontSize: 12, color: "#38bdf8",
              fontFamily: "IBM Plex Mono, monospace",
            }}>
              {gridFactor.toFixed(3)} kg CO₂/kWh
            </div>
          </Section>
        </div>

        {/* ── Main Content ── */}
        <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>

          {/* Error */}
          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 10, padding: "12px 16px", marginBottom: 20,
              color: "#fca5a5", fontSize: 13,
            }}>
              ⚠ {error} — make sure the backend is running at {API_BASE}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, color: "#6b7280", fontSize: 13 }}>
              <div style={{
                width: 16, height: 16, border: "2px solid #374151",
                borderTopColor: "#a78bfa", borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              Calculating lifecycle emissions…
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {results && (
            <>
              {/* Recommendation Banner */}
              <div style={{
                background: "linear-gradient(135deg, rgba(167,139,250,0.12), rgba(56,189,248,0.08))",
                border: "1px solid rgba(167,139,250,0.25)",
                borderRadius: 16, padding: "20px 24px",
                marginBottom: 24, display: "flex", alignItems: "center",
                justifyContent: "space-between", flexWrap: "wrap", gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, letterSpacing: "0.1em", marginBottom: 6 }}>
                    RECOMMENDED VEHICLE
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                    {VEHICLE_TYPES.find((v) => v.value === results.recommendation.recommended_vehicle)?.icon}{" "}
                    {results.recommendation.recommended_vehicle} —{" "}
                    <span style={{ color: "#a78bfa" }}>
                      {VEHICLE_TYPES.find((v) => v.value === results.recommendation.recommended_vehicle)?.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6, maxWidth: 600, lineHeight: 1.5 }}>
                    {results.recommendation.reasoning}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>CONFIDENCE</div>
                  <div style={{
                    fontSize: 32, fontWeight: 700, color: "#a78bfa",
                    fontFamily: "IBM Plex Mono, monospace",
                  }}>
                    {results.recommendation.confidence_percentage.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    Saves {fmtTonne(results.recommendation.savings_vs_worst_kg)} ({results.recommendation.savings_vs_worst_pct.toFixed(0)}%) vs worst
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(results.results.length, 3)}, 1fr)`,
                gap: 12, marginBottom: 28,
              }}>
                {results.results.map((r) => {
                  const vt = VEHICLE_TYPES.find((v) => v.value === r.vehicle_type);
                  return (
                    <StatCard
                      key={r.vehicle_type}
                      label={`${vt?.icon} ${r.vehicle_type} — Total Lifecycle`}
                      value={fmtTonne(r.total)}
                      sub={`${fmt(r.per_km, 0)} g/km · ${fmtTonne(r.manufacturing)} mfg · ${fmtTonne(r.use_phase)} use`}
                      color={vt?.color}
                      flag={r.greenwashing_flag}
                    />
                  );
                })}
              </div>

              {/* Break-even callout — one row per comparison pair */}
              {results.break_even?.pairs.map((pair) => {
                const achieved = pair.year != null && pair.year >= 0;
                const instant = pair.year === 0;
                return (
                  <div key={pair.comparison_vehicle} style={{
                    background: achieved ? "rgba(105,255,71,0.06)" : "rgba(251,113,133,0.06)",
                    border: `1px solid ${achieved ? "rgba(105,255,71,0.2)" : "rgba(251,113,133,0.2)"}`,
                    borderRadius: 10, padding: "10px 16px",
                    fontSize: 13, marginBottom: 8,
                    color: achieved ? "#86efac" : "#fca5a5",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 15 }}>{achieved ? "✓" : "✗"}</span>
                    <span>
                      <strong>{pair.best_vehicle}</strong> vs <strong>{pair.comparison_vehicle}</strong>
                      {instant
                        ? " — best vehicle leads from year 0 (lower manufacturing burden too)."
                        : achieved
                          ? ` — break-even after ${pair.year} year${pair.year !== 1 ? "s" : ""}.`
                          : ` — no break-even within ${years}-year period on this grid (${gridFactor.toFixed(3)} kg/kWh).`
                      }
                    </span>
                  </div>
                );
              })}

              {/* Greenwashing alerts */}
              {results.results.filter((r) => r.greenwashing_flag).map((r) => (
                <div key={r.vehicle_type} style={{
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: 10, padding: "12px 18px",
                  fontSize: 12, color: "#fcd34d", marginBottom: 12,
                }}>
                  ⚠ <strong>{r.vehicle_type}:</strong> {r.greenwashing_reason}
                </div>
              ))}

              {/* Chart Tabs */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, overflow: "hidden",
              }}>
                <div style={{
                  display: "flex",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  padding: "0 4px",
                }}>
                  {[
                    { id: "bar", label: "Lifecycle Breakdown" },
                    { id: "line", label: "Break-Even Curve" },
                    { id: "pie", label: "Best Vehicle Split" },
                  ].map((t) => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                      padding: "14px 20px", border: "none",
                      background: "transparent", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 13,
                      color: activeTab === t.id ? "#e5e7eb" : "#6b7280",
                      borderBottom: `2px solid ${activeTab === t.id ? "#a78bfa" : "transparent"}`,
                      fontWeight: activeTab === t.id ? 600 : 400,
                      marginBottom: -1, transition: "all 0.15s",
                    }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ padding: "24px", height: 360 }}>
                  {activeTab === "bar" && barData && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} barSize={40} barGap={4}>
                        <XAxis dataKey="name" stroke="#4b5563" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                        <YAxis stroke="#4b5563" tick={{ fill: "#9ca3af", fontSize: 11 }}
                          tickFormatter={(v) => fmtTonne(v)} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                        <Bar dataKey="Manufacturing" stackId="a" fill={PIE_COLORS.manufacturing} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Use Phase" stackId="a" fill={PIE_COLORS.use_phase} />
                        <Bar dataKey="Disposal" stackId="a" fill={PIE_COLORS.disposal} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  {activeTab === "line" && lineData && results?.break_even && (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineData}>
                        <XAxis dataKey="year" stroke="#4b5563" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                        <YAxis stroke="#4b5563" tick={{ fill: "#9ca3af", fontSize: 11 }}
                          tickFormatter={(v) => fmtTonne(v)} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />

                        {/* Break-even reference lines — one per pair that achieves it */}
                        {breakEvenMarkers.map((m) => (
                          <ReferenceLine
                            key={m.label}
                            x={`Yr ${m.year}`}
                            stroke="#69ff47"
                            strokeDasharray="4 2"
                            label={{ value: m.label, fill: "#69ff47", fontSize: 10, position: "insideTopRight" }}
                          />
                        ))}

                        {/* Best vehicle line — solid, always cyan */}
                        <Line
                          type="monotone"
                          dataKey={results.break_even.best_vehicle}
                          stroke="#00e5ff"
                          strokeWidth={2.5}
                          dot={false}
                          name={`${results.break_even.best_vehicle} ★ (best)`}
                        />

                        {/* One dashed line per comparison vehicle, distinct colours */}
                        {results.break_even.pairs.map((pair, idx) => {
                          const COMPARISON_COLORS = ["#ff6b6b", "#ffd740", "#ff9a3c", "#c084fc"];
                          const vt = VEHICLE_TYPES.find((v) => v.value === pair.comparison_vehicle);
                          return (
                            <Line
                              key={pair.comparison_vehicle}
                              type="monotone"
                              dataKey={pair.comparison_vehicle}
                              stroke={vt?.color ?? COMPARISON_COLORS[idx % COMPARISON_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                              strokeDasharray="5 3"
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {activeTab === "pie" && pieData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData} cx="50%" cy="50%"
                          outerRadius={130} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ stroke: "#4b5563" }}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={PIE_COLORS[entry.name.toLowerCase().replace(" ", "_")]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => fmtTonne(v)} contentStyle={{
                          background: "#f1f3f7", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                        }} />
                        <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 13 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}

                  {activeTab === "line" && !lineData && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#4b5563", fontSize: 14 }}>
                      Select at least 2 vehicles to see break-even curves
                    </div>
                  )}
                </div>
              </div>

              {/* Raw data table */}
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.1em", marginBottom: 12 }}>DETAILED BREAKDOWN</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["Vehicle", "Manufacturing", "Use Phase", "Disposal", "Total", "g/km"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#6b7280", fontWeight: 600, fontSize: 11, letterSpacing: "0.05em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.results.map((r) => {
                        const vt = VEHICLE_TYPES.find((v) => v.value === r.vehicle_type);
                        const isWinner = r.vehicle_type === results.recommendation.recommended_vehicle;
                        return (
                          <tr key={r.vehicle_type} style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            background: isWinner ? "rgba(167,139,250,0.04)" : "transparent",
                          }}>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: vt?.color }}>
                              {vt?.icon} {r.vehicle_type} {isWinner ? "★" : ""}
                            </td>
                            {[r.manufacturing, r.use_phase, r.disposal, r.total].map((v, i) => (
                              <td key={i} style={{ padding: "10px 12px", fontFamily: "IBM Plex Mono, monospace", color: "#d1d5db" }}>
                                {fmtTonne(v)}
                              </td>
                            ))}
                            <td style={{ padding: "10px 12px", fontFamily: "IBM Plex Mono, monospace", color: "#9ca3af" }}>
                              {fmt(r.per_km, 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!results && !loading && !error && (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: "60vh", color: "#374151", gap: 12,
            }}>
              <div style={{ fontSize: 48 }}>🌍</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Waiting for backend…</div>
              <div style={{ fontSize: 13, color: "#4b5563" }}>
                Start the FastAPI server at {API_BASE} and results will appear automatically.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────────

function Section({ label, sub, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: sub ? 2 : 10 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 10 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Label({ text }) {
  return <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{text}</div>;
}