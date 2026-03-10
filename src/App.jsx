import { useState, useEffect } from 'react';
import * as mammoth from 'mammoth';
import {
  getQuizList, getQuizByCode, saveQuiz, deleteQuiz,
  getAdminPassword, setAdminPassword,
} from './lib/supabase';

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
  if (file.name.endsWith('.pdf'))
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = (e) => res({ type: 'pdf', data: e.target.result.split(',')[1] });
      r.readAsDataURL(file);
    });
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Lỗi không xác định');
  return data;
}

const grade = (p) =>
  p >= 90 ? { l: 'Xuất sắc', c: '#F59E0B' }
  : p >= 70 ? { l: 'Khá', c: '#10B981' }
  : p >= 50 ? { l: 'Trung bình', c: '#60A5FA' }
  : { l: 'Cần cố gắng', c: '#F87171' };

// ── UI Primitives ──
const Wrap = ({ children, center }) => (
  <div style={{
    minHeight: '100vh', background: C.bg, color: C.text, fontFamily: dm,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: center ? 'center' : 'flex-start', padding: 16,
  }}>{children}</div>
);

const Card = ({ children, s = {} }) => (
  <div style={{
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 20, padding: 28, ...s,
  }}>{children}</div>
);

const Btn = ({ onClick, children, disabled, ghost, danger, sm }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: danger ? 'rgba(239,68,68,0.12)' : ghost ? 'transparent' : C.amber,
    color: danger ? C.red : ghost ? C.muted : '#07071A',
    border: `1px solid ${danger ? 'rgba(239,68,68,0.3)' : ghost ? C.border : 'transparent'}`,
    borderRadius: 10, padding: sm ? '6px 14px' : '12px 24px',
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: sm ? 13 : 14, fontFamily: dm,
    opacity: disabled ? 0.45 : 1, transition: 'all 0.15s', whiteSpace: 'nowrap',
  }}>{children}</button>
);

const Inp = ({ value, onChange, placeholder, type = 'text' }) => (
  <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder} style={{
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '12px 16px', color: C.text,
      fontSize: 15, fontFamily: dm, width: '100%', boxSizing: 'border-box', outline: 'none',
    }} />
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
  const [copied, setCopied] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  // Load fonts
  useEffect(() => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap';
    document.head.appendChild(l);
  }, []);

  // Load quiz list when admin logs in
  useEffect(() => {
    if (adminOk) {
      getQuizList().then(setQuizList).catch(() => {});
    }
  }, [adminOk]);

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
    try {
      const qd = await getQuizByCode(code.trim().toUpperCase());
      if (!qd) return setErr('Mã quiz không tồn tại hoặc đã bị xoá');
      setQuiz(qd);
      setQIdx(0);
      setAnswers({});
      setSc('quiz');
    } catch (e) {
      setErr('Lỗi: ' + e.message);
    }
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ══════════════════════════════════════════
  //  SCREENS
  // ══════════════════════════════════════════

  // ── HOME ──
  if (sc === 'home') return (
    <Wrap center>
      <div style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>
        <div style={{ color: C.amber, fontWeight: 600, fontSize: 11, letterSpacing: 3, marginBottom: 16 }}>
          AI QUIZ GENERATOR
        </div>
        <h1 style={{ fontFamily: syne, fontSize: 44, fontWeight: 800, margin: '0 0 14px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          Tạo Quiz<br />từ Tài Liệu
        </h1>
        <p style={{ color: C.muted, margin: '0 0 40px', lineHeight: 1.6 }}>
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
          <Inp value={pwInput} onChange={setPwInput} placeholder="Mật khẩu admin" type="password" />
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ color: C.amber, fontWeight: 600, fontSize: 11, letterSpacing: 3, marginBottom: 4 }}>ADMIN</div>
            <h2 style={{ fontFamily: syne, fontSize: 26, fontWeight: 700, margin: 0 }}>Quản lý Quiz</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={() => { setFile(null); setErr(''); setSc('admin-create'); }}>+ Tạo Quiz Mới</Btn>
            <Btn ghost sm onClick={() => setShowChangePw(true)}>Đổi mật khẩu</Btn>
            <Btn ghost sm onClick={() => { setAdminOk(false); setSc('home'); }}>Đăng xuất</Btn>
          </div>
        </div>

        {/* Change Password Modal */}
        {showChangePw && (
          <Card s={{ marginBottom: 20, padding: 20 }}>
            <h3 style={{ fontFamily: syne, fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Đổi mật khẩu Admin</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Inp value={newPw} onChange={setNewPw} placeholder="Mật khẩu mới" type="password" />
              </div>
              <Btn sm onClick={handleChangePw}>Lưu</Btn>
              <Btn sm ghost onClick={() => { setShowChangePw(false); setPwMsg(''); setNewPw(''); }}>Huỷ</Btn>
            </div>
            {pwMsg && <p style={{ color: pwMsg.includes('thành công') ? C.green : C.red, fontSize: 13, margin: '8px 0 0' }}>{pwMsg}</p>}
          </Card>
        )}

        {quizList.length === 0 ? (
          <Card s={{ textAlign: 'center', padding: 56 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <p style={{ color: C.muted, margin: 0 }}>Chưa có quiz nào. Hãy tạo quiz đầu tiên!</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quizList.map((q) => (
              <Card key={q.code} s={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{q.title}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ background: C.amberDim, color: C.amber, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, fontFamily: syne, letterSpacing: 1 }}>
                      {q.code}
                    </span>
                    <span style={{ color: C.muted, fontSize: 13 }}>{q.question_count} câu</span>
                    <span style={{ color: C.muted, fontSize: 13 }}>{new Date(q.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn sm ghost onClick={() => copyCode(q.code)}>{copied ? 'Đã copy!' : 'Copy Mã'}</Btn>
                  <Btn sm danger onClick={() => handleDelQuiz(q.code)}>Xoá</Btn>
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
        <h2 style={{ fontFamily: syne, fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Tạo Quiz Mới</h2>
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
      <Card s={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontFamily: syne, fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Quiz đã sẵn sàng!</h2>
        <p style={{ color: C.muted, margin: '0 0 24px', fontSize: 14 }}>Chia sẻ mã này cho người tham gia</p>
        <div style={{ background: C.amberDim, border: `2px solid ${C.amber}`, borderRadius: 16, padding: '24px 32px', marginBottom: 20 }}>
          <div style={{ fontFamily: syne, fontSize: 52, fontWeight: 800, color: C.amber, letterSpacing: 8 }}>{newCode}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn onClick={() => copyCode(newCode)}>{copied ? '✓ Đã copy!' : 'Copy Mã'}</Btn>
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
          <Inp value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="Mã quiz (VD: AB3X7K)" />
          <Inp value={uname} onChange={setUname} placeholder="Tên của bạn" />
          {err && <p style={{ color: C.red, fontSize: 13, margin: 0 }}>{err}</p>}
          <Btn onClick={handleJoin}>Bắt đầu làm bài</Btn>
        </div>
      </Card>
    </Wrap>
  );

  // ── QUIZ TAKING ──
  if (sc === 'quiz' && quiz) {
    const q = quiz.questions[qIdx];
    const total = quiz.questions.length;
    return (
      <Wrap>
        <div style={{ width: '100%', maxWidth: 620, paddingTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {quiz.title}
            </div>
            <div style={{ color: C.muted, fontSize: 13 }}>Câu {qIdx + 1}/{total}</div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, marginBottom: 28, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: C.amber, borderRadius: 4, width: `${((qIdx + 1) / total) * 100}%`, transition: 'width 0.3s' }} />
          </div>
          <Card s={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20 }}>
              <span style={{ background: C.amberDim, color: C.amber, borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', marginTop: 2, flexShrink: 0 }}>
                {qIdx + 1}
              </span>
              <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.65 }}>{q.question}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((opt, i) => {
                const val = q.type === 'mcq' ? opt[0] : opt;
                const sel = answers[qIdx] === val;
                return (
                  <div key={i} onClick={() => setAnswers((p) => ({ ...p, [qIdx]: val }))}
                    style={{
                      padding: '13px 16px', borderRadius: 10,
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <Btn ghost onClick={() => setQIdx((i) => i - 1)} disabled={qIdx === 0}>&larr; Trước</Btn>
            <div style={{ display: 'flex', gap: 8 }}>
              {qIdx < total - 1 && <Btn ghost onClick={() => setQIdx((i) => i + 1)}>Tiếp &rarr;</Btn>}
              {qIdx === total - 1 && (
                <Btn onClick={handleSubmit}>
                  Nộp bài ({Object.keys(answers).length}/{total})
                </Btn>
              )}
            </div>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── RESULT ──
  if (sc === 'result' && result) {
    const g = grade(result.pct);
    return (
      <Wrap>
        <div style={{ width: '100%', maxWidth: 620, paddingTop: 40 }}>
          <Card s={{ textAlign: 'center', marginBottom: 24, padding: '44px 32px' }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, fontWeight: 500 }}>
              Kết quả của {uname}
            </div>
            <div style={{ fontFamily: syne, fontSize: 76, fontWeight: 800, color: C.amber, lineHeight: 1, marginBottom: 6 }}>
              {result.correct}<span style={{ fontSize: 38, color: C.muted }}>/{result.total}</span>
            </div>
            <div style={{ fontSize: 22, marginBottom: 10, color: g.c, fontWeight: 600 }}>{result.pct}%</div>
            <div style={{ fontSize: 18, color: g.c, fontWeight: 600 }}>{g.l}</div>
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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn ghost onClick={() => { setAnswers({}); setQIdx(0); setSc('quiz'); }}>Làm lại</Btn>
            <Btn ghost onClick={() => setSc('home')}>Trang chủ</Btn>
          </div>
        </div>
      </Wrap>
    );
  }

  return null;
}
