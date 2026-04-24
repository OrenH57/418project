// File purpose:
// Floating shortcut for creating a quick request.
// Gives users a lightweight way to jump into the request form from most pages.

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { cn } from "../../lib/cn";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

export function QuickRequestButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [serviceType, setServiceType] = useState("food");
  const [pickup, setPickup] = useState("");
  const [restaurants, setRestaurants] = useState<string[]>([]);
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    async function loadBootstrap() {
      if (!token) return;
      const response = await api.bootstrap(token);
      setRestaurants(response.restaurants);
      if (!pickup && response.restaurants[0]) {
        setPickup(response.restaurants[0]);
      }
    }

    void loadBootstrap();
  }, [pickup, token]);

  const handleFullForm = () => {
    setIsOpen(false);

    const params = new URLSearchParams();
    if (serviceType) params.set("type", serviceType);
    if (pickup.trim()) params.set("pickup", pickup.trim());
    navigate(`/request?${params.toString()}`);
  };

  return (
    <>
      <button
        className={cn(
          "fixed right-4 bottom-24 z-50 flex h-14 w-14 items-center justify-center rounded-full sm:right-6 sm:bottom-6 sm:h-16 sm:w-16",
          "bg-[var(--brand-maroon)] text-white shadow-lg transition duration-200 hover:scale-105 hover:bg-[var(--brand-maroon-deep)]",
        )}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>

      <div
        className={cn(
          "fixed right-4 bottom-40 left-4 z-40 rounded-2xl border border-[var(--border)] bg-white p-5 shadow-xl sm:right-6 sm:bottom-24 sm:left-auto sm:w-80 sm:p-6",
          "transition-all duration-200",
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <h3 className="mb-4 text-lg font-semibold text-[var(--ink)]">Quick Request</h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="quick-service">Service Type</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger id="quick-service">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="food">Food Delivery</SelectItem>
                <SelectItem value="ride">Ride</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {serviceType === "food" && restaurants.length ? (
            <div>
              <Label htmlFor="quick-restaurant">Campus Center Restaurant</Label>
              <Select value={pickup} onValueChange={setPickup}>
                <SelectTrigger id="quick-restaurant">
                  <SelectValue placeholder="Select restaurant" />
                </SelectTrigger>
                <SelectContent>
                  {restaurants.map((restaurant) => (
                    <SelectItem key={restaurant} value={restaurant}>
                      {restaurant}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label htmlFor="quick-location">Location</Label>
              <Input
                id="quick-location"
                onChange={(event) => setPickup(event.target.value)}
                placeholder="Pickup location"
                value={pickup}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleFullForm} type="button">
              Full Form
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
