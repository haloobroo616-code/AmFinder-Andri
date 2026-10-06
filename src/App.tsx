/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Search, Clipboard, ShieldAlert, X, ExternalLink, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface PresetLink {
  url: string;
  am: boolean;
  title: string | null;
  thumb: string | null;
  type: string | null;
  size: string | null;
  ratio: string | null;
  author: string | null;
}

console.log('App rendering');

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState('');
  const [showPopup, setShowPopup] = useState(true);
  const outRef = useRef<HTMLDivElement>(null);

  // Disable scrolling when popup is open
  useEffect(() => {
    if (showPopup) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [showPopup]);

  console.log('App state:', { loading, hasData: !!data, error });

  const steps = [
    'Membuka video TikTok...',
    'Membaca deskripsi dan bio...',
    'Memindai komentar satu per satu...',
    'Mengambil link preset...',
  ];

  const nk = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isHttp = (s: any) => typeof s === 'string' && /^https?:\/\//i.test(s);

  function findValue(root: any, names: string[], skip: any = null, pred?: (v: any) => boolean): any {
    for (const n of names) {
      const q = [root];
      while (q.length) {
        const o = q.shift();
        if (!o || typeof o !== 'object' || o === skip) continue;
        for (const [k, v] of Object.entries(o)) {
          if (nk(k) === n && v != null && v !== '' && typeof v !== 'object' && (!pred || pred(v))) return v;
        }
        for (const v of Object.values(o)) if (v && typeof v === 'object') q.push(v);
      }
    }
    return null;
  }

  function findLinks(root: any): any[] {
    const cand: [string, any[]][] = [];
    const q: [string, any][] = [['', root]];
    while (q.length) {
      const [k, o] = q.shift()!;
      if (Array.isArray(o) && o.length && o.every(x => isHttp(x) || (x && typeof x === 'object' && Object.values(x).some(isHttp)))) {
        cand.push([k, o]);
      }
      if (o && typeof o === 'object') {
        for (const [kk, v] of Object.entries(o)) q.push([kk, v]);
      }
    }
    const found = cand.find(([k]) => /preset|link|result|item/i.test(k)) || cand[0];
    return found ? found[1] : [];
  }

  function num(n: any) {
    const val = Number(n);
    if (isNaN(val)) return String(n);
    if (val >= 1e6) return (val / 1e6).toFixed(1).replace(/\.0$/, '') + ' M';
    if (val >= 1e3) return (val / 1e3).toFixed(1).replace(/\.0$/, '') + ' K';
    return String(val);
  }

  function bytes(n: any) {
    if (typeof n === 'number' || /^\d+$/.test(String(n))) {
      const val = Number(n);
      if (val >= 1048576) return (val / 1048576).toFixed(1) + ' MB';
      if (val >= 1024) return (val / 1024).toFixed(1) + ' KB';
      return val + ' B';
    }
    return String(n);
  }

  const SKIP_REGEX = /whatsapp\.com|wa\.me|t\.me|telegram|tiktok\.com|instagram\.com|youtube\.com|youtu\.be|facebook\.com|fb\.com|twitter\.com|\/\/x\.com|linktr\.ee|saweria|trakteer/i;
  const KEEP_REGEX = /alightcreative\.com\/am\/share|drive\.google\.com\/(file|open|uc)|mediafire\.com|mega\.nz/i;

  function scanText(root: any) {
    const found = new Map<string, string | null>();
    const walk = (o: any) => {
      if (typeof o === 'string') {
        for (const m of o.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
          const u = m[0].replace(/[.,;:!?]+$/, '');
          const before = o.slice(Math.max(0, m.index! - 30), m.index);
          const lb = before.match(/(\d+(?:[.,]\d+)?\s?(?:MB|KB|GB)|XML|ZIP)\s*[:\-]?\s*$/i);
          const label = lb ? lb[1].replace(/\s/g, '').toUpperCase() : null;
          if (!found.has(u) || (label && !found.get(u))) found.set(u, label);
        }
      } else if (o && typeof o === 'object') {
        Object.values(o).forEach(walk);
      }
    };
    walk(root);
    return found;
  }

  function normalize(x: any): PresetLink {
    const o = typeof x === 'string' ? { url: x } : x;
    const urlVal = findValue(o, ['url', 'link', 'href', 'shareurl', 'downloadurl'], null, isHttp) || Object.values(o).find(isHttp);
    const type = findValue(o, ['type', 'format', 'kind', 'ext', 'category'], null, (v: any) => !isHttp(v));
    const size = findValue(o, ['size', 'filesize', 'sizetext', 'bytes']);
    const author = findValue(o, ['author', 'username', 'uniqueid', 'user', 'owner', 'uploader', 'by', 'detail'], null, (v: any) => !isHttp(v));
    return {
      url: urlVal,
      am: /alightcreative\.com/i.test(urlVal),
      title: findValue(o, ['title', 'name', 'label'], null, (v: any) => !isHttp(v)),
      thumb: findValue(o, ['thumb', 'thumbnail', 'cover', 'image', 'preview', 'icon', 'poster'], null, isHttp),
      type: type ? String(type).toUpperCase() : null,
      size: size != null ? bytes(size) : null,
      ratio: findValue(o, ['ratio', 'aspect', 'aspectratio']),
      author: author ? (String(author).startsWith('@') ? author : '@' + author) : null,
    };
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);
    setStep(steps[0]);

    let stepIdx = 0;
    const stepInterval = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setStep(steps[stepIdx]);
    }, 5000);

    try {
      const res = await fetch(`/api/find?url=${encodeURIComponent(url.trim())}`, {
        headers: {
          'x-app-request': 'am-preset-finder-secure'
        }
      });
      const json = await res.json();
      setData(json);
      if (json.status === false || json.ok === false) {
        setError(json.message || json.error || 'Preset tidak ditemukan. Coba link video lain.');
      }
    } catch (err: any) {
      setError('Gagal menghubungi server: ' + err.message);
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, e: any) => {
    const btn = e.currentTarget;
    const originalText = btn.textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Tersalin!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1500);
    });
  };

  const getProcessedLinks = () => {
    if (!data) return [];
    const arr = Array.isArray(data.presetLinks) ? data.presetLinks : findLinks(data);
    const texts = scanText(data);
    let links = arr.map(normalize).filter((l: any) => l.url);
    const have = new Set(links.map((l: any) => l.url));

    for (const u of texts.keys()) {
      if (KEEP_REGEX.test(u) && !have.has(u)) {
        links.push(normalize(u));
        have.add(u);
      }
    }

    const dup = new Set();
    links = links.filter((l: any) => !SKIP_REGEX.test(l.url) && !dup.has(l.url) && dup.add(l.url));
    links.forEach((l: any) => {
      l.type = l.type || texts.get(l.url) || (/drive\.google\.com/i.test(l.url) ? 'XML' : null);
    });

    return links;
  };

  const links = getProcessedLinks();
  const V = data?.video || {};
  const VS = V.stats || {};
  const videoSrc = V.playUrlNoWm || V.playUrl || findValue(data, ['playaddr', 'play', 'videourl', 'video', 'nowm', 'downloadaddr', 'wmplay'], links, (v: any) => isHttp(v) && !/\.(jpe?g|png|webp)(\?|$)/i.test(v));
  const coverSrc = V.cover || findValue(data, ['origincover', 'cover', 'dynamiccover', 'thumbnail', 'thumb'], links, isHttp);
  const caption = V.description || findValue(data, ['desc', 'description', 'caption', 'text', 'title'], links, (v: any) => !isHttp(v));
  const authorAcct = data?.author || findValue(data, ['uniqueid', 'username', 'authorname', 'author', 'nickname', 'user'], links, (v: any) => !isHttp(v));

  const stats = [
    { label: 'Account', value: authorAcct && (String(authorAcct).startsWith('@') ? authorAcct : '@' + authorAcct) },
    { label: 'Comments', value: VS.comments ?? findValue(data, ['commentcount', 'comments', 'commentscount'], links, (v: any) => !isNaN(v)) },
    { label: 'Views', value: VS.views ?? findValue(data, ['playcount', 'views', 'viewcount', 'plays'], links, (v: any) => !isNaN(v)) },
    { label: 'Likes', value: VS.likes ?? findValue(data, ['diggcount', 'likes', 'likecount', 'digg'], links, (v: any) => !isNaN(v)) },
  ].filter(s => s.value != null);

  return (
    <main className="max-w-[520px] mx-auto p-[24px_16px_60px]">
      {/* Disclaimer Popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative w-full max-w-[360px] bg-white text-black rounded-lg shadow-2xl overflow-hidden animate-up">
            <button 
              onClick={() => setShowPopup(false)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X size={20} className="text-black" />
            </button>

            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 bg-yellow-400 border-2 border-black flex items-center justify-center rounded-sm shrink-0">
                  <ShieldAlert size={24} className="text-black" />
                </div>
                <div>
                  <div className="bg-black text-white text-[9px] font-bold px-2 py-0.5 inline-block tracking-widest uppercase mb-1">
                    Pemberitahuan Resmi
                  </div>
                  <h2 className="text-xl font-black tracking-tight uppercase leading-none">
                    Disclaimer Layanan
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-xs md:text-sm leading-relaxed text-gray-700">
                <p>
                  Platform ini disediakan secara <span className="font-bold">100% GRATIS</span> untuk komunitas tanpa pungutan biaya apa pun.
                </p>
                <p>
                  Pengembang <span className="font-bold">tidak pernah memperjualbelikan</span> akses layanan ataupun fitur yang ada di situs ini.
                </p>

                <div className="border-2 border-black p-4 bg-gray-50 rounded-sm italic">
                  <div className="font-bold not-italic mb-1 uppercase text-[10px]">PERINGATAN TINDAKAN ILEGAL:</div>
                  Jika Anda menemukan pihak atau oknum yang menjual atau mengomersialkan akses website ini, mohon segera laporkan melalui saluran komunikasi resmi di bawah ini.
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <a 
                  href="https://t.me/AndriZxcll" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-[#a3e635] border-2 border-black py-2.5 px-4 font-black uppercase tracking-tighter text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all text-sm"
                >
                  <ExternalLink size={16} />
                  Lapor Ke Developer
                </a>
                <button 
                  onClick={() => setShowPopup(false)}
                  className="w-full flex items-center justify-center gap-2 bg-black py-2.5 px-4 font-black uppercase tracking-tighter text-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(250,204,21,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all text-sm"
                >
                  <Check size={16} />
                  Saya Mengerti
                </button>
              </div>

              <div className="mt-5 text-center">
                <span className="text-[9px] font-bold text-gray-400 tracking-[0.2em] uppercase">
                  Power By Andri Ganteng
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border-2 border-[var(--acc)] p-1 mb-4 shadow-[0_0_20px_rgba(0,255,170,0.2)] overflow-hidden">
          <img 
            src="https://files.catbox.moe/39k6zw.jpg" 
            alt="AM Preset Finder Logo" 
            className="w-full h-full object-cover rounded-xl"
          />
        </div>
        <h1 className="text-xl font-bold mb-1">AM Preset Finder</h1>
        <p className="text-[var(--mut)] text-[13px] mb-1">Temukan preset Alight motion dengan gampang</p>
        <div className="text-[var(--acc)] text-[11px] font-semibold">· By Andri ·</div>
      </header>

      {/* Main Action */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-[2px] bg-[var(--acc)]"></div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">Cari Link Preset</h2>
        </div>
        <p className="text-[var(--mut)] text-[13px] mb-6 leading-relaxed">
          Tempel link video TikTok. Deskripsi, bio akun, link bio, komentar dan balasan akan dibuka satu per satu, lalu dipindai untuk mencari link preset Alight Motion.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="url"
              placeholder="https://vt.tiktok.com/xxx"
              className="w-full pl-11 pr-11 py-3 bg-[#121417] border border-gray-800 rounded-xl text-[13px] focus:outline-none focus:border-[var(--acc)] transition-colors"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              <Clipboard size={16} />
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 bg-[var(--acc)] text-black text-sm font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? '...' : 'Cari'}
          </button>
        </form>
      </section>

      {/* Step by Step */}
      <section className="bg-[#121417] border border-gray-800 rounded-2xl p-5 mb-10">
        <h3 className="text-[var(--acc)] text-[9px] font-black uppercase tracking-[0.2em] mb-5">Langkah demi Langkah</h3>
        <div className="space-y-5">
          {[
            'Tempel link video TikTok',
            'AM Preset Finder memindai video, bio, dan komentar',
            'Link preset akan diambil secara otomatis',
            'Salin preset yang Anda butuhkan'
          ].map((text, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-7 h-7 rounded-full border-2 border-[var(--acc)] flex items-center justify-center text-[var(--acc)] text-[11px] font-bold shrink-0">
                {i + 1}
              </div>
              <p className="text-[var(--mut)] text-[13px]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Output / Results */}
      <div ref={outRef} className="mb-10">
        {loading && (
          <div className="text-center py-10">
            <div className="sk w-10 h-10 mx-auto rounded-full mb-4"></div>
            <p className="text-[var(--mut)] text-xs animate-pulse">{step}</p>
          </div>
        )}
        
        {error && (
          <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-500 text-sm">
            {error}
          </div>
        )}

        {data && !error && (
          <div className="animate-up">
            {videoSrc ? (
              <video
                controls
                playsInline
                preload="metadata"
                poster={coverSrc}
                src={videoSrc}
                className="w-full rounded-2xl bg-black aspect-video object-contain border border-gray-800 mb-6"
              />
            ) : coverSrc && (
              <img src={coverSrc} alt="" className="w-full rounded-2xl bg-black aspect-video object-contain border border-gray-800 mb-6" />
            )}

            <div className="grid grid-cols-2 gap-3 mb-6">
              {stats.map((s, i) => (
                <div key={i} className="bg-[#121417] border border-gray-800 p-3.5 rounded-xl">
                  <div className="text-[9px] text-[var(--mut)] uppercase tracking-widest mb-1">{s.label}</div>
                  <div className="text-base font-bold">{s.label === 'Account' ? s.value : num(s.value)}</div>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
              Preset yang Ditemukan
              <span className="text-[var(--acc)] text-xs px-2 py-0.5 bg-[var(--acc)]/10 rounded-lg">{links.length}</span>
            </h3>

            <div className="space-y-3">
              {links.map((l: PresetLink, i: number) => (
                <div key={i} className="bg-[#121417] border border-gray-800 rounded-2xl p-4 hover:border-[var(--acc)] transition-colors group">
                  <div className="flex gap-4 mb-4">
                    <div className="w-16 h-16 bg-gray-900 rounded-lg overflow-hidden shrink-0">
                      {l.thumb ? (
                        <img src={l.thumb} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--acc)] font-bold text-[10px]">
                          {l.ratio || 'AM'}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm mb-1 truncate">{l.title || 'Preset Alight Motion'}</h4>
                      <div className="flex gap-2">
                        {l.type && <span className="text-[9px] font-bold text-[var(--acc)] bg-[var(--acc)]/10 px-2 py-0.5 rounded uppercase">{l.type}</span>}
                        {l.size && <span className="text-[9px] font-bold text-[var(--mut)] bg-gray-800 px-2 py-0.5 rounded uppercase">{l.size}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a href={l.url} target="_blank" className="flex-1 bg-[var(--acc)] text-black text-xs font-bold py-2.5 rounded-lg text-center">Buka</a>
                    <button onClick={(e) => copyToClipboard(l.url, e)} className="flex-1 bg-gray-800 text-white text-xs font-bold py-2.5 rounded-lg">Salin</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New Footer based on screenshot */}
      <footer className="border-t border-gray-800 pt-10">
        <div className="flex flex-col md:flex-row gap-10 mb-10">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg border border-gray-800 p-0.5 overflow-hidden">
                <img 
                  src="https://files.catbox.moe/39k6zw.jpg" 
                  alt="Logo" 
                  className="w-full h-full object-cover rounded-md"
                />
              </div>
              <span className="text-xl font-bold">AM Preset Finder</span>
            </div>
            <p className="text-[var(--mut)] text-[13px] leading-relaxed mb-6">
              Tempel link TikTok dan dapatkan link preset Alight Motion yang tersembunyi di deskripsi, bio, komentar, dan balasan. Tanpa akun, tanpa iklan, tanpa pelacakan.
            </p>
            <div className="flex items-center gap-2 text-[var(--mut)] text-[13px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.036 2.612.13 3.847.551V5.07c-1.026-.304-2.104-.334-3.145-.087-1.538.366-2.723 1.535-3.089 3.073-.247 1.04-.217 2.118.087 3.145H12.5l-.64 4.5h-4.5v12h-4.5V15.73l-.64-4.5h2.895c-.304-1.026-.334-2.104-.087-3.145.366-1.538 1.535-2.723 3.073-3.089 1.04-.247 2.118-.217 3.145.087V.57c-1.235-.42-2.537-.587-3.847-.551Z"/></svg>
              @andrizxcll
            </div>
          </div>
          <div className="flex gap-16">
            <div>
              <h4 className="text-[var(--acc)] text-[10px] font-black uppercase tracking-widest mb-4">Jelajahi</h4>
              <ul className="space-y-3 text-[var(--mut)] text-[13px]">
                <li><button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>Kotak pencarian</button></li>
                <li><button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>Kembali ke atas</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[var(--acc)] text-[10px] font-black uppercase tracking-widest mb-4">Tentang</h4>
              <ul className="space-y-3 text-[var(--mut)] text-[13px]">
                <li>Gratis digunakan</li>
                <li>Tanpa daftar</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-900 py-6 flex flex-col md:flex-row justify-between gap-4">
          <div className="text-[var(--mut)] text-[10px]">
            © 2026 Andri. Semua hak dilindungi. 
            <span className="block mt-1 font-bold text-[var(--ink)] opacity-50 uppercase tracking-widest">Power By Andri Ganteng</span>
          </div>
          <div className="text-[var(--mut)] text-[10px]">
            Tidak berafiliasi dengan TikTok atau Alight Motion.
          </div>
        </div>
      </footer>
    </main>
  );
}
