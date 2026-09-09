function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function saveAsImage(title, text) {
  const W = 960, pad = 64, lineH = 32;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '21px Georgia, "Times New Roman", serif';
  const lines = wrapLines(measure, text, W - pad * 2);
  const H = pad * 2 + 90 + lines.length * lineH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createRadialGradient(W / 2, H * 0.3, 50, W / 2, H / 2, H);
  bg.addColorStop(0, '#2a0f1f');
  bg.addColorStop(1, '#12080f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(217,178,111,.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.fillStyle = '#d9b26f';
  ctx.font = '34px Georgia, "Times New Roman", serif';
  ctx.fillText(title, pad, pad + 20);
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillStyle = '#b8a892';
  ctx.fillText('Madame Claude', pad, pad + 48);

  ctx.fillStyle = '#f3e9dc';
  ctx.font = '21px Georgia, "Times New Roman", serif';
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + 90 + i * lineH));

  const a = document.createElement('a');
  a.download = 'madame-claude-reading.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

export function initReading({ panel, titleEl, noteEl, textEl, copyBtn, shareBtn, saveBtn, feedbackEl }) {
  let shareUrl = '';
  let title = 'Your reading';
  let feedbackTimer;

  const getText = () => textEl.textContent;
  const feedback = (msg) => {
    feedbackEl.textContent = msg;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { feedbackEl.textContent = ''; }, 4000);
  };

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      feedback('Reading copied.');
    } catch {
      feedback('Could not copy automatically — select the text instead.');
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      feedback('Link copied. It carries only the cards — never your words or key.');
    } catch {
      feedback(shareUrl);
    }
  });

  saveBtn.addEventListener('click', () => saveAsImage(title, getText()));

  const append = (chunk) => {
    const span = document.createElement('span');
    span.className = 'chunk';
    span.textContent = chunk;
    textEl.append(span);
  };

  return {
    getText,
    append,
    reset() {
      textEl.textContent = '';
      noteEl.textContent = '';
      textEl.removeAttribute('aria-busy');
      panel.hidden = true;
    },
    start({ title: t, shareUrl: url }) {
      title = t;
      shareUrl = url;
      titleEl.textContent = t;
      textEl.textContent = '';
      noteEl.textContent = '';
      textEl.setAttribute('aria-busy', 'true');
      panel.hidden = false;
    },
    setText(text) {
      textEl.textContent = '';
      append(text);
    },
    setNote(note) {
      noteEl.textContent = note;
    },
    finish({ source, error } = {}) {
      textEl.removeAttribute('aria-busy');
      noteEl.textContent = error
        ? `${error} — so Madame Claude read the cards herself.`
        : `Read by ${source}.`;
    },
  };
}