"use client";
import React, {useMemo, useRef, useState} from "react";

/** --- types --- */
type ChatMsg = { role:"user"|"assistant"|"system"; text:string; t:string };
type Exp = { id:string; status:"queued"|"running"|"done"|"failed"; sharpe:number; dd:number; acc:number; prec:number; rec:number; notes?:string };

export default function StockBotPage() {
  const [tab, setTab] = useState<"datasets"|"training"|"experiments"|"backtests"|"forward"|"deployment"|"diagnostics"|"audit">("datasets");
  const [chat, setChat] = useState<ChatMsg[]>([
    {role:"system", text:"Jarvis ready.", t:"09:30"},
    {role:"assistant", text:"Welcome. Manage datasets, run sweeps, backtest, deploy, and monitor.", t:"09:31"},
  ]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exps, setExps] = useState<Exp[]>([
    {id:"EXP-001", status:"done", sharpe:1.42, dd: -11.1, acc:0.66, prec:0.62, rec:0.59, notes:"baseline"},
    {id:"EXP-002", status:"running", sharpe:1.58, dd: -12.4, acc:0.68, prec:0.64, rec:0.60, notes:"sweep z∈[1.2,1.8]"},
  ]);
  const [deployEnv, setDeployEnv] = useState<"Paper"|"Live">("Paper");
  const [override, setOverride] = useState(false);

  const send = () => {
    if (!input.trim()) return;
    setChat(c=>[...c,{role:"user", text:input.trim(), t:now()}]);
    setTimeout(()=> setChat(c=>[...c,{role:"assistant", text:"Acknowledged. (Hook to FastAPI /chat)", t:now()}]), 120);
    setInput("");
  };
  const onUpload = async (files: FileList | null) => {
    if(!files || !files.length) return;
    setUploading(true); setProgress(0);
    for(let p=0;p<=100;p+=10){ await wait(80); setProgress(p); }
    setUploading(false);
  };
  const startSweep = () => {
    const id = "EXP-"+String(Math.random()).slice(2,5);
    setExps(e=>[{id, status:"queued", sharpe:0, dd:0, acc:0, prec:0, rec:0, notes:"grid α, β"}, ...e]);
  };

  return (
    <div className="px-4 py-6 space-y-6 bg-ink">
      <Blobs />

      <section className="ink-card gradient-ring">
        <div className="p-5 md:p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">StockBot</h1>
            <p className="opacity-70 text-sm">Model lifecycle, backtesting, deployment, diagnostics & audit.</p>
          </div>
          <div className="tabs tabs-bordered">
            {(["datasets","training","experiments","backtests","forward","deployment","diagnostics","audit"] as const).map(t=>(
              <a key={t} className={`tab ${tab===t?"tab-active text-[#a78bfa]":""}`} onClick={()=>setTab(t)}>{t.toUpperCase()}</a>
            ))}
          </div>
        </div>
      </section>

      {/* DATASETS */}
      {tab==="datasets" && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title="Upload Dataset">
            <input type="file" multiple className="file-input file-input-bordered w-full" onChange={e=>onUpload(e.target.files)} />
            {uploading && <progress className="progress w-full mt-3" value={progress} max={100}></progress>}
            <div className="text-xs opacity-70 mt-2">Supported: CSV/Parquet. Versioned to S3 or local store.</div>
          </Card>
          <Card title="Datasets (versions)">
            <ul className="menu menu-sm">
              <li><a>features_v2025_08_10.parquet</a></li>
              <li><a>ticks_2025Q2.parquet</a></li>
              <li><a>fundamentals_2025_07.csv</a></li>
            </ul>
          </Card>
          <Card title="Notes & Docs">
            <textarea className="textarea textarea-bordered h-40" placeholder="Document schema, preprocessing, leakage checks…"></textarea>
            <button className="btn btn-sm mt-2">Save</button>
          </Card>
        </section>
      )}

      {/* TRAINING */}
      {tab==="training" && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title="Pipeline Config">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Model" placeholder="XGBoost / LSTM / Transformer" />
              <Field label="Lookback (bars)" placeholder="50" />
              <Field label="Features" placeholder="mom, rsi, vol, vwap, ..." />
              <Field label="Target" placeholder="next_ret_5m > 0" />
              <Field label="Train Split" placeholder="2019-2024" />
              <Field label="Val Split" placeholder="2025-H1" />
              <Field label="Tx Costs (bps)" placeholder="5" />
              <Field label="Slippage (bps)" placeholder="5" />
              <Field label="Labeling" placeholder="triple-barrier" />
              <Field label="Freq" placeholder="1m" />
            </div>
            <div className="join mt-3">
              <button className="btn join-item btn-primary ink-glow">Run Training</button>
              <button className="btn join-item btn-outline" onClick={startSweep}>Start Sweep</button>
            </div>
          </Card>

          <Card title="Chat with Jarvis">
            <Chat chat={chat} />
            <div className="join w-full mt-2">
              <input className="input input-bordered join-item w-full" value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask: 'What features are most predictive for NVDA?'" />
              <button className="btn join-item btn-primary ink-glow" onClick={send}>Send</button>
            </div>
          </Card>

          <Card title="Sweep Queue / Results">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead><tr><th>Exp</th><th>Status</th><th className="text-right">Sharpe</th><th className="text-right">MaxDD</th><th className="text-right">Acc</th><th className="text-right">Prec</th><th className="text-right">Rec</th><th>Notes</th></tr></thead>
                <tbody>
                  {exps.map(e=>(
                    <tr key={e.id}><td className="font-mono">{e.id}</td><td><span className={`badge ${e.status==="done"?"badge-success":e.status==="running"?"badge-info":e.status==="failed"?"badge-error":"badge-warning"}`}>{e.status}</span></td><td className="text-right">{nz(e.sharpe)}</td><td className="text-right">{nz(e.dd)}</td><td className="text-right">{nz(e.acc)}</td><td className="text-right">{nz(e.prec)}</td><td className="text-right">{nz(e.rec)}</td><td className="text-xs">{e.notes}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      {/* BACKTESTS */}
      {tab==="backtests" && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title="Backtest Config">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Universe" placeholder="AAPL,NVDA,MSFT,SPY" />
              <Field label="Benchmark" placeholder="SPY" />
              <Field label="Start" placeholder="2018-01-01" />
              <Field label="End" placeholder="2025-08-12" />
              <Field label="Initial Capital" placeholder="100000" />
              <Field label="Commission ($/trade)" placeholder="0.00" />
              <Field label="Slippage (bps)" placeholder="5" />
              <Field label="Borrow (bps/day)" placeholder="1.5" />
              <Select label="Simulation" options={["Regular","Walk-Forward","Monte Carlo (paths)"]} />
              <Field label="Param (k / paths)" placeholder="5" />
            </div>
            <div className="join mt-3">
              <button className="btn btn-primary join-item ink-glow">Run Backtest</button>
              <button className="btn btn-outline join-item">Export Report</button>
            </div>
          </Card>

          <Card title="Equity & Drawdown">
            <div className="grid grid-cols-1 gap-3">
              <Equity />
              <Drawdown />
            </div>
          </Card>

          <Card title="Performance Stats">
            <table className="table table-sm">
              <tbody>
                {[
                  ["CAGR","18.2%"],["Sharpe","1.45"],["Sortino","2.10"],["Max DD","-11.3%"],
                  ["Win Rate","54%"],["Avg Trade","+ $42"],["Exposure","0.86"],["Turnover","1.7x"]
                ].map(([k,v])=>(<tr key={k}><td>{k}</td><td className="text-right font-mono">{v}</td></tr>))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* FORWARD TEST / LIVE SIGNALS */}
      {tab==="forward" && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title="Live Predictions">
            <div className="bg-base-200/60 rounded-box p-2 h-48 overflow-auto font-mono text-xs">
              [10:59:44] NVDA +0.22 σ • BUY<br/>
              [10:59:43] AAPL −0.10 σ • HOLD<br/>
              [10:59:41] MSFT +0.08 σ • HOLD
            </div>
          </Card>
          <Card title="Manual Overrides">
            <label className="label cursor-pointer justify-between"><span className="label-text">Enable override</span><input type="checkbox" className="toggle" checked={override} onChange={e=>setOverride(e.target.checked)}/></label>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Symbol" options={["AAPL","NVDA","MSFT","SPY"]}/>
              <Select label="Action" options={["FORCE BUY","FORCE SELL","BLOCK","RESET"]}/>
            </div>
            <button className="btn btn-primary mt-2">Apply</button>
          </Card>
          <Card title="Decision Log">
            <div className="bg-base-200/60 rounded-box p-2 h-48 overflow-auto font-mono text-xs">
              [10:58] BUY NVDA (score 0.62) • risk ok • exposure 0.83<br/>
              [10:57] HOLD AAPL (score 0.41)
            </div>
          </Card>
        </section>
      )}

      {/* DEPLOYMENT */}
      {tab==="deployment" && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title="Deploy Model">
            <Select label="Environment" options={["Paper","Live"]}/>
            <button className="btn btn-primary mt-2 ink-glow" onClick={()=>alert(`Deployed to ${deployEnv} (mock)`)}>Deploy</button>
          </Card>
          <Card title="Health & Latency">
            <table className="table table-sm"><tbody>
              {[
                ["Model Service","OK"],["Inference P50","45 ms"],["P99","110 ms"],
                ["WS Connections","2"],["Queue Depth","0"]
              ].map(([k,v])=>(<tr key={k}><td>{k}</td><td className="text-right">{v}</td></tr>))}
            </tbody></table>
          </Card>
          <Card title="Config Snapshot (readonly)">
            <pre className="bg-base-200/60 rounded-box p-3 text-xs">{`{ "model":"xgb-v3.4.1", "features":"s3://features/*", "slippage_bps":5 }`}</pre>
          </Card>
        </section>
      )}

      {/* DIAGNOSTICS */}
      {tab==="diagnostics" && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title="Feature Importance (mock)">
            <Bars labels={["mom","rsi","vol","vwap","sentiment"]} values={[42,33,28,22,15]} />
          </Card>
          <Card title="Confusion Matrix (val)">
            <Confusion />
          </Card>
          <Card title="Residuals / Drift">
            <div className="h-40 rounded-xl bg-base-200/40 grid place-items-center text-sm opacity-70">Residuals chart placeholder</div>
            <div className="mt-2"><span className="badge badge-warning">Drift Alert</span> Feature “spread_imbalance” shifted +1.2σ</div>
          </Card>
        </section>
      )}

      {/* AUDIT */}
      {tab==="audit" && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title="Comments">
            <textarea className="textarea textarea-bordered h-40" placeholder="Leave a note on the latest run…"></textarea>
            <button className="btn btn-sm mt-2">Post</button>
          </Card>
          <Card title="Change Log">
            <ul className="menu menu-sm">
              <li><a>2025-08-10 — bump to v3.4.1 • widen universe</a></li>
              <li><a>2025-08-08 — adjust entry_z 1.5→1.6</a></li>
            </ul>
          </Card>
          <Card title="Export Notebook / Script">
            <button className="btn">Export .ipynb</button>
            <button className="btn btn-outline mt-2">Export .py</button>
          </Card>
        </section>
      )}
    </div>
  );
}

/** components */
function Card({title,children}:{title:string;children:React.ReactNode}){return(<div className="ink-card"><div className="card-body"><div className="card-title text-base">{title}</div>{children}</div></div>);}
function Field({label,placeholder}:{label:string;placeholder?:string}){return(<div className="form-control"><label className="label"><span className="label-text">{label}</span></label><input className="input input-bordered" placeholder={placeholder}/></div>);}
function Select({label,options}:{label:string;options:string[]}){return(<div className="form-control"><label className="label"><span className="label-text">{label}</span></label><select className="select select-bordered">{options.map(o=><option key={o}>{o}</option>)}</select></div>);}
function Chat({chat}:{chat:ChatMsg[]}){const ref=useRef<HTMLDivElement>(null); const items=useMemo(()=>chat,[chat]); return(<div className="bg-base-200/60 rounded-box p-3 h-48 overflow-auto space-y-2">{items.map((m,i)=>(<div key={i} className={`chat ${m.role==="user"?"chat-end":"chat-start"}`}><div className="chat-header text-xs opacity-70">{m.role.toUpperCase()} • {m.t}</div><div className={`chat-bubble ${m.role==="assistant"?"chat-bubble-primary":""}`}>{m.text}</div></div>))}<div ref={ref}/></div>);}
function Bars({labels,values}:{labels:string[];values:number[]}){const max=Math.max(...values);return(<div className="space-y-3">{labels.map((l,i)=>(<div key={l}><div className="flex justify-between text-xs"><span>{l}</span><span>{values[i]}%</span></div><progress className="progress" value={values[i]} max={max}/></div>))}</div>);}
function Confusion(){const labels=["Buy","Hold","Sell"]; const m=[[62,25,13],[12,71,17],[10,18,72]]; return(<div className="overflow-x-auto"><table className="table table-xs"><thead><tr><th></th>{labels.map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>{m.map((r,i)=>(<tr key={i}><td className="font-mono">{labels[i]}</td>{r.map((c,j)=>(<td key={j} style={{background:confCol(c)}} className="text-center">{c}</td>))}</tr>))}</tbody></table></div>);}
function Equity(){return(<div className="rounded-xl h-36 bg-base-200/40 grid place-items-center"><svg viewBox="0 0 100 40" className="w-11/12 h-4/5" style={{color:"#338EF7"}}><defs><linearGradient id="g-eq" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".6"/><stop offset="100%" stopColor="currentColor" stopOpacity=".05"/></linearGradient></defs><path d="M0,30 L10,28 L20,32 L30,24 L40,26 L50,18 L60,22 L70,15 L80,16 L90,8 L100,12 L100,40 L0,40 Z" fill="url(#g-eq)"/><polyline fill="none" stroke="currentColor" strokeWidth="2" points="0,30 10,28 20,32 30,24 40,26 50,18 60,22 70,15 80,16 90,8 100,12"/></svg></div>);}
function Drawdown(){return(<div className="rounded-xl h-36 bg-base-200/40 grid place-items-center"><svg viewBox="0 0 100 40" className="w-11/12 h-4/5" style={{color:"#7c3aed"}}><polyline fill="none" stroke="currentColor" strokeWidth="2" points="0,10 10,12 20,18 30,14 40,20 50,26 60,22 70,29 80,23 90,31 100,28"/></svg></div>);}
function Blobs(){ return (<><div className="blob blob-blue"/><div className="blob blob-purple"/></>); }
function confCol(v:number){ const sat = Math.min(80,v); return `hsl(260 ${sat}% ${30+ (100-v)/3}%)`; }
function wait(ms:number){ return new Promise(res=>setTimeout(res,ms)); }
function nz(n:number){return n ? n.toFixed(2) : "—";}
function now(){ const d=new Date(); return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
