export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType } = req.body;
  const mediaType = imageMediaType || 'image/jpeg';

  if (!imageBase64) return res.status(400).json({ error: '画像データがありません' });

  if (step === 'analyze_area') {
    const prompt = `この外壁写真を解析して、開口部（窓・ドア・シャッターなど）の種類と数を認識してください。

以下をJSONのみで返答：
{
  "buildingInfo": {"type": "木造2階建て", "style": "建物の特徴", "note": "注意点"},
  "openings": [
    {"type": "引き違い窓", "count": 2},
    {"type": "玄関ドア", "count": 1}
  ]
}

塗装対象外（シャッターガレージ等）は除外してください。`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const result = JSON.parse(data.content.map(i => i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: '不正なstepです' });
}
