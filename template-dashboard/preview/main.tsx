import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@gears-frontx/ui-kit/theme.css';
import { CellFrame, DashboardArea, type DashboardCell, type WidgetInstance } from '@gears-frontx/frontx-dashboard-root';
import { CartesianChart, GridWidget, PieChart } from '@gears-frontx/frontx-dashboard-widgets';

import { COLOUR_CELLS, DEMO_CELLS, DEMO_DATA, GRID_500_CELLS, typeOf } from './demoData';
import './preview.css';

/*
 * Dev preview of template-dashboard: mounts the dashboard root's area and
 * frame with the catalog widgets over invented demo data, so the packages can
 * be checked in a real browser. Not part of the template.
 * Query: ?theme=dark|light, ?view=grid500 (one 500-row grid, mounted by a button), ?view=pie12|pie24|stack10 (one chart
 * with many slices or stacked series, for the series colours), ?view=labels12|labels12h (a bar chart of twelve long
 * category names, upright or horizontal), ?view=stackcolumn (eight rows stacked by an outcome column, long form),
 * ?palette=host (a host palette of three colours).
 */

const params = new URLSearchParams(location.search);
const theme = params.get('theme');
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

function Widget({ widget }: { widget: WidgetInstance }) {
  const demo = DEMO_DATA[widget.id];
  if (!demo) return null;
  const payload = { render: demo.render, data: demo.data, value_format: demo.value_format } as never;
  const label = widget.title ?? 'Widget';
  switch (typeOf(widget.id)) {
    case 'cartesian_chart':
      return <CartesianChart payload={payload} label={label} />;
    case 'pie_chart':
      return <PieChart payload={payload} label={label} />;
    default:
      return <GridWidget payload={payload} label={label} />;
  }
}

function Cell({ cell }: { cell: DashboardCell }) {
  const [open, setOpen] = useState(false);
  const larger = cell.larger_view;
  return (
    <CellFrame
      title={cell.widget.title}
      state="shown"
      largerView={larger ? { title: larger.title ?? cell.widget.title ?? '', state: 'shown', content: open ? <Widget widget={larger} /> : null, onOpenChange: setOpen } : undefined}
    >
      <Widget widget={cell.widget} />
    </CellFrame>
  );
}

function Preview() {
  const view = params.get('view') ?? '';
  const grid500 = view === 'grid500';
  // A colour view shows one chart in a tall box, so a long legend shows in full.
  const colourView = !grid500 && Object.hasOwn(COLOUR_CELLS, view);
  let cells = DEMO_CELLS;
  if (grid500) cells = GRID_500_CELLS;
  else if (colourView) cells = COLOUR_CELLS[view];
  const [mounted, setMounted] = useState(!grid500);
  return (
    <main className={params.get('palette') === 'host' ? 'preview preview-host-palette' : 'preview'}>
      <h1 className="preview-title">Dashboard preview</h1>
      {grid500 && !mounted ? (
        <button type="button" id="mount" onClick={() => setMounted(true)}>
          Mount grid
        </button>
      ) : null}
      {colourView ? (
        <div className={view === 'pie24' ? 'preview-tall preview-tall-xl' : 'preview-tall'}>
          <Cell cell={cells[0]} />
        </div>
      ) : null}
      {!colourView && mounted ? <DashboardArea layout={{ cells }} renderCell={(cell) => <Cell cell={cell} />} /> : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
