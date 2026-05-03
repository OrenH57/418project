// File purpose:
// Public landing-page collage graphic.
// Uses a compact food-and-delivery layout that stays readable on phones.

import { Footprints } from "lucide-react";
import { UAlbanyMark } from "../brand/UAlbanyMark";

const baseUrl = import.meta.env.BASE_URL;

const restaurantImages = [
  { name: "Morris's Cafe", src: `${baseUrl}landing-food/0933ac4c-fbd5-4828-8d24-8f985a49329f.jpeg` },
  { name: "The Corner Deli", src: `${baseUrl}landing-food/e76d7c96-352d-4692-be92-5e2a073fa442.jpeg` },
  { name: "Umai Fusion", src: `${baseUrl}landing-food/98813c20-3e13-40b0-bf13-da6aa86408c3.jpeg` },
  { name: "The Spread", src: `${baseUrl}landing-food/19021f97-d322-4134-8ea8-8bc9f7f7df86.jpeg` },
  { name: "Baba's Pizza", src: `${baseUrl}landing-food/d92086c8-f4c1-45e5-a4b9-d2f3e2fbf63c.jpeg` },
  { name: "Greens To Go", src: `${baseUrl}landing-food/f0a40720-b692-44f6-aa4b-64dd52bca0b6.jpeg` },
  { name: "Zoca", src: `${baseUrl}landing-food/b0973875-9e47-47f2-af83-7d02a8c5d895.jpeg` },
  { name: "Jamal's Chicken", src: `${baseUrl}landing-food/20c98794-cc03-4205-b3fa-1343b6f211c9.jpeg` },
  { name: "Yella's", src: `${baseUrl}landing-food/7309b43d-f500-477e-8585-c61ccd069e52.jpeg` },
  { name: "The Halal Shack", src: `${baseUrl}landing-food/5872e9d5-d87d-4c9d-914d-489c4746b7aa.jpeg` },
];

export function LandingHeroGraphic() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-white p-2.5 shadow-sm sm:p-4">
      <div className="relative">
        <div className="mb-2.5 rounded-xl bg-[linear-gradient(135deg,#46166b_0%,#5f2786_100%)] p-3.5 text-white shadow-sm sm:mb-3 sm:p-4">
          <div className="flex items-start gap-3">
            <UAlbanyMark className="h-12 w-12 bg-white text-[var(--brand-maroon)]" compact />
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/75 sm:text-xs">CampusConnect</p>
              <h3 className="mt-1.5 text-lg font-bold leading-tight sm:text-2xl">
                Campus Center restaurants in one delivery grid
              </h3>
              <p className="mt-1.5 text-xs text-white/85 sm:text-sm">
                Order in GET, send it through CampusConnect, and let another student bring it across campus.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4">
          {restaurantImages.map((image, index) => (
            <div
              key={image.name}
              className={`overflow-hidden rounded-[0.95rem] bg-white/70 sm:rounded-[1.2rem] ${
                index >= 4 ? "hidden sm:block" : ""
              }`}
            >
              <div className="aspect-[4/3] bg-white">
                <img alt={image.name} className="h-full w-full object-cover" src={image.src} />
              </div>
              <div className="px-2 py-1.5 text-center text-[10px] font-medium text-[var(--ink)] sm:px-2.5 sm:py-1.5 sm:text-xs">
                {image.name}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2.5 rounded-xl border border-[var(--border)] bg-white p-3 shadow-sm sm:absolute sm:right-3 sm:bottom-3 sm:mt-0 sm:max-w-[220px] sm:p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-maroon)] text-white shadow-sm sm:h-14 sm:w-14">
              <Footprints className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] sm:text-xs">Pickup to handoff</p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink)]">Student walker on the way</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)] sm:mt-2.5 sm:text-sm">
            Less back-and-forth to the Campus Center. More time where you already are.
          </p>
        </div>
      </div>
    </div>
  );
}
