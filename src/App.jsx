import { useState, useEffect, useRef, useCallback } from 'react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import {
  getQuizList, getQuizByCode, saveQuiz, deleteQuiz,
  getAdminPassword, setAdminPassword,
} from './lib/supabase';

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ── Theme ──
const C = {
  bg: '#07071A', surface: '#0D0D22', border: 'rgba(255,255,255,0.08)',
  amber: '#F59E0B', amberDim: 'rgba(245,158,11,0.12)',
  text: '#E2E8F0', muted: '#64748B', green: '#10B981', red: '#EF4444',
};
const syne = "'Syne',sans-serif", dm = "'DM Sans',sans-serif";

// ── Helpers ──
function genCode() {
  return Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
  ).join('');
}

async function readFile(file) {
  if (file.name.endsWith('.pdf')) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return { type: 'text', data: text };
  }
  if (file.name.endsWith('.docx')) {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return { type: 'text', data: value };
  }
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = (e) => res({ type: 'text', data: e.target.result });
    r.readAsText(file);
  });
}

async function genQuiz(content, count) {
  const res = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, count }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Server trả về lỗi: ' + text.slice(0, 200)); }
  if (!res.ok) throw new Error(data.error || 'Lỗi không xác định');
  return data;
}

const grade = (p) =>
  p >= 90 ? { l: 'Xuất sắc', c: '#F59E0B' }
  : p >= 70 ? { l: 'Khá', c: '#10B981' }
  : p >= 50 ? { l: 'Trung bình', c: '#60A5FA' }
  : { l: 'Cần cố gắng', c: '#F87171' };

function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

// ── CSS injection for animations ──
const styleId = 'quiz-app-styles';
function injectStyles() {
  if (document.getElementById(styleId)) return;
  const s = document.createElement('style');
  s.id = styleId;
  s.textContent = `
    @keyframes slideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes slideOut { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
    @keyframes ringDraw { from { stroke-dashoffset: 283; } }
    @keyframes confettiFall {
      0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(60px) rotate(360deg); opacity: 0; }
    }
    .q-slide-in { animation: slideIn 0.25s ease-out; }
    .q-slide-out { animation: slideOut 0.25s ease-out; }
    .q-fade-up { animation: fadeUp 0.35s ease-out; }
    .q-scale-in { animation: scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1); }
  `;
  document.head.appendChild(s);
}

// ── UI Primitives ──
const Wrap = ({ children, center }) => (
  <div style={{
    minHeight: '100vh', background: C.bg, color: C.text, fontFamily: dm,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: center ? 'center' : 'flex-start', padding: 16,
  }}>{children}</div>
);

const Card = ({ children, s = {}, className }) => (
  <div className={className} style={{
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 20, padding: 28, ...s,
  }}>{children}</div>
);

const Btn = ({ onClick, children, disabled, ghost, danger, sm, full }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: danger ? 'rgba(239,68,68,0.12)' : ghost ? 'transparent' : C.amber,
    color: danger ? C.red : ghost ? C.muted : '#07071A',
    border: `1px solid ${danger ? 'rgba(239,68,68,0.3)' : ghost ? C.border : 'transparent'}`,
    borderRadius: 10, padding: sm ? '6px 14px' : '12px 24px',
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: sm ? 13 : 14, fontFamily: dm,
    opacity: disabled ? 0.45 : 1, transition: 'all 0.15s',
    whiteSpace: 'nowrap', width: full ? '100%' : undefined,
  }}>{children}</button>
);

const Inp = ({ value, onChange, placeholder, type = 'text', onEnter }) => (
  <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
    placeholder={placeholder} style={{
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '12px 16px', color: C.text,
      fontSize: 15, fontFamily: dm, width: '100%', boxSizing: 'border-box', outline: 'none',
    }} />
);

// ── Progress Ring component ──
const ProgressRing = ({ pct, color, size = 140 }) => {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block', margin: '0 auto 8px' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ animation: 'ringDraw 1.2s ease-out', transition: 'stroke-dashoffset 1s ease-out' }} />
    </svg>
  );
};

// ── Confetti component ──
const Confetti = () => {
  const colors = ['#F59E0B', '#10B981', '#60A5FA', '#F87171', '#A78BFA', '#FBBF24'];
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 40}%`,
          width: 8, height: 8,
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          background: colors[i % colors.length],
          animation: `confettiFall ${1.5 + Math.random() * 2}s ease-out ${Math.random() * 0.8}s forwards`,
          opacity: 0.9,
        }} />
      ))}
    </div>
  );
};

// ── Question Map overlay ──
const QuestionMap = ({ total, answers, current, onSelect, onClose }) => (
  <div onClick={onClose} style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  }}>
    <div onClick={(e) => e.stopPropagation()} className="q-scale-in" style={{
      background: C.surface, borderRadius: 20, padding: 24, maxWidth: 340, width: '100%',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontFamily: syne, fontSize: 16, fontWeight: 700, margin: 0 }}>Tổng quan bài làm</h3>
        <div onClick={onClose} style={{ cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1 }}>&times;</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {Array.from({ length: total }).map((_, i) => {
          const answered = answers[i] !== undefined;
          const isCurrent = i === current;
          return (
            <div key={i} onClick={() => { onSelect(i); onClose(); }}
              style={{
                width: '100%', aspectRatio: '1', borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: isCurrent ? C.amber : answered ? C.amberDim : 'rgba(255,255,255,0.04)',
                color: isCurrent ? '#07071A' : answered ? C.amber : C.muted,
                border: `2px solid ${isCurrent ? C.amber : answered ? 'rgba(245,158,11,0.3)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}>
              {i + 1}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center', fontSize: 12, color: C.muted }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: C.amberDim, marginRight: 4, verticalAlign: 'middle' }} />Đã trả lời</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', marginRight: 4, verticalAlign: 'middle' }} />Chưa trả lời</span>
      </div>
    </div>
  </div>
);

// ── Main App ──
export default function App() {
  const [sc, setSc] = useState('home');
  const [adminOk, setAdminOk] = useState(false);
  const [quizList, setQuizList] = useState([]);
  const [file, setFile] = useState(null);
  const [qCount, setQCount] = useState(10);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [uname, setUname] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [pwInput, setPwInput] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [joining, setJoining] = useState(false);
  const [slideDir, setSlideDir] = useState('in');
  const [showMap, setShowMap] = useState(false);

  // Swipe detection ref
  const touchStartX = useRef(0);
  const quizContentRef = useRef(null);

  // Load fonts + styles
  useEffect(() => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap';
    document.head.appendChild(l);
    injectStyles();
  }, []);

  // Load quiz list when admin logs in
  useEffect(() => {
    if (adminOk) {
      getQuizList().then(setQuizList).catch(() => {});
    }
  }, [adminOk]);

  // Navigate quiz with animation
  const goToQ = useCallback((newIdx) => {
    if (!quiz || newIdx < 0 || newIdx >= quiz.questions.length) return;
    setSlideDir(newIdx > qIdx ? 'in' : 'out');
    setQIdx(newIdx);
    haptic();
  }, [quiz, qIdx]);

  // Swipe handlers
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!quiz) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    const total = quiz.questions.length;
    if (Math.abs(diff) > 60) {
      if (diff > 0 && qIdx < total - 1) goToQ(qIdx + 1);
      else if (diff < 0 && qIdx > 0) goToQ(qIdx - 1);
    }
  }, [quiz, qIdx, goToQ]);

  // ── Admin login ──
  async function handleAdminLogin() {
    setErr('');
    try {
      const pass = await getAdminPassword();
      if (pwInput === pass) {
        setAdminOk(true);
        setSc('admin-dash');
        setPwInput('');
      } else {
        setErr('Mật khẩu không đúng');
      }
    } catch (e) {
      setErr('Lỗi kết nối: ' + e.message);
    }
  }

  // ── Change password ──
  async function handleChangePw() {
    if (!newPw || newPw.length < 4) return setPwMsg('Mật khẩu tối thiểu 4 ký tự');
    try {
      await setAdminPassword(newPw);
      setPwMsg('Đã đổi mật khẩu thành công!');
      setNewPw('');
      setTimeout(() => { setShowChangePw(false); setPwMsg(''); }, 1500);
    } catch (e) {
      setPwMsg('Lỗi: ' + e.message);
    }
  }

  // ── Create quiz ──
  async function handleCreate() {
    if (!file) return setErr('Vui lòng chọn file tài liệu');
    setCreating(true);
    setErr('');
    try {
      const content = await readFile(file);
      const quizData = await genQuiz(content, qCount);
      const quizCode = genCode();
      quizData.code = quizCode;
      await saveQuiz(quizData);
      const list = await getQuizList();
      setQuizList(list);
      setNewCode(quizCode);
      setFile(null);
      setSc('admin-code');
    } catch (e) {
      setErr('Lỗi: ' + e.message);
    }
    setCreating(false);
  }

  // ── Join quiz ──
  async function handleJoin() {
    setErr('');
    if (!code.trim() || !uname.trim()) return setErr('Vui lòng nhập đầy đủ mã và tên');
    setJoining(true);
    try {
      const qd = await getQuizByCode(code.trim().toUpperCase());
      if (!qd) { setJoining(false); return setErr('Mã quiz không tồn tại hoặc đã bị xoá'); }
      setQuiz(qd);
      setQIdx(0);
      setAnswers({});
      setSc('quiz');
    } catch (e) {
      setErr('Lỗi: ' + e.message);
    }
    setJoining(false);
  }

  // ── Submit quiz ──
  function handleSubmit() {
    const correct = quiz.questions.filter((q, i) => answers[i] === q.answer).length;
    setResult({
      correct,
      total: quiz.questions.length,
      pct: Math.round((correct / quiz.questions.length) * 100),
    });
    setSc('result');
  }

  // ── Delete quiz ──
  async function handleDelQuiz(qCode) {
    if (!window.confirm('Bạn có chắc muốn xoá quiz này? Hành động này không thể hoàn tác.')) return;
    try {
      await deleteQuiz(qCode);
      const list = await getQuizList();
      setQuizList(list);
    } catch (e) {
      setErr('Lỗi xoá: ' + e.message);
    }
  }

  function copyCode(c) {
    navigator.clipboard?.writeText(c);
    setCopiedCode(c);
    setTimeout(() => setCopiedCode(''), 2000);
  }

  // ══════════════════════════════════════════
  //  SCREENS
  // ══════════════════════════════════════════

  // ── HOME ──
  if (sc === 'home') return (
    <Wrap center>
      <div style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
        <div style={{ color: C.amber, fontWeight: 600, fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>
          AI QUIZ GENERATOR
        </div>
        <h1 style={{ fontFamily: syne, fontSize: 'clamp(30px, 8vw, 44px)', fontWeight: 800, margin: '0 0 10px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          Tạo Quiz<br />từ Tài Liệu
        </h1>
        <p style={{ color: C.muted, margin: '0 0 32px', lineHeight: 1.6, fontSize: 'clamp(13px, 3.5vw, 15px)' }}>
          Upload tài liệu &middot; AI tạo câu hỏi &middot; Chia sẻ mã &middot; Thi ngay
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn onClick={() => setSc(adminOk ? 'admin-dash' : 'admin-auth')}>Tạo Quiz (Admin)</Btn>
          <Btn ghost onClick={() => setSc('user-join')}>Làm Bài — Nhập Mã Quiz</Btn>
        </div>
      </div>
    </Wrap>
  );

  // ── ADMIN AUTH ──
  if (sc === 'admin-auth') return (
    <Wrap center>
      <Card s={{ maxWidth: 380, width: '100%' }}>
        <div onClick={() => { setSc('home'); setErr(''); }} style={{ color: C.muted, cursor: 'pointer', marginBottom: 24, fontSize: 13 }}>
          &larr; Quay lại
        </div>
        <h2 style={{ fontFamily: syne, fontSize: 22, fontWeight: 700, margin: '0 0 24px' }}>Admin Login</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp value={pwInput} onChange={setPwInput} placeholder="Mật khẩu admin" type="password" onEnter={handleAdminLogin} />
          {err && <p style={{ color: C.red, fontSize: 13, margin: 0 }}>{err}</p>}
          <Btn onClick={handleAdminLogin}>Đăng nhập</Btn>
          <p style={{ color: C.muted, fontSize: 12, margin: 0, textAlign: 'center' }}>
            Mật khẩu mặc định: admin@123
          </p>
        </div>
      </Card>
    </Wrap>
  );

  // ── ADMIN DASHBOARD ──
  if (sc === 'admin-dash') return (
    <Wrap>
      <div style={{ width: '100%', maxWidth: 700, paddingTop: 40 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ color: C.amber, fontWeight: 600, fontSize: 11, letterSpacing: 3, marginBottom: 4 }}>ADMIN</div>
              <h2 style={{ fontFamily: syne, fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 700, margin: 0 }}>Quản lý Quiz</h2>
            </div>
            <Btn ghost sm onClick={() => { setAdminOk(false); setSc('home'); }}>Đăng xuất</Btn>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => { setFile(null); setErr(''); setSc('admin-create'); }} full>+ Tạo Quiz Mới</Btn>
            <Btn ghost sm onClick={() => setShowChangePw(true)}>Đổi mật khẩu</Btn>
          </div>
        </div>

        {/* Change Password */}
        {showChangePw && (
          <Card s={{ marginBottom: 20, padding: 20 }}>
            <h3 style={{ fontFamily: syne, fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Đổi mật khẩu Admin</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Inp value={newPw} onChange={setNewPw} placeholder="Mật khẩu mới" type="password" onEnter={handleChangePw} />
              </div>
              <Btn sm onClick={handleChangePw}>Lưu</Btn>
              <Btn sm ghost onClick={() => { setShowChangePw(false); setPwMsg(''); setNewPw(''); }}>Huỷ</Btn>
            </div>
            {pwMsg && <p style={{ color: pwMsg.includes('thành công') ? C.green : C.red, fontSize: 13, margin: '8px 0 0' }}>{pwMsg}</p>}
          </Card>
        )}

        {/* Quiz List */}
        {quizList.length === 0 ? (
          <Card s={{ textAlign: 'center', padding: 56 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <p style={{ color: C.muted, margin: 0 }}>Chưa có quiz nào. Hãy tạo quiz đầu tiên!</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quizList.map((q) => (
              <Card key={q.code} s={{ padding: '16px 20px' }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>{q.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: C.amberDim, color: C.amber, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, fontFamily: syne, letterSpacing: 1 }}>
                      {q.code}
                    </span>
                    <span style={{ color: C.muted, fontSize: 13 }}>{q.question_count} câu</span>
                    <span style={{ color: C.muted, fontSize: 13 }}>{new Date(q.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn sm ghost onClick={() => copyCode(q.code)}>{copiedCode === q.code ? 'Đã copy!' : 'Copy Mã'}</Btn>
                    <Btn sm danger onClick={() => handleDelQuiz(q.code)}>Xoá</Btn>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Wrap>
  );

  // ── ADMIN CREATE ──
  if (sc === 'admin-create') return (
    <Wrap>
      <div style={{ width: '100%', maxWidth: 540, paddingTop: 40 }}>
        <div onClick={() => setSc('admin-dash')} style={{ color: C.muted, cursor: 'pointer', marginBottom: 24, fontSize: 13 }}>
          &larr; Quay lại Dashboard
        </div>
        <h2 style={{ fontFamily: syne, fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 700, margin: '0 0 6px' }}>Tạo Quiz Mới</h2>
        <p style={{ color: C.muted, margin: '0 0 28px', fontSize: 14 }}>Upload tài liệu để AI tự sinh câu hỏi</p>
        <Card s={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 10, fontSize: 14 }}>Tài liệu</label>
            <div onClick={() => document.getElementById('fi').click()} style={{
              border: `2px dashed ${file ? C.amber : C.border}`, borderRadius: 14,
              padding: 28, textAlign: 'center', cursor: 'pointer',
              background: file ? C.amberDim : 'transparent', transition: 'all 0.2s',
            }}>
              {file ? (
                <>
                  <div style={{ color: C.amber, fontWeight: 600, marginBottom: 4 }}>✓ {file.name}</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>Click để đổi file</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Click để chọn file</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>PDF · DOCX · TXT</div>
                </>
              )}
              <input id="fi" type="file" accept=".pdf,.docx,.txt"
                style={{ display: 'none' }}
                onChange={(e) => { setFile(e.target.files[0] || null); e.target.value = ''; }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 10, fontSize: 14 }}>
              Số câu hỏi: <span style={{ color: C.amber, fontWeight: 700 }}>{qCount} câu</span>
            </label>
            <input type="range" min={5} max={30} value={qCount}
              onChange={(e) => setQCount(+e.target.value)}
              style={{ width: '100%', accentColor: C.amber }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted, fontSize: 12, marginTop: 6 }}>
              <span>5 câu</span><span>30 câu</span>
            </div>
          </div>
          {err && (
            <div style={{ color: C.red, fontSize: 13, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
              {err}
            </div>
          )}
          <Btn onClick={handleCreate} disabled={creating || !file}>
            {creating ? '⏳ AI đang tạo câu hỏi...' : 'Tạo Quiz'}
          </Btn>
        </Card>
      </div>
    </Wrap>
  );

  // ── ADMIN CODE (after creation) ──
  if (sc === 'admin-code') return (
    <Wrap center>
      <Card s={{ maxWidth: 400, width: '100%', textAlign: 'center' }} className="q-scale-in">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontFamily: syne, fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Quiz đã sẵn sàng!</h2>
        <p style={{ color: C.muted, margin: '0 0 24px', fontSize: 14 }}>Chia sẻ mã này cho người tham gia</p>
        <div style={{ background: C.amberDim, border: `2px solid ${C.amber}`, borderRadius: 16, padding: '24px 32px', marginBottom: 20 }}>
          <div style={{ fontFamily: syne, fontSize: 'clamp(36px, 10vw, 52px)', fontWeight: 800, color: C.amber, letterSpacing: 8 }}>{newCode}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn onClick={() => copyCode(newCode)}>{copiedCode === newCode ? '✓ Đã copy!' : 'Copy Mã'}</Btn>
          <Btn ghost onClick={() => setSc('admin-dash')}>Về Dashboard</Btn>
        </div>
      </Card>
    </Wrap>
  );

  // ── USER JOIN ──
  if (sc === 'user-join') return (
    <Wrap center>
      <Card s={{ maxWidth: 400, width: '100%' }}>
        <div onClick={() => { setSc('home'); setErr(''); }} style={{ color: C.muted, cursor: 'pointer', marginBottom: 24, fontSize: 13 }}>
          &larr; Quay lại
        </div>
        <h2 style={{ fontFamily: syne, fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Làm Bài Quiz</h2>
        <p style={{ color: C.muted, margin: '0 0 24px', fontSize: 14 }}>Nhập mã quiz và tên để bắt đầu</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Inp value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="Mã quiz (VD: AB3X7K)" onEnter={handleJoin} />
          <Inp value={uname} onChange={setUname} placeholder="Tên của bạn" onEnter={handleJoin} />
          {err && <p style={{ color: C.red, fontSize: 13, margin: 0 }}>{err}</p>}
          <Btn onClick={handleJoin} disabled={joining}>{joining ? '⏳ Đang tải quiz...' : 'Bắt đầu làm bài'}</Btn>
        </div>
      </Card>
    </Wrap>
  );

  // ── QUIZ TAKING ──
  if (sc === 'quiz' && quiz) {
    const q = quiz.questions[qIdx];
    const total = quiz.questions.length;
    const answered = Object.keys(answers).length;
    const canSubmit = qIdx === total - 1 || answered === total;
    return (
      <>
        {showMap && <QuestionMap total={total} answers={answers} current={qIdx} onSelect={goToQ} onClose={() => setShowMap(false)} />}
        <div style={{
          minHeight: '100vh', background: C.bg, color: C.text, fontFamily: dm,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Fixed header */}
          <div style={{ padding: '16px 16px 0', maxWidth: 620, width: '100%', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {quiz.title}
              </div>
              <div onClick={() => setShowMap(true)} style={{
                color: C.amber, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                padding: '4px 10px', borderRadius: 8, background: C.amberDim,
              }}>
                {qIdx + 1}/{total}
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: C.amber, borderRadius: 4, width: `${((qIdx + 1) / total) * 100}%`, transition: 'width 0.3s' }} />
            </div>
            {/* Question dots */}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              {Array.from({ length: total }).map((_, i) => (
                <div key={i} onClick={() => goToQ(i)} style={{
                  width: i === qIdx ? 18 : 8, height: 8, borderRadius: 4,
                  background: i === qIdx ? C.amber : answers[i] !== undefined ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.1)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }} />
              ))}
            </div>
          </div>

          {/* Scrollable question content */}
          <div ref={quizContentRef}
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
            style={{ flex: 1, overflow: 'auto', padding: '16px 16px 0' }}>
            <div key={qIdx} className={slideDir === 'in' ? 'q-slide-in' : 'q-slide-out'}
              style={{ maxWidth: 620, margin: '0 auto' }}>
              <Card s={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
                  <span style={{ background: C.amberDim, color: C.amber, borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', marginTop: 2, flexShrink: 0 }}>
                    {qIdx + 1}
                  </span>
                  <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.6 }}>{q.question}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {q.options.map((opt, i) => {
                    const val = q.type === 'mcq' ? opt[0] : opt;
                    const sel = answers[qIdx] === val;
                    return (
                      <div key={i} onClick={() => { setAnswers((p) => ({ ...p, [qIdx]: val })); haptic(); }}
                        style={{
                          padding: '12px 14px', borderRadius: 10,
                          border: `1px solid ${sel ? C.amber : C.border}`,
                          background: sel ? C.amberDim : 'transparent',
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          border: `2px solid ${sel ? C.amber : C.muted}`,
                          background: sel ? C.amber : 'transparent', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}>
                          {sel && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#07071A' }} />}
                        </div>
                        <span style={{ fontSize: 14, lineHeight: 1.5 }}>{opt}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>

          {/* Sticky bottom navigation */}
          <div style={{
            padding: '12px 16px', borderTop: `1px solid ${C.border}`,
            background: C.bg, maxWidth: 620, width: '100%', margin: '0 auto',
          }}>
            {canSubmit && (
              <div style={{ marginBottom: 8 }}>
                <Btn onClick={handleSubmit} full>
                  Nộp bài ({answered}/{total})
                </Btn>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <Btn ghost onClick={() => goToQ(qIdx - 1)} disabled={qIdx === 0}>&larr; Trước</Btn>
              <div style={{ color: C.muted, fontSize: 12, display: 'flex', alignItems: 'center' }}>vuốt để chuyển câu</div>
              {qIdx < total - 1 && <Btn ghost onClick={() => goToQ(qIdx + 1)}>Tiếp &rarr;</Btn>}
              {qIdx === total - 1 && !canSubmit && <div />}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── RESULT ──
  if (sc === 'result' && result) {
    const g = grade(result.pct);
    return (
      <Wrap>
        <div style={{ width: '100%', maxWidth: 620, paddingTop: 32 }}>
          <Card s={{ textAlign: 'center', marginBottom: 20, padding: '36px 24px', position: 'relative', overflow: 'hidden' }} className="q-fade-up">
            {result.pct >= 80 && <Confetti />}
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, fontWeight: 500 }}>
              Kết quả của {uname}
            </div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <ProgressRing pct={result.pct} color={g.c} />
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', transform: 'rotate(0deg)',
              }}>
                <div style={{ fontFamily: syne, fontSize: 36, fontWeight: 800, color: C.amber, lineHeight: 1 }}>
                  {result.correct}<span style={{ fontSize: 20, color: C.muted }}>/{result.total}</span>
                </div>
              </div>
            </div>
            <div className="q-scale-in" style={{ fontSize: 22, marginBottom: 6, color: g.c, fontWeight: 600 }}>{result.pct}%</div>
            <div style={{ fontSize: 16, color: g.c, fontWeight: 600, marginBottom: 20 }}>{g.l}</div>
            {/* Action buttons right after score */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Btn onClick={() => { setAnswers({}); setQIdx(0); setSc('quiz'); }}>Làm lại</Btn>
              <Btn ghost onClick={() => setSc('home')}>Trang chủ</Btn>
            </div>
          </Card>

          <h3 style={{ fontFamily: syne, fontSize: 17, fontWeight: 700, margin: '0 0 12px' }}>Chi tiết bài làm</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {quiz.questions.map((q, i) => {
              const ok = answers[i] === q.answer;
              return (
                <Card key={i} s={{ padding: '14px 18px', borderLeft: `3px solid ${ok ? C.green : C.red}` }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: ok ? 0 : 6 }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{ok ? '✅' : '❌'}</span>
                    <div style={{ fontSize: 13, flex: 1, lineHeight: 1.5 }}>{q.question}</div>
                  </div>
                  {!ok && (
                    <div style={{ marginLeft: 26, fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: '#F87171' }}>Bạn chọn: {answers[i] || 'Bỏ qua'}</span>
                      <span style={{ color: C.muted }}> &middot; </span>
                      <span style={{ color: C.green }}>Đúng: {q.answer}</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          {/* Bottom actions repeated for long scroll */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingBottom: 20 }}>
            <Btn onClick={() => { setAnswers({}); setQIdx(0); setSc('quiz'); }}>Làm lại</Btn>
            <Btn ghost onClick={() => setSc('home')}>Trang chủ</Btn>
          </div>
        </div>
      </Wrap>
    );
  }

  return null;
}
