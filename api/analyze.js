export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, width, height, outlinePx, openings } = req.body;
  const mediaType = imageMediaType || 'image/jpeg';
  if (!imageBase64) return res.status(400).json({ error: '画像データがありません' });

  if (step === 'calculate') {
    const w = parseFloat(width);
    const h = parseFloat(height);

    // 外枠の左端・右端それぞれの縮尺を計算（遠近補正）
    const outlineWpx = (outlinePx && outlinePx.w) || 1;
    const leftHpx = (outlinePx && outlinePx.leftH) || (outlinePx && outlinePx.h) || 1;
    const rightHpx = (outlinePx && outlinePx.rightH) || (outlinePx && outlinePx.h) || 1;

    // 左端・右端の縮尺（m/px）
    const scaleLeft = h / leftHpx;
    const scaleRight = h / rightHpx;
    const scaleW = w / outlineWpx;

    // 各開口部のpxを実寸に変換（X位置で縮尺を補間）
    const openingDesc = (openings || []).map((op, i) => {
      const xRatio = (op.xRatio != null ? op.xRatio : 0.5);
      // X位置に応じて左右の縮尺を線形補間
      const scaleH = scaleLeft + (scaleRight - scaleLeft) * xRatio;
      const wM = parseFloat((op.widthPx * scaleW).toFixed(3));
      const hM = parseFloat((op.heightPx * scaleH).toFixed(3));
      return `開口部${i+1}（${op.type}）: 幅${wM}m × 高さ${hM}m（X位置${(xRatio*100).toFixed(0)}%、縮尺h=${scaleH.toFixed(4)}m/px）`;
    }).join('\n');

    const prompt = `あなたは塗装業の見積り専門AIです。

外壁の実測値：
- 横幅：${w}m
- 高さ：${h}m

外枠のピクセルサイズ：幅${outlineWpx}px
縮尺（横）：${scaleW.toFixed(4)}m/px、縮尺（左端縦）：${scaleLeft.toFixed(4)}m/px、縮尺（右端縦）：${scaleRight.toFixed(4)}m/px

人間が指定した各開口部のpx換算値：
${openingDesc}

この写真を見て以下を判断してください：
1. 各開口部のpx換算値が写真上の実際のサイズと整合しているか
2. 斜め撮影による歪みがある場合、補正が必要か
3. 極端に不自然な値には「要確認」フラグを付ける
4. 最終的な開口部の実寸を判断して返す

JSONのみで返答：
{
  "openings": [
    {
      "id": "op1",
      "type": "引き違い窓",
      "widthM": 1.65,
      "heightM": 1.05,
      "areaM": 1.73,
      "confidence": "high",
      "note": "px換算値と整合。妥当なサイズ。",
      "warning": null
    }
  ],
  "wallArea": 40.0,
  "totalOpeningArea": 5.2,
  "paintArea": 34.8,
  "scaleNote": "縮尺の信頼性についてのコメント"
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
      if (!response.ok) throw new Error(data.error && data.error.message || 'APIエラー');
      let result;
      try {
        result = JSON.parse(data.content.map(i => i.text||'').join('').replace(/```json|```/g,'').trim());
      } catch(parseErr) {
        return res.status(500).json({ error: 'AIの応答をJSONに変換できませんでした: ' + parseErr.message });
      }
      
      // wallAreaをサーバー側で計算（AIの返す値に依存しない）
      const w2 = parseFloat(width);
      const h2 = parseFloat(height);
      const serverWallArea = parseFloat((w2 * h2).toFixed(1));
      
      // 開口部の合計面積もサーバーで計算
      const       openingsOut = (result.openings || []).map((op, i) => {
        const origOp = (openings || [])[i] || {};
        const xRatio = (origOp.xRatio != null ? origOp.xRatio : 0.5);
        const scaleH = scaleLeft + (scaleRight - scaleLeft) * xRatio;
        // px換算値を計算
        const pxW = parseFloat((origOp.widthPx * scaleW).toFixed(2));
        const pxH = parseFloat((origOp.heightPx * scaleH).toFixed(2));
        // AIの値とpx換算値を比較し、30%以上乖離ならpx換算値を採用
        let wM = parseFloat(parseFloat(op.widthM || pxW).toFixed(2));
        let hM = parseFloat(parseFloat(op.heightM || pxH).toFixed(2));
        if (pxW > 0 && Math.abs(wM - pxW) / pxW > 0.3) wM = pxW;
        if (pxH > 0 && Math.abs(hM - pxH) / pxH > 0.3) hM = pxH;
        const aM = parseFloat((wM * hM).toFixed(2));
        return { ...op, widthM: wM, heightM: hM, areaM: aM };
      });
      const totalOpening = parseFloat(openingsOut.reduce((s,o) => s + (o.areaM||0), 0).toFixed(1));
      const paintArea = parseFloat(Math.max(0, serverWallArea - totalOpening).toFixed(1));
      
      return res.status(200).json({
        ...result,
        openings: openingsOut,
        wallArea: serverWallArea,
        totalOpeningArea: totalOpening,
        paintArea: paintArea
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: '不正なstepです' });
}
