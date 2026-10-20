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
  const accent = color(appearance.accentColor, '#d97706')
  const surface = color(appearance.surfaceColor, '#f4f6f8')
  const contrastText = value => {
    const luminance = value
      .slice(1)
      .match(/../g)
      .map(channel => parseInt(channel, 16) / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
    const blackContrast = (luminance + 0.05) / 0.05
    const whiteContrast = 1.05 / (luminance + 0.05)
    return blackContrast >= whiteContrast ? '#000000' : '#ffffff'
  }
  const luminance = primary
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
  return {
    '--brand': primary,
    '--brand-secondary': secondary,
    '--brand-accent': accent,
    '--brand-surface': surface,
    '--on-brand-accent': contrastText(accent),
    '--on-brand-surface': contrastText(surface),
    '--on-brand':
      (luminance + 0.05) / 0.061 >= 4.5
        ? '#101b30'
        : 1.05 / (luminance + 0.05) >= 4.5
          ? '#ffffff'
          : '#000000',
  }
}
