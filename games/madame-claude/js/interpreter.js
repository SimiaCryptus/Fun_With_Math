// Built-in templated reading, used when no API key is present or the API fails.

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

function connective(prev, cur, t, pick) {
  const c = t.connective || {};
  if (prev.card.arcana === 'major' && cur.card.arcana === 'major' && c.majorMajor?.length) {
    return pick(c.majorMajor);
  }
  if (prev.card.suit && prev.card.suit === cur.card.suit && c.sameSuit?.[prev.card.suit]?.length) {
    return pick(c.sameSuit[prev.card.suit]);
  }
  if (prev.reversed && cur.reversed && c.bothReversed?.length) {
    return pick(c.bothReversed);
  }
  if (prev.card.arcana !== cur.card.arcana && c.crossArcana?.length) {
    return pick(c.crossArcana);
  }
  return null;
}

/**
 * @param {object} args
 * @param {object} args.spread     spread definition
 * @param {Array}  args.dealt      [{ position, card, reversed }]
 * @param {object} args.templates  contents of data/templates.json
 * @param {Function} args.rng      seeded PRNG so prose choices are stable
 * @returns {string} plain-text reading with blank lines between paragraphs
 */
export function interpret({ spread, dealt, templates, rng }) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const paragraphs = [];

  const openings = templates.opening[spread.id] || templates.opening.default;
  paragraphs.push(pick(openings));

  dealt.forEach((d, i) => {
    if (i > 0) {
      const bridge = connective(dealt[i - 1], d, templates, pick);
      if (bridge) paragraphs.push(bridge);
    }
    const orient = d.reversed ? 'reversed' : 'upright';
    const byRole = templates.position[d.position.role] || {};
    const pool = byRole[orient] || templates.position.default[orient];
    const keywords = d.card.keywords[orient];
    paragraphs.push(fill(pick(pool), {
      position: d.position.label,
      card: d.card.name,
      kw1: keywords[0],
      kw2: keywords[1] || keywords[0],
      kw3: keywords[2] || keywords[0],
      meaning: d.card.meaning[orient],
    }));
  });

  paragraphs.push(pick(templates.closing));
  return paragraphs.join('\n\n');
}