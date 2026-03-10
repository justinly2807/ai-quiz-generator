import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Quiz CRUD ──
export async function getQuizList() {
  const { data, error } = await supabase
    .from('quizzes')
    .select('code, title, question_count, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getQuizByCode(code) {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function saveQuiz(quizData) {
  const { error } = await supabase.from('quizzes').insert({
    code: quizData.code,
    title: quizData.title,
    questions: quizData.questions,
    question_count: quizData.questions.length,
  });
  if (error) throw error;
}

export async function deleteQuiz(code) {
  const { error } = await supabase.from('quizzes').delete().eq('code', code);
  if (error) throw error;
}

// ── Admin password ──
export async function getAdminPassword() {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'admin_password')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.value || 'admin@123';
}

export async function setAdminPassword(newPass) {
  const { error } = await supabase
    .from('admin_settings')
    .upsert({ key: 'admin_password', value: newPass });
  if (error) throw error;
}
