import { WorkflowType } from '../lib/api';

const badgeStyles: Record<WorkflowType, React.CSSProperties> = {
  native: {
    background: '#6c757d',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
  },
  official: {
    background: '#0f4c75',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
  },
  community: {
    background: '#6f42c1',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
  },
};

const labels: Record<WorkflowType, string> = {
  native: 'Native',
  official: 'Official',
  community: 'Community',
};

export default function TypeBadge({ type }: { type: WorkflowType }) {
  return <span style={badgeStyles[type]}>{labels[type]}</span>;
}
