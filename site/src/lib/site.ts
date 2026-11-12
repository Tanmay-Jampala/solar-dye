// Site map: page slugs, titles and tag lines. No result numbers here (those come from results.json).

export interface PartPage {
  index: number;
  slug: string;
  title: string;
  titleLines: [string, string];
  tags: string[];
}

export const PARTS: PartPage[] = [
  { index: 0, slug: 'data', title: 'Data', titleLines: ['The', 'Data'], tags: ['QM9', 'HOPV15', 'SHA256'] },
  { index: 1, slug: 'ceiling', title: 'The Ceiling', titleLines: ['The', 'Ceiling'], tags: ['Detailed balance', 'AM1.5G', 'Shockley–Queisser'] },
  { index: 2, slug: 'hf-vs-b3lyp', title: 'HF vs B3LYP', titleLines: ['HF vs', 'B3LYP'], tags: ['PySCF', 'B3LYP/6-31G*', 'HF', 'geomeTRIC'] },
  { index: 3, slug: 'twist', title: 'The Twist', titleLines: ['The', 'Twist'], tags: ['Relaxed torsion scan', 'Bithiophene'] },
  { index: 4, slug: 'descriptors', title: 'Descriptors & Filters', titleLines: ['Descriptors', '& Filters'], tags: ['RDKit', 'Lipinski', 'Dye-likeness'] },
  { index: 5, slug: 'surrogate', title: 'The Surrogate', titleLines: ['The', 'Surrogate'], tags: ['Ridge', 'Random forest', 'HistGB', 'QM9'] },
  { index: 6, slug: 'quantum-dots', title: 'Quantum Dots', titleLines: ['Quantum', 'Dots'], tags: ['Brus', 'CdSe', 'PbS'] },
  { index: 7, slug: 'cost', title: 'The Cost of Knowing', titleLines: ['The Cost', 'of Knowing'], tags: ['TDP × time', 'CO₂', 'Landauer'] },
];

export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export const partUrl = (part: PartPage) => url(`parts/${part.slug}/`);

export const NAV = [
  { label: 'Home', href: url('/') },
  ...PARTS.map((part) => ({ label: part.title, href: partUrl(part) })),
  { label: 'Checks & Data', href: url('checks/') },
];
