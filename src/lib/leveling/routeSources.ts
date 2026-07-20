// The 10 act route files (exile-leveling's DSL) as raw text, in act order.
// Lives behind the lazy dynamic import in levelingRoute.svelte.ts.
import act1 from './routes/act-1.txt?raw';
import act2 from './routes/act-2.txt?raw';
import act3 from './routes/act-3.txt?raw';
import act4 from './routes/act-4.txt?raw';
import act5 from './routes/act-5.txt?raw';
import act6 from './routes/act-6.txt?raw';
import act7 from './routes/act-7.txt?raw';
import act8 from './routes/act-8.txt?raw';
import act9 from './routes/act-9.txt?raw';
import act10 from './routes/act-10.txt?raw';

export const ROUTE_SOURCES: string[] = [
  act1,
  act2,
  act3,
  act4,
  act5,
  act6,
  act7,
  act8,
  act9,
  act10,
];
