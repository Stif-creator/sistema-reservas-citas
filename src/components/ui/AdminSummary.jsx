export default function AdminSummary({ items }) {
  return <div className="admin-summary">{items.map(({ label, value, icon: Icon, tone = 'purple' }) => <div className={`admin-summary-item tone-${tone}`} key={label}>
    <span className="admin-summary-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.7} /></span><div><strong>{value}</strong><span>{label}</span></div>
  </div>)}</div>
}
