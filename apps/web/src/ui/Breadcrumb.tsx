import { ChevronRight } from 'lucide-react';
export function Breadcrumb({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <nav className="breadcrumbs" aria-label="Caminho de navegação">
      <ol>
        {items.map((item, index) => (
          <li key={index}>
            {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
            {item.onClick ? (
              <button type="button" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span aria-current={index === items.length - 1 ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
