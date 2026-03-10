-- ══════════════════════════════════════════════════════
--  Chạy SQL này trong Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════

-- 1. Bảng quizzes
CREATE TABLE quizzes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(6) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  questions JSONB NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng admin_settings (lưu mật khẩu admin)
CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 3. Insert mật khẩu mặc định
INSERT INTO admin_settings (key, value) VALUES ('admin_password', 'admin@123');

-- 4. Tắt RLS (Row Level Security) cho đơn giản - app nội bộ
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- 5. Policy cho phép mọi thao tác (dùng anon key)
CREATE POLICY "Allow all on quizzes" ON quizzes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on admin_settings" ON admin_settings FOR ALL USING (true) WITH CHECK (true);
