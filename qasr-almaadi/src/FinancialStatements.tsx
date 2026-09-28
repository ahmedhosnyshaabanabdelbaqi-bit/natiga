import { useEffect, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { api, money, Row, Table } from "./shared";
import { useLanguage } from "./i18n";
import AccountingWorkspace from "./AccountingWorkspace";

const today=()=>new Date().toISOString().slice(0,10);
const yearStart=()=>`${new Date().getFullYear()}-01-01`;
const names:Record<string,[string,string]>={income:["قائمة الدخل","Income statement"],position:["المركز المالي","Financial position"],cashflow:["التدفقات النقدية","Cash flows"],trial:["ميزان المراجعة","Trial balance"],aging:["أعمار المديونيات","Receivables aging"]};
export default function FinancialStatements({can}:{can:(permission:string)=>boolean}){
  const english=useLanguage()==="en";
  const [from,setFrom]=useState(yearStart()),[end,setEnd]=useState(today()),[active,setActive]=useState("income"),[data,setData]=useState<Row|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const load=()=>{setLoading(true);setError("");api(`/financial-statements?from=${from}&end=${end}`).then(setData).catch(e=>setError(e.message)).finally(()=>setLoading(false))};
  useEffect(load,[from,end]);
  const rows:Row[]=data?.[active]||[];
  const url=(format:string)=>`/api/financial-statements?from=${encodeURIComponent(from)}&end=${encodeURIComponent(end)}&format=${format}&lang=${english?'en':'ar'}`;
  return <><section className="financial-center">
    <div className="financial-head"><div><span>{english?"Financial reporting center":"مركز التقارير المالية"}</span><h2>{english?"Integrated financial statements":"القوائم المالية المترابطة"}</h2><p>{english?"Calculated directly from invoices, collections, insurance, purchasing, maintenance and treasury records.":"محسوبة مباشرة من الفواتير والتحصيل والتأمين والمشتريات والصيانة والخزنة."}</p></div><div className="financial-actions"><label>{english?"From":"من"}<input type="date" value={from} max={end} onChange={e=>setFrom(e.target.value)}/></label><label>{english?"To":"إلى"}<input type="date" value={end} min={from} onChange={e=>setEnd(e.target.value)}/></label><button className="button small" onClick={load}><RefreshCw size={15}/>{english?"Refresh":"تحديث"}</button><a className="button small" href={url("excel")}><Download size={15}/>{english?"Excel":"Excel"}</a><button className="button small primary" onClick={()=>window.open(url("pdf"),"_blank","noopener")}><FileText size={15}/>{english?"PDF":"PDF"}</button></div></div>
    {error&&<div className="error-box">{error}</div>}{loading&&<div className="loading"><RefreshCw className="spin"/>{english?"Calculating statements…":"جارٍ احتساب القوائم…"}</div>}
    {data&&<><div className="financial-kpis">{[["revenue","الإيرادات","Revenue"],["expenses","المصروفات","Expenses"],["net_income","صافي الدخل","Net income"],["cash","النقدية والبنوك","Cash and banks"],["receivables","المديونيات","Receivables"],["assets","إجمالي الأصول","Total assets"]].map(([key,ar,en])=><article key={key}><span>{english?en:ar}</span><strong>{money(data.summary[key])}</strong></article>)}</div><div className="statement-tabs">{Object.keys(names).map(key=><button key={key} className={active===key?"active":""} onClick={()=>setActive(key)}>{names[key][english?1:0]}</button>)}</div><div className="statement-table"><h3>{names[active][english?1:0]}</h3><Table headers={active==="trial"?[english?"Account":"الحساب",english?"Debit":"مدين",english?"Credit":"دائن"]:[english?"Item":"البيان",active==="aging"?(english?"Accounts":"عدد الحسابات"):(english?"Amount":"القيمة"),active==="aging"?(english?"Amount":"القيمة"):""]} rows={rows.map(r=>active==="trial"?[r.label,money(r.debit),money(r.credit)]:active==="aging"?[r.label,r.count,money(r.amount)]:[r.label,money(r.amount),""])} /></div><div className="financial-note">{data.notes?.map((x:string)=><p key={x}>{x}</p>)}</div></>}
  </section><AccountingWorkspace can={can}/></>
}
