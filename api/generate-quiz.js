export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY chưa được cấu hình trên server' });

  try {
    const { content, count } = req.body;
    if (!content || !count) return res.status(400).json({ error: 'Thiếu content hoặc count' });

    const systemPrompt = `Bạn là hệ thống tạo quiz. CHỈ trả về JSON hợp lệ, KHÔNG markdown, KHÔNG text khác.
Format bắt buộc: {"title":"Tên quiz ngắn gọn","questions":[{"type":"mcq","question":"Câu hỏi?","options":["A. Đáp án 1","B. Đáp án 2","C. Đáp án 3","D. Đáp án 4"],"answer":"A"},{"type":"tf","question":"Mệnh đề?","options":["Đúng","Sai"],"answer":"Đúng"}]}
Tạo MIX: 70% mcq (A-B-C-D), 30% tf (Đúng/Sai). Câu hỏi bằng tiếng Việt. Đảm bảo đúng ${count} câu.`;

    const userMessage = `Tạo đúng ${count} câu hỏi quiz từ nội dung:\n\n${content.data.slice(0, 12000)}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(500).json({ error: 'AI không trả về kết quả. Thử lại.' });
    }

    const quiz = JSON.parse(text.replace(/```json?|```/g, '').trim());
    return res.status(200).json(quiz);
  } catch (e) {
    return res.status(500).json({ error: 'Lỗi tạo quiz: ' + e.message });
  }
}
