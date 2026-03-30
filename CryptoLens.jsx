import { useState, useEffect, useRef, useCallback } from "react";

function calcRSI(closes, p = 14) {
  if (closes.length < p + 1) return [];
  let g = [], l = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0);
  }
  let ag = g.slice(0, p).reduce((a, b) => a + b) / p;
  let al = l.slice(0, p).reduce((a, b) => a + b) / p;
  const out = Array(p).fill(null);
  out.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  for (let i = p; i < g.length; i++) {
    ag = (ag * (p - 1) + g[i]) / p; al = (al * (p - 1) + l[i]) / p;
    out.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return out;
}
function calcEMA(v, p) {
  const k = 2 / (p + 1), e = []; let s = 0, cnt = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] == null) { e.push(null); continue; }
    if (cnt < p) { s += v[i]; cnt++; e.push(cnt === p ? s / p : null); }
    else e.push(v[i] * k + e[e.length - 1] * (1 - k));
  }
  return e;
}
function calcMACD(c) {
  const e12 = calcEMA(c, 12), e26 = calcEMA(c, 26);
  const ml = e12.map((v, i) => v != null && e26[i] != null ? v - e26[i] : null);
  const sig = calcEMA(ml.filter(v => v != null), 9);
  const sf = []; let si = 0;
  for (let i = 0; i < ml.length; i++) { if (ml[i] == null) sf.push(null); else { sf.push(sig[si] ?? null); si++; } }
  return { ml, sf, hist: ml.map((v, i) => v != null && sf[i] != null ? v - sf[i] : null) };
}
function calcBB(c, p = 20, m = 2) {
  const u = [], md = [], lo = [];
  for (let i = 0; i < c.length; i++) {
    if (i < p - 1) { u.push(null); md.push(null); lo.push(null); continue; }
    const sl = c.slice(i - p + 1, i + 1), mn = sl.reduce((a, b) => a + b) / p;
    const sd = Math.sqrt(sl.map(v => (v - mn) ** 2).reduce((a, b) => a + b) / p);
    u.push(mn + m * sd); md.push(mn); lo.push(mn - m * sd);
  }
  return { u, md, lo };
}
function calcStoch(cs, kp = 14, dp = 3) {
  const k = [];
  for (let i = 0; i < cs.length; i++) {
    if (i < kp - 1) { k.push(null); continue; }
    const sl = cs.slice(i - kp + 1, i + 1);
    const hh = Math.max(...sl.map(c => c.h)), ll = Math.min(...sl.map(c => c.l));
    k.push(hh === ll ? 50 : (cs[i].c - ll) / (hh - ll) * 100);
  }
  const dc = calcEMA(k.filter(v => v != null), dp); const d = []; let di = 0;
  for (let i = 0; i < k.length; i++) { if (k[i] == null) d.push(null); else { d.push(dc[di] ?? null); di++; } }
  return { k, d };
}
function calcIchi(cs) {
  const mHL = (arr, p) => arr.map((_, i) => {
    if (i < p - 1) return null;
    const sl = arr.slice(i - p + 1, i + 1);
    return (Math.max(...sl.map(c => c.h)) + Math.min(...sl.map(c => c.l))) / 2;
  });
  const t = mHL(cs, 9), kk = mHL(cs, 26);
  return { t, k: kk, ssa: t.map((v, i) => v != null && kk[i] != null ? (v + kk[i]) / 2 : null), ssb: mHL(cs, 52) };
}
function calcVP(cs, bins = 12) {
  if (!cs.length) return { poc: 0, bins: [] };
  const maxP = Math.max(...cs.map(c => c.h)), minP = Math.min(...cs.map(c => c.l));
  const step = (maxP - minP) / bins, bkt = Array(bins).fill(0);
  cs.forEach(c => { const idx = Math.min(Math.floor((c.c - minP) / step), bins - 1); bkt[idx] += c.v; });
  const maxV = Math.max(...bkt), pi = bkt.indexOf(maxV);
  return { poc: minP + (pi + 0.5) * step, bins: bkt.map((v, i) => ({ price: minP + i * step, pct: maxV > 0 ? v / maxV : 0 })) };
}
function fp(n) {
  if (n == null || isNaN(n)) return "—";
  if (n >= 10000) return Math.round(n).toLocaleString("tr-TR");
  if (n >= 1000) return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function CandleChart({ candles }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !candles.length) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const vis = candles.slice(-80);
    const closes = vis.map(c => c.c);
    const bb = calcBB(closes);
    const maxP = Math.max(...vis.map((c, i) => bb.u[i] ? Math.max(c.h, bb.u[i]) : c.h));
    const minP = Math.min(...vis.map((c, i) => bb.lo[i] ? Math.min(c.l, bb.lo[i]) : c.l));
    const pad = { l: 4, r: 52, t: 8, b: 16 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    const rng = (maxP - minP) || 1;
    const py = v => pad.t + cH * (1 - (v - minP) / rng);
    const bw = Math.max(2, Math.floor(cW / vis.length) - 1);
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + i * cH / 4;
      ctx.strokeStyle = "#0b1018"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = "#354a60"; ctx.font = "9px monospace"; ctx.textAlign = "left";
      ctx.fillText(fp(maxP - i / 4 * rng), W - pad.r + 3, y + 3);
    }
    if (bb.u[0] != null) {
      ctx.beginPath();
      vis.forEach((_, i) => { if (bb.u[i] == null) return; const x = pad.l + i * cW / vis.length + bw / 2; i === 0 ? ctx.moveTo(x, py(bb.u[i])) : ctx.lineTo(x, py(bb.u[i])); });
      vis.slice().reverse().forEach((_, ri) => { const i = vis.length - 1 - ri; if (bb.lo[i] == null) return; const x = pad.l + i * cW / vis.length + bw / 2; ctx.lineTo(x, py(bb.lo[i])); });
      ctx.closePath(); ctx.fillStyle = "rgba(59,130,246,0.05)"; ctx.fill();
      [bb.u, bb.md, bb.lo].forEach((arr, ai) => {
        ctx.beginPath(); ctx.strokeStyle = ai === 1 ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.5)"; ctx.lineWidth = 1;
        if (ai === 1) ctx.setLineDash([3, 3]);
        let s = false;
        arr.forEach((v, i) => { if (v == null) return; const x = pad.l + i * cW / vis.length + bw / 2; s ? ctx.lineTo(x, py(v)) : (ctx.moveTo(x, py(v)), s = true); });
        ctx.stroke(); ctx.setLineDash([]);
      });
    }
    vis.forEach((c, i) => {
      const x = pad.l + i * cW / vis.length, cx = x + bw / 2;
      const color = c.c >= c.o ? "#10b981" : "#ef4444";
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, py(c.h)); ctx.lineTo(cx, py(c.l)); ctx.stroke();
      const bt = py(Math.max(c.o, c.c)), bh = Math.max(1, py(Math.min(c.o, c.c)) - bt);
      ctx.fillRect(x, bt, bw, bh);
    });
  }, [candles]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

function LineChart({ data, colors, min, max, refs = [] }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 2, r: 36, t: 4, b: 4 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    const rng = (max - min) || 1;
    const py = v => pad.t + cH * (1 - (v - min) / rng);
    refs.forEach(r => {
      ctx.strokeStyle = r.color || "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(pad.l, py(r.v)); ctx.lineTo(W - pad.r, py(r.v)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = r.color || "#354a60"; ctx.font = "8px monospace"; ctx.textAlign = "left";
      ctx.fillText(r.v, W - pad.r + 2, py(r.v) + 3);
    });
    if (min < 0 && max > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, py(0)); ctx.lineTo(W - pad.r, py(0)); ctx.stroke();
    }
    data.forEach((arr, di) => {
      if (!arr?.length) return;
      if (colors[di] === "hist") {
        arr.forEach((v, i) => {
          if (v == null) return;
          const x = pad.l + i * cW / arr.length, bw2 = Math.max(1, cW / arr.length - 1);
          const zero = py(0), y = py(v);
          ctx.fillStyle = v >= 0 ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.6)";
          v >= 0 ? ctx.fillRect(x, y, bw2, zero - y) : ctx.fillRect(x, zero, bw2, y - zero);
        });
        return;
      }
      ctx.beginPath(); ctx.strokeStyle = colors[di] || "#fff"; ctx.lineWidth = 1.5;
      let s = false;
      arr.forEach((v, i) => {
        if (v == null) return;
        const x = pad.l + i * cW / arr.length;
        s ? ctx.lineTo(x, py(v)) : (ctx.moveTo(x, py(v)), s = true);
      });
      ctx.stroke();
    });
    if (data[0] && colors[0] !== "hist") {
      let last = null;
      for (let i = data[0].length - 1; i >= 0; i--) { if (data[0][i] != null) { last = data[0][i]; break; } }
      if (last != null) { ctx.fillStyle = colors[0]; ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.fillText(last.toFixed(1), W - pad.r + 2, py(last) + 3); }
    }
  }, [data, min, max]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export default function CryptoLens() {
  const [tab, setTab] = useState("chart");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("5m");
  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(null);
  const [pct, setPct] = useState(null);
  const [stats, setStats] = useState({ h: null, l: null });
  const [status, setStatus] = useState("connecting");
  const [ind, setInd] = useState({});
  const [score, setScore] = useState({ buys: 0, sells: 0, ntr: 0, total: 50 });
  const [verdict, setVerdict] = useState("YÜKLÜYOR");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTime, setAiTime] = useState("");
  const [lastUpdate, setLastUpdate] = useState("");
  const candlesRef = useRef([]);
  const simRef = useRef(null);
  const pollRef = useRef(null);

  const fetchCandles = useCallback(async (sym, intv) => {
    const urls = [
      `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${intv}&limit=220`,
      `https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${intv}&limit=220`)}`,
      `https://corsproxy.io/?${encodeURIComponent(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${intv}&limit=220`)}`
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const j = await r.json();
        const raw = j.contents ? JSON.parse(j.contents) : j;
        if (!Array.isArray(raw) || raw.length < 10) continue;
        return raw.map(d => ({ t: Math.floor(d[0] / 1000), o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5] }));
      } catch (e) {}
    }
    return null;
  }, []);

  const startSim = useCallback((sym, intv) => {
    setStatus("sim");
    const prices = { BTCUSDT: 67000, ETHUSDT: 3200, SOLUSDT: 145, BNBUSDT: 580, XRPUSDT: 0.52, ADAUSDT: 0.44, DOGEUSDT: 0.16, AVAXUSDT: 38 };
    const base = prices[sym] || 1000;
    const secs = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 }[intv] || 300;
    const now = Math.floor(Date.now() / 1000);
    const cs = [];
    let p = base * 0.94;
    for (let i = 220; i >= 0; i--) {
      const chg = (Math.random() - 0.492) * 0.012;
      const o = p, c = o * (1 + chg);
      cs.push({ t: now - i * secs, o, h: Math.max(o, c) * (1 + Math.random() * 0.005), l: Math.min(o, c) * (1 - Math.random() * 0.005), c, v: base * (30 + Math.random() * 120) });
      p = c;
    }
    candlesRef.current = cs;
    setCandles([...cs]);
    setPrice(cs[cs.length - 1].c);
    setPct(((cs[cs.length - 1].c - cs[0].c) / cs[0].c) * 100);
    setStats({ h: Math.max(...cs.map(c => c.h)), l: Math.min(...cs.map(c => c.l)) });
    if (simRef.current) clearInterval(simRef.current);
    simRef.current = setInterval(() => {
      const arr = candlesRef.current;
      const last = arr[arr.length - 1];
      const nc = last.c * (1 + (Math.random() - 0.492) * 0.004);
      const nowT = Math.floor(Date.now() / 1000), bt = Math.floor(nowT / secs) * secs;
      if (bt === last.t) { last.c = nc; last.h = Math.max(last.h, nc); last.l = Math.min(last.l, nc); last.v += Math.random() * 40; }
      else { arr.push({ t: bt, o: last.c, h: Math.max(last.c, nc), l: Math.min(last.c, nc), c: nc, v: Math.random() * 400 }); if (arr.length > 400) arr.shift(); }
      candlesRef.current = [...arr];
      setCandles([...arr]);
      setPrice(nc);
      const n = new Date(); setLastUpdate(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`);
    }, 2500);
  }, []);

  const loadData = useCallback(async (sym, intv) => {
    setStatus("connecting");
    setCandles([]); candlesRef.current = [];
    if (simRef.current) { clearInterval(simRef.current); simRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const data = await fetchCandles(sym, intv);
    if (data) {
      setStatus("live");
      candlesRef.current = data;
      setCandles([...data]);
      const last = data[data.length - 1];
      setPrice(last.c);
      const open24 = data[Math.max(0, data.length - 288)].o;
      setPct(((last.c - open24) / open24) * 100);
      setStats({ h: Math.max(...data.map(c => c.h)), l: Math.min(...data.map(c => c.l)) });
      const n = new Date(); setLastUpdate(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`);
      pollRef.current = setInterval(async () => {
        const fresh = await fetchCandles(sym, intv);
        if (fresh) {
          candlesRef.current = fresh; setCandles([...fresh]);
          setPrice(fresh[fresh.length - 1].c);
          const n2 = new Date(); setLastUpdate(`${String(n2.getHours()).padStart(2, "0")}:${String(n2.getMinutes()).padStart(2, "0")}:${String(n2.getSeconds()).padStart(2, "0")}`);
        }
      }, 15000);
    } else {
      startSim(sym, intv);
    }
  }, [fetchCandles, startSim]);

  useEffect(() => { loadData(symbol, interval); return () => { if (simRef.current) clearInterval(simRef.current); if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  useEffect(() => {
    if (candles.length < 60) return;
    const closes = candles.map(c => c.c);
    const p = closes[closes.length - 1];
    const result = {};
    const rsiArr = calcRSI(closes); const rv = rsiArr[rsiArr.length - 1], rpv = rsiArr[rsiArr.length - 2];
    if (rv != null) {
      const sig = rv < 30 && rv > (rpv || 0) ? "AL" : rv > 70 && rv < (rpv || 100) ? "SAT" : "BEKLE";
      result.rsi = { val: rv, sig, arr: rsiArr, txt: rv > 70 ? `RSI ${rv.toFixed(1)} — Aşırı alım. Geri çekilme olası.` : rv < 30 ? `RSI ${rv.toFixed(1)} — Aşırı satım. Toparlanma beklentisi.` : `RSI ${rv.toFixed(1)} — Nötr bölge (30–70).` };
    }
    const mr = calcMACD(closes); const mv = mr.ml[mr.ml.length - 1], sv = mr.sf[mr.sf.length - 1], hv = mr.hist[mr.hist.length - 1];
    const mlp = mr.ml[mr.ml.length - 2], sfp = mr.sf[mr.sf.length - 2];
    if (mv != null && sv != null) {
      const bullX = mv > sv && mlp != null && mlp <= sfp, bearX = mv < sv && mlp != null && mlp >= sfp;
      const sig = bullX ? "AL" : bearX ? "SAT" : mv > sv ? "AL" : "SAT";
      result.macd = { val: mv, sigLine: sv, hist: hv, sig, bullX, bearX, ml: mr.ml, sf: mr.sf, histArr: mr.hist, txt: bullX ? "MACD yükseliş kesişimi — güçlü AL!" : bearX ? "MACD düşüş kesişimi — güçlü SAT!" : mv > sv ? `MACD sinyal üzerinde — yükseliş.` : "MACD sinyal altında — düşüş momentumu." };
    }
    const bb = calcBB(closes); const bbu = bb.u[bb.u.length - 1], bbm = bb.md[bb.md.length - 1], bbl = bb.lo[bb.lo.length - 1];
    if (bbu != null) {
      const pct2 = (p - bbl) / (bbu - bbl) * 100, bw = ((bbu - bbl) / bbm) * 100;
      const crossUp = p > bbm && closes[closes.length - 2] <= bbm, crossDn = p < bbm && closes[closes.length - 2] >= bbm;
      const sig = p < bbl ? "AL" : p > bbu ? "SAT" : "BEKLE";
      result.bb = { upper: bbu, mid: bbm, lower: bbl, pct: pct2, bw, sig, crossUp, crossDn, txt: p > bbu ? `Üst bandın dışında (%${pct2.toFixed(0)}) — aşırı uzama.` : p < bbl ? "Alt bandın dışında — aşırı satım." : crossUp ? `Orta bandı yukarı geçti → üst banda (${fp(bbu)}) hareket beklentisi.` : crossDn ? "Orta bandı aşağı geçti → alt banda baskı." : `Bant içi (%${pct2.toFixed(0)}), genişlik %${bw.toFixed(1)}.` };
    }
    const st = calcStoch(candles); const kv = st.k[st.k.length - 1], dv = st.d[st.d.length - 1], kpv = st.k[st.k.length - 2], dpv = st.d[st.d.length - 2];
    if (kv != null) {
      const kXu = kv > dv && kpv != null && kpv <= (dpv || 0) && kv < 40, kXd = kv < dv && kpv != null && kpv >= (dpv || 0) && kv > 60;
      const sig = kv < 20 ? "AL" : kv > 80 ? "SAT" : "BEKLE";
      result.stoch = { k: kv, d: dv, sig, kXu, kXd, kArr: st.k, dArr: st.d, txt: kXu ? "%K, %D'yi yukarı kesti — AL!" : kXd ? "%K, %D'yi aşağı kesti — SAT!" : kv < 20 ? `%K=${kv.toFixed(1)} aşırı satım.` : kv > 80 ? `%K=${kv.toFixed(1)} aşırı alım.` : `%K=${kv.toFixed(1)}, %D=${dv?.toFixed(1) || "—"} nötr.` };
    }
    const vp = calcVP(candles.slice(-50)); const curV = candles[candles.length - 1].v, avgV = candles.slice(-20).reduce((s, c) => s + c.v, 0) / 20;
    const vr = (curV / avgV * 100).toFixed(0);
    result.vol = { poc: vp.poc, curV, sig: p > vp.poc ? "AL" : "SAT", vr, vpBins: vp.bins, txt: `POC: ${fp(vp.poc)} — Fiyat ${p > vp.poc ? "üzerinde (alıcı baskısı)" : "altında (satıcı baskısı)"}. Hacim ort. %${vr}.` };
    const ichi = calcIchi(candles); const n = candles.length - 1;
    const it = ichi.t[n], ik = ichi.k[n], issa = ichi.ssa[n], issb = ichi.ssb[n];
    if (it != null && ik != null) {
      const ct = issa != null && issb != null ? Math.max(issa, issb) : null, cb = issa != null && issb != null ? Math.min(issa, issb) : null;
      const cStr = ct != null ? (p > ct ? "Üstünde ↑" : p < cb ? "Altında ↓" : "İçinde ~") : "—";
      const isig = p > (ct || 0) && it > ik ? "AL" : p < (cb || Infinity) && it < ik ? "SAT" : "BEKLE";
      result.ichi = { tenkan: it, kijun: ik, cloudStr: cStr, sig: isig, txt: p > (ct || 0) && it > ik ? "Bulut üstünde, Tenkan>Kijun — güçlü yükseliş." : p < (cb || Infinity) && it < ik ? "Bulut altında, Tenkan<Kijun — güçlü düşüş." : "Bulut içinde/sınırda — belirsizlik." };
    }
    setInd(result);
    const ids = ["rsi", "macd", "bb", "stoch", "vol", "ichi"];
    const sigs = ids.map(id => result[id]?.sig || "BEKLE");
    const buys = sigs.filter(s => s === "AL").length, sells = sigs.filter(s => s === "SAT").length, ntr = sigs.filter(s => s === "BEKLE").length;
    const total = Math.round((buys * 100 + ntr * 50) / sigs.length);
    setScore({ buys, sells, ntr, total });
    setVerdict(total >= 75 ? "GÜÇLÜ ARTIŞ" : total >= 58 ? "ARTIŞ SİNYALİ" : total >= 42 ? "YATAY SEYİR" : total >= 25 ? "DÜŞÜŞ SİNYALİ" : "GÜÇLÜ DÜŞÜŞ");
  }, [candles]);

  const triggerAI = async () => {
    if (aiLoading || !ind.rsi) return;
    setAiLoading(true); setAiText("");
    const ids = ["rsi", "macd", "bb", "stoch", "vol", "ichi"];
    const sigs = ids.map(id => ind[id]?.sig || "BEKLE");
    const buys = sigs.filter(s => s === "AL").length, sells = sigs.filter(s => s === "SAT").length;
    const sc = Math.round((buys * 100 + (6 - buys - sells) * 50) / 6);
    const prompt = `Sen kripto teknik analiz uzmanısın. Anlık indikatörleri koordineli yorumla.

Varlık: ${symbol.replace("USDT", "/USDT")} | Fiyat: ${fp(price)} | Zaman: ${interval}${status === "sim" ? " (Simülasyon)" : ""}

İndikatörler:
• RSI: ${ind.rsi?.val.toFixed(1) || "-"} → ${ind.rsi?.sig || "-"} — ${ind.rsi?.txt || ""}
• MACD: ${ind.macd?.val.toFixed(4) || "-"} → ${ind.macd?.sig || "-"}${ind.macd?.bullX ? " [YÜKSELİŞ KESİŞİMİ]" : ind.macd?.bearX ? " [DÜŞÜŞ KESİŞİMİ]" : ""} — ${ind.macd?.txt || ""}
• Bollinger: %${ind.bb?.pct.toFixed(0) || "-"} → ${ind.bb?.sig || "-"}${ind.bb?.crossUp ? " [ORTA BANT YUKARI]" : ind.bb?.crossDn ? " [ORTA BANT AŞAĞI]" : ""} — ${ind.bb?.txt || ""}
• Stochastic: %K=${ind.stoch?.k.toFixed(1) || "-"} → ${ind.stoch?.sig || "-"}${ind.stoch?.kXu ? " [AL KESİŞİMİ]" : ind.stoch?.kXd ? " [SAT KESİŞİMİ]" : ""} — ${ind.stoch?.txt || ""}
• Volume Profile: POC=${fp(ind.vol?.poc)} → ${ind.vol?.sig || "-"} — ${ind.vol?.txt || ""}
• Ichimoku: ${fp(ind.ichi?.tenkan)} → ${ind.ichi?.sig || "-"} — ${ind.ichi?.txt || ""}

Skor: ${sc}/100 | AL:${buys} SAT:${sells} NÖTR:${6 - buys - sells}

En güçlü sinyali öne çıkar, çelişen indikatörleri belirt, koordineli sonuç yaz. Yatırım tavsiyesi verme. 3-4 cümle, düz paragraf.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, stream: true, messages: [{ role: "user", content: prompt }] }) });
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "", full = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const d = line.slice(5).trim(); if (d === "[DONE]") continue;
          try { const j = JSON.parse(d); if (j.type === "content_block_delta" && j.delta?.text) { full += j.delta.text; setAiText(full); } } catch (e) {}
        }
      }
    } catch (e) { setAiText("Analiz yapılamadı. Lütfen tekrar deneyin."); }
    const n = new Date(); setAiTime(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
    setAiLoading(false);
  };

  useEffect(() => { if (tab === "ai" && candles.length > 60 && !aiLoading && !aiText) triggerAI(); }, [tab, candles.length]);

  const c = {
    app: { background: "#060a0f", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif", color: "#e2eaf4", maxWidth: 480, margin: "0 auto", overflow: "hidden" },
    topbar: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 8px", borderBottom: "1px solid #1c2a38", background: "rgba(6,10,15,0.97)", flexShrink: 0 },
    pbar: { display: "flex", background: "#0b1018", borderBottom: "1px solid #1c2a38", flexShrink: 0, overflowX: "auto" },
    ibar: { display: "flex", gap: 4, padding: "7px 14px", borderBottom: "1px solid #1c2a38", flexShrink: 0, overflowX: "auto" },
    pages: { flex: 1, overflow: "hidden", position: "relative", minHeight: 0 },
    page: (a) => ({ position: "absolute", inset: 0, display: a ? "flex" : "none", flexDirection: "column", overflow: "hidden" }),
    subrow: { display: "flex", height: 90, borderTop: "1px solid #1c2a38", flexShrink: 0 },
    sw: (last) => ({ flex: 1, display: "flex", flexDirection: "column", borderRight: last ? "none" : "1px solid #1c2a38", overflow: "hidden" }),
    swl: { padding: "3px 7px", fontSize: 8, fontFamily: "monospace", color: "#354a60", textTransform: "uppercase", letterSpacing: "0.8px", background: "#0b1018", borderBottom: "1px solid #1c2a38", flexShrink: 0 },
    icard: (sig) => ({ background: "#111820", border: `1px solid ${sig === "AL" ? "rgba(16,185,129,0.25)" : sig === "SAT" ? "rgba(239,68,68,0.25)" : "#1c2a38"}`, borderRadius: 12, padding: 12, flexShrink: 0, position: "relative", overflow: "hidden" }),
    ibar2: (sig) => ({ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sig === "AL" ? "#10b981" : sig === "SAT" ? "#ef4444" : "#354a60", borderRadius: "3px 0 0 3px" }),
    badge: (sig) => ({ fontSize: 10, fontFamily: "monospace", padding: "4px 10px", borderRadius: 4, fontWeight: 700, background: sig === "AL" ? "rgba(16,185,129,0.15)" : sig === "SAT" ? "rgba(239,68,68,0.15)" : "rgba(107,138,170,0.1)", color: sig === "AL" ? "#34d399" : sig === "SAT" ? "#f87171" : "#6b8aaa", whiteSpace: "nowrap" }),
    sigHero: (t) => ({ background: "#111820", border: `1px solid ${t >= 58 ? "rgba(16,185,129,0.35)" : t <= 42 ? "rgba(239,68,68,0.35)" : "#1c2a38"}`, borderRadius: 16, padding: 18, flexShrink: 0, textAlign: "center" }),
    bnav: { display: "flex", background: "#0b1018", borderTop: "1px solid #1c2a38", flexShrink: 0 },
    nb: (a) => ({ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "9px 0", cursor: "pointer", color: a ? "#60a5fa" : "#354a60", fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.5px", border: "none", background: "transparent" }),
  };

  const vis = candles.slice(-80);
  const closes80 = vis.map(v => v.c);
  const rsiVis = calcRSI(closes80).slice(-80);
  const mr = calcMACD(closes80);
  const allM = [...mr.ml, ...mr.sf].filter(v => v != null);
  const mMin = allM.length ? Math.min(...allM) * 1.3 : -1, mMax = allM.length ? Math.max(...allM) * 1.3 : 1;
  const stVis = calcStoch(vis);
  const indIds = ["rsi", "macd", "bb", "stoch", "vol", "ichi"];
  const indNames = { rsi: "RSI", macd: "MACD", bb: "Bollinger", stoch: "Stochastic", vol: "Vol.Profile", ichi: "Ichimoku" };
  const indVals = { rsi: ind.rsi?.val.toFixed(1), macd: ind.macd?.val.toFixed(4), bb: ind.bb?.pct.toFixed(0) + "%", stoch: ind.stoch?.k.toFixed(1), vol: fp(ind.vol?.poc), ichi: ind.ichi?.cloudStr };

  return (
    <div style={c.app}>
      {/* TOPBAR */}
      <div style={c.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
          <div style={{ width: 22, height: 22, background: "#3b82f6", clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)", flexShrink: 0 }} />
          <div style={{ fontSize: 16, fontWeight: 800 }}>Crypto<span style={{ color: "#3b82f6" }}>Lens</span></div>
          <div style={{ fontSize: 9, background: "rgba(59,130,246,0.14)", border: "1px solid rgba(59,130,246,0.28)", color: "#60a5fa", padding: "2px 5px", borderRadius: 4 }}>AI</div>
        </div>
        <div title={status === "live" ? "Canlı Veri" : status === "sim" ? "Simülasyon" : "Bağlanıyor..."} style={{ width: 7, height: 7, borderRadius: "50%", background: status === "live" ? "#10b981" : status === "sim" ? "#f59e0b" : "#354a60", flexShrink: 0 }} />
        <select style={{ background: "#111820", border: "1px solid #243448", color: "#e2eaf4", fontSize: 11, padding: "6px 8px", borderRadius: 7, outline: "none", fontFamily: "monospace" }} value={symbol} onChange={e => { setSymbol(e.target.value); loadData(e.target.value, interval); }}>
          {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT"].map(s => <option key={s} value={s}>{s.replace("USDT", "/USDT")}</option>)}
        </select>
      </div>

      {/* PRICE BAR */}
      <div style={c.pbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", flexShrink: 0 }}>
          <div style={{ fontFamily: "monospace", fontSize: 21, fontWeight: 700 }}>{fp(price)}</div>
          {pct != null && <div style={{ fontFamily: "monospace", fontSize: 11, padding: "3px 7px", borderRadius: 5, background: pct >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: pct >= 0 ? "#34d399" : "#f87171" }}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</div>}
        </div>
        <div style={{ width: 1, height: 26, background: "#1c2a38", flexShrink: 0, alignSelf: "center" }} />
        {[["Yüksek", fp(stats.h)], ["Düşük", fp(stats.l)], ["Güncelleme", lastUpdate || "—"]].map(([l, v]) => (
          <div key={l} style={{ padding: "6px 12px", flexShrink: 0 }}>
            <div style={{ fontSize: 8, color: "#354a60", fontFamily: "monospace", textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#6b8aaa" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* INTERVAL */}
      <div style={c.ibar}>
        {[["1m","1d"],["5m","5d"],["15m","15d"],["1h","1s"],["4h","4s"],["1d","1G"]].map(([v, l]) => (
          <button key={v} style={{ flexShrink: 0, background: interval === v ? "rgba(59,130,246,0.12)" : "#111820", border: interval === v ? "1px solid #3b82f6" : "1px solid #1c2a38", color: interval === v ? "#60a5fa" : "#6b8aaa", padding: "5px 11px", borderRadius: 6, fontFamily: "monospace", fontSize: 11, cursor: "pointer" }} onClick={() => { setInterval(v); loadData(symbol, v); }}>{l}</button>
        ))}
      </div>

      {/* PAGES */}
      <div style={c.pages}>
        {candles.length < 5 && (
          <div style={{ position: "absolute", inset: 0, background: "#060a0f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 99, gap: 14 }}>
            <div style={{ width: 32, height: 32, border: "2px solid #243448", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#6b8aaa", textAlign: "center", lineHeight: 1.7 }}>
              {status === "connecting" ? "Binance'e bağlanıyor..." : "Simülasyon başlıyor..."}<br />
              <span style={{ color: "#354a60", fontSize: 10 }}>{symbol.replace("USDT", "/USDT")} · {interval}</span>
            </div>
          </div>
        )}

        {/* CHART */}
        <div style={c.page(tab === "chart")}>
          <div style={{ flex: 1, minHeight: 0 }}><CandleChart candles={vis} /></div>
          <div style={c.subrow}>
            <div style={c.sw(false)}><div style={c.swl}>RSI (14)</div><div style={{ flex: 1, minHeight: 0 }}><LineChart data={[rsiVis]} colors={["#8b5cf6"]} min={0} max={100} refs={[{ v: 70, color: "rgba(239,68,68,0.4)" }, { v: 30, color: "rgba(16,185,129,0.4)" }]} /></div></div>
            <div style={c.sw(false)}><div style={c.swl}>MACD</div><div style={{ flex: 1, minHeight: 0 }}><LineChart data={[mr.hist.slice(-80), mr.ml.slice(-80), mr.sf.slice(-80)]} colors={["hist", "#3b82f6", "#f59e0b"]} min={mMin} max={mMax} refs={[]} /></div></div>
            <div style={c.sw(true)}><div style={c.swl}>Stochastic</div><div style={{ flex: 1, minHeight: 0 }}><LineChart data={[stVis.k.slice(-80), stVis.d.slice(-80)]} colors={["#3b82f6", "#f59e0b"]} min={0} max={100} refs={[{ v: 80, color: "rgba(239,68,68,0.4)" }, { v: 20, color: "rgba(16,185,129,0.4)" }]} /></div></div>
          </div>
        </div>

        {/* INDICATORS */}
        <div style={{ ...c.page(tab === "ind"), overflowY: "auto", padding: 11, gap: 9 }}>
          {[
            { id: "rsi", name: "RSI", sub: "Relative Strength Index · 14", nums: [["Değer", ind.rsi?.val.toFixed(1)], ["Bölge", ind.rsi?.val > 70 ? "Aşırı Alım" : ind.rsi?.val < 30 ? "Aşırı Satım" : "Normal"]], bar: ind.rsi?.val, txt: ind.rsi?.txt },
            { id: "macd", name: "MACD", sub: "12 / 26 / 9", nums: [["MACD", ind.macd?.val.toFixed(4)], ["Sinyal", ind.macd?.sigLine?.toFixed(4)], ["Hist", ind.macd?.hist?.toFixed(4)]], txt: ind.macd?.txt },
            { id: "bb", name: "Bollinger Bands", sub: "20 periyot · 2σ", nums: [["Üst", fp(ind.bb?.upper)], ["Orta", fp(ind.bb?.mid)], ["Alt", fp(ind.bb?.lower)]], bar: ind.bb?.pct, txt: ind.bb?.txt },
            { id: "stoch", name: "Stochastic", sub: "%K/%D · 14/3", nums: [["%K", ind.stoch?.k.toFixed(1)], ["%D", ind.stoch?.d?.toFixed(1)]], bar: ind.stoch?.k, txt: ind.stoch?.txt },
            { id: "vol", name: "Volume Profile", sub: "50 periyot · 12 seviye", nums: [["POC", fp(ind.vol?.poc)], ["Hacim", ind.vol ? (ind.vol.curV > 1e6 ? (ind.vol.curV / 1e6).toFixed(2) + "M" : (ind.vol.curV / 1000).toFixed(1) + "K") : "—"]], txt: ind.vol?.txt, vpBins: ind.vol?.vpBins },
            { id: "ichi", name: "Ichimoku", sub: "9 / 26 / 52", nums: [["Tenkan", fp(ind.ichi?.tenkan)], ["Kijun", fp(ind.ichi?.kijun)], ["Bulut", ind.ichi?.cloudStr]], txt: ind.ichi?.txt },
          ].map(({ id, name, sub, nums, bar, txt, vpBins }) => {
            const sig = ind[id]?.sig || "BEKLE";
            return (
              <div key={id} style={c.icard(sig)}>
                <div style={c.ibar2(sig)} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 }}>
                  <div><div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div><div style={{ fontSize: 9, color: "#354a60", fontFamily: "monospace", marginTop: 1 }}>{sub}</div></div>
                  <div style={c.badge(sig)}>{sig}</div>
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 9, flexWrap: "wrap" }}>
                  {nums.map(([l, v]) => <div key={l} style={{ display: "flex", flexDirection: "column", gap: 2 }}><div style={{ fontSize: 8, color: "#354a60", fontFamily: "monospace", textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 13, fontFamily: "monospace" }}>{v || "—"}</div></div>)}
                </div>
                {bar != null && <div style={{ width: "100%", height: 4, background: "#1c2a38", borderRadius: 2, position: "relative", marginBottom: 8 }}><div style={{ height: 4, borderRadius: 2, width: `${Math.min(100, Math.max(0, bar))}%`, background: sig === "AL" ? "#10b981" : sig === "SAT" ? "#ef4444" : "#3b82f6", transition: "width 0.5s" }} /><div style={{ position: "absolute", top: -4, left: `${Math.min(100, Math.max(0, bar))}%`, width: 2, height: 12, background: "rgba(255,255,255,0.3)", borderRadius: 1 }} /></div>}
                {vpBins && <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 32, marginBottom: 8 }}>{vpBins.map((b, i) => <div key={i} style={{ flex: 1, borderRadius: "1px 1px 0 0", height: b.pct * 28 + 4, minWidth: 4, background: Math.abs(b.price - ind.vol.poc) < ind.vol.poc * 0.012 ? "#3b82f6" : b.price < price ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.35)" }} />)}</div>}
                <div style={{ fontSize: 11, color: "#6b8aaa", lineHeight: 1.6 }}>{txt || "Bekleniyor..."}</div>
              </div>
            );
          })}
        </div>

        {/* AI */}
        <div style={{ ...c.page(tab === "ai"), overflowY: "auto", padding: 12, gap: 11 }}>
          <div style={c.sigHero(score.total)}>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#354a60", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>Koordineli Sinyal Analizi</div>
            <div style={{ fontSize: 25, fontWeight: 900, letterSpacing: -0.5, color: score.total >= 58 ? "#34d399" : score.total <= 42 ? "#f87171" : "#f59e0b", marginBottom: 5 }}>{verdict}</div>
            <div style={{ fontSize: 11, color: "#6b8aaa", marginBottom: 14 }}>{score.buys} AL · {score.ntr} Nötr · {score.sells} SAT  |  Skor: {score.total}/100</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 22 }}>
              {[{ n: score.buys, l: "AL", col: "#34d399" }, { n: score.ntr, l: "NÖTR", col: "#6b8aaa" }, { n: score.sells, l: "SAT", col: "#f87171" }].map(x => (
                <div key={x.l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: x.col }}>{x.n}</div>
                  <div style={{ fontSize: 9, color: "#354a60", fontFamily: "monospace", textTransform: "uppercase" }}>{x.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#111820", border: "1px solid #1c2a38", borderRadius: 13, padding: 14, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
              <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 22, height: 22, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🤖</div>
                AI Koordineli Analiz
              </div>
              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#354a60" }}>{aiTime || "—"}</div>
            </div>
            <div style={{ fontSize: 12, color: "#6b8aaa", lineHeight: 1.75, minHeight: 56 }}>
              {aiLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#354a60" }}>
                  <div style={{ display: "flex", gap: 4 }}>{[0, 0.2, 0.4].map((d, i) => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#3b82f6", animation: `td 1.4s ${d}s ease-in-out infinite` }} />)}</div>
                  AI analiz yapıyor...
                </div>
              ) : aiText || "Veri bekleniyor..."}
            </div>
          </div>

          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#354a60", textTransform: "uppercase", letterSpacing: "1px", padding: "2px 0 4px" }}>İndikatör Özeti</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, flexShrink: 0 }}>
            {indIds.map(id => {
              const sig = ind[id]?.sig || "BEKLE";
              return (
                <div key={id} style={{ background: "#0b1018", border: "1px solid #1c2a38", borderRadius: 9, padding: 10, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sig === "AL" ? "#10b981" : sig === "SAT" ? "#ef4444" : "#354a60" }} />
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{indNames[id]}</div>
                  <div style={{ fontSize: 10, fontFamily: "monospace", color: "#6b8aaa", marginBottom: 5 }}>{indVals[id] || "—"}</div>
                  <div style={c.badge(sig)}>{sig}</div>
                </div>
              );
            })}
          </div>
          <button style={{ width: "100%", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa", padding: 12, borderRadius: 10, fontFamily: "monospace", fontSize: 12, cursor: "pointer", flexShrink: 0 }} onClick={triggerAI} disabled={aiLoading}>⟳  AI Analizi Güncelle</button>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div style={c.bnav}>
        {[["chart", "📈", "Grafik"], ["ind", "🔬", "İndikatörler"], ["ai", "🎯", "AI Sinyal"]].map(([id, icon, label]) => (
          <button key={id} style={c.nb(tab === id)} onClick={() => setTab(id)}>
            <div style={{ fontSize: 18, lineHeight: 1 }}>{icon}</div>
            <div>{label}</div>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes td { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
