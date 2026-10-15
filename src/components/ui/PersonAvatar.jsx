export default function PersonAvatar({ name = '', tone = 'purple' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  return <span className={`person-avatar tone-${tone}`} aria-hidden="true">{initials || '?'}</span>
}
