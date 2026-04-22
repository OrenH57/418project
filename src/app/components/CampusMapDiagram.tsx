import { cn } from "../lib/cn";
import { campusMapNodes, type CampusMapNode } from "../lib/campusMap";

// File purpose:
// Reusable visual campus diagram for the map page.
// Shows major campus delivery zones in a simple schematic layout instead of sending users to external maps.

type CampusMapDiagramProps = {
  activeNodeId?: string | null;
  highlightedNodeIds?: string[];
  onSelectNode?: (node: CampusMapNode) => void;
};

function getNodeStyles(node: CampusMapNode) {
  if (node.kind === "pickup") {
    return "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-white";
  }

  if (node.kind === "academic") {
    return "border-[var(--brand-maroon)] bg-[var(--surface-tint)] text-[var(--brand-maroon)]";
  }

  return "border-[var(--border)] bg-white text-[var(--ink)]";
}

export function CampusMapDiagram({
  activeNodeId,
  highlightedNodeIds = [],
  onSelectNode,
}: CampusMapDiagramProps) {
  return (
    <div className="rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(180deg,#fbf7f1,#f4ecf5)] p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
        <span className="rounded-full bg-white px-3 py-1">North quads across the top of campus</span>
        <span className="rounded-full bg-white px-3 py-1">Podium, libraries, and Campus Center through the middle</span>
        <span className="rounded-full bg-white px-3 py-1">Apartments and southern housing around the lower edges</span>
      </div>

      <div className="relative aspect-[5/4] overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[radial-gradient(circle_at_top,#fffaf2,#f7eef8_60%,#f4e8ef)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(255,255,255,0.08))]" />
        <div className="absolute top-[6%] left-[8%] h-[17%] w-[24%] rounded-[1.35rem] border border-white/80 bg-white/34" />
        <div className="absolute top-[6%] left-[43%] h-[17%] w-[24%] rounded-[1.35rem] border border-white/80 bg-white/34" />
        <div className="absolute top-[6%] left-[75%] h-[14%] w-[16%] rounded-[1.15rem] border border-white/80 bg-white/30" />

        <div className="absolute top-[30%] left-[32%] h-[10%] w-[18%] rounded-[1rem] border border-white/85 bg-white/66" />
        <div className="absolute top-[30%] left-[51%] h-[10%] w-[18%] rounded-[1rem] border border-white/85 bg-white/66" />
        <div className="absolute top-[41%] left-[39%] h-[12%] w-[22%] rounded-[1rem] border border-white/90 bg-white/72" />
        <div className="absolute top-[50%] left-[61%] h-[10%] w-[16%] rounded-[1rem] border border-white/85 bg-white/62" />

        <div className="absolute top-[47%] left-[4%] h-[18%] w-[25%] rounded-[1.35rem] border border-white/80 bg-white/32" />
        <div className="absolute top-[58%] left-[45%] h-[18%] w-[25%] rounded-[1.35rem] border border-white/80 bg-white/32" />
        <div className="absolute top-[72%] left-[68%] h-[15%] w-[20%] rounded-[1.15rem] border border-white/80 bg-white/32" />
        <div className="absolute top-[73%] left-[22%] h-[13%] w-[19%] rounded-[1.15rem] border border-white/80 bg-white/30" />

        <div className="absolute top-[24%] left-[9%] right-[9%] h-[2.2%] rounded-full bg-white/50" />
        <div className="absolute top-[44%] left-[8%] right-[8%] h-[3.2%] rounded-full bg-white/52" />
        <div className="absolute top-[11%] bottom-[12%] left-[49%] w-[2.8%] rounded-full bg-white/42" />

        <div className="absolute top-[2%] left-[15%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Indigenous Quad
        </div>
        <div className="absolute top-[2%] left-[50%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          State Quad
        </div>
        <div className="absolute top-[2%] left-[77%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Empire Commons
        </div>
        <div className="absolute top-[27%] left-[34%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Main Library
        </div>
        <div className="absolute top-[27%] left-[54%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Science Library
        </div>
        <div className="absolute top-[39%] left-[42%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Campus Center
        </div>
        <div className="absolute top-[49%] left-[63%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Massry Center
        </div>
        <div className="absolute top-[45%] left-[8%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Dutch Quad
        </div>
        <div className="absolute top-[57%] left-[49%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Colonial Quad
        </div>
        <div className="absolute top-[70%] left-[22%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Freedom Apartments
        </div>
        <div className="absolute top-[69%] left-[70%] text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Liberty Terrace
        </div>

        {campusMapNodes.map((node) => {
          const isActive = activeNodeId === node.id;
          const isHighlighted = highlightedNodeIds.includes(node.id);
          const clickable = Boolean(onSelectNode);

          return (
            <button
              key={node.id}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-3 py-2 text-center shadow-sm transition",
                getNodeStyles(node),
                isActive && "ring-2 ring-[var(--brand-accent)] ring-offset-2 ring-offset-transparent",
                isHighlighted && !isActive && "border-[var(--brand-accent)] bg-white",
                clickable && "hover:-translate-y-[52%] hover:shadow-md",
              )}
              onClick={() => onSelectNode?.(node)}
              style={{ top: node.top, left: node.left }}
              type="button"
            >
              <div className="min-w-[76px]">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]">{node.shortLabel}</p>
                <p className="mt-1 text-xs font-medium">{node.name}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
