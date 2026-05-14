export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'APIキーが設定されていません' });
  }

  const { imageBase64, mode, width, heightNear, heightFar, floors } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: '画像データがありません' });
  }

  let promptExtra = '';
  if (mode === 'front') {
    promptExtra = `建物情報：横幅（実測）= ${width}m、階数 = ${floors}階建て。この横幅を基準スケールとして使用してください。`;
  } else {
    promptExtra = `斜め撮影です。手前の壁高さ = ${heightNear}m、奥の壁高さ = ${heightFar}m。この2点を基準に遠近補正して横幅を推定してください。階数 = ${floors}階建て。`;
  }

  const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真を解析して塗装面積を計算してください。

${promptExtra}

以下をJSONのみで返答してください（説明文・マークダウン不要）：
{
  "estimatedWidth": 推定横幅(m、小数1桁),
  "estimatedHeight": 推定高さ(m、小数1桁),
  "totalWallArea": 外壁総面積㎡(小数1桁),
  "openings": [
    {"type": "窓/ドア/掃き出し窓などの種類", "count": 数, "unitArea": 1個あたりの面積㎡}
  ],
  "totalOpeningArea": 開口部合計面積㎡(小数1桁),
  "paintArea": 塗装面積㎡(小数1桁),
  "comment": "解析コメント（日本語2〜3文、精度・注意点を含む）",
  "confidence": "高/中/低"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Anthropic API エラー');

    const text = data.content.map(i => i.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
