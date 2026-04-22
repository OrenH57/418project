// File purpose:
// Public landing-page collage graphic.
// Uses a compact food-and-delivery layout that stays readable on phones.

const restaurantImages = [
  { name: "Morris's Cafe", src: "/landing-food/0933ac4c-fbd5-4828-8d24-8f985a49329f.jpeg" },
  { name: "The Corner Deli", src: "/landing-food/e76d7c96-352d-4692-be92-5e2a073fa442.jpeg" },
  { name: "Umai Fusion", src: "/landing-food/98813c20-3e13-40b0-bf13-da6aa86408c3.jpeg" },
  { name: "The Spread", src: "/landing-food/19021f97-d322-4134-8ea8-8bc9f7f7df86.jpeg" },
  { name: "Baba's Pizza", src: "/landing-food/d92086c8-f4c1-45e5-a4b9-d2f3e2fbf63c.jpeg" },
  { name: "Greens To Go", src: "/landing-food/f0a40720-b692-44f6-aa4b-64dd52bca0b6.jpeg" },
  { name: "Zoca", src: "/landing-food/b0973875-9e47-47f2-af83-7d02a8c5d895.jpeg" },
  { name: "Jamal's Chicken", src: "/landing-food/20c98794-cc03-4205-b3fa-1343b6f211c9.jpeg" },
  { name: "Yella's", src: "/landing-food/7309b43d-f500-477e-8585-c61ccd069e52.jpeg" },
  { name: "Campus Center", src: "/landing-food/e67fd87c-c303-4203-819f-707dcf5cbfdb.jpeg" },
  { name: "Downtown Cafe", src: "/landing-food/62b603b0-aa1d-4537-8630-dc5869fd4404.jpeg" },
  { name: "The Halal Shack", src: "/landing-food/5872e9d5-d87d-4c9d-914d-489c4746b7aa.jpeg" },
];

export function LandingHeroGraphic() {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[linear-gradient(145deg,#fff8ef_0%,#f6edf7_52%,#f3e8d8_100%)] p-3 shadow-sm sm:rounded-[2rem] sm:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.75),transparent_38%)]" />
      <div className="absolute -top-8 -right-10 h-28 w-28 rounded-full bg-[var(--gold-soft)]/70 blur-2xl" />
      <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-[var(--surface-tint)] blur-2xl" />

      <div className="relative">
        <div className="mb-3 rounded-[1.1rem] bg-[linear-gradient(135deg,#6e2144,#8d436a,#c7a24a)] p-4 text-white shadow-sm sm:mb-4 sm:rounded-[1.4rem] sm:p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/75 sm:text-xs">CampusConnect</p>
          <h3 className="mt-2 text-lg font-bold leading-tight sm:text-2xl">
            Campus Center restaurants in one delivery grid
          </h3>
          <p className="mt-2 text-xs text-white/85 sm:text-sm">
            Order in GET, send it through CampusConnect, and let another student bring it across campus.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {restaurantImages.map((image) => (
            <div
              key={image.name}
              className="overflow-hidden rounded-[0.95rem] border border-white/80 bg-white shadow-sm sm:rounded-[1.2rem]"
            >
              <div className="aspect-[4/3] bg-white">
                <img
                  alt={image.name}
                  className="h-full w-full object-cover"
                  src={image.src}
                />
              </div>
              <div className="border-t border-[var(--border)] px-2 py-1.5 text-center text-[10px] font-medium text-[var(--ink)] sm:px-3 sm:py-2 sm:text-xs">
                {image.name}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-[1rem] border border-white/90 bg-white/92 p-3 shadow-lg backdrop-blur sm:absolute sm:right-3 sm:bottom-3 sm:mt-0 sm:max-w-[240px] sm:rounded-[1.35rem] sm:p-4 sm:shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-maroon)] text-xl text-white shadow-sm sm:h-14 sm:w-14 sm:text-2xl">
              🚲
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] sm:text-xs">Pickup to handoff</p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                Student courier on the way
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)] sm:mt-3 sm:text-sm">
            Less back-and-forth to the Campus Center. More time where you already are.
          </p>
        </div>
      </div>
    </div>
  );
}
