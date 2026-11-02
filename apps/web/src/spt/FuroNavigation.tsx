import { canOpenFuroSection } from '../auth/permissions';
import type { Profile } from '../auth/client';
import {
  ClipboardList,
  Eye,
  ChartNoAxesCombined,
  ClipboardCheck,
  Camera,
  Pencil,
} from 'lucide-react';
import { Button } from '../ui/Button';
export type FuroSection =
  'overview' | 'field' | 'analysis' | 'review' | 'photos' | 'identification';
const sections = [
  ['overview', 'Visão geral', Eye],
  ['identification', 'Identificação', Pencil],
  ['field', 'Registro de campo', ClipboardList],
  ['photos', 'Fotografias', Camera],
  ['analysis', 'Análise geotécnica', ChartNoAxesCombined],
  ['review', 'Revisão técnica', ClipboardCheck],
] as const;
export function FuroNavigation({
  section,
  onChange,
  disabled = false,
  profile,
}: {
  section: FuroSection;
  onChange: (section: FuroSection) => void;
  disabled?: boolean;
  profile: Profile;
}) {
  return (
    <nav className="furo-navigation" aria-label="Seções do furo">
      {sections
        .filter(([id]) => canOpenFuroSection(profile, id))
        .map(([id, label, icon]) => (
          <Button
            key={id}
            icon={icon}
            className={id === section ? '' : 'secondary'}
            disabled={disabled}
            aria-current={id === section ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            {label}
          </Button>
        ))}
    </nav>
  );
}
