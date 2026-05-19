export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, width, height, openings } = req.body;
  const mediaType = imageMediaType || 'image/jpeg';
  if (!imageBase64) return res.status(400).json({ error: '画像データがありません' });

  // Step1: AIが開口部を認識して写真上の位置（bbox %）を返す
  if (step === 'detect') {
    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真を解析してください。

塗装対象の開口部（窓・ドア）を全て認識して、写真上の位置をパーセントで返してください。
シャッターガレージ・エアコン室外機・配管などは除外してください。

重要：bboxは写真全体に対する位置です。
x=左端%、y=上端%、w=幅%、h=高さ%（0〜100）

JSONのみで返答：
{
  "buildingInfo": {
    "type": "木造2階建て",
    "style": "建物の特徴",
    "note": "現場での注意点（斜め撮影・障害物など）"
  },
  "openings": [
    {
      "id": "op1",
      "type": "引き違い窓",
      "count": 1,
      "bbox": {"x": 20, "y": 35, "w": 15, "h": 12},
      "confidence": "high",
      "note": "2階左の窓"
    },
    {
      "id": "op2", 
      "type": "玄関ドア",
      "count": 1,
      "bbox": {"x": 45, "y": 55, "w": 10, "h": 22},
      "confidence": "high",
      "note": "1階中央"
    }
  ]
}

confidence：high=明確に見える、medium=やや不明確、low=推定`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 2000,
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

  // Step2: 確定した開口部のサイズをAIが計算
  if (step === 'calculate') {
    const w = parseFloat(width);
    const h = parseFloat(height);

    const openingDesc = (openings||[]).map((op, i) => 
      `開口部${i+1}（${op.type}）: 写真上の位置 x=${op.bbox.x.toFixed(1)}% y=${op.bbox.y.toFixed(1)}% 幅=${op.bbox.w.toFixed(1)}% 高さ=${op.bbox.h.toFixed(1)}%`
    ).join('\n');

    const prompt = `あなたは塗装業の見積り専門AIです。

外壁の実測値：
- 横幅：${w}m
- 高さ：${h}m

写真上の各開口部の位置（写真全体に対する%）：
${openingDesc}

この写真を見て、斜め撮影による遠近歪みを考慮しながら各開口部の実寸を計算してください。

考慮すること：
- 写真上の%から実際のサイズへの変換
- 斜め撮影の場合、手前と奥で縮尺が異なる
- 開口部の位置（左右・上下）による縮尺の違い
- 日本の住宅の標準的なサイズ規格との照合
- 極端な値は「要確認」フラグを付ける

JSONのみで返答：
{
  "openings": [
    {
      "id": "op1",
      "type": "引き違い窓",
      "widthM": 1.65,
      "heightM": 1.10,
      "areaM": 1.82,
      "confidence": "high",
      "note": "標準的なサイズ範囲内",
      "warning": null
    }
  ],
  "totalOpeningArea": 5.2,
  "wallArea": 40.0,
  "paintArea": 34.8,
  "note": "計算上の注意点"
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 2000,
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
