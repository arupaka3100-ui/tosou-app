export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { imageBase64, imageMediaType, width, height, openings } = req.body;
  const mediaType = imageMediaType || 'image/jpeg';
  if (!imageBase64) return res.status(400).json({ error: '画像データがありません' });

  const w = parseFloat(width);
  const h = parseFloat(height);

  const openingDesc = (openings || []).map((op, i) => {
    return `開口部${i+1}（${op.type}）: 幅${op.widthPx}px × 高さ${op.heightPx}px`;
  }).join('\n');

  const prompt = `あなたは塗装業の見積り専門AIです。

この写真は台形補正（ホモグラフィー変換）済みの正面補正画像です。
外壁の実測値：横幅${w}m、高さ${h}m

人間が指定した各開口部のピクセルサイズ：
${openingDesc}

補正済み画像なので縮尺は均一です。
実測値とピクセルサイズから各開口部の実寸を計算してください。
異常値には要確認フラグを付けてください。

JSON以外の文字（説明文・コードフェンス・前置き等）は一切出力しないでください。
出力はJSONオブジェクトの { から } までのみです。

{
  "openings": [
    {"id":"op1","type":"引き違い窓","widthM":1.65,"heightM":1.05,"areaM":1.73,"confidence":"high","warning":null,"note":"計算根拠"}
  ],
  "scaleNote": "縮尺の信頼性コメント"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 3000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error && data.error.message || 'APIエラー');
    const rawText = data.content.map(i => i.text||'').join('');
    let result;
    try {
      result = JSON.parse(rawText.replace(/```json|```/g,'').trim());
    } catch(e1) {
      try {
        const cleaned = rawText.replace(/```json|```/g,'').trim();
        const s = cleaned.indexOf('{');
        const eIdx = cleaned.lastIndexOf('}');
        if (s === -1 || eIdx === -1 || eIdx <= s) throw new Error('JSON構造が見つかりません');
        result = JSON.parse(cleaned.slice(s, eIdx + 1));
      } catch(e2) {
        return res.status(500).json({
          error: 'AIの応答をJSONに変換できませんでした',
          rawResponsePreview: rawText.slice(0, 500)
        });
      }
    }

    const serverWallArea = parseFloat((w * h).toFixed(1));
    const openingsOut = (result.openings || []).map((op, i) => {
      const origOp = (openings || [])[i] || {};
      const imgW = origOp.imgW || 1000;
      const imgH = origOp.imgH || 1000;
      const pxW = parseFloat((origOp.widthPx / imgW * w).toFixed(2));
      const pxH = parseFloat((origOp.heightPx / imgH * h).toFixed(2));
      let wM = parseFloat(parseFloat(op.widthM || pxW).toFixed(2));
      let hM = parseFloat(parseFloat(op.heightM || pxH).toFixed(2));
      if (pxW > 0 && Math.abs(wM - pxW) / pxW > 0.3) wM = pxW;
      if (pxH > 0 && Math.abs(hM - pxH) / pxH > 0.3) hM = pxH;
      const aM = parseFloat((wM * hM).toFixed(2));
      return { ...op, widthM: wM, heightM: hM, areaM: aM };
    });

    const totalOpening = parseFloat(openingsOut.reduce((s,o) => s + (o.areaM||0), 0).toFixed(1));
    const paintArea = parseFloat(Math.max(0, serverWallArea - totalOpening).toFixed(1));
    return res.status(200).json({ ...result, openings: openingsOut, wallArea: serverWallArea, totalOpeningArea: totalOpening, paintArea });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
