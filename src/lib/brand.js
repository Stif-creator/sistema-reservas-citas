export function safeImageUrl(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export function brandVariables(appearance = {}) {
  const color = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value) ? value : fallback)
  const primary = color(appearance.primaryColor, '#1672ed')
  const secondary = color(appearance.secondaryColor, '#eaf3ff')
  const luminance = primary
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  return {
    '--brand': primary,
    '--brand-secondary': secondary,
    '--on-brand':
      (luminance + 0.05) / 0.061 >= 4.5
        ? '#101b30'
        : 1.05 / (luminance + 0.05) >= 4.5
          ? '#ffffff'
          : '#000000',
  }
}
