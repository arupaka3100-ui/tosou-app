export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, image2Base64, image2MediaType,
          width, height, outlinePx, openings } = req.body;
  const mediaType = imageMediaType || 'image/jpeg';
  const mediaType2 = image2MediaType || 'image/jpeg';
  if (!imageBase64) return res.status(400).json({ error: '画像データがありません' });

  // 写真解析（A4縮尺計算＋開口部認識）
  if (step === 'analyze') {
    const has2 = !!image2Base64;
    const prompt = `あなたは塗装業の見積り専門AIです。
${has2 ? '2枚の外壁写真（角度違い）を解析してください。' : 'この外壁写真を解析してください。'}

写真にはA4用紙（210mm×297mm）が壁に貼られています。

以下を解析してください：
1. A4用紙を見つけてピクセルサイズを計測
2. A4用紙から縮尺を計算（mm/px）
3. 開口部（窓・ドア）の種類と数を認識
${has2 ? '4. 2枚の写真を比較してより正確な開口部情報を返す' : ''}

JSONのみで返答：
{
  "a4Found": true,
  "a4WidthPx": 120,
  "a4HeightPx": 170,
  "scaleWmm": 1.75,
  "scaleHmm": 1.75,
  "a4Note": "A4紙の位置・状態",
  "buildingInfo": {"type": "木造2階建て", "style": "特徴", "note": "注意点"},
  "openings": [
    {"id": "op1", "type": "引き違い窓", "count": 1, "note": "位置の説明"},
    {"id": "op2", "type": "玄関ドア", "count": 1, "note": "位置の説明"}
  ]
}`;

    const imgContent = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }
    ];
    if (has2) {
      imgContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType2, data: image2Base64 } });
    }
    imgContent.push({ type: 'text', text: prompt });

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000,
          messages: [{ role: 'user', content: imgContent }] })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error && data.error.message || 'APIエラー');
      let result;
      try {
        result = JSON.parse(data.content.map(i => i.text||'').join('').replace(/```json|```/g,'').trim());
      } catch(e) {
        return res.status(500).json({ error: 'AIの応答をJSONに変換できませんでした' });
      }
      return res.status(200).json(result);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 面積計算
  if (step === 'calculate') {
    const w = parseFloat(width);
    const h = parseFloat(height);
    const outlineWpx = (outlinePx && outlinePx.w) || 1;
    const leftHpx = (outlinePx && outlinePx.leftH) || (outlinePx && outlinePx.h) || 1;
    const rightHpx = (outlinePx && outlinePx.rightH) || (outlinePx && outlinePx.h) || 1;
    const a4ScaleW = (outlinePx && outlinePx.a4ScaleW) || null;
    const a4ScaleH = (outlinePx && outlinePx.a4ScaleH) || null;
    const scaleLeft = h / leftHpx;
    const scaleRight = h / rightHpx;
    const scaleW = w / outlineWpx;

    const openingDesc = (openings || []).map((op, i) => {
      const xRatio = (op.xRatio != null ? op.xRatio : 0.5);
      const scaleH = scaleLeft + (scaleRight - scaleLeft) * xRatio;
      const wM = parseFloat((op.widthPx * scaleW).toFixed(3));
      const hM = parseFloat((op.heightPx * scaleH).toFixed(3));
      let a4info = '';
      if (a4ScaleW && op.a4WidthPx) {
        const a4wM = parseFloat((op.a4WidthPx * a4ScaleW / 1000).toFixed(3));
        const a4hM = parseFloat((op.a4HeightPx * a4ScaleH / 1000).toFixed(3));
        a4info = ` A4基準=${a4wM}m×${a4hM}m`;
      }
      return `開口部${i+1}（${op.type}）: 外枠基準=${wM}m×${hM}m${a4info} X位置=${(xRatio*100).toFixed(0)}%`;
    }).join('\n');

    const prompt = `あなたは塗装業の見積り専門AIです。

外壁実測値：横幅${w}m、高さ${h}m
縦縮尺：左端${scaleLeft.toFixed(4)}m/px、右端${scaleRight.toFixed(4)}m/px
${a4ScaleW ? `A4縮尺：幅${a4ScaleW}mm/px 高${a4ScaleH}mm/px（A4基準は高精度）` : 'A4縮尺：なし（外枠基準のみ）'}

各開口部の計算値：
${openingDesc}

写真を見て各開口部の最終的な実寸を判断してください。
A4縮尺がある場合はA4基準を優先してください（より正確）。
異常値には要確認フラグを付けてください。

JSONのみで返答：
{
  "openings": [
    {"id":"op1","type":"引き違い窓","widthM":1.65,"heightM":1.05,"areaM":1.73,"confidence":"high","warning":null,"note":"A4基準採用"}
  ],
  "scaleNote": "縮尺の信頼性コメント"
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}] })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error && data.error.message || 'APIエラー');
      let result;
      try {
        result = JSON.parse(data.content.map(i => i.text||'').join('').replace(/```json|```/g,'').trim());
      } catch(e) {
        return res.status(500).json({ error: 'AIの応答をJSONに変換できませんでした' });
      }

      const serverWallArea = parseFloat((w * h).toFixed(1));
      const openingsOut = (result.openings || []).map((op, i) => {
        const origOp = (openings || [])[i] || {};
        const xRatio = (origOp.xRatio != null ? origOp.xRatio : 0.5);
        const scaleH = scaleLeft + (scaleRight - scaleLeft) * xRatio;
        const pxW = parseFloat((origOp.widthPx * scaleW).toFixed(2));
        const pxH = parseFloat((origOp.heightPx * scaleH).toFixed(2));
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

  return res.status(400).json({ error: '不正なstepです' });
}
